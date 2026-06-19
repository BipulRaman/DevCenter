mod apps;
mod commands;
mod error;
mod git;
mod models;
mod pr;
mod secrets;
mod state;
mod store;

use serde::Serialize;
use tauri::{Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

use state::AppState;

#[derive(Clone, Serialize)]
struct UpdateState {
    status: String,
    version: Option<String>,
    error: Option<String>,
}

fn emit_update(app: &tauri::AppHandle, status: &str, version: Option<String>, error: Option<String>) {
    let _ = app.emit(
        "update_state",
        UpdateState {
            status: status.to_string(),
            version,
            error,
        },
    );
}

async fn auto_update_on_start(app: tauri::AppHandle) {
    emit_update(&app, "checking", None, None);

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            emit_update(&app, "error", None, Some(format!("updater init failed: {e}")));
            return;
        }
    };

    let update = match updater.check().await {
        Ok(v) => v,
        Err(e) => {
            emit_update(&app, "error", None, Some(format!("update check failed: {e}")));
            return;
        }
    };

    let Some(update) = update else {
        emit_update(&app, "up_to_date", None, None);
        return;
    };

    // An update is available. Do NOT download/install automatically — on Windows
    // download_and_install runs the NSIS installer, which closes and relaunches
    // the app (the auto-restart the user reported). Only notify the UI here; the
    // user confirms, and the install (which restarts the app) runs via the
    // install_update command.
    emit_update(&app, "available", Some(update.version.to_string()), None);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Per-user app data dir (e.g. %APPDATA%\com.devcenter.desktop on Windows).
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = store::open(&dir.join("devcenter.db"))?;
            app.manage(AppState::new(conn));

            // Auto-update runs only in release builds.
            if !cfg!(debug_assertions) {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    auto_update_on_start(app_handle).await;
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::os::app_version,
            commands::os::check_for_updates,
            commands::os::install_update,
            commands::os::open_path,
            commands::os::open_url,
            commands::os::open_terminal,
            commands::git::list_repos,
            commands::git::scan_repos,
            commands::git::git_fetch,
            commands::git::git_clone,
            commands::git::add_repo,
            commands::git::list_branches,
            commands::git::git_checkout,
            commands::git::git_create_branch,
            commands::git::git_rename_branch,
            commands::git::git_delete_branch,
            commands::git::set_repo_watched,
            commands::git::remove_repo,
            commands::git::set_repo_tags,
            commands::git::list_tags,
            commands::git::git_changes,
            commands::git::git_diff,
            commands::git::git_pr_changes,
            commands::git::git_pr_file_diff,
            commands::git::git_stage,
            commands::git::git_unstage,
            commands::git::git_discard,
            commands::git::git_stash_push,
            commands::git::git_stash_apply,
            commands::git::git_stash_pop,
            commands::git::git_stash_drop,
            commands::git::git_commit,
            commands::git::git_push,
            commands::git::git_pull,
            commands::git::git_log,
            commands::accounts::list_accounts,
            commands::accounts::add_account,
            commands::accounts::test_account,
            commands::accounts::remove_account,
            commands::accounts::git_token,
            commands::pr::list_pull_requests,
            commands::pr::list_repo_pull_requests,
            commands::apps::list_presets,
            commands::apps::list_apps,
            commands::apps::create_app,
            commands::apps::update_app,
            commands::apps::delete_app,
            commands::apps::reorder_apps,
            commands::apps::start_app,
            commands::apps::stop_app,
            commands::apps::restart_app,
            commands::apps::start_all_apps,
            commands::apps::stop_all_apps,
            commands::apps::app_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running DevCenter");
}

