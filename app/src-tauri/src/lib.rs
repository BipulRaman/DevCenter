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
/// Reveal the main window and close the splash screen. Safe to call more than
/// once (the fallback timer and the frontend both call it) — missing or
/// already-closed windows are simply ignored.
fn reveal_main(app: &tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
    if let Some(splash) = app.get_webview_window("splashscreen") {
        let _ = splash.close();
    }
}

/// Called by the frontend once the UI has painted, to swap the splash window
/// out for the fully-rendered main window.
#[tauri::command]
fn close_splashscreen(app: tauri::AppHandle) {
    reveal_main(&app);
}

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

            // Safety net: if the frontend never signals it's ready (JS error,
            // etc.), reveal the main window and dismiss the splash after a delay
            // so the app can never get stuck on the loading screen.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(12));
                reveal_main(&handle);
            });

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
            close_splashscreen,
            commands::os::app_version,
            commands::os::check_for_updates,
            commands::os::install_update,
            commands::os::open_path,
            commands::os::open_url,
            commands::os::write_text_file,
            commands::os::open_terminal,
            commands::os::vscode_available,
            commands::os::open_in_vscode,
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
            commands::git::git_stash_push_staged,
            commands::git::git_stash_clear,
            commands::git::git_stash_show,
            commands::git::git_commit,
            commands::git::git_undo_commit,
            commands::git::git_push,
            commands::git::git_push_to,
            commands::git::git_pull,
            commands::git::git_pull_from,
            commands::git::git_fetch_prune,
            commands::git::git_fetch_all,
            commands::git::git_merge_branch,
            commands::git::git_rebase_branch,
            commands::git::git_delete_remote_branch,
            commands::git::git_conflicts,
            commands::git::git_conflict_file,
            commands::git::git_resolve_conflict,
            commands::git::git_conflict_abort,
            commands::git::git_conflict_continue,
            commands::git::git_log,
            commands::git::git_remote_url,
            commands::git::git_set_remote_url,
            commands::git::git_list_remotes,
            commands::git::git_add_remote,
            commands::git::git_remove_remote,
            commands::git::git_list_tags,
            commands::git::git_create_tag,
            commands::git::git_delete_tag,
            commands::git::git_checkout_tag,
            commands::git::git_delete_remote_tag,
            commands::git::git_push_tags,
            commands::git::git_list_worktrees,
            commands::git::git_add_worktree,
            commands::git::git_remove_worktree,
            commands::git::git_action_log,
            commands::accounts::list_accounts,
            commands::accounts::add_account,
            commands::accounts::test_account,
            commands::accounts::remove_account,
            commands::accounts::git_token,
            commands::pr::list_pull_requests,
            commands::pr::list_repo_pull_requests,
            commands::pr::fetch_pr_threads,
            commands::pr::post_pr_comment,
            commands::pr::resolve_pr_thread,
            commands::pr::submit_pr_review,
            commands::pr::pr_my_vote,
            commands::pr::publish_pr,
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

