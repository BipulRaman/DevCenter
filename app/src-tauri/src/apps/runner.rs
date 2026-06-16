//! Process lifecycle, build pipeline and live log streaming for App Center.
//! Ported from AppNest's manager.rs, adapted to emit Tauri events instead of SSE.

use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::oneshot;

use super::serve;
use super::{AppDef, LogLine, StatusEvent};

const LOG_RING: usize = 800;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct RunningApp {
    status: String,
    pid: Option<u32>,
    started_at: Option<u64>,
    cancel: Arc<AtomicBool>,
    logs: VecDeque<LogLine>,
    /// Shutdown trigger for in-process servers (static / apimock).
    shutdown: Option<oneshot::Sender<()>>,
}

impl RunningApp {
    fn new() -> Self {
        RunningApp {
            status: "building".into(),
            pid: None,
            started_at: None,
            cancel: Arc::new(AtomicBool::new(false)),
            logs: VecDeque::with_capacity(LOG_RING),
            shutdown: None,
        }
    }
}

#[derive(Default)]
pub struct AppRunner {
    apps: Mutex<HashMap<i64, RunningApp>>,
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn ts() -> String {
    // Local wall-clock would need chrono; a UTC HH:MM:SS is enough for logs.
    let secs = now_secs();
    let h = (secs / 3600) % 24;
    let m = (secs / 60) % 60;
    let s = secs % 60;
    format!("{h:02}:{m:02}:{s:02}")
}

/// Humanize an uptime in seconds (e.g. "1h 23m", "45s").
pub fn fmt_uptime(started_at: Option<u64>) -> String {
    let Some(start) = started_at else { return String::new() };
    let secs = now_secs().saturating_sub(start);
    if secs >= 3600 {
        format!("{}h {}m", secs / 3600, (secs % 3600) / 60)
    } else if secs >= 60 {
        format!("{}m {}s", secs / 60, secs % 60)
    } else {
        format!("{secs}s")
    }
}

impl AppRunner {
    pub fn new() -> Self {
        Self::default()
    }

    /// Snapshot of (status, pid, uptime) for an app, defaulting to stopped.
    pub fn status_of(&self, id: i64) -> (String, Option<u32>, String) {
        let map = self.apps.lock().unwrap();
        match map.get(&id) {
            Some(a) => (a.status.clone(), a.pid, fmt_uptime(a.started_at)),
            None => ("stopped".into(), None, String::new()),
        }
    }

    pub fn is_active(&self, id: i64) -> bool {
        let map = self.apps.lock().unwrap();
        map.get(&id).map(|a| a.status != "stopped").unwrap_or(false)
    }

    pub fn running_ids(&self) -> Vec<i64> {
        let map = self.apps.lock().unwrap();
        map.iter().filter(|(_, a)| a.status != "stopped").map(|(id, _)| *id).collect()
    }

    /// Buffered log snapshot for an app (for the log viewer's initial load).
    pub fn logs(&self, id: i64) -> Vec<LogLine> {
        let map = self.apps.lock().unwrap();
        map.get(&id).map(|a| a.logs.iter().cloned().collect()).unwrap_or_default()
    }

    fn emit_status(&self, app: &AppHandle, id: i64) {
        let (status, pid, uptime) = self.status_of(id);
        let _ = app.emit("app_status_changed", StatusEvent { id, status, pid, uptime });
    }

    fn push_log(&self, app: &AppHandle, id: i64, stream: &str, level: &str, line: &str) {
        let rec = LogLine {
            id,
            stream: stream.into(),
            level: level.into(),
            line: line.into(),
            ts: ts(),
        };
        {
            let mut map = self.apps.lock().unwrap();
            if let Some(a) = map.get_mut(&id) {
                if a.logs.len() >= LOG_RING {
                    a.logs.pop_front();
                }
                a.logs.push_back(rec.clone());
            }
        }
        let _ = app.emit("app_log", rec);
    }

    /// Start an app: runs build steps then launches the selected serve mode.
    /// No-op if already active. Returns immediately; work proceeds on a task.
    pub fn start(self: &Arc<Self>, app: &AppHandle, def: AppDef) -> Result<(), String> {
        let id = def.id;
        {
            let mut map = self.apps.lock().unwrap();
            if let Some(a) = map.get(&id) {
                if a.status != "stopped" {
                    return Err("Application is already running.".into());
                }
            }
            map.insert(id, RunningApp::new());
        }
        let runner = Arc::clone(self);
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            runner.run(app, def).await;
        });
        Ok(())
    }

    /// Stop an app: cancels build, kills the process tree, or shuts down the
    /// in-process server. Idempotent.
    pub fn stop(&self, app: &AppHandle, id: i64) -> Result<(), String> {
        let (cancel, pid, shutdown) = {
            let mut map = self.apps.lock().unwrap();
            match map.get_mut(&id) {
                Some(a) => {
                    a.cancel.store(true, Ordering::SeqCst);
                    (a.cancel.clone(), a.pid.take(), a.shutdown.take())
                }
                None => return Ok(()),
            }
        };
        let _ = cancel;
        if let Some(tx) = shutdown {
            let _ = tx.send(());
        }
        if let Some(pid) = pid {
            kill_tree(pid);
        }
        {
            let mut map = self.apps.lock().unwrap();
            if let Some(a) = map.get_mut(&id) {
                a.status = "stopped".into();
                a.pid = None;
                a.started_at = None;
            }
        }
        self.push_log(app, id, "system", "info", "Stopped.");
        self.emit_status(app, id);
        Ok(())
    }

    pub fn stop_all(&self, app: &AppHandle) {
        for id in self.running_ids() {
            let _ = self.stop(app, id);
        }
    }

    // ---------- internal ----------

    async fn run(self: Arc<Self>, app: AppHandle, def: AppDef) {
        let id = def.id;
        let cancel = {
            let map = self.apps.lock().unwrap();
            map.get(&id).map(|a| a.cancel.clone()).unwrap_or_default()
        };
        self.emit_status(&app, id);
        self.push_log(&app, id, "system", "info", &format!("Starting “{}”…", def.name));

        let (build_steps, run_cmd) = split_commands(&def);

        // Build phase.
        for step in &build_steps {
            if cancel.load(Ordering::SeqCst) {
                return self.mark_stopped(&app, id);
            }
            self.push_log(&app, id, "build", "info", &format!("$ {step}"));
            let ok = self.run_build_step(&app, id, &def, step, &cancel).await;
            if !ok {
                if !cancel.load(Ordering::SeqCst) {
                    self.mark_error(&app, id, "Build step failed.");
                }
                return;
            }
        }
        if cancel.load(Ordering::SeqCst) {
            return self.mark_stopped(&app, id);
        }

        // Run phase by serve mode.
        match def.serve_mode.as_str() {
            "command" => match run_cmd {
                Some(cmd) => self.spawn_process(app, id, &def, &cmd, false).await,
                None => self.mark_error(&app, id, "No run command set for Command mode."),
            },
            "script" => match def.script_file.clone() {
                Some(script) => {
                    let cmd = script_command(&script);
                    self.spawn_process(app, id, &def, &cmd, true).await;
                }
                None => self.mark_error(&app, id, "No script file set for Script mode."),
            },
            "static" => self.start_static(app, id, &def),
            "apimock" => self.start_mock(app, id, &def),
            other => self.mark_error(&app, id, &format!("Unknown serve mode: {other}")),
        }
    }

    async fn run_build_step(
        &self,
        app: &AppHandle,
        id: i64,
        def: &AppDef,
        step: &str,
        cancel: &Arc<AtomicBool>,
    ) -> bool {
        let mut cmd = shell_command(step);
        apply_env(&mut cmd, def);
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                self.push_log(app, id, "build", "error", &format!("Failed to start: {e}"));
                return false;
            }
        };
        if let Some(pid) = child.id() {
            let mut map = self.apps.lock().unwrap();
            if let Some(a) = map.get_mut(&id) {
                a.pid = Some(pid);
            }
        }
        self.spawn_readers(app, id, &mut child, "build");

        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    let mut map = self.apps.lock().unwrap();
                    if let Some(a) = map.get_mut(&id) {
                        a.pid = None;
                    }
                    drop(map);
                    return status.success();
                }
                Ok(None) => {
                    if cancel.load(Ordering::SeqCst) {
                        if let Some(pid) = child.id() {
                            kill_tree(pid);
                        }
                        let _ = child.wait().await;
                        return false;
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(120)).await;
                }
                Err(e) => {
                    self.push_log(app, id, "build", "error", &e.to_string());
                    return false;
                }
            }
        }
    }

    async fn spawn_process(
        self: &Arc<Self>,
        app: AppHandle,
        id: i64,
        def: &AppDef,
        command: &str,
        _is_script: bool,
    ) {
        let mut cmd = shell_command(command);
        apply_env(&mut cmd, def);
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => return self.mark_error(&app, id, &format!("Failed to start: {e}")),
        };
        let pid = child.id();
        {
            let mut map = self.apps.lock().unwrap();
            if let Some(a) = map.get_mut(&id) {
                a.status = "running".into();
                a.pid = pid;
                a.started_at = Some(now_secs());
            }
        }
        self.spawn_readers(&app, id, &mut child, "run");
        let url = def.port.map(|p| format!("  →  http://localhost:{p}")).unwrap_or_default();
        self.push_log(&app, id, "system", "info", &format!("Running{url}"));
        self.emit_status(&app, id);

        let exit = child.wait().await;
        let cancelled = {
            let map = self.apps.lock().unwrap();
            map.get(&id).map(|a| a.cancel.load(Ordering::SeqCst)).unwrap_or(true)
        };
        if cancelled {
            self.mark_stopped(&app, id);
            return;
        }
        match exit {
            Ok(s) if s.success() => {
                self.push_log(&app, id, "system", "info", "Process exited.");
                self.mark_stopped(&app, id);
            }
            Ok(s) => {
                let code = s.code().unwrap_or(-1);
                self.push_log(&app, id, "system", "error", &format!("Exited with code {code}."));
                self.mark_error(&app, id, &format!("Exited with code {code}"));
            }
            Err(e) => self.mark_error(&app, id, &e.to_string()),
        }
    }

    fn start_static(self: &Arc<Self>, app: AppHandle, id: i64, def: &AppDef) {
        let port = match def.port {
            Some(p) => p,
            None => return self.mark_error(&app, id, "A port is required for Static mode."),
        };
        let rel = def.static_dir.clone().unwrap_or_else(|| ".".into());
        let dir = resolve_dir(&def.project_dir, &rel);
        self.start_server(app, id, port, ServerKind::Static, dir);
    }

    fn start_mock(self: &Arc<Self>, app: AppHandle, id: i64, def: &AppDef) {
        let port = match def.port {
            Some(p) => p,
            None => return self.mark_error(&app, id, "A port is required for API Mock mode."),
        };
        let spec = match def.spec_file.clone() {
            Some(s) => resolve_dir(&def.project_dir, &s),
            None => return self.mark_error(&app, id, "A spec file is required for API Mock mode."),
        };
        self.start_server(app, id, port, ServerKind::Mock, spec);
    }

    /// Shared launcher for the in-process axum servers (static / apimock).
    fn start_server(
        self: &Arc<Self>,
        app: AppHandle,
        id: i64,
        port: u16,
        kind: ServerKind,
        target: PathBuf,
    ) {
        let (tx, rx) = oneshot::channel::<()>();
        {
            let mut map = self.apps.lock().unwrap();
            if let Some(a) = map.get_mut(&id) {
                a.status = "running".into();
                a.started_at = Some(now_secs());
                a.shutdown = Some(tx);
            }
        }
        let label = match kind {
            ServerKind::Static => "Static server",
            ServerKind::Mock => "API Mock",
        };
        self.push_log(&app, id, "system", "info", &format!("{label} at http://127.0.0.1:{port}"));
        self.push_log(&app, id, "system", "info", &format!("Serving: {}", target.display()));
        self.emit_status(&app, id);

        let runner = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            let result = match kind {
                ServerKind::Static => serve::run_static(target, port, rx).await,
                ServerKind::Mock => serve::run_mock(target, port, rx).await,
            };
            let cancelled = {
                let map = runner.apps.lock().unwrap();
                map.get(&id).map(|a| a.cancel.load(Ordering::SeqCst)).unwrap_or(true)
            };
            match result {
                Ok(()) => runner.mark_stopped(&app, id),
                Err(e) if !cancelled => runner.mark_error(&app, id, &e),
                Err(_) => runner.mark_stopped(&app, id),
            }
        });
    }

    fn spawn_readers(
        &self,
        app: &AppHandle,
        id: i64,
        child: &mut tokio::process::Child,
        stream: &str,
    ) {
        if let Some(out) = child.stdout.take() {
            self.spawn_reader(app.clone(), id, out, stream.to_string(), "info");
        }
        if let Some(err) = child.stderr.take() {
            self.spawn_reader(app.clone(), id, err, stream.to_string(), "error");
        }
    }

    fn spawn_reader<R>(&self, app: AppHandle, id: i64, reader: R, stream: String, level: &str)
    where
        R: tokio::io::AsyncRead + Unpin + Send + 'static,
    {
        let level = level.to_string();
        // Stream stdout/stderr lines straight to the UI as `app_log` events.
        // (Ring buffering is handled by push_log for system/lifecycle lines.)
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(reader).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let rec = LogLine {
                    id,
                    stream: stream.clone(),
                    level: level.clone(),
                    line,
                    ts: ts(),
                };
                let _ = app.emit("app_log", rec);
            }
        });
    }

    fn mark_stopped(&self, app: &AppHandle, id: i64) {
        {
            let mut map = self.apps.lock().unwrap();
            if let Some(a) = map.get_mut(&id) {
                a.status = "stopped".into();
                a.pid = None;
                a.started_at = None;
            }
        }
        self.emit_status(app, id);
    }

    fn mark_error(&self, app: &AppHandle, id: i64, msg: &str) {
        self.push_log(app, id, "system", "error", msg);
        {
            let mut map = self.apps.lock().unwrap();
            if let Some(a) = map.get_mut(&id) {
                a.status = "error".into();
                a.pid = None;
                a.started_at = None;
            }
        }
        self.emit_status(app, id);
    }
}

/// Which in-process server a serve mode launches.
#[derive(Clone, Copy)]
enum ServerKind {
    Static,
    Mock,
}

/// Split commands into (build steps, run command). For Command mode the last
/// line is the run command; for other modes all lines are build steps.
fn split_commands(def: &AppDef) -> (Vec<String>, Option<String>) {
    let lines: Vec<String> = def
        .commands
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if def.serve_mode == "command" {
        if lines.is_empty() {
            (Vec::new(), None)
        } else {
            let run = lines.last().cloned();
            let build = lines[..lines.len() - 1].to_vec();
            (build, run)
        }
    } else {
        (lines, None)
    }
}

/// Build a shell command for the current OS that won't flash a console window.
fn shell_command(line: &str) -> tokio::process::Command {
    #[cfg(windows)]
    {
        let mut c = tokio::process::Command::new("cmd");
        c.args(["/C", line]);
        c.creation_flags(CREATE_NO_WINDOW);
        c
    }
    #[cfg(not(windows))]
    {
        let mut c = tokio::process::Command::new("sh");
        c.args(["-c", line]);
        #[cfg(unix)]
        c.process_group(0);
        c
    }
}

/// Choose an interpreter command for a script file by extension.
fn script_command(path: &str) -> String {
    let lower = path.to_lowercase();
    if lower.ends_with(".ps1") {
        format!("pwsh -NoProfile -ExecutionPolicy Bypass -File \"{path}\"")
    } else if lower.ends_with(".bat") || lower.ends_with(".cmd") {
        format!("\"{path}\"")
    } else if lower.ends_with(".sh") || lower.ends_with(".bash") {
        format!("sh \"{path}\"")
    } else {
        format!("\"{path}\"")
    }
}

/// Apply working dir, the app's env vars, and PORT injection to a command.
fn apply_env(cmd: &mut tokio::process::Command, def: &AppDef) {
    if !def.project_dir.is_empty() {
        cmd.current_dir(&def.project_dir);
    }
    for (k, v) in &def.env {
        if !k.trim().is_empty() {
            cmd.env(k.trim(), v);
        }
    }
    if let Some(port) = def.port {
        cmd.env("PORT", port.to_string());
        if def.app_type == ".net" || def.app_type == "dotnet" {
            cmd.env("ASPNETCORE_URLS", format!("http://localhost:{port}"));
        }
    }
}

/// Resolve a possibly-relative path against the project directory.
fn resolve_dir(project_dir: &str, rel: &str) -> PathBuf {
    let p = PathBuf::from(rel);
    if p.is_absolute() {
        p
    } else {
        PathBuf::from(project_dir).join(rel)
    }
}

/// Kill a process and its descendants.
fn kill_tree(pid: u32) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
    #[cfg(unix)]
    {
        // Negative pid targets the process group created via process_group(0).
        let _ = std::process::Command::new("kill")
            .args(["-TERM", &format!("-{pid}")])
            .output();
    }
    #[cfg(not(any(windows, unix)))]
    {
        let _ = pid;
    }
}
