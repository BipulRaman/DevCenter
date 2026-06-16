mod apps;
mod commands;
mod error;
mod git;
mod models;
mod pr;
mod secrets;
mod state;
mod store;

use tauri::Manager;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Per-user app data dir (e.g. %APPDATA%\com.devcenter.desktop on Windows).
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = store::open(&dir.join("devcenter.db"))?;
            app.manage(AppState::new(conn));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::os::app_version,
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
            commands::git::set_repo_watched,
            commands::git::remove_repo,
            commands::git::set_repo_tags,
            commands::git::list_tags,
            commands::git::git_changes,
            commands::git::git_diff,
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

