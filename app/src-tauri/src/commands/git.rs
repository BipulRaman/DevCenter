use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter, State};

use crate::error::{AppError, AppResult};
use crate::git;
use crate::models::Repo;
use crate::state::AppState;
use crate::store;

const SCAN_DEPTH: u32 = 3;

/// Build the repo list from the registry, computing live git info for each path.
/// Paths that are no longer valid repositories are silently skipped.
fn collect_repos(state: &AppState) -> AppResult<Vec<Repo>> {
    let (paths, tag_map) = {
        let conn = state.db.lock().unwrap();
        (store::list_paths(&conn)?, store::tags_by_path(&conn)?)
    };
    let mut repos = Vec::new();
    for (path, watched) in paths {
        let tags = tag_map.get(&path).cloned().unwrap_or_default();
        if let Ok(repo) = git::repo_info(Path::new(&path), watched, tags) {
            repos.push(repo);
        }
    }
    Ok(repos)
}

/// Read a single repo's watched flag and tags in one lock.
fn meta_for(state: &AppState, id: &str) -> (bool, Vec<String>) {
    let conn = state.db.lock().unwrap();
    let watched = store::list_paths(&conn)
        .ok()
        .and_then(|paths| paths.into_iter().find(|(p, _)| p == id).map(|(_, w)| w))
        .unwrap_or(false);
    let tags = store::tags_for(&conn, id).unwrap_or_default();
    (watched, tags)
}

/// List all registered repositories with live status. On first run (empty
/// registry) this performs a one-time scan of common developer roots.
#[tauri::command]
pub async fn list_repos(state: State<'_, AppState>) -> AppResult<Vec<Repo>> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Vec<Repo>> {
        let empty = {
            let conn = st.db.lock().unwrap();
            store::is_empty(&conn)?
        };
        if empty {
            let found = git::scan(&git::default_scan_roots(), SCAN_DEPTH);
            let conn = st.db.lock().unwrap();
            for p in &found {
                store::ensure_repo(&conn, p)?;
            }
        }
        collect_repos(&st)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Discover repositories under the given roots (or the default roots when the
/// list is empty), register any new ones, and return the full list.
#[tauri::command]
pub async fn scan_repos(
    roots: Vec<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<Vec<Repo>> {
    let st = state.inner().clone();
    let repos = tauri::async_runtime::spawn_blocking(move || -> AppResult<Vec<Repo>> {
        let root_paths: Vec<PathBuf> = if roots.is_empty() {
            git::default_scan_roots()
        } else {
            roots.into_iter().map(PathBuf::from).collect()
        };
        let found = git::scan(&root_paths, SCAN_DEPTH);
        {
            let conn = st.db.lock().unwrap();
            for p in &found {
                store::ensure_repo(&conn, p)?;
            }
        }
        collect_repos(&st)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))??;

    let _ = app.emit("repos_updated", &repos);
    Ok(repos)
}

/// Fetch all remotes for one repository (by id == path) and return its refreshed state.
#[tauri::command]
pub async fn git_fetch(id: String, state: State<'_, AppState>) -> AppResult<Repo> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Repo> {
        let path = PathBuf::from(&id);
        git::fetch(&path)?;
        let (watched, tags) = meta_for(&st, &id);
        git::repo_info(&path, watched, tags)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Clone `url` into `dir`, register the new repository, and return its state.
#[tauri::command]
pub async fn git_clone(url: String, dir: String, state: State<'_, AppState>) -> AppResult<Repo> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Repo> {
        let new_path = git::clone(&url, Path::new(&dir))?;
        let id = new_path.to_string_lossy().replace('\\', "/");
        {
            let conn = st.db.lock().unwrap();
            store::ensure_repo(&conn, &id)?;
        }
        git::repo_info(&new_path, false, Vec::new())
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Register an already-cloned repository by folder path (the repo root or any
/// subfolder), then return its state. Idempotent: re-adding an existing repo
/// just returns it with its current watched flag.
#[tauri::command]
pub async fn add_repo(path: String, state: State<'_, AppState>) -> AppResult<Repo> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Repo> {
        let root = git::resolve_repo_root(Path::new(&path))?;
        let id = root.to_string_lossy().replace('\\', "/");
        {
            let conn = st.db.lock().unwrap();
            store::ensure_repo(&conn, &id)?;
        }
        let (watched, tags) = meta_for(&st, &id);
        git::repo_info(&root, watched, tags)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// List the local branches of a repository (by id == path).
#[tauri::command]
pub async fn list_branches(id: String) -> AppResult<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || git::list_branches(Path::new(&id)))
        .await
        .map_err(|e| AppError::msg(e.to_string()))?
}

/// Check out an existing local branch and return the repository's refreshed state.
#[tauri::command]
pub async fn git_checkout(
    id: String,
    branch: String,
    state: State<'_, AppState>,
) -> AppResult<Repo> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Repo> {
        let path = PathBuf::from(&id);
        git::checkout(&path, &branch)?;
        let (watched, tags) = meta_for(&st, &id);
        git::repo_info(&path, watched, tags)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Toggle whether a repository's pull requests are watched.
#[tauri::command]
pub async fn set_repo_watched(
    id: String,
    watched: bool,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<()> {
        let conn = st.db.lock().unwrap();
        store::set_watched(&conn, &id, watched)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Remove a repository from DevCenter's list (files on disk are untouched).
#[tauri::command]
pub async fn remove_repo(id: String, state: State<'_, AppState>) -> AppResult<()> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<()> {
        let conn = st.db.lock().unwrap();
        store::remove_repo(&conn, &id)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Replace a repository's tags and return its refreshed state.
#[tauri::command]
pub async fn set_repo_tags(
    id: String,
    tags: Vec<String>,
    state: State<'_, AppState>,
) -> AppResult<Repo> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Repo> {
        {
            let mut conn = st.db.lock().unwrap();
            store::set_tags(&mut conn, &id, &tags)?;
        }
        let (watched, tags) = meta_for(&st, &id);
        git::repo_info(Path::new(&id), watched, tags)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// List all distinct tags in use across repositories.
#[tauri::command]
pub async fn list_tags(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Vec<String>> {
        let conn = st.db.lock().unwrap();
        store::all_tags(&conn)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}
