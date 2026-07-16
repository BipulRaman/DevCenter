use serde::Serialize;
use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize)]
pub struct UpdateActionResult {
    pub status: String,
    pub version: Option<String>,
}

/// Returns the application version (from Cargo/tauri.conf.json).
#[tauri::command]
pub fn app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Opens a file or folder with the OS default handler (e.g. File Explorer).
#[tauri::command]
pub fn open_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Opens a URL in the user's default browser.
#[tauri::command]
pub fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Writes UTF-8 text to a file on disk. Backs the log viewer's "Export" action
/// (the destination is chosen by the user via the save dialog on the frontend).
#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Opens a terminal at the given working directory.
#[tauri::command]
pub fn open_terminal(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("wt")
            .args(["-d", &path])
            .spawn()
            .or_else(|_| {
                std::process::Command::new("cmd")
                    .args(["/C", "start", "cmd", "/K", &format!("cd /d \"{path}\"")])
                    .spawn()
            })
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-a", "Terminal", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("x-terminal-emulator")
            .current_dir(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Locate the VS Code executable if it's installed. Checks well-known install
/// locations first, then falls back to a PATH lookup. Returns None when VS Code
/// can't be found. When `insiders` is true, looks for the VS Code Insiders build.
fn vscode_path(insiders: bool) -> Option<std::path::PathBuf> {
    use std::path::PathBuf;

    #[cfg(target_os = "windows")]
    let known: Vec<PathBuf> = {
        let (dir, exe) = if insiders {
            (r"Microsoft VS Code Insiders", "Code - Insiders.exe")
        } else {
            (r"Microsoft VS Code", "Code.exe")
        };
        let mut v = Vec::new();
        if let Ok(p) = std::env::var("LOCALAPPDATA") {
            v.push(PathBuf::from(p).join("Programs").join(dir).join(exe));
        }
        if let Ok(p) = std::env::var("ProgramFiles") {
            v.push(PathBuf::from(p).join(dir).join(exe));
        }
        if let Ok(p) = std::env::var("ProgramFiles(x86)") {
            v.push(PathBuf::from(p).join(dir).join(exe));
        }
        v
    };
    #[cfg(target_os = "macos")]
    let known: Vec<PathBuf> = if insiders {
        vec![PathBuf::from(
            "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code",
        )]
    } else {
        vec![PathBuf::from(
            "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
        )]
    };
    #[cfg(target_os = "linux")]
    let known: Vec<PathBuf> = if insiders {
        vec![
            PathBuf::from("/usr/bin/code-insiders"),
            PathBuf::from("/usr/local/bin/code-insiders"),
            PathBuf::from("/snap/bin/code-insiders"),
        ]
    } else {
        vec![
            PathBuf::from("/usr/bin/code"),
            PathBuf::from("/usr/local/bin/code"),
            PathBuf::from("/snap/bin/code"),
        ]
    };

    if let Some(p) = known.into_iter().find(|p| p.exists()) {
        return Some(p);
    }

    // Fall back to a PATH lookup (`where code` on Windows, `which code` elsewhere).
    let finder = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };
    let cli = if insiders { "code-insiders" } else { "code" };
    let mut cmd = std::process::Command::new(finder);
    cmd.arg(cli);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let first = stdout.lines().next()?.trim();
    if first.is_empty() {
        return None;
    }
    let p = std::path::PathBuf::from(first);
    if p.exists() {
        Some(p)
    } else {
        None
    }
}

/// Whether VS Code appears to be installed on this machine (drives the optional
/// "Open in VS Code" menu item).
#[tauri::command]
pub fn vscode_available() -> bool {
    vscode_path(false).is_some()
}

/// Whether VS Code Insiders appears to be installed on this machine (drives the
/// optional "Open in VS Code (I)" menu item).
#[tauri::command]
pub fn vscode_insiders_available() -> bool {
    vscode_path(true).is_some()
}

/// Opens the given folder in VS Code. Errors if VS Code can't be located.
#[tauri::command]
pub fn open_in_vscode(path: String) -> Result<(), String> {
    open_in_vscode_variant(path, false)
}

/// Opens the given folder in VS Code Insiders. Errors if it can't be located.
#[tauri::command]
pub fn open_in_vscode_insiders(path: String) -> Result<(), String> {
    open_in_vscode_variant(path, true)
}

fn open_in_vscode_variant(path: String, insiders: bool) -> Result<(), String> {
    let exe = vscode_path(insiders).ok_or_else(|| {
        if insiders {
            "VS Code Insiders was not found on this machine.".to_string()
        } else {
            "VS Code was not found on this machine.".to_string()
        }
    })?;
    // `.cmd`/`.bat` wrappers can't be spawned directly on Windows — run via cmd.
    let is_script = exe
        .extension()
        .map(|e| e.eq_ignore_ascii_case("cmd") || e.eq_ignore_ascii_case("bat"))
        .unwrap_or(false);
    let mut cmd = if is_script {
        let mut c = std::process::Command::new("cmd");
        c.arg("/C").arg(&exe).arg(&path);
        c
    } else {
        let mut c = std::process::Command::new(&exe);
        c.arg(&path);
        c
    };
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Checks for an available update WITHOUT installing it. Installing restarts the
/// app, so the UI asks the user first (see install_update).
#[tauri::command]
pub async fn check_for_updates(app: tauri::AppHandle) -> Result<UpdateActionResult, String> {
    // Dev builds and locally-built (unsigned) builds ship an empty updater pubkey
    // — CI injects the real minisign key only at release time. With no valid key
    // the updater can't initialize (it fails to parse the empty key with
    // "Invalid encoding in minisign data"), so report a clear "not configured"
    // state instead of surfacing that cryptic error to the user.
    let updater = match app.updater() {
        Ok(u) => u,
        Err(_) => {
            return Ok(UpdateActionResult {
                status: "not_configured".to_string(),
                version: None,
            });
        }
    };
    let update = updater.check().await.map_err(|e| e.to_string())?;

    match update {
        Some(update) => Ok(UpdateActionResult {
            status: "available".to_string(),
            version: Some(update.version.to_string()),
        }),
        None => Ok(UpdateActionResult {
            status: "up_to_date".to_string(),
            version: None,
        }),
    }
}

/// Downloads and installs the available update. On Windows the NSIS installer
/// closes the app and relaunches it, so this is invoked ONLY after the user
/// explicitly confirms — updates are never installed or restarted automatically.
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    if let Some(update) = update {
        update
            .download_and_install(|_chunk_len, _content_len| {}, || {})
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
