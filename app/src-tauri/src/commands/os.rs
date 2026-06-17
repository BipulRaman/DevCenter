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

/// Manually checks for app updates and installs if available.
#[tauri::command]
pub async fn check_for_updates(app: tauri::AppHandle) -> Result<UpdateActionResult, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;

    let Some(update) = update else {
        return Ok(UpdateActionResult {
            status: "up_to_date".to_string(),
            version: None,
        });
    };

    let version = update.version.to_string();
    update
        .download_and_install(
            |_chunk_len, _content_len| {},
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(UpdateActionResult {
        status: "installed".to_string(),
        version: Some(version),
    })
}
