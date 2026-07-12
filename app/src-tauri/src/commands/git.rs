use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter, State};

use crate::error::{AppError, AppResult};
use crate::git;
use crate::models::{ChangeSet, CommitInfo, ConflictFile, ConflictInfo, FileDiff, Repo};
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
/// registry) the UI would otherwise block while a full recursive scan of the
/// developer folders runs — so the scan is performed in the background and its
/// results are pushed to the UI via the `repos_updated` event, keeping the
/// initial landing instant.
#[tauri::command]
pub async fn list_repos(state: State<'_, AppState>, app: AppHandle) -> AppResult<Vec<Repo>> {
    let st = state.inner().clone();
    let (repos, need_scan) = tauri::async_runtime::spawn_blocking(
        move || -> AppResult<(Vec<Repo>, bool)> {
            let empty = {
                let conn = st.db.lock().unwrap();
                store::is_empty(&conn)?
            };
            let repos = collect_repos(&st)?;
            Ok((repos, empty))
        },
    )
    .await
    .map_err(|e| AppError::msg(e.to_string()))??;

    // First run: discover repositories in the background, then notify the UI.
    if need_scan {
        let st = state.inner().clone();
        tauri::async_runtime::spawn(async move {
            let scanned = tauri::async_runtime::spawn_blocking(move || -> AppResult<Vec<Repo>> {
                let found = git::scan(&git::default_scan_roots(), SCAN_DEPTH);
                {
                    let conn = st.db.lock().unwrap();
                    for p in &found {
                        store::ensure_repo(&conn, p)?;
                    }
                }
                collect_repos(&st)
            })
            .await;
            if let Ok(Ok(repos)) = scanned {
                let _ = app.emit("repos_updated", &repos);
            }
        });
    }

    Ok(repos)
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
    context: Option<u32>,
) -> AppResult<FileDiff> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = Path::new(&id);
        let ctx = context.unwrap_or(3);
        match sha {
            Some(s) => git::commit_file_diff(p, &s, &path, ctx),
            None => git::file_diff(p, &path, staged.unwrap_or(false), ctx),
        }
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// The files changed by a pull request (the `base...head` diff), computed
/// locally from the repo's refs. Backs the Pull Requests tab detail pane.
#[tauri::command]
pub async fn git_pr_changes(id: String, base: String, head: String) -> AppResult<ChangeSet> {
    tauri::async_runtime::spawn_blocking(move || git::pr_changes(Path::new(&id), &base, &head))
        .await
        .map_err(|e| AppError::msg(e.to_string()))?
}

/// Unified diff for one file within a pull request (the `base...head` diff).
#[tauri::command]
pub async fn git_pr_file_diff(
    id: String,
    base: String,
    head: String,
    path: String,
    context: Option<u32>,
) -> AppResult<FileDiff> {
    tauri::async_runtime::spawn_blocking(move || {
        git::pr_file_diff(Path::new(&id), &base, &head, &path, context.unwrap_or(3))
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
    staging_op(id, "Stage files", state, app, move |p| git::stage(p, &files)).await
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
    staging_op(id, "Unstage files", state, app, move |p| git::unstage(p, &files)).await
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
    staging_op(id, "Discard changes", state, app, move |p| git::discard(p, &files)).await
}

/// Save the current changes to a new stash and return the refreshed working
/// changes (now clean, with the new stash listed). Emits `repos_updated`.
#[tauri::command]
pub async fn git_stash_push(
    id: String,
    message: String,
    include_untracked: bool,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Stash changes", state, app, move |p| {
        git::stash_push(p, &message, include_untracked)
    })
    .await
}

/// Apply a stash (keeping it) and return the refreshed working changes.
#[tauri::command]
pub async fn git_stash_apply(
    id: String,
    index: usize,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Apply stash", state, app, move |p| git::stash_apply(p, index)).await
}

/// Apply a stash and remove it from the list, returning the refreshed changes.
#[tauri::command]
pub async fn git_stash_pop(
    id: String,
    index: usize,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Restore stash", state, app, move |p| git::stash_pop(p, index)).await
}

/// Delete a stash without applying it, returning the refreshed changes.
#[tauri::command]
pub async fn git_stash_drop(
    id: String,
    index: usize,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Delete stash", state, app, move |p| git::stash_drop(p, index)).await
}

/// Stash only the staged changes, returning the refreshed working changes.
/// Emits `repos_updated`.
#[tauri::command]
pub async fn git_stash_push_staged(
    id: String,
    message: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Stash staged", state, app, move |p| git::stash_push_staged(p, &message)).await
}

/// Delete every stash, returning the refreshed working changes. Destructive —
/// confirm in the UI first. Emits `repos_updated`.
#[tauri::command]
pub async fn git_stash_clear(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Drop all stashes", state, app, |p| git::stash_clear(p)).await
}

/// Raw unified diff for a stash ("View Stash…"), shown as plain text.
#[tauri::command]
pub async fn git_stash_show(id: String, index: usize) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || git::stash_show(Path::new(&id), index))
        .await
        .map_err(|e| AppError::msg(e.to_string()))?
}

/// Shared plumbing for stage/unstage/discard: run `op`, return the refreshed
/// working changes, and emit `repos_updated` so the Git Board stays in sync.
/// Also records the action (success/failure) in the "Show Git Output" log.
async fn staging_op<F>(
    id: String,
    label: &'static str,
    state: State<'_, AppState>,
    app: AppHandle,
    op: F,
) -> AppResult<ChangeSet>
where
    F: FnOnce(&Path) -> AppResult<()> + Send + 'static,
{
    let st = state.inner().clone();
    let log_id = id.clone();
    let result = tauri::async_runtime::spawn_blocking(
        move || -> AppResult<(ChangeSet, Vec<Repo>)> {
            let p = Path::new(&id);
            op(p)?;
            let changes = git::working_changes(p)?;
            let repos = collect_repos(&st)?;
            Ok((changes, repos))
        },
    )
    .await
    .map_err(|e| AppError::msg(e.to_string()))?;

    git::record_action(
        Path::new(&log_id),
        label,
        &result.as_ref().map(|_| ()).map_err(|e| e.to_string()),
    );

    let (changes, repos) = result?;
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
    amend: bool,
    signoff: bool,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Commit", state, app, move |p| {
        git::commit(p, &summary, &description, all, amend, signoff).map(|_| ())
    })
    .await
}

/// Undo the current HEAD commit (soft reset to its parent), returning the
/// refreshed working changes — the undone commit's files reappear as staged.
/// Only allowed when `sha` is the current HEAD commit. Emits `repos_updated`.
#[tauri::command]
pub async fn git_undo_commit(
    id: String,
    sha: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Undo commit", state, app, move |p| git::undo_commit(p, &sha)).await
}

/// Push the current branch to its upstream, then return refreshed working
/// changes (with updated ahead/behind). Emits `repos_updated`.
#[tauri::command]
pub async fn git_push(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Push", state, app, |p| git::push(p)).await
}

/// Pull the current branch from its upstream (`rebase` false = fast-forward
/// only, true = `git pull --rebase`), then return refreshed working changes.
/// Emits `repos_updated`.
#[tauri::command]
pub async fn git_pull(
    id: String,
    rebase: bool,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, if rebase { "Pull (rebase)" } else { "Pull" }, state, app, move |p| git::pull(p, rebase)).await
}

/// Pull from an explicit remote/branch, then return refreshed working changes.
/// Emits `repos_updated`.
#[tauri::command]
pub async fn git_pull_from(
    id: String,
    remote: String,
    branch: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Pull from", state, app, move |p| git::pull_from(p, &remote, &branch)).await
}

/// Push the current branch to an explicit remote/branch, then return refreshed
/// working changes. Emits `repos_updated`.
#[tauri::command]
pub async fn git_push_to(
    id: String,
    remote: String,
    branch: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Push to", state, app, move |p| git::push_to(p, &remote, &branch)).await
}

/// Fetch the current branch's remote, pruning stale remote-tracking branches.
/// Emits `repos_updated`.
#[tauri::command]
pub async fn git_fetch_prune(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Fetch (prune)", state, app, |p| git::fetch_prune(p)).await
}

/// Fetch every configured remote. Emits `repos_updated`.
#[tauri::command]
pub async fn git_fetch_all(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Fetch (all remotes)", state, app, |p| git::fetch_all(p)).await
}

/// Merge `branch` into the current branch, then return refreshed working
/// changes. A conflicted merge is left in-progress (not an error) — the
/// caller should check `git_conflicts` afterwards. Emits `repos_updated`.
#[tauri::command]
pub async fn git_merge_branch(
    id: String,
    branch: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Merge branch", state, app, move |p| git::merge_branch(p, &branch)).await
}

/// Rebase the current branch onto `onto`, then return refreshed working
/// changes. A conflicted rebase is left in-progress (not an error) — the
/// caller should check `git_conflicts` afterwards. Emits `repos_updated`.
#[tauri::command]
pub async fn git_rebase_branch(
    id: String,
    onto: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Rebase branch", state, app, move |p| git::rebase_branch(p, &onto)).await
}

/// Delete a branch on the `origin` remote, then return refreshed working
/// changes. Emits `repos_updated`.
#[tauri::command]
pub async fn git_delete_remote_branch(
    id: String,
    branch: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Delete remote branch", state, app, move |p| git::delete_remote_branch(p, &branch)).await
}

/// Current merge-conflict state for a repo (kind, side labels, conflicted files).
#[tauri::command]
pub async fn git_conflicts(id: String) -> AppResult<ConflictInfo> {
    tauri::async_runtime::spawn_blocking(move || git::conflict_state(Path::new(&id)))
        .await
        .map_err(|e| AppError::msg(e.to_string()))?
}

/// The three sides + marker content of one conflicted file.
#[tauri::command]
pub async fn git_conflict_file(id: String, path: String) -> AppResult<ConflictFile> {
    tauri::async_runtime::spawn_blocking(move || git::conflict_file(Path::new(&id), &path))
        .await
        .map_err(|e| AppError::msg(e.to_string()))?
}

/// Resolve one conflicted file — by taking a whole side (`side` = "ours"|"theirs")
/// or by writing explicit merged `content` — then return the refreshed conflict
/// state. Emits `repos_updated`.
#[tauri::command]
pub async fn git_resolve_conflict(
    id: String,
    path: String,
    side: Option<String>,
    content: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ConflictInfo> {
    let st = state.inner().clone();
    let (info, repos) = tauri::async_runtime::spawn_blocking(
        move || -> AppResult<(ConflictInfo, Vec<Repo>)> {
            let p = Path::new(&id);
            if let Some(c) = content {
                git::resolve_conflict_content(p, &path, &c)?;
            } else {
                git::resolve_conflict_side(p, &path, side.as_deref().unwrap_or("ours"))?;
            }
            let info = git::conflict_state(p)?;
            let repos = collect_repos(&st)?;
            Ok((info, repos))
        },
    )
    .await
    .map_err(|e| AppError::msg(e.to_string()))??;
    let _ = app.emit("repos_updated", &repos);
    Ok(info)
}

/// Abort the in-progress merge/rebase/etc., returning refreshed working changes.
/// Emits `repos_updated`.
#[tauri::command]
pub async fn git_conflict_abort(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    let st = state.inner().clone();
    let (changes, repos) = tauri::async_runtime::spawn_blocking(
        move || -> AppResult<(ChangeSet, Vec<Repo>)> {
            let p = Path::new(&id);
            let kind = git::conflict_state(p)?.kind;
            git::conflict_abort(p, &kind)?;
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

/// Complete the in-progress operation (all conflicts must be staged first),
/// returning refreshed working changes. Emits `repos_updated`.
#[tauri::command]
pub async fn git_conflict_continue(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    let st = state.inner().clone();
    let (changes, repos) = tauri::async_runtime::spawn_blocking(
        move || -> AppResult<(ChangeSet, Vec<Repo>)> {
            let p = Path::new(&id);
            let kind = git::conflict_state(p)?.kind;
            git::conflict_continue(p, &kind)?;
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

// ===================== Remote =====================

/// The raw `origin` remote URL (unlike `Repo.remote`, not stripped of scheme).
#[tauri::command]
pub async fn git_remote_url(id: String) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || git::remote_url(Path::new(&id)))
        .await
        .map_err(|e| AppError::msg(e.to_string()))?
}

/// Point `origin` at a new URL, returning the repository's refreshed state.
/// Emits `repos_updated`.
#[tauri::command]
pub async fn git_set_remote_url(
    id: String,
    url: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<Repo> {
    let st = state.inner().clone();
    let log_id = id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || -> AppResult<(Repo, Vec<Repo>)> {
        let path = PathBuf::from(&id);
        git::set_remote_url(&path, &url)?;
        let (watched, tags) = meta_for(&st, &id);
        let repo = git::repo_info(&path, watched, tags)?;
        let repos = collect_repos(&st)?;
        Ok((repo, repos))
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?;

    git::record_action(
        Path::new(&log_id),
        "Change remote URL",
        &result.as_ref().map(|_| ()).map_err(|e| e.to_string()),
    );
    let (repo, repos) = result?;
    let _ = app.emit("repos_updated", &repos);
    Ok(repo)
}

/// All configured remotes.
#[tauri::command]
pub async fn git_list_remotes(id: String) -> AppResult<Vec<crate::models::RemoteInfo>> {
    tauri::async_runtime::spawn_blocking(move || git::list_remotes(Path::new(&id)))
        .await
        .map_err(|e| AppError::msg(e.to_string()))?
}

/// Add a new remote, returning the refreshed working changes. Emits `repos_updated`.
#[tauri::command]
pub async fn git_add_remote(
    id: String,
    name: String,
    url: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Add remote", state, app, move |p| git::add_remote(p, &name, &url)).await
}

/// Remove a remote, returning the refreshed working changes. Emits `repos_updated`.
#[tauri::command]
pub async fn git_remove_remote(
    id: String,
    name: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Remove remote", state, app, move |p| git::remove_remote(p, &name)).await
}

// ===================== Tags =====================

/// All tags in the repository.
#[tauri::command]
pub async fn git_list_tags(id: String) -> AppResult<Vec<crate::models::GitTagInfo>> {
    tauri::async_runtime::spawn_blocking(move || git::list_git_tags(Path::new(&id)))
        .await
        .map_err(|e| AppError::msg(e.to_string()))?
}

/// Create a tag (annotated when `message` is non-empty). `target` may be empty
/// for HEAD. Returns the refreshed working changes. Emits `repos_updated`.
#[tauri::command]
pub async fn git_create_tag(
    id: String,
    name: String,
    target: String,
    message: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Create tag", state, app, move |p| {
        git::create_tag(p, &name, &target, &message)
    })
    .await
}

/// Delete a tag, returning the refreshed working changes. Emits `repos_updated`.
#[tauri::command]
pub async fn git_delete_tag(
    id: String,
    name: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Delete tag", state, app, move |p| git::delete_tag(p, &name)).await
}

/// Check out a tag (detached HEAD), returning the refreshed working changes.
/// Emits `repos_updated`.
#[tauri::command]
pub async fn git_checkout_tag(
    id: String,
    name: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Checkout tag", state, app, move |p| git::checkout_tag(p, &name)).await
}

/// Delete a tag on the `origin` remote, returning the refreshed working
/// changes. Emits `repos_updated`.
#[tauri::command]
pub async fn git_delete_remote_tag(
    id: String,
    name: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Delete remote tag", state, app, move |p| git::delete_remote_tag(p, &name)).await
}

/// Push all local tags to `origin`, returning the refreshed working changes.
/// Emits `repos_updated`.
#[tauri::command]
pub async fn git_push_tags(
    id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Push tags", state, app, |p| git::push_tags(p)).await
}

// ===================== Worktrees =====================

/// All linked worktrees for a repository.
#[tauri::command]
pub async fn git_list_worktrees(id: String) -> AppResult<Vec<crate::models::WorktreeInfo>> {
    tauri::async_runtime::spawn_blocking(move || git::list_worktrees(Path::new(&id)))
        .await
        .map_err(|e| AppError::msg(e.to_string()))?
}

/// Add a new linked worktree, returning the refreshed working changes. Emits
/// `repos_updated`.
#[tauri::command]
pub async fn git_add_worktree(
    id: String,
    target_path: String,
    branch: String,
    create_branch: bool,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Add worktree", state, app, move |p| {
        git::add_worktree(p, &target_path, &branch, create_branch)
    })
    .await
}

/// Remove a linked worktree, returning the refreshed working changes. Emits
/// `repos_updated`.
#[tauri::command]
pub async fn git_remove_worktree(
    id: String,
    target_path: String,
    force: bool,
    state: State<'_, AppState>,
    app: AppHandle,
) -> AppResult<ChangeSet> {
    staging_op(id, "Remove worktree", state, app, move |p| {
        git::remove_worktree(p, &target_path, force)
    })
    .await
}

// ===================== Show Git Output =====================

/// Snapshot of the "Show Git Output" activity log (newest first).
#[tauri::command]
pub async fn git_action_log() -> AppResult<Vec<crate::models::GitLogEntry>> {
    tauri::async_runtime::spawn_blocking(git::action_log)
        .await
        .map_err(|e| AppError::msg(e.to_string()))
}
