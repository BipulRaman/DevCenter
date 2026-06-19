use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter, State};

use crate::error::{AppError, AppResult};
use crate::git;
use crate::models::{ChangeSet, CommitInfo, FileDiff, Repo};
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
/// `stash` true leaves the current changes behind on the old branch; false
/// carries them to the target (git's default).
#[tauri::command]
pub async fn git_checkout(
    id: String,
    branch: String,
    stash: bool,
    state: State<'_, AppState>,
) -> AppResult<Repo> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Repo> {
        let path = PathBuf::from(&id);
        git::checkout(&path, &branch, stash)?;
        let (watched, tags) = meta_for(&st, &id);
        git::repo_info(&path, watched, tags)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Create a new branch from `base`, check it out, and return the repository's
/// refreshed state. `base` may be empty to branch from the current HEAD.
#[tauri::command]
pub async fn git_create_branch(
    id: String,
    name: String,
    base: String,
    state: State<'_, AppState>,
) -> AppResult<Repo> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Repo> {
        let path = PathBuf::from(&id);
        git::create_branch(&path, &name, &base)?;
        let (watched, tags) = meta_for(&st, &id);
        git::repo_info(&path, watched, tags)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Rename a branch (`name` -> `new_name`) and return the repository's refreshed state.
#[tauri::command]
pub async fn git_rename_branch(
    id: String,
    name: String,
    new_name: String,
    state: State<'_, AppState>,
) -> AppResult<Repo> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Repo> {
        let path = PathBuf::from(&id);
        git::rename_branch(&path, &name, &new_name)?;
        let (watched, tags) = meta_for(&st, &id);
        git::repo_info(&path, watched, tags)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Delete a local branch and return the repository's refreshed state. When
/// `force` is false a branch with unmerged commits is refused (git `-d`).
#[tauri::command]
pub async fn git_delete_branch(
    id: String,
    name: String,
    force: bool,
    state: State<'_, AppState>,
) -> AppResult<Repo> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Repo> {
        let path = PathBuf::from(&id);
        git::delete_branch(&path, &name, force)?;
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

/// Working-tree changes for a repo (by id == path), or the files of a specific
/// commit when `sha` is provided (History tab).
#[tauri::command]
pub async fn git_changes(id: String, sha: Option<String>) -> AppResult<ChangeSet> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = Path::new(&id);
        match sha {
            Some(s) => git::commit_changes(p, &s),
            None => git::working_changes(p),
        }
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Unified diff for one file — the working-tree change (`staged` false), the
/// staged change (`staged` true), or a file within a commit (`sha`).
#[tauri::command]
pub async fn git_diff(
    id: String,
    path: String,
    sha: Option<String>,
    staged: Option<bool>,
) -> AppResult<FileDiff> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = Path::new(&id);
        match sha {
            Some(s) => git::commit_file_diff(p, &s, &path),
            None => git::file_diff(p, &path, staged.unwrap_or(false)),
        }
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Stage files into the index (empty list = stage everything) and return the
/// refreshed working changes. Emits `repos_updated`.
#[tauri::command]
pub async fn git_stage(
    id: String,
    files: Vec<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, state, app, move |p| git::stage(p, &files)).await
}

/// Unstage files (empty list = unstage everything) and return the refreshed
/// working changes. Emits `repos_updated`.
#[tauri::command]
pub async fn git_unstage(
    id: String,
    files: Vec<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, state, app, move |p| git::unstage(p, &files)).await
}

/// Discard unstaged changes (empty list = discard everything) and return the
/// refreshed working changes. Destructive — confirm in the UI first. Emits
/// `repos_updated`.
#[tauri::command]
pub async fn git_discard(
    id: String,
    files: Vec<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, state, app, move |p| git::discard(p, &files)).await
}

/// Shared plumbing for stage/unstage/discard: run `op`, return the refreshed
/// working changes, and emit `repos_updated` so the Git Board stays in sync.
async fn staging_op<F>(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
    op: F,
) -> AppResult<ChangeSet>
where
    F: FnOnce(&Path) -> AppResult<()> + Send + 'static,
{
    let st = state.inner().clone();
    let (changes, repos) = tauri::async_runtime::spawn_blocking(
        move || -> AppResult<(ChangeSet, Vec<Repo>)> {
            let p = Path::new(&id);
            op(p)?;
            let changes = git::working_changes(p)?;
            let repos = collect_repos(&st)?;
            Ok((changes, repos))
        },
    )
    .await
    .map_err(|e| AppError::msg(e.to_string()))??;

    let _ = app.emit("repos_updated", &repos);
    Ok(changes)
}

/// Commit the selected files with a summary + optional description, then return
/// the refreshed working changes. Emits `repos_updated` so the Git Board
/// reflects the new clean/ahead state.
#[tauri::command]
pub async fn git_commit(
    id: String,
    summary: String,
    description: String,
    all: bool,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    let st = state.inner().clone();
    let (changes, repos) = tauri::async_runtime::spawn_blocking(
        move || -> AppResult<(ChangeSet, Vec<Repo>)> {
            let p = Path::new(&id);
            git::commit(p, &summary, &description, all)?;
            let changes = git::working_changes(p)?;
            let repos = collect_repos(&st)?;
            Ok((changes, repos))
        },
    )
    .await
    .map_err(|e| AppError::msg(e.to_string()))??;

    let _ = app.emit("repos_updated", &repos);
    Ok(changes)
}

/// Push the current branch to its upstream, then return refreshed working
/// changes (with updated ahead/behind). Emits `repos_updated`.
#[tauri::command]
pub async fn git_push(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    let st = state.inner().clone();
    let (changes, repos) = tauri::async_runtime::spawn_blocking(
        move || -> AppResult<(ChangeSet, Vec<Repo>)> {
            let p = Path::new(&id);
            git::push(p)?;
            let changes = git::working_changes(p)?;
            let repos = collect_repos(&st)?;
            Ok((changes, repos))
        },
    )
    .await
    .map_err(|e| AppError::msg(e.to_string()))??;

    let _ = app.emit("repos_updated", &repos);
    Ok(changes)
}

/// Pull (fast-forward) the current branch from its upstream, then return
/// refreshed working changes. Emits `repos_updated`.
#[tauri::command]
pub async fn git_pull(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    let st = state.inner().clone();
    let (changes, repos) = tauri::async_runtime::spawn_blocking(
        move || -> AppResult<(ChangeSet, Vec<Repo>)> {
            let p = Path::new(&id);
            git::pull(p)?;
            let changes = git::working_changes(p)?;
            let repos = collect_repos(&st)?;
            Ok((changes, repos))
        },
    )
    .await
    .map_err(|e| AppError::msg(e.to_string()))??;

    let _ = app.emit("repos_updated", &repos);
    Ok(changes)
}

/// Recent commit history for a repo (newest first).
#[tauri::command]
pub async fn git_log(id: String, limit: Option<u32>) -> AppResult<Vec<CommitInfo>> {
    tauri::async_runtime::spawn_blocking(move || {
        git::log(Path::new(&id), limit.unwrap_or(100) as usize)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}
