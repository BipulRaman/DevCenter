mod apps;
mod commands;
mod error;
mod git;
mod gitconfig;
mod models;
mod pr;
mod secrets;
mod state;
mod store;

use serde::Serialize;
use tauri::{Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

use state::AppState;

use std::sync::OnceLock;

/// The application's display name (`productName` from tauri.conf.json), captured
/// once at startup. Non-UI code (e.g. the HTTP `User-Agent`) reads it via
/// `app_name()` so the brand always comes from the single config source instead
/// of a hardcoded literal.
static APP_NAME: OnceLock<String> = OnceLock::new();

/// Record the app's display name for later non-UI use. Called once from setup.
fn set_app_name(name: &str) {
    let _ = APP_NAME.set(name.to_string());
}

/// The app's display name, or a compile-time fallback before it's captured
/// (e.g. in unit tests that don't boot Tauri).
pub(crate) fn app_name() -> &'static str {
    APP_NAME.get().map(String::as_str).unwrap_or("DevGitCenter")
}

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
    } else {
        // Startup race: the frontend's `load` fired before the splash window
        // finished coming up, so there is nothing to close yet. If we did
        // nothing, the splash would appear afterwards (alwaysOnTop) and linger
        // on top of the already-revealed main window. Retry briefly so a
        // late-created splash is dismissed as soon as it exists.
        let handle = app.clone();
        std::thread::spawn(move || {
            for _ in 0..50 {
                std::thread::sleep(std::time::Duration::from_millis(100));
                if let Some(splash) = handle.get_webview_window("splashscreen") {
                    let _ = splash.close();
                    break;
                }
            }
        });
    }
}

/// Called by the frontend once the UI has painted, to swap the splash window
/// out for the fully-rendered main window.
#[tauri::command]
fn close_splashscreen(app: tauri::AppHandle) {
    reveal_main(&app);
}

/// Resolve the per-user application data directory, mirroring Tauri's
/// `app_data_dir()` (`<platform data dir>/<identifier>`), but WITHOUT needing an
/// `AppHandle`. This lets us open the database and register state on the builder
/// before the event loop starts (see `run`), avoiding the startup race where the
/// frontend's first command call could beat `.manage()`.
///
/// The identifier must match `tauri.conf.json` so the same database file is used.
/// The bundle identifier (`identifier` in tauri.conf.json), captured once at
/// startup from the parsed Tauri config so it is never duplicated as a literal.
/// The per-user data-folder name and the keychain service both derive from this.
static APP_IDENTIFIER: OnceLock<String> = OnceLock::new();

/// Record the bundle identifier for later use (data dir, secrets). Called once
/// from `run` before the event loop starts.
fn set_app_identifier(id: &str) {
    let _ = APP_IDENTIFIER.set(id.to_string());
}

/// The bundle identifier, or a fallback matching tauri.conf.json before it is
/// captured (e.g. in unit tests that don't boot Tauri). Must equal the config
/// value so the same data folder / credential entries are used.
pub(crate) fn app_identifier() -> &'static str {
    APP_IDENTIFIER
        .get()
        .map(String::as_str)
        .unwrap_or("in.bipul.devcenter")
}

/// Previous bundle identifier, kept so we can migrate a user's data one time
/// after the identifier changed (see `migrate_legacy_data_dir`). This is a fixed
/// historical value — it is NOT in the current config, so it stays a literal.
const LEGACY_APP_IDENTIFIER: &str = "com.devcenter.desktop";

/// Internal database filename. Deliberately stable and independent of the brand
/// so renaming the app never orphans a user's existing data.
const DB_FILENAME: &str = "devcenter.db";

/// The platform-specific base directory that holds per-app data folders
/// (`<base>/<identifier>`), mirroring Tauri's `app_data_dir()` resolution but
/// WITHOUT needing an `AppHandle`.
fn platform_data_base() -> std::path::PathBuf {
    use std::path::PathBuf;

    #[cfg(target_os = "windows")]
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);

    #[cfg(target_os = "macos")]
    let base = std::env::var_os("HOME")
        .map(|h| PathBuf::from(h).join("Library/Application Support"))
        .unwrap_or_else(std::env::temp_dir);

    #[cfg(target_os = "linux")]
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
        .unwrap_or_else(std::env::temp_dir);

    base
}

fn resolve_app_data_dir() -> std::path::PathBuf {
    platform_data_base().join(app_identifier())
}

/// Recursively copy the contents of `src` into `dst`, creating `dst` as needed.
fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&from, &to)?;
        } else {
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

/// One-time migration: after the bundle identifier changed, the per-user data
/// folder name changed too. If the old folder (`<base>/com.devcenter.desktop`)
/// still exists and the new one has no database yet, copy the old data across
/// and then delete the old folder so the app keeps the user's repos/settings.
fn migrate_legacy_data_dir(new_dir: &std::path::Path) {
    let legacy_dir = platform_data_base().join(LEGACY_APP_IDENTIFIER);

    // Nothing to do if there is no legacy folder, or if we already migrated
    // (the new folder already holds a database).
    if !legacy_dir.is_dir() || new_dir.join(DB_FILENAME).exists() {
        return;
    }

    if copy_dir_all(&legacy_dir, new_dir).is_ok() {
        // Only remove the old folder once the copy succeeded.
        let _ = std::fs::remove_dir_all(&legacy_dir);
    }
}

pub fn run() {
    // Parse the bundled Tauri config once up front so the bundle identifier (and
    // thus the data-folder name and keychain service) comes from the single
    // source of truth in tauri.conf.json rather than a duplicated literal.
    let context = tauri::generate_context!();
    set_app_identifier(&context.config().identifier);

    // Open the database and register application state BEFORE the Tauri event
    // loop starts. The main window is created (hidden) at startup and its
    // frontend invokes `list_repos` immediately — if the state were only
    // managed inside `.setup()`, that first call could race ahead of
    // `app.manage()` and fail with "state not managed" (seen intermittently on
    // a cold first launch). Managing on the builder eliminates the race.
    let dir = resolve_app_data_dir();
    let _ = std::fs::create_dir_all(&dir);
    migrate_legacy_data_dir(&dir);
    let conn = store::open(&dir.join(DB_FILENAME)).expect("failed to open the app database");
    let app_state = AppState::new(conn);

    tauri::Builder::default()
        .manage(app_state)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Capture the display name (productName) so non-UI code can derive
            // the brand from the single config source of truth.
            set_app_name(&app.package_info().name);

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
            commands::os::app_name,
            commands::os::check_for_updates,
            commands::os::install_update,
            commands::os::open_path,
            commands::os::open_url,
            commands::os::write_text_file,
            commands::os::open_terminal,
            commands::os::vscode_available,
            commands::os::vscode_insiders_available,
            commands::os::open_in_vscode,
            commands::os::open_in_vscode_insiders,
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
            commands::gitconfig::read_git_identity,
            commands::gitconfig::save_git_identity,
            commands::pr::list_pull_requests,
            commands::pr::list_repo_pull_requests,
            commands::pr::fetch_pr_threads,
            commands::pr::post_pr_comment,
            commands::pr::resolve_pr_thread,
            commands::pr::submit_pr_review,
            commands::pr::pr_my_vote,
            commands::pr::publish_pr,
            commands::pr::create_pull_request,
            commands::apps::list_presets,
            commands::apps::list_apps,
            commands::apps::create_app,
            commands::apps::update_app,
            commands::apps::set_app_tags,
            commands::apps::delete_app,
            commands::apps::reorder_apps,
            commands::apps::start_app,
            commands::apps::stop_app,
            commands::apps::restart_app,
            commands::apps::start_all_apps,
            commands::apps::stop_all_apps,
            commands::apps::app_logs,
        ])
        .run(context)
        .expect("error while running the app");
}

