//! Process lifecycle, build pipeline and live log streaming for App Center.
//! Ported from AppNest's manager.rs, adapted to emit Tauri events instead of SSE.

use std::collections::{HashMap, VecDeque};
use std::net::{Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::oneshot;

use super::serve;
use super::{AppDef, LogLine, NoticeEvent, StatusEvent};

const LOG_RING: usize = 800;

/// How many ports past the configured one to probe before falling back to an
/// OS-assigned ephemeral port.
const PORT_SCAN: u16 = 50;

/// Grace period for a busy port before we give up on it. A process we just
/// killed (Restart) can hold its socket for a moment, and moving that app to a
/// different port would be wrong — only a *foreign* occupant should push us off.
const PORT_GRACE_MS: u64 = 2000;

/// How long to wait for a stopped app's port to be released by the OS.
const PORT_RELEASE_MS: u64 = 3000;

/// Longest stderr excerpt appended to an "exited with code N" message.
const ERR_DETAIL_MAX: usize = 200;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct RunningApp {
    status: String,
    pid: Option<u32>,
    started_at: Option<u64>,
    cancel: Arc<AtomicBool>,
    logs: VecDeque<LogLine>,
    /// Port actually bound/handed to the process (may differ from the config).
    port: Option<u16>,
    /// Reason for the current "error" status.
    error: Option<String>,
    /// Most recent stderr line, used to explain a non-zero exit code.
    last_stderr: Option<String>,
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
            port: None,
            error: None,
            last_stderr: None,
            shutdown: None,
        }
    }

    /// True while a start is in flight or a process/server is alive. "error"
    /// and "stopped" are both idle, so the user can always start again.
    fn is_busy(&self) -> bool {
        match self.status.as_str() {
            "building" => true,
            // A "running" entry with nothing to stop is stale (e.g. a task was
            // lost); treat it as idle so the UI can never wedge.
            "running" => self.pid.is_some() || self.shutdown.is_some(),
            _ => false,
        }
    }
}

/// Snapshot of an app's live runtime state.
#[derive(Clone, Debug, Default)]
pub struct RunState {
    pub status: String,
    pub pid: Option<u32>,
    pub uptime: String,
    pub port: Option<u16>,
    pub error: Option<String>,
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

    /// Lock the state map, recovering from poisoning. A panic while the lock is
    /// held must never brick App Center for the rest of the session.
    fn map(&self) -> MutexGuard<'_, HashMap<i64, RunningApp>> {
        self.apps.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Snapshot of an app's live state, defaulting to stopped.
    pub fn status_of(&self, id: i64) -> RunState {
        let map = self.map();
        match map.get(&id) {
            Some(a) => RunState {
                status: a.status.clone(),
                pid: a.pid,
                uptime: fmt_uptime(a.started_at),
                port: a.port,
                error: a.error.clone(),
            },
            None => RunState { status: "stopped".into(), ..Default::default() },
        }
    }

    /// True only while building or actually running — an errored app counts as
    /// idle so "start all" retries it instead of skipping it forever.
    pub fn is_active(&self, id: i64) -> bool {
        let map = self.map();
        map.get(&id).map(|a| a.is_busy()).unwrap_or(false)
    }

    pub fn running_ids(&self) -> Vec<i64> {
        let map = self.map();
        map.iter().filter(|(_, a)| a.is_busy()).map(|(id, _)| *id).collect()
    }

    /// Buffered log snapshot for an app (for the log viewer's initial load).
    pub fn logs(&self, id: i64) -> Vec<LogLine> {
        let map = self.map();
        map.get(&id).map(|a| a.logs.iter().cloned().collect()).unwrap_or_default()
    }

    fn emit_status(&self, app: &AppHandle, id: i64) {
        let s = self.status_of(id);
        let _ = app.emit(
            "app_status_changed",
            StatusEvent {
                id,
                status: s.status,
                pid: s.pid,
                uptime: s.uptime,
                port: s.port,
                error: s.error,
            },
        );
    }

    /// Surface a message the UI should show to the user (toast/alert).
    fn emit_notice(&self, app: &AppHandle, id: i64, kind: &str, title: &str, message: &str) {
        let _ = app.emit(
            "app_notice",
            NoticeEvent {
                id,
                kind: kind.into(),
                title: title.into(),
                message: message.into(),
            },
        );
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
            let mut map = self.map();
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
    /// Rejected only while a start is in flight or something is actually
    /// running — an "error" (or stale) app can always be started again.
    /// Returns immediately; work proceeds on a task.
    pub fn start(self: &Arc<Self>, app: &AppHandle, def: AppDef) -> Result<(), String> {
        let id = def.id;
        {
            let mut map = self.map();
            if let Some(a) = map.get(&id) {
                if a.is_busy() {
                    return Err(if a.status == "building" {
                        "Application is already starting.".to_string()
                    } else {
                        "Application is already running.".to_string()
                    });
                }
                // Reuse the previous entry's logs so a retry keeps its history,
                // and drop any stale shutdown handle (releases a lost server).
                let prev = map.remove(&id);
                let mut fresh = RunningApp::new();
                if let Some(p) = prev {
                    fresh.logs = p.logs;
                }
                map.insert(id, fresh);
            } else {
                map.insert(id, RunningApp::new());
            }
        }
        let runner = Arc::clone(self);
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            runner.run(app, def).await;
        });
        Ok(())
    }

    /// Stop an app: cancels build, kills the process tree, or shuts down the
    /// in-process server. Idempotent, and always leaves the app "stopped" so
    /// it can be started again — including from an error state.
    pub fn stop(&self, app: &AppHandle, id: i64) -> Result<(), String> {
        let port = self.stop_inner(app, id);
        let _ = port;
        Ok(())
    }

    /// Stop and wait until the port it held is actually free again, so the next
    /// start (Restart) can reuse it instead of being pushed onto another port.
    pub async fn stop_wait(&self, app: &AppHandle, id: i64) -> Result<(), String> {
        if let Some(port) = self.stop_inner(app, id) {
            wait_port_free(port).await;
        }
        Ok(())
    }

    /// Stop every app and block until their ports are released. Called on app
    /// exit — a child process that outlives DevCenter would keep its port.
    pub fn shutdown(&self, app: &AppHandle) {
        let mut ports = Vec::new();
        for id in self.running_ids() {
            if let Some(p) = self.stop_inner(app, id) {
                ports.push(p);
            }
        }
        // Blocking is fine here: the event loop is already tearing down.
        let deadline = std::time::Instant::now() + std::time::Duration::from_millis(PORT_RELEASE_MS);
        while ports.iter().any(|p| !port_is_free(*p)) {
            if std::time::Instant::now() >= deadline {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    }

    /// Shared stop path: cancel, kill/shut down, reset state. Returns the port
    /// the app was occupying, if any.
    fn stop_inner(&self, app: &AppHandle, id: i64) -> Option<u16> {
        let (pid, shutdown, port) = {
            let mut map = self.map();
            match map.get_mut(&id) {
                Some(a) => {
                    a.cancel.store(true, Ordering::SeqCst);
                    (a.pid.take(), a.shutdown.take(), a.port)
                }
                None => return None,
            }
        };
        if let Some(tx) = shutdown {
            let _ = tx.send(());
        }
        if let Some(pid) = pid {
            kill_tree(pid);
        }
        {
            let mut map = self.map();
            if let Some(a) = map.get_mut(&id) {
                a.status = "stopped".into();
                a.pid = None;
                a.started_at = None;
                a.port = None;
                a.error = None;
            }
        }
        self.push_log(app, id, "system", "info", "Stopped.");
        self.emit_status(app, id);
        port
    }

    pub fn stop_all(&self, app: &AppHandle) {
        for id in self.running_ids() {
            let _ = self.stop(app, id);
        }
    }

    // ---------- internal ----------

    /// True when `token` still belongs to the app's current start attempt. Each
    /// start gets a fresh cancel flag, so this identifies a run generation and
    /// stops a superseded task from writing over a newer one's state.
    fn is_current(&self, id: i64, token: &Arc<AtomicBool>) -> bool {
        let map = self.map();
        map.get(&id).map(|a| Arc::ptr_eq(&a.cancel, token)).unwrap_or(false)
    }

    async fn run(self: Arc<Self>, app: AppHandle, mut def: AppDef) {
        let id = def.id;
        let cancel = {
            let map = self.map();
            map.get(&id).map(|a| a.cancel.clone()).unwrap_or_default()
        };
        self.emit_status(&app, id);
        self.push_log(&app, id, "system", "info", &format!("Starting “{}”…", def.name));

        let (build_steps, run_cmd) = split_commands(&def);

        // Build phase.
        for step in &build_steps {
            if cancel.load(Ordering::SeqCst) {
                return self.mark_stopped(&app, id, &cancel);
            }
            self.push_log(&app, id, "build", "info", &format!("$ {step}"));
            let ok = self.run_build_step(&app, id, &def, step, &cancel).await;
            if !ok {
                if !cancel.load(Ordering::SeqCst) {
                    self.mark_error(&app, id, "Build step failed.", &cancel);
                }
                return;
            }
        }
        if cancel.load(Ordering::SeqCst) {
            return self.mark_stopped(&app, id, &cancel);
        }

        // Port phase: never fail just because the configured port is taken —
        // move to a free one and tell the user which one is in use.
        if let Some(wanted) = def.port {
            match find_free_port(wanted).await {
                Some(port) => {
                    def.port = Some(port);
                    self.set_port(id, Some(port));
                    if port != wanted {
                        self.push_log(
                            &app,
                            id,
                            "system",
                            "warn",
                            &format!("Port {wanted} is already in use — starting on port {port} instead."),
                        );
                        self.emit_notice(
                            &app,
                            id,
                            "portChanged",
                            "Port already in use",
                            &format!(
                                "Port {wanted} is being used by another application, so “{}” was started on port {port} instead.",
                                def.name
                            ),
                        );
                    }
                }
                None => {
                    return self.mark_error(
                        &app,
                        id,
                        &format!("No free port available near {wanted}. Close the app using it or configure another port."),
                        &cancel,
                    );
                }
            }
        }

        // Run phase by serve mode.
        match def.serve_mode.as_str() {
            "command" => match run_cmd {
                Some(cmd) => self.spawn_process(app, id, &def, &cmd, &cancel).await,
                None => self.mark_error(&app, id, "No run command set for Command mode.", &cancel),
            },
            "script" => match def.script_file.clone() {
                Some(script) => {
                    let cmd = script_command(&script);
                    self.spawn_process(app, id, &def, &cmd, &cancel).await;
                }
                None => self.mark_error(&app, id, "No script file set for Script mode.", &cancel),
            },
            "static" => self.start_static(app, id, &def, &cancel).await,
            "apimock" => self.start_mock(app, id, &def, &cancel).await,
            other => self.mark_error(&app, id, &format!("Unknown serve mode: {other}"), &cancel),
        }
    }

    async fn run_build_step(
        self: &Arc<Self>,
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
            let mut map = self.map();
            if let Some(a) = map.get_mut(&id) {
                if Arc::ptr_eq(&a.cancel, cancel) {
                    a.pid = Some(pid);
                }
            }
        }
        self.spawn_readers(app, id, &mut child, "build", cancel);

        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    let mut map = self.map();
                    if let Some(a) = map.get_mut(&id) {
                        if Arc::ptr_eq(&a.cancel, cancel) {
                            a.pid = None;
                        }
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
        cancel: &Arc<AtomicBool>,
    ) {
        let mut cmd = shell_command(command);
        apply_env(&mut cmd, def);
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => return self.mark_error(&app, id, &format!("Failed to start: {e}"), cancel),
        };
        let pid = child.id();
        let adopted = {
            let mut map = self.map();
            match map.get_mut(&id) {
                Some(a) if Arc::ptr_eq(&a.cancel, cancel) => {
                    a.status = "running".into();
                    a.pid = pid;
                    a.started_at = Some(now_secs());
                    a.error = None;
                    true
                }
                _ => false,
            }
        };
        // Superseded by a newer start (or removed): abandon this child.
        if !adopted {
            if let Some(pid) = pid {
                kill_tree(pid);
            }
            let _ = child.wait().await;
            return;
        }
        self.spawn_readers(&app, id, &mut child, "run", cancel);
        let url = def.port.map(|p| format!("  →  http://localhost:{p}")).unwrap_or_default();
        self.push_log(&app, id, "system", "info", &format!("Running{url}"));
        self.emit_status(&app, id);

        let exit = child.wait().await;
        if cancel.load(Ordering::SeqCst) {
            self.mark_stopped(&app, id, cancel);
            return;
        }
        match exit {
            Ok(s) if s.success() => {
                self.push_log(&app, id, "system", "info", "Process exited.");
                self.mark_stopped(&app, id, cancel);
            }
            Ok(s) => {
                // A bare exit code explains nothing — quote the last stderr line.
                let code = s.code().unwrap_or(-1);
                let msg = match self.last_stderr(id, cancel) {
                    Some(detail) => format!("Exited with code {code} — {detail}"),
                    None => format!("Exited with code {code}. See logs for details."),
                };
                self.mark_error(&app, id, &msg, cancel);
            }
            Err(e) => self.mark_error(&app, id, &e.to_string(), cancel),
        }
    }

    async fn start_static(self: &Arc<Self>, app: AppHandle, id: i64, def: &AppDef, cancel: &Arc<AtomicBool>) {
        let port = match def.port {
            Some(p) => p,
            None => return self.mark_error(&app, id, "A port is required for Static mode.", cancel),
        };
        let rel = def.static_dir.clone().unwrap_or_else(|| ".".into());
        let dir = resolve_dir(&def.project_dir, &rel);
        if !dir.is_dir() {
            return self.mark_error(&app, id, &format!("Static folder not found: {}", dir.display()), cancel);
        }
        self.start_server(app, id, port, ServerKind::Static, dir, cancel).await;
    }

    async fn start_mock(self: &Arc<Self>, app: AppHandle, id: i64, def: &AppDef, cancel: &Arc<AtomicBool>) {
        let port = match def.port {
            Some(p) => p,
            None => return self.mark_error(&app, id, "A port is required for API Mock mode.", cancel),
        };
        let spec = match def.spec_file.clone() {
            Some(s) => resolve_dir(&def.project_dir, &s),
            None => return self.mark_error(&app, id, "A spec file is required for API Mock mode.", cancel),
        };
        if !spec.is_file() {
            return self.mark_error(&app, id, &format!("Spec file not found: {}", spec.display()), cancel);
        }
        self.start_server(app, id, port, ServerKind::Mock, spec, cancel).await;
    }

    /// Shared launcher for the in-process axum servers (static / apimock).
    /// Binds the socket *before* reporting "running" so a port conflict can be
    /// retried on another port instead of flipping the app into an error state.
    async fn start_server(
        self: &Arc<Self>,
        app: AppHandle,
        id: i64,
        port: u16,
        kind: ServerKind,
        target: PathBuf,
        cancel: &Arc<AtomicBool>,
    ) {
        let (listener, port) = match bind_free_port(port).await {
            Ok(bound) => bound,
            Err(e) => return self.mark_error(&app, id, &e, cancel),
        };
        let (tx, rx) = oneshot::channel::<()>();
        {
            let mut map = self.map();
            match map.get_mut(&id) {
                Some(a) if Arc::ptr_eq(&a.cancel, cancel) => {
                    a.status = "running".into();
                    a.started_at = Some(now_secs());
                    a.shutdown = Some(tx);
                    a.port = Some(port);
                    a.error = None;
                }
                // Superseded by a newer start: drop the listener and bail.
                _ => return,
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
        let token = Arc::clone(cancel);
        tauri::async_runtime::spawn(async move {
            let result = match kind {
                ServerKind::Static => serve::run_static(target, listener, rx).await,
                ServerKind::Mock => serve::run_mock(target, listener, rx).await,
            };
            let cancelled = token.load(Ordering::SeqCst);
            match result {
                Ok(()) => runner.mark_stopped(&app, id, &token),
                Err(e) if !cancelled => runner.mark_error(&app, id, &e, &token),
                Err(_) => runner.mark_stopped(&app, id, &token),
            }
        });
    }

    fn spawn_readers(
        self: &Arc<Self>,
        app: &AppHandle,
        id: i64,
        child: &mut tokio::process::Child,
        stream: &str,
        token: &Arc<AtomicBool>,
    ) {
        if let Some(out) = child.stdout.take() {
            self.spawn_reader(app.clone(), id, out, stream.to_string(), "info", token);
        }
        if let Some(err) = child.stderr.take() {
            self.spawn_reader(app.clone(), id, err, stream.to_string(), "error", token);
        }
    }

    fn spawn_reader<R>(
        self: &Arc<Self>,
        app: AppHandle,
        id: i64,
        reader: R,
        stream: String,
        level: &str,
        token: &Arc<AtomicBool>,
    ) where
        R: tokio::io::AsyncRead + Unpin + Send + 'static,
    {
        let level = level.to_string();
        let is_err = level == "error";
        let runner = Arc::clone(self);
        let token = Arc::clone(token);
        // Stream stdout/stderr lines straight to the UI as `app_log` events.
        // (Ring buffering is handled by push_log for system/lifecycle lines.)
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(reader).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                // Keep the newest stderr line so a bare exit code can say why.
                if is_err && !line.trim().is_empty() {
                    let mut map = runner.map();
                    if let Some(a) = map.get_mut(&id) {
                        if Arc::ptr_eq(&a.cancel, &token) {
                            a.last_stderr = Some(line.trim().to_string());
                        }
                    }
                }
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

    /// The newest stderr line of the current run, trimmed for display.
    fn last_stderr(&self, id: i64, token: &Arc<AtomicBool>) -> Option<String> {
        let map = self.map();
        let a = map.get(&id)?;
        if !Arc::ptr_eq(&a.cancel, token) {
            return None;
        }
        let mut line = a.last_stderr.clone()?;
        if line.chars().count() > ERR_DETAIL_MAX {
            line = line.chars().take(ERR_DETAIL_MAX).collect::<String>() + "…";
        }
        Some(line)
    }

    /// Remember the port an app was actually launched with.
    fn set_port(&self, id: i64, port: Option<u16>) {
        let mut map = self.map();
        if let Some(a) = map.get_mut(&id) {
            a.port = port;
        }
    }

    fn mark_stopped(&self, app: &AppHandle, id: i64, token: &Arc<AtomicBool>) {
        if !self.is_current(id, token) {
            return;
        }
        {
            let mut map = self.map();
            if let Some(a) = map.get_mut(&id) {
                a.status = "stopped".into();
                a.pid = None;
                a.started_at = None;
                a.port = None;
                a.error = None;
                a.shutdown = None;
            }
        }
        self.emit_status(app, id);
    }

    /// Park the app in a recoverable error state: the reason is logged, kept on
    /// the record for the UI, and the app stays startable.
    fn mark_error(&self, app: &AppHandle, id: i64, msg: &str, token: &Arc<AtomicBool>) {
        if !self.is_current(id, token) {
            return;
        }
        self.push_log(app, id, "system", "error", msg);
        {
            let mut map = self.map();
            if let Some(a) = map.get_mut(&id) {
                a.status = "error".into();
                a.pid = None;
                a.started_at = None;
                a.port = None;
                a.error = Some(msg.to_string());
                a.shutdown = None;
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

/// True when `127.0.0.1:port` can be bound right now.
fn port_is_free(port: u16) -> bool {
    std::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, port))).is_ok()
}

/// Wait (bounded) for a port to become bindable again after we released it.
/// A killed process can hold its socket for a moment.
async fn wait_port_free(port: u16) -> bool {
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(PORT_RELEASE_MS);
    loop {
        if port_is_free(port) {
            return true;
        }
        if std::time::Instant::now() >= deadline {
            return false;
        }
        tokio::time::sleep(std::time::Duration::from_millis(75)).await;
    }
}

/// Pick a usable port: the configured one if it frees up within the grace
/// period, otherwise the next free port above it, falling back to an
/// OS-assigned ephemeral port. The grace period matters on Restart, where the
/// app's own dying process may still hold the socket — that must not push the
/// app onto a different port.
async fn find_free_port(desired: u16) -> Option<u16> {
    if desired == 0 || wait_port_free(desired).await {
        return Some(desired);
    }
    let mut port = desired;
    for _ in 0..PORT_SCAN {
        port = port.checked_add(1)?;
        if port_is_free(port) {
            return Some(port);
        }
    }
    std::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0)))
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
}

/// Bind `127.0.0.1:desired`, moving to the next free port only when it stays
/// taken past the grace period. Holding the listener removes the race between
/// probing and serving.
async fn bind_free_port(desired: u16) -> Result<(tokio::net::TcpListener, u16), String> {
    let bind = |p: u16| tokio::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, p)));

    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(PORT_GRACE_MS);
    loop {
        match bind(desired).await {
            Ok(l) => return Ok((l, desired)),
            Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => {
                if std::time::Instant::now() >= deadline {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(75)).await;
            }
            Err(e) => return Err(format!("Cannot bind 127.0.0.1:{desired} — {e}")),
        }
    }

    let mut port = desired;
    for _ in 0..PORT_SCAN {
        port = match port.checked_add(1) {
            Some(p) => p,
            None => break,
        };
        match bind(port).await {
            Ok(l) => return Ok((l, port)),
            Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => continue,
            Err(e) => return Err(format!("Cannot bind 127.0.0.1:{port} — {e}")),
        }
    }
    Err(format!(
        "No free port available between {desired} and {}. Close the app using it or configure another port.",
        desired.saturating_add(PORT_SCAN)
    ))
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
