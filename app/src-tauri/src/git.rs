use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use git2::{Delta, DiffOptions, Oid, Patch, Repository, Sort, StatusEntry, StatusOptions};

use base64::Engine;

use crate::error::{AppError, AppResult};
use crate::models::{
    ChangeSet, CommitInfo, ConflictFile, ConflictInfo, DiffHunk, DiffLine, FileChange, FileDiff,
    GitLogEntry, GitTagInfo, RemoteInfo, Repo, StashEntry, WorktreeInfo,
};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Build a `git` command that won't flash a console window on Windows.
fn git_cmd() -> Command {
    let cmd = Command::new("git");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = cmd;
        cmd.creation_flags(CREATE_NO_WINDOW);
        return cmd;
    }
    #[allow(unreachable_code)]
    cmd
}

/// Normalize a path to a forward-slash string (used as both `path` and `id`).
fn norm(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn short_oid(oid: git2::Oid) -> String {
    let s = oid.to_string();
    s.chars().take(7).collect()
}

/// Compute live information for a repository at `path`.
pub fn repo_info(path: &Path, watched: bool, tags: Vec<String>) -> AppResult<Repo> {
    let repo = Repository::open(path)?;

    let head = repo.head().ok();
    let branch = match &head {
        Some(h) if h.is_branch() => h.shorthand().unwrap_or("HEAD").to_string(),
        Some(h) => h.target().map(short_oid).unwrap_or_else(|| "(detached)".into()),
        None => "(no commits)".into(),
    };

    let (ahead, behind) = ahead_behind(&repo).unwrap_or((0, 0));

    let remote_url = repo
        .find_remote("origin")
        .ok()
        .and_then(|r| r.url().map(|s| s.to_string()));
    let remote = remote_url.as_deref().map(clean_remote).unwrap_or_default();
    let provider = detect_provider(remote_url.as_deref().unwrap_or("")).to_string();

    let status = if is_dirty(&repo) { "dirty" } else { "clean" }.to_string();

    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| norm(path));

    let id = norm(path);

    Ok(Repo {
        id: id.clone(),
        name,
        path: id,
        branch,
        remote,
        provider,
        status,
        ahead,
        behind,
        last_fetch: last_fetch(path),
        watched,
        tags,
    })
}

fn ahead_behind(repo: &Repository) -> Option<(u32, u32)> {
    let head = repo.head().ok()?;
    if !head.is_branch() {
        return None;
    }
    let local = head.target()?;
    let upstream_name = repo.branch_upstream_name(head.name()?).ok()?;
    let upstream_name = upstream_name.as_str()?.to_string();
    let upstream = repo.find_reference(&upstream_name).ok()?;
    let upstream_oid = upstream.target()?;
    let (a, b) = repo.graph_ahead_behind(local, upstream_oid).ok()?;
    Some((a as u32, b as u32))
}

fn is_dirty(repo: &Repository) -> bool {
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .include_ignored(false)
        .exclude_submodules(true);
    match repo.statuses(Some(&mut opts)) {
        Ok(statuses) => !statuses.is_empty(),
        Err(_) => false,
    }
}

fn clean_remote(url: &str) -> String {
    let s = url.trim();
    // scp-like: git@host:owner/repo(.git)
    if let Some(rest) = s.strip_prefix("git@") {
        let replaced = rest.replacen(':', "/", 1);
        return replaced.trim_end_matches('/').trim_end_matches(".git").to_string();
    }
    let mut s = s;
    for p in ["https://", "http://", "ssh://", "git://"] {
        if let Some(r) = s.strip_prefix(p) {
            s = r;
            break;
        }
    }
    // strip an embedded "user@" before the first '/'
    if let (Some(at), Some(slash)) = (s.find('@'), s.find('/')) {
        if at < slash {
            s = &s[at + 1..];
        }
    }
    s.trim_end_matches('/').trim_end_matches(".git").to_string()
}

fn detect_provider(url: &str) -> &'static str {
    let u = url.to_lowercase();
    if u.contains("github.com") {
        "github"
    } else if u.contains("dev.azure.com") || u.contains("visualstudio.com") {
        "azure"
    } else {
        "other"
    }
}

fn last_fetch(path: &Path) -> Option<String> {
    let fetch_head = path.join(".git").join("FETCH_HEAD");
    let meta = std::fs::metadata(&fetch_head).ok()?;
    let modified = meta.modified().ok()?;
    Some(humanize_since(modified))
}

fn humanize_since(t: SystemTime) -> String {
    let secs = SystemTime::now()
        .duration_since(t)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if secs < 60 {
        "just now".to_string()
    } else if secs < 3_600 {
        format!("{} min ago", secs / 60)
    } else if secs < 86_400 {
        format!("{} h ago", secs / 3_600)
    } else if secs < 172_800 {
        "Yesterday".to_string()
    } else if secs < 604_800 {
        format!("{} d ago", secs / 86_400)
    } else {
        format!("{} w ago", secs / 604_800)
    }
}

// ---------- Discovery ----------

fn should_skip(name: &str) -> bool {
    name.starts_with('.')
        || matches!(
            name,
            "node_modules"
                | "target"
                | "bin"
                | "obj"
                | "dist"
                | "build"
                | "vendor"
                | "packages"
                | "__pycache__"
        )
}

fn scan_dir(dir: &Path, depth: u32, max_depth: u32, out: &mut Vec<PathBuf>) {
    if depth > max_depth {
        return;
    }
    if dir.join(".git").exists() {
        out.push(dir.to_path_buf());
        return; // don't descend into a repository
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if should_skip(&name) {
            continue;
        }
        scan_dir(&p, depth + 1, max_depth, out);
    }
}

/// Discover repositories (directories containing `.git`) under the given roots.
pub fn scan(roots: &[PathBuf], max_depth: u32) -> Vec<String> {
    let mut found = Vec::new();
    for root in roots {
        if root.is_dir() {
            scan_dir(root, 0, max_depth, &mut found);
        }
    }
    found.sort();
    found.dedup();
    found.iter().map(|p| norm(p)).collect()
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

/// Curated set of common developer roots that actually exist on this machine.
/// Used for a first-run scan so the user sees real repositories immediately.
pub fn default_scan_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(home) = home_dir() {
        for name in [
            "source/repos",
            "Projects",
            "projects",
            "git",
            "dev",
            "code",
            "repos",
            "GitHub",
            "src",
            "work",
        ] {
            let p = home.join(name);
            if p.is_dir() {
                roots.push(p);
            }
        }
    }
    for p in [
        r"D:\GitHub",
        r"C:\GitHub",
        r"D:\source\repos",
        r"D:\repos",
        r"D:\dev",
        r"D:\work",
        r"C:\source\repos",
    ] {
        let pb = PathBuf::from(p);
        if pb.is_dir() {
            roots.push(pb);
        }
    }
    roots.sort();
    roots.dedup();
    roots
}

// ---------- Network operations (system git) ----------

/// Fetch the current branch's remote (plain `git fetch`, no pruning).
pub fn fetch(path: &Path) -> AppResult<()> {
    run_git(path, &["fetch"])
}

/// Fetch the current branch's remote, pruning stale remote-tracking branches.
pub fn fetch_prune(path: &Path) -> AppResult<()> {
    run_git(path, &["fetch", "--prune"])
}

/// Fetch every configured remote.
pub fn fetch_all(path: &Path) -> AppResult<()> {
    run_git(path, &["fetch", "--all"])
}

/// Push the current branch to its upstream. When the branch has no upstream
/// yet, publish it to `origin` and set tracking (`-u origin <branch>`).
pub fn push(path: &Path) -> AppResult<()> {
    let repo = Repository::open(path)?;
    let head = repo.head()?;
    if !head.is_branch() {
        return Err(AppError::msg("Not on a branch — cannot push a detached HEAD."));
    }
    let branch = head.shorthand().unwrap_or("HEAD").to_string();
    let has_upstream = head
        .name()
        .and_then(|n| repo.branch_upstream_name(n).ok())
        .is_some();

    let mut cmd = git_cmd();
    cmd.arg("-C").arg(path).arg("push");
    if !has_upstream {
        cmd.args(["-u", "origin", &branch]);
    }
    let output = cmd.output()?;
    if !output.status.success() {
        return Err(AppError::msg(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

/// Pull the current branch from its upstream. `rebase` false uses `--ff-only`
/// (avoids surprise merge commits, matching the default Pull button); `rebase`
/// true replays local commits on top instead (`git pull --rebase`), which can
/// leave a rebase in progress on conflicts (handled by the conflict resolver).
pub fn pull(path: &Path, rebase: bool) -> AppResult<()> {
    let mut cmd = git_cmd();
    cmd.arg("-C").arg(path).arg("pull");
    if rebase {
        cmd.arg("--rebase");
    } else {
        cmd.arg("--ff-only");
    }
    let output = cmd.output()?;
    if !output.status.success() {
        let out = String::from_utf8_lossy(&output.stdout);
        let err = String::from_utf8_lossy(&output.stderr);
        if rebase && (out.contains("CONFLICT") || err.contains("CONFLICT") || out.contains("could not apply")) {
            // Left in-progress on purpose — the caller refreshes ConflictInfo.
            return Ok(());
        }
        let err = err.trim().to_string();
        let msg = if err.contains("not possible to fast-forward") || err.contains("diverging") {
            "Local and remote have diverged. Pull is fast-forward only — commit or stash, then merge/rebase manually.".to_string()
        } else if err.is_empty() {
            "Pull failed.".to_string()
        } else {
            err
        };
        return Err(AppError::msg(msg));
    }
    Ok(())
}

/// Pull from an explicit `remote`/`branch` instead of the tracked upstream
/// (`git pull <remote> <branch>`).
pub fn pull_from(path: &Path, remote: &str, branch: &str) -> AppResult<()> {
    let remote = remote.trim();
    let branch = branch.trim();
    if remote.is_empty() || branch.is_empty() {
        return Err(AppError::msg("Enter a remote and a branch."));
    }
    run_git(path, &["pull", remote, branch])
}

/// Push the current branch to an explicit `remote`/`branch` (`git push <remote>
/// HEAD:<branch>`), setting it as the upstream.
pub fn push_to(path: &Path, remote: &str, branch: &str) -> AppResult<()> {
    let remote = remote.trim();
    let branch = branch.trim();
    if remote.is_empty() || branch.is_empty() {
        return Err(AppError::msg("Enter a remote and a branch."));
    }
    run_git(path, &["push", "-u", remote, &format!("HEAD:{branch}")])
}

/// Merge `branch` into the current branch (`git merge --no-edit <branch>`).
/// When the merge results in conflicts, this is NOT treated as a hard error —
/// the merge is left in-progress (MERGE_HEAD + conflict markers written to the
/// working tree) for the conflict resolver to handle, matching how `pull`
/// leaves a diverged branch for the user rather than failing silently.
pub fn merge_branch(path: &Path, branch: &str) -> AppResult<()> {
    let branch = branch.trim();
    if branch.is_empty() {
        return Err(AppError::msg("Choose a branch to merge."));
    }
    let output = git_cmd()
        .arg("-C")
        .arg(path)
        .args(["merge", "--no-edit", branch])
        .output()?;
    if !output.status.success() {
        let out = String::from_utf8_lossy(&output.stdout);
        let err = String::from_utf8_lossy(&output.stderr);
        if out.contains("CONFLICT") || out.contains("Automatic merge failed") {
            // Left in-progress on purpose — the caller refreshes ConflictInfo.
            return Ok(());
        }
        let msg = if !err.trim().is_empty() {
            err.trim().to_string()
        } else if !out.trim().is_empty() {
            out.trim().to_string()
        } else {
            format!("Merge of \"{branch}\" failed.")
        };
        return Err(AppError::msg(msg));
    }
    Ok(())
}

/// Rebase the current branch onto `onto` (`git rebase <onto>`). Like
/// `merge_branch`, a conflicting rebase is left in-progress rather than
/// treated as an error — the conflict resolver handles it (`kind` reports
/// "rebase").
pub fn rebase_branch(path: &Path, onto: &str) -> AppResult<()> {
    let onto = onto.trim();
    if onto.is_empty() {
        return Err(AppError::msg("Choose a branch to rebase onto."));
    }
    let output = git_cmd().arg("-C").arg(path).args(["rebase", onto]).output()?;
    if !output.status.success() {
        let out = String::from_utf8_lossy(&output.stdout);
        let err = String::from_utf8_lossy(&output.stderr);
        if out.contains("CONFLICT") || err.contains("CONFLICT") || out.contains("could not apply") {
            return Ok(());
        }
        let msg = if !err.trim().is_empty() {
            err.trim().to_string()
        } else if !out.trim().is_empty() {
            out.trim().to_string()
        } else {
            format!("Rebase onto \"{onto}\" failed.")
        };
        return Err(AppError::msg(msg));
    }
    Ok(())
}

/// Delete a branch on the `origin` remote (`git push origin --delete <branch>`).
pub fn delete_remote_branch(path: &Path, branch: &str) -> AppResult<()> {
    let branch = branch.trim();
    if branch.is_empty() {
        return Err(AppError::msg("Choose a branch to delete."));
    }
    run_git(path, &["push", "origin", "--delete", branch])
}

// ===================== Merge-conflict resolution =====================

/// Run a git subcommand at `path`, mapping a non-zero exit to its stderr.
fn run_git(path: &Path, args: &[&str]) -> AppResult<()> {
    run_git_env(path, args, &[])
}

fn run_git_env(path: &Path, args: &[&str], env: &[(&str, &str)]) -> AppResult<()> {
    let mut cmd = git_cmd();
    cmd.arg("-C").arg(path).args(args);
    for (k, v) in env {
        cmd.env(k, v);
    }
    let output = cmd.output()?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::msg(if err.is_empty() {
            format!("git {} failed", args.join(" "))
        } else {
            err
        }));
    }
    Ok(())
}

/// Conflicted paths from the index (sorted, deduped, forward slashes).
fn conflicted_files(repo: &Repository) -> Vec<String> {
    let mut files = Vec::new();
    if let Ok(index) = repo.index() {
        if let Ok(conflicts) = index.conflicts() {
            for c in conflicts.flatten() {
                let entry = c.our.or(c.their).or(c.ancestor);
                if let Some(e) = entry {
                    let p = String::from_utf8_lossy(&e.path).replace('\\', "/");
                    if !files.contains(&p) {
                        files.push(p);
                    }
                }
            }
        }
    }
    files.sort();
    files
}

/// Extract the branch name from a "Merge branch 'X'" / "Merge remote-tracking
/// branch 'origin/X'" message line.
fn parse_merge_branch(msg: &str) -> Option<String> {
    let start = msg.find('\'')? + 1;
    let rest = &msg[start..];
    let end = rest.find('\'')?;
    let name = &rest[..end];
    Some(name.rsplit('/').next().unwrap_or(name).to_string())
}

/// Best-effort human label for the "theirs" side of an in-progress operation.
fn theirs_label(git_dir: &Path, kind: &str) -> String {
    let read_first = |rel: &str| -> Option<String> {
        std::fs::read_to_string(git_dir.join(rel))
            .ok()
            .and_then(|s| s.lines().next().map(|l| l.trim().to_string()))
            .filter(|s| !s.is_empty())
    };
    match kind {
        "rebase" => read_first("rebase-merge/head-name")
            .map(|s| s.rsplit('/').next().unwrap_or(&s).to_string())
            .unwrap_or_else(|| "rebase".to_string()),
        "cherry-pick" => read_first("CHERRY_PICK_HEAD")
            .map(|s| s.chars().take(7).collect())
            .unwrap_or_else(|| "cherry-pick".to_string()),
        "revert" => read_first("REVERT_HEAD")
            .map(|s| s.chars().take(7).collect())
            .unwrap_or_else(|| "revert".to_string()),
        _ => {
            if let Some(msg) = read_first("MERGE_MSG") {
                if let Some(name) = parse_merge_branch(&msg) {
                    return name;
                }
            }
            read_first("MERGE_HEAD")
                .map(|s| s.chars().take(7).collect())
                .unwrap_or_else(|| "incoming".to_string())
        }
    }
}

/// Inspect a repo for an in-progress merge/rebase/cherry-pick/revert that left
/// conflicts. `kind` is "none" when the index has no conflicts.
pub fn conflict_state(path: &Path) -> AppResult<ConflictInfo> {
    let repo = Repository::open(path)?;
    let git_dir = repo.path().to_path_buf();
    let files = conflicted_files(&repo);

    let kind = if git_dir.join("MERGE_HEAD").exists() {
        "merge"
    } else if git_dir.join("rebase-merge").exists() || git_dir.join("rebase-apply").exists() {
        "rebase"
    } else if git_dir.join("CHERRY_PICK_HEAD").exists() {
        "cherry-pick"
    } else if git_dir.join("REVERT_HEAD").exists() {
        "revert"
    } else if files.is_empty() {
        "none"
    } else {
        "merge"
    };

    let ours = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()))
        .unwrap_or_else(|| "HEAD".to_string());
    let theirs = theirs_label(&git_dir, kind);

    Ok(ConflictInfo {
        kind: kind.to_string(),
        ours,
        theirs,
        files,
    })
}

/// Read the three sides + the working-tree (marker) content of a conflicted file.
pub fn conflict_file(path: &Path, file: &str) -> AppResult<ConflictFile> {
    let repo = Repository::open(path)?;
    let index = repo.index()?;
    let target = file.replace('\\', "/");

    let read_blob = |entry: &Option<git2::IndexEntry>| -> (String, bool) {
        if let Some(e) = entry {
            if let Ok(blob) = repo.find_blob(e.id) {
                if blob.is_binary() {
                    return (String::new(), true);
                }
                return (String::from_utf8_lossy(blob.content()).to_string(), false);
            }
        }
        (String::new(), false)
    };

    let (mut base, mut ours, mut theirs, mut binary) =
        (String::new(), String::new(), String::new(), false);
    if let Ok(conflicts) = index.conflicts() {
        for c in conflicts.flatten() {
            let p = c
                .our
                .as_ref()
                .or(c.their.as_ref())
                .or(c.ancestor.as_ref())
                .map(|e| String::from_utf8_lossy(&e.path).replace('\\', "/"));
            if p.as_deref() == Some(target.as_str()) {
                let (b, bb) = read_blob(&c.ancestor);
                let (o, ob) = read_blob(&c.our);
                let (t, tb) = read_blob(&c.their);
                base = b;
                ours = o;
                theirs = t;
                binary = bb || ob || tb;
                break;
            }
        }
    }
    let merged = if binary {
        String::new()
    } else {
        std::fs::read_to_string(path.join(&target)).unwrap_or_default()
    };
    Ok(ConflictFile {
        path: target,
        base,
        ours,
        theirs,
        merged,
        binary,
    })
}

/// Resolve a conflicted file by taking one whole side ("ours"|"theirs"), then stage it.
pub fn resolve_conflict_side(path: &Path, file: &str, side: &str) -> AppResult<()> {
    let flag = if side == "theirs" { "--theirs" } else { "--ours" };
    run_git(path, &["checkout", flag, "--", file])?;
    run_git(path, &["add", "--", file])
}

/// Resolve a conflicted file with explicit merged content, then stage it.
pub fn resolve_conflict_content(path: &Path, file: &str, content: &str) -> AppResult<()> {
    std::fs::write(path.join(file), content)
        .map_err(|e| AppError::msg(format!("Couldn't write {file}: {e}")))?;
    run_git(path, &["add", "--", file])
}

/// Abort the in-progress merge/rebase/cherry-pick/revert, restoring the prior state.
pub fn conflict_abort(path: &Path, kind: &str) -> AppResult<()> {
    let op = match kind {
        "rebase" => "rebase",
        "cherry-pick" => "cherry-pick",
        "revert" => "revert",
        _ => "merge",
    };
    run_git(path, &[op, "--abort"])
}

/// Finish the in-progress operation once all conflicts are resolved (staged).
pub fn conflict_continue(path: &Path, kind: &str) -> AppResult<()> {
    let env = [("GIT_EDITOR", "true"), ("GIT_SEQUENCE_EDITOR", "true")];
    match kind {
        "rebase" => run_git_env(path, &["rebase", "--continue"], &env),
        "cherry-pick" => run_git_env(path, &["cherry-pick", "--continue"], &env),
        "revert" => run_git_env(path, &["revert", "--continue"], &env),
        // A merge is completed by committing the prepared MERGE_MSG.
        _ => run_git(path, &["commit", "--no-edit"]),
    }
}

fn repo_name_from_url(url: &str) -> String {
    url.trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("repository")
        .trim_end_matches(".git")
        .to_string()
}

/// Clone `url` into `parent_dir`, returning the new repository directory.
pub fn clone(url: &str, parent_dir: &Path) -> AppResult<PathBuf> {
    let output = git_cmd()
        .arg("clone")
        .arg(url)
        .current_dir(parent_dir)
        .output()?;
    if !output.status.success() {
        return Err(AppError::msg(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(parent_dir.join(repo_name_from_url(url)))
}

/// Resolve the working-directory root of the repository containing `path`.
/// Accepts the repo root or any subfolder; errors clearly when `path` is not
/// inside a Git repository. The returned path is normalized (no trailing
/// separator) so it matches paths produced by discovery scans.
pub fn resolve_repo_root(path: &Path) -> AppResult<PathBuf> {
    if !path.exists() {
        return Err(AppError::msg("That folder no longer exists."));
    }
    let repo = Repository::discover(path)
        .map_err(|_| AppError::msg("That folder is not a Git repository."))?;
    match repo.workdir() {
        // `components().collect()` strips any trailing separator from workdir().
        Some(wd) => Ok(wd.components().collect::<PathBuf>()),
        None => Err(AppError::msg("Bare repositories are not supported.")),
    }
}

/// List branch names for the repository at `path`: local branches plus
/// remote-tracking branches (with their remote prefix stripped, e.g.
/// `origin/feature/x` -> `feature/x`), deduplicated and sorted. This matches
/// GitHub Desktop, where a freshly cloned repo still lists every branch even
/// though only the default one exists locally. Checking out a remote-only name
/// works because `git checkout <name>` auto-creates a local tracking branch.
pub fn list_branches(path: &Path) -> AppResult<Vec<String>> {
    use std::collections::BTreeSet;
    let repo = Repository::open(path)?;
    let mut names: BTreeSet<String> = BTreeSet::new();

    for item in repo.branches(Some(git2::BranchType::Local))? {
        let (branch, _) = item?;
        if let Some(name) = branch.name()? {
            names.insert(name.to_string());
        }
    }

    for item in repo.branches(Some(git2::BranchType::Remote))? {
        let (branch, _) = item?;
        if let Some(full) = branch.name()? {
            // Strip the leading "<remote>/" segment; skip the symbolic HEAD ref.
            if let Some((_, rest)) = full.split_once('/') {
                if rest != "HEAD" && !rest.is_empty() {
                    names.insert(rest.to_string());
                }
            }
        }
    }

    Ok(names.into_iter().collect())
}

/// Check out an existing local branch in the repository at `path`.
///
/// When `stash` is true, the current working-tree changes (including untracked
/// files) are stashed before switching — tagged with the branch they were left
/// on — so they stay behind on that branch (GitHub Desktop's "Leave my changes
/// on <branch>"). When false, uncommitted changes are carried to the target by
/// git's default checkout ("Bring my changes"). After switching, a change set
/// previously left on the target branch is auto-restored when the working tree
/// is clean, so returning to a branch brings its stashed work back.
pub fn checkout(path: &Path, branch: &str, stash: bool) -> AppResult<()> {
    if stash {
        let current = head_branch_name(path).unwrap_or_default();
        let msg = format!("{AUTOSTASH_TAG}{current}");
        let output = git_cmd()
            .arg("-C")
            .arg(path)
            .args(["stash", "push", "--include-untracked", "-m", &msg])
            .output()?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            let out = String::from_utf8_lossy(&output.stdout);
            // "nothing to stash" is not a real failure — just proceed to switch.
            if !err.contains("No local changes") && !out.contains("No local changes") {
                return Err(AppError::msg(err.trim().to_string()));
            }
        }
    }

    let output = git_cmd()
        .arg("-C")
        .arg(path)
        .args(["checkout", branch])
        .output()?;
    if !output.status.success() {
        return Err(AppError::msg(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    restore_autostash(path, branch);
    Ok(())
}

/// Prefix used to tag DevCenter-created "leave my changes" stashes so they can
/// be recognized and auto-restored when the user returns to that branch.
const AUTOSTASH_TAG: &str = "DevCenter autostash @ ";

/// The short name of the currently checked-out branch, if HEAD is on a branch.
fn head_branch_name(path: &Path) -> Option<String> {
    let repo = Repository::open(path).ok()?;
    let head = repo.head().ok()?;
    if head.is_branch() {
        head.shorthand().map(|s| s.to_string())
    } else {
        None
    }
}

/// Pop a DevCenter-tagged stash that was left on `branch`, if the working tree is
/// currently clean. Best-effort: any failure is ignored so the stash is never
/// lost (the user can still restore it manually).
fn restore_autostash(path: &Path, branch: &str) {
    if let Ok(repo) = Repository::open(path) {
        if is_dirty(&repo) {
            return; // carried changes present — don't risk a conflicting pop
        }
    }
    let wanted = format!("{AUTOSTASH_TAG}{branch}");
    let list = match git_cmd().arg("-C").arg(path).args(["stash", "list"]).output() {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).into_owned(),
        _ => return,
    };
    // Each line looks like: "stash@{0}: On <branch>: DevCenter autostash @ <branch>"
    for line in list.lines() {
        if let Some((refname, rest)) = line.split_once(':') {
            if rest.trim_end().ends_with(&wanted) {
                let _ = git_cmd()
                    .arg("-C")
                    .arg(path)
                    .args(["stash", "pop", refname.trim()])
                    .output();
                return;
            }
        }
    }
}

/// Create a new branch named `name`, starting from `base`, and check it out, in
/// the repository at `path`. Delegates to system `git checkout -b <name> <base>`
/// so the new branch starts at the base branch's tip and the working tree is
/// updated. When `base` is empty the new branch starts from the current HEAD.
/// Surfaces git's own error (e.g. invalid name, branch already exists, or a
/// dirty working tree that would conflict).
pub fn create_branch(path: &Path, name: &str, base: &str) -> AppResult<()> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::msg("Branch name is required.".to_string()));
    }
    let mut cmd = git_cmd();
    cmd.arg("-C").arg(path).args(["checkout", "-b", name]);
    let base = base.trim();
    if !base.is_empty() {
        cmd.arg(base);
    }
    let output = cmd.output()?;
    if !output.status.success() {
        return Err(AppError::msg(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

/// Rename branch `old` to `new` in the repository at `path`. Delegates to system
/// `git branch -m <old> <new>` (works for the current branch too). Surfaces
/// git's own error (e.g. invalid name or a destination that already exists).
pub fn rename_branch(path: &Path, old: &str, new: &str) -> AppResult<()> {
    let new = new.trim();
    if new.is_empty() {
        return Err(AppError::msg("Branch name is required.".to_string()));
    }
    let output = git_cmd()
        .arg("-C")
        .arg(path)
        .args(["branch", "-m", old, new])
        .output()?;
    if !output.status.success() {
        return Err(AppError::msg(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

/// Delete the local branch `name` in the repository at `path`. Uses `git branch
/// -d` (safe; refuses to delete a branch with unmerged commits) unless `force`
/// is set, which uses `-D`. The currently checked-out branch cannot be deleted —
/// git surfaces a clear error in that case.
pub fn delete_branch(path: &Path, name: &str, force: bool) -> AppResult<()> {
    let flag = if force { "-D" } else { "-d" };
    let output = git_cmd()
        .arg("-C")
        .arg(path)
        .args(["branch", flag, name])
        .output()?;
    if !output.status.success() {
        return Err(AppError::msg(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

/// Retrieve a credential for `url` from Git Credential Manager via
/// `git credential fill` — the same mechanism Git uses for clone/fetch. If GCM
/// has a cached credential (e.g. from a previous clone) it returns immediately;
/// otherwise GCM launches its interactive browser sign-in. The wait is bounded
/// by a timeout so an unfinished sign-in can never hang the app, and the child
/// is killed on timeout so no stray git/GCM process is left behind.
///
/// `url` should be the collection URL (e.g. `https://dev.azure.com/myorg` or
/// `https://github.com`); the host and path are passed to the helper with
/// `useHttpPath=true` so GCM can disambiguate per-organization Azure DevOps
/// credentials.
pub fn credential_fill(url: &str) -> AppResult<(String, String)> {
    use std::io::Write;
    use std::process::Stdio;
    use std::sync::mpsc;
    use std::time::Duration;

    // Split "https://host/path" into host and (optional) path.
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .unwrap_or(url);
    let (host, path) = match rest.split_once('/') {
        Some((h, p)) => (h.to_string(), p.trim_end_matches('/').to_string()),
        None => (rest.to_string(), String::new()),
    };

    let mut child = git_cmd()
        .args(["-c", "credential.useHttpPath=true", "credential", "fill"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()?;

    if let Some(mut stdin) = child.stdin.take() {
        // git credential protocol: a blank line terminates the request.
        let mut req = format!("protocol=https\nhost={host}\n");
        if !path.is_empty() {
            req.push_str(&format!("path={path}\n"));
        }
        req.push('\n');
        let _ = stdin.write_all(req.as_bytes());
        // stdin is dropped here, closing the pipe so git proceeds.
    }

    // Share the child so the waiter thread can read output while we retain the
    // ability to kill it on timeout.
    let child = std::sync::Arc::new(std::sync::Mutex::new(child));
    let waiter = std::sync::Arc::clone(&child);
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut out = Vec::new();
        let mut status_ok = false;
        if let Ok(mut c) = waiter.lock() {
            use std::io::Read;
            if let Some(mut so) = c.stdout.take() {
                let _ = so.read_to_end(&mut out);
            }
            status_ok = c.wait().map(|s| s.success()).unwrap_or(false);
        }
        let _ = tx.send((status_ok, out));
    });

    let (ok, stdout) = match rx.recv_timeout(Duration::from_secs(180)) {
        Ok(v) => v,
        Err(_) => {
            if let Ok(mut c) = child.lock() {
                let _ = c.kill();
            }
            return Err(AppError::msg(
                "Timed out waiting for Git sign-in. Complete the browser prompt and retry, or paste a token.",
            ));
        }
    };

    if !ok {
        return Err(AppError::msg(format!(
            "Git couldn't sign in to {host}. Try cloning a repo from there first, or paste a token."
        )));
    }

    let mut username = String::new();
    let mut password = String::new();
    for line in String::from_utf8_lossy(&stdout).lines() {
        if let Some(v) = line.strip_prefix("username=") {
            username = v.to_string();
        } else if let Some(v) = line.strip_prefix("password=") {
            password = v.to_string();
        }
    }
    if password.is_empty() {
        return Err(AppError::msg(format!("Git returned no token for {host}.")));
    }
    Ok((username, password))
}

// ---------- Changes page: status, diff, commit, history ----------

/// Humanize a Unix timestamp (seconds) as a relative time.
fn humanize_epoch(secs: i64) -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let diff = (now - secs).max(0) as u64;
    if diff < 60 {
        "just now".into()
    } else if diff < 3_600 {
        format!("{} min ago", diff / 60)
    } else if diff < 86_400 {
        format!("{} h ago", diff / 3_600)
    } else if diff < 172_800 {
        "yesterday".into()
    } else if diff < 604_800 {
        format!("{} d ago", diff / 86_400)
    } else if diff < 2_592_000 {
        format!("{} w ago", diff / 604_800)
    } else {
        format!("{} mo ago", diff / 2_592_000)
    }
}

/// Collapse git2's per-file status flags into a single label + rename source.
fn classify_status(s: git2::Status, entry: &StatusEntry) -> (String, Option<String>) {
    use git2::Status as St;
    let mut old_path = None;
    if s.intersects(St::INDEX_RENAMED | St::WT_RENAMED) {
        if let Some(delta) = entry.head_to_index().or_else(|| entry.index_to_workdir()) {
            old_path = delta
                .old_file()
                .path()
                .map(|p| p.to_string_lossy().replace('\\', "/"));
        }
    }
    let status = if s.contains(St::CONFLICTED) {
        "conflicted"
    } else if s.contains(St::WT_NEW) && !s.contains(St::INDEX_NEW) {
        "untracked"
    } else if s.contains(St::INDEX_NEW) {
        "new"
    } else if s.intersects(St::WT_DELETED | St::INDEX_DELETED) {
        "deleted"
    } else if s.intersects(St::INDEX_RENAMED | St::WT_RENAMED) {
        "renamed"
    } else if s.intersects(St::WT_MODIFIED | St::INDEX_MODIFIED) {
        "modified"
    } else if s.intersects(St::WT_TYPECHANGE | St::INDEX_TYPECHANGE) {
        "typechange"
    } else {
        "modified"
    };
    (status.to_string(), old_path)
}

/// The staged (index) portion of a status entry, if any — i.e. what differs
/// between HEAD and the index. Returns `None` when nothing is staged.
fn staged_change(s: git2::Status, entry: &StatusEntry, path: &str) -> Option<FileChange> {
    use git2::Status as St;
    let status = if s.contains(St::INDEX_NEW) {
        "new"
    } else if s.contains(St::INDEX_MODIFIED) {
        "modified"
    } else if s.contains(St::INDEX_DELETED) {
        "deleted"
    } else if s.contains(St::INDEX_RENAMED) {
        "renamed"
    } else if s.contains(St::INDEX_TYPECHANGE) {
        "typechange"
    } else {
        return None;
    };
    let old_path = if s.contains(St::INDEX_RENAMED) {
        entry.head_to_index().and_then(|d| {
            d.old_file()
                .path()
                .map(|p| p.to_string_lossy().replace('\\', "/"))
        })
    } else {
        None
    };
    Some(FileChange {
        path: path.to_string(),
        old_path,
        status: status.to_string(),
    })
}

/// The unstaged (working-tree) portion of a status entry, if any — i.e. what
/// differs between the index and the working tree (including untracked files).
fn unstaged_change(s: git2::Status, entry: &StatusEntry, path: &str) -> Option<FileChange> {
    use git2::Status as St;
    let status = if s.contains(St::CONFLICTED) {
        "conflicted"
    } else if s.contains(St::WT_NEW) {
        "untracked"
    } else if s.contains(St::WT_MODIFIED) {
        "modified"
    } else if s.contains(St::WT_DELETED) {
        "deleted"
    } else if s.contains(St::WT_RENAMED) {
        "renamed"
    } else if s.contains(St::WT_TYPECHANGE) {
        "typechange"
    } else {
        return None;
    };
    let old_path = if s.contains(St::WT_RENAMED) {
        entry.index_to_workdir().and_then(|d| {
            d.old_file()
                .path()
                .map(|p| p.to_string_lossy().replace('\\', "/"))
        })
    } else {
        None
    };
    Some(FileChange {
        path: path.to_string(),
        old_path,
        status: status.to_string(),
    })
}

/// List the working-tree changes for a repo (everything that would be committed
/// if all files were selected), GitHub-Desktop style.
pub fn working_changes(path: &Path) -> AppResult<ChangeSet> {
    let repo = Repository::open(path)?;
    let branch = match repo.head() {
        Ok(h) if h.is_branch() => h.shorthand().unwrap_or("HEAD").to_string(),
        Ok(h) => h.target().map(short_oid).unwrap_or_else(|| "HEAD".into()),
        Err(_) => "main".to_string(),
    };

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true)
        .include_ignored(false)
        .exclude_submodules(true);

    let statuses = repo.statuses(Some(&mut opts))?;
    let mut files = Vec::new();
    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    for entry in statuses.iter() {
        let s = entry.status();
        if s.is_ignored() {
            continue;
        }
        let path_str = match entry.path() {
            Some(p) => p.replace('\\', "/"),
            None => continue,
        };
        let (status, old_path) = classify_status(s, &entry);
        files.push(FileChange {
            path: path_str.clone(),
            old_path,
            status,
        });
        if let Some(fc) = staged_change(s, &entry, &path_str) {
            staged.push(fc);
        }
        if let Some(fc) = unstaged_change(s, &entry, &path_str) {
            unstaged.push(fc);
        }
    }
    let by_path = |a: &FileChange, b: &FileChange| a.path.to_lowercase().cmp(&b.path.to_lowercase());
    files.sort_by(by_path);
    staged.sort_by(by_path);
    unstaged.sort_by(by_path);

    // Sync state vs upstream (for the Push/Pull controls on the Changes page).
    let has_upstream = repo
        .head()
        .ok()
        .and_then(|h| h.name().map(|n| n.to_string()))
        .and_then(|n| repo.branch_upstream_name(&n).ok())
        .is_some();
    let (ahead, behind) = ahead_behind(&repo).unwrap_or((0, 0));

    let stashes = stash_list(path).unwrap_or_default();

    Ok(ChangeSet {
        branch: Some(branch),
        summary: None,
        author: None,
        when: None,
        files,
        staged,
        unstaged,
        stashes,
        ahead,
        behind,
        has_upstream,
    })
}

/// List the saved stashes for the repo at `path` (most recent first). Returns an
/// empty list when there are none. Parses `git stash list` with a unit-separated
/// format so messages containing spaces/colons stay intact.
pub fn stash_list(path: &Path) -> AppResult<Vec<StashEntry>> {
    let output = git_cmd()
        .arg("-C")
        .arg(path)
        .args(["stash", "list", "--format=%gd%x1f%ct%x1f%gs"])
        .output()?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();
    for line in text.lines() {
        let mut parts = line.split('\u{1f}');
        let selector = parts.next().unwrap_or("");
        let ts = parts.next().unwrap_or("");
        let subject = parts.next().unwrap_or("");
        let index = selector
            .trim_start_matches("stash@{")
            .trim_end_matches('}')
            .parse::<usize>()
            .unwrap_or(entries.len());
        let when = ts.parse::<i64>().ok().map(humanize_epoch).unwrap_or_default();
        let (branch, message) = parse_stash_subject(subject);
        entries.push(StashEntry {
            index,
            message,
            branch,
            when,
        });
    }
    Ok(entries)
}

/// Split a stash subject ("On <branch>: <msg>" or "WIP on <branch>: <msg>") into
/// its branch and message parts. Falls back to the whole subject when it doesn't
/// match the expected shape.
fn parse_stash_subject(subject: &str) -> (String, String) {
    let s = subject.trim();
    let rest = s
        .strip_prefix("WIP on ")
        .or_else(|| s.strip_prefix("On "))
        .unwrap_or(s);
    match rest.split_once(": ") {
        Some((branch, msg)) => (branch.trim().to_string(), msg.trim().to_string()),
        None => (String::new(), s.to_string()),
    }
}

/// Save the current changes to a new stash. Includes untracked files when
/// `include_untracked` is set. A blank `message` lets git auto-generate the
/// usual "WIP on <branch>" subject.
pub fn stash_push(path: &Path, message: &str, include_untracked: bool) -> AppResult<()> {
    let mut cmd = git_cmd();
    cmd.arg("-C").arg(path).args(["stash", "push"]);
    if include_untracked {
        cmd.arg("--include-untracked");
    }
    let message = message.trim();
    if !message.is_empty() {
        cmd.arg("-m").arg(message);
    }
    let output = cmd.output()?;
    if !output.status.success() {
        return Err(AppError::msg(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

/// Run a `git stash <op> stash@{index}` operation (op = "apply" | "pop" | "drop").
fn stash_op(path: &Path, op: &str, index: usize) -> AppResult<()> {
    let stash_ref = format!("stash@{{{index}}}");
    let output = git_cmd()
        .arg("-C")
        .arg(path)
        .args(["stash", op, &stash_ref])
        .output()?;
    if !output.status.success() {
        return Err(AppError::msg(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

/// Apply or pop a stash, preserving the original staged/unstaged split via
/// `--index` (so files that were staged come back staged). When git can't
/// reinstate the index it aborts cleanly — nothing is applied and the stash is
/// kept — so on that failure we safely retry without `--index` (the changes
/// still come back, just unstaged).
fn stash_restore(path: &Path, op: &str, index: usize) -> AppResult<()> {
    let stash_ref = format!("stash@{{{index}}}");
    let with_index = git_cmd()
        .arg("-C")
        .arg(path)
        .args(["stash", op, "--index", &stash_ref])
        .output()?;
    if with_index.status.success() {
        return Ok(());
    }
    let plain = git_cmd()
        .arg("-C")
        .arg(path)
        .args(["stash", op, &stash_ref])
        .output()?;
    if plain.status.success() {
        return Ok(());
    }
    let plain_err = String::from_utf8_lossy(&plain.stderr).trim().to_string();
    let idx_err = String::from_utf8_lossy(&with_index.stderr).trim().to_string();
    Err(AppError::msg(if plain_err.is_empty() {
        idx_err
    } else {
        plain_err
    }))
}

/// Apply a stash to the working tree (keeping the staged split) without removing
/// it from the stash list.
pub fn stash_apply(path: &Path, index: usize) -> AppResult<()> {
    stash_restore(path, "apply", index)
}

/// Apply a stash (keeping the staged split) and remove it from the stash list.
pub fn stash_pop(path: &Path, index: usize) -> AppResult<()> {
    stash_restore(path, "pop", index)
}

/// Delete a stash without applying it (destructive — confirm in the UI first).
pub fn stash_drop(path: &Path, index: usize) -> AppResult<()> {
    stash_op(path, "drop", index)
}

/// Stash only the staged changes (`git stash push --staged`), leaving unstaged
/// changes in the working tree.
pub fn stash_push_staged(path: &Path, message: &str) -> AppResult<()> {
    let mut cmd = git_cmd();
    cmd.arg("-C").arg(path).args(["stash", "push", "--staged"]);
    let message = message.trim();
    if !message.is_empty() {
        cmd.arg("-m").arg(message);
    }
    let output = cmd.output()?;
    if !output.status.success() {
        return Err(AppError::msg(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

/// Raw unified diff for a stash (`git stash show -p`), for the "View Stash…"
/// action. Returned as-is (not parsed into a ChangeSet) since it's shown as
/// plain text.
pub fn stash_show(path: &Path, index: usize) -> AppResult<String> {
    let stash_ref = format!("stash@{{{index}}}");
    let output = git_cmd()
        .arg("-C")
        .arg(path)
        .args(["stash", "show", "-p", &stash_ref])
        .output()?;
    if !output.status.success() {
        return Err(AppError::msg(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Delete every stash (`git stash clear`) — destructive, confirm in the UI first.
pub fn stash_clear(path: &Path) -> AppResult<()> {
    run_git(path, &["stash", "clear"])
}

/// Stage files into the index (`git add -A`). An empty `files` list stages
/// everything (the working tree). Handles new, modified, deleted and renamed
/// paths.
pub fn stage(path: &Path, files: &[String]) -> AppResult<()> {
    let mut cmd = git_cmd();
    cmd.arg("-C").arg(path);
    if files.is_empty() {
        cmd.args(["add", "-A"]);
    } else {
        cmd.args(["add", "-A", "--"]);
        for f in files {
            cmd.arg(f);
        }
    }
    let out = cmd.output()?;
    if !out.status.success() {
        return Err(AppError::msg(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

/// Unstage files (move them back from the index to the working tree, keeping the
/// edits). An empty `files` list unstages everything. Uses `git restore
/// --staged`, falling back to `git rm --cached` on an unborn branch (no HEAD).
pub fn unstage(path: &Path, files: &[String]) -> AppResult<()> {
    let unborn = Repository::open(path).map(|r| r.head().is_err()).unwrap_or(false);
    let mut cmd = git_cmd();
    cmd.arg("-C").arg(path);
    if unborn {
        cmd.args(["rm", "--cached", "-r", "-q", "--"]);
    } else {
        cmd.args(["restore", "--staged", "--"]);
    }
    if files.is_empty() {
        cmd.arg(".");
    } else {
        for f in files {
            cmd.arg(f);
        }
    }
    let out = cmd.output()?;
    if !out.status.success() {
        return Err(AppError::msg(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

/// Discard unstaged working-tree changes: revert tracked files to the index/HEAD
/// state and delete untracked files. An empty `files` list discards everything.
/// Destructive — the caller is expected to confirm first. Best-effort: a benign
/// failure on one phase (e.g. `restore` on an untracked-only set) doesn't block
/// the other, so mixed selections are fully discarded.
pub fn discard(path: &Path, files: &[String]) -> AppResult<()> {
    // Revert tracked files (drops unstaged edits, keeps any staged version).
    let mut restore = git_cmd();
    restore.arg("-C").arg(path).args(["restore", "--"]);
    if files.is_empty() {
        restore.arg(".");
    } else {
        for f in files {
            restore.arg(f);
        }
    }
    let _ = restore.output();

    // Remove untracked files and directories.
    let mut clean = git_cmd();
    clean.arg("-C").arg(path).args(["clean", "-fd", "--"]);
    if !files.is_empty() {
        for f in files {
            clean.arg(f);
        }
    }
    let _ = clean.output();
    Ok(())
}

/// MIME type for a path's image extension, or None when it isn't a raster image
/// we can preview inline in the diff viewer.
fn image_mime(path: &str) -> Option<&'static str> {
    let ext = Path::new(path).extension()?.to_str()?.to_ascii_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" | "jfif" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" | "cur" => "image/x-icon",
        "avif" => "image/avif",
        "tif" | "tiff" => "image/tiff",
        _ => return None,
    })
}

/// Raw bytes for one side of a diff: the stored blob when the side exists in the
/// object database, otherwise the working-tree file on disk (the "after" side of
/// an unstaged or untracked change isn't a committed blob yet).
fn diff_side_bytes(repo: &Repository, f: &git2::DiffFile) -> Option<Vec<u8>> {
    let oid = f.id();
    if !oid.is_zero() {
        if let Ok(blob) = repo.find_blob(oid) {
            return Some(blob.content().to_vec());
        }
    }
    let abs = repo.workdir()?.join(f.path()?);
    std::fs::read(abs).ok()
}

/// Build a `data:` URL so the webview can render an image inline.
fn image_data_url(mime: &str, bytes: &[u8]) -> String {
    format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

/// Convert a git2 `Diff` into our serializable `FileDiff` for one file. For image
/// files the before/after bytes are attached as `data:` URLs so the UI can show a
/// visual preview instead of an inert "binary file" message.
fn build_file_diff(repo: &Repository, diff: &git2::Diff, file: &str) -> AppResult<FileDiff> {
    // Don't base64 enormous images into the IPC payload; fall back to the binary
    // message for anything bigger.
    const MAX_IMAGE_BYTES: usize = 24 * 1024 * 1024;
    let want = file.replace('\\', "/");
    let mut result = FileDiff {
        path: want.clone(),
        binary: false,
        additions: 0,
        deletions: 0,
        hunks: Vec::new(),
        old_image: None,
        new_image: None,
    };
    for (idx, delta) in diff.deltas().enumerate() {
        let dpath = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|p| p.to_string_lossy().replace('\\', "/"));
        if dpath.as_deref() != Some(want.as_str()) {
            continue;
        }

        // A binary delta (images, etc.) has no usable text patch — when the patch
        // is missing we fall through to the image/binary handling below.
        let patch = if delta.flags().is_binary() {
            None
        } else {
            Patch::from_diff(diff, idx)?
        };

        if let Some(patch) = patch {
            for h in 0..patch.num_hunks() {
                let (hunk, nlines) = patch.hunk(h)?;
                let header = String::from_utf8_lossy(hunk.header())
                    .trim_end_matches(['\n', '\r'])
                    .to_string();
                let mut lines = Vec::with_capacity(nlines);
                for l in 0..nlines {
                    let line = patch.line_in_hunk(h, l)?;
                    let origin = line.origin();
                    // Skip libgit2's synthetic "no newline at end of file"
                    // markers. These use the EOFNL line origins ('=', '<', '>')
                    // and carry only the "\ No newline at end of file" notice —
                    // never real file content (which always uses ' ', '+', '-').
                    // Matching on the origin guarantees no actual line is dropped.
                    if matches!(origin, '=' | '<' | '>') {
                        continue;
                    }
                    let kind = match origin {
                        '+' => {
                            result.additions += 1;
                            "add"
                        }
                        '-' => {
                            result.deletions += 1;
                            "del"
                        }
                        _ => "ctx",
                    };
                    let content = String::from_utf8_lossy(line.content())
                        .trim_end_matches(['\n', '\r'])
                        .to_string();
                    lines.push(DiffLine {
                        kind: kind.to_string(),
                        content,
                        old_lineno: line.old_lineno(),
                        new_lineno: line.new_lineno(),
                    });
                }
                result.hunks.push(DiffHunk { header, lines });
            }
            return Ok(result);
        }

        // Binary file. Attach before/after previews when it's a known image type.
        result.binary = true;
        if let Some(mime) = image_mime(&want) {
            result.old_image = diff_side_bytes(repo, &delta.old_file())
                .filter(|b| !b.is_empty() && b.len() <= MAX_IMAGE_BYTES)
                .map(|b| image_data_url(mime, &b));
            result.new_image = diff_side_bytes(repo, &delta.new_file())
                .filter(|b| !b.is_empty() && b.len() <= MAX_IMAGE_BYTES)
                .map(|b| image_data_url(mime, &b));
        }
        return Ok(result);
    }
    Ok(result)
}

/// Diff a single file. When `staged` is true, show the staged diff (HEAD vs the
/// index); otherwise show the unstaged diff (index vs the working tree,
/// including untracked content) — matching VS Code's split source-control view.
pub fn file_diff(path: &Path, file: &str, staged: bool, context: u32) -> AppResult<FileDiff> {
    let repo = Repository::open(path)?;
    let mut opts = DiffOptions::new();
    opts.context_lines(context).pathspec(file);
    let diff = if staged {
        let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))?
    } else {
        opts.include_untracked(true)
            .recurse_untracked_dirs(true)
            .show_untracked_content(true);
        repo.diff_index_to_workdir(None, Some(&mut opts))?
    };
    build_file_diff(&repo, &diff, file)
}

/// Commit the staged index with `summary` (+ optional `description`) using the
/// system `git` (so the user's configured identity and hooks apply). When `all`
/// is true, everything is staged first (`git add -A`) — used when the user
/// commits without having staged anything. Returns the new short hash.
/// Commit the index. `all` stages everything first (`git add -A`). `amend`
/// rewrites the current HEAD commit instead of creating a new one. `signoff`
/// appends a `Signed-off-by` trailer (`git commit -s`).
pub fn commit(
    path: &Path,
    summary: &str,
    description: &str,
    all: bool,
    amend: bool,
    signoff: bool,
) -> AppResult<String> {
    let summary = summary.trim();
    if summary.is_empty() {
        return Err(AppError::msg("Enter a commit summary."));
    }
    let repo = Repository::open(path)?;

    if all {
        let out = git_cmd().arg("-C").arg(path).args(["add", "-A"]).output()?;
        if !out.status.success() {
            return Err(AppError::msg(
                String::from_utf8_lossy(&out.stderr).trim().to_string(),
            ));
        }
    }

    // Commit whatever is staged (the index).
    let mut c = git_cmd();
    c.arg("-C").arg(path).arg("commit");
    if amend {
        c.arg("--amend");
    }
    if signoff {
        c.arg("--signoff");
    }
    c.arg("-m").arg(summary);
    if !description.trim().is_empty() {
        c.arg("-m").arg(description.trim());
    }
    let out = c.output()?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let msg = if stderr.is_empty() { stdout } else { stderr };
        return Err(AppError::msg(if msg.is_empty() {
            "Commit failed.".to_string()
        } else {
            msg
        }));
    }

    Ok(repo.head().ok().and_then(|h| h.target()).map(short_oid).unwrap_or_default())
}

/// Undo the current HEAD commit (soft reset to its parent) so its changes
/// move back into the index (Staged Changes) instead of being lost. Only the
/// most recent commit can be undone this way — undoing an older commit would
/// require rewriting everything after it.
pub fn undo_commit(path: &Path, sha: &str) -> AppResult<()> {
    let repo = Repository::open(path)?;
    let head_oid = repo
        .head()
        .ok()
        .and_then(|h| h.target())
        .ok_or_else(|| AppError::msg("No commits to undo."))?;
    let target_oid =
        Oid::from_str(sha).map_err(|_| AppError::msg("Invalid commit reference."))?;
    if head_oid != target_oid {
        return Err(AppError::msg(
            "Only the most recent commit can be undone.",
        ));
    }
    let commit = repo.find_commit(head_oid)?;
    let parent = commit
        .parent(0)
        .map_err(|_| AppError::msg("Can't undo the first commit in the repository."))?;
    repo.reset(parent.as_object(), git2::ResetType::Soft, None)?;
    Ok(())
}

/// Recent commit history (newest first), up to `limit` entries.
pub fn log(path: &Path, limit: usize) -> AppResult<Vec<CommitInfo>> {
    let repo = Repository::open(path)?;
    if repo.head().is_err() {
        return Ok(Vec::new());
    }
    let unpushed = unpushed_oids(&repo, limit);
    let tags = tag_map(&repo);
    let mut walk = repo.revwalk()?;
    walk.push_head()?;
    walk.set_sorting(Sort::TIME)?;
    let mut out = Vec::new();
    for oid in walk.take(limit) {
        let oid = oid?;
        let c = repo.find_commit(oid)?;
        out.push(CommitInfo {
            id: short_oid(oid),
            hash: oid.to_string(),
            summary: c.summary().unwrap_or("(no message)").to_string(),
            author: c.author().name().unwrap_or("unknown").to_string(),
            when: humanize_epoch(c.time().seconds()),
            unpushed: unpushed.contains(&oid),
            tags: tags.get(&oid).cloned().unwrap_or_default(),
        });
    }
    Ok(out)
}

/// OIDs of commits on HEAD that haven't been pushed to the upstream branch
/// (the commits in `@{upstream}..HEAD`). When the branch has no upstream
/// (unpublished), every reachable commit is treated as unpushed — matching the
/// "Publish branch" behaviour in GitHub Desktop.
fn unpushed_oids(repo: &Repository, limit: usize) -> HashSet<Oid> {
    let mut set = HashSet::new();
    let upstream_oid = repo
        .head()
        .ok()
        .filter(|h| h.is_branch())
        .and_then(|h| h.name().map(|n| n.to_string()))
        .and_then(|n| repo.branch_upstream_name(&n).ok())
        .and_then(|u| u.as_str().map(|s| s.to_string()))
        .and_then(|u| repo.find_reference(&u).ok())
        .and_then(|r| r.target());
    let mut walk = match repo.revwalk() {
        Ok(w) => w,
        Err(_) => return set,
    };
    if walk.push_head().is_err() {
        return set;
    }
    if let Some(up) = upstream_oid {
        let _ = walk.hide(up);
    }
    for oid in walk.take(limit).flatten() {
        set.insert(oid);
    }
    set
}

/// Map every tagged commit OID to the tag names pointing at it (annotated tags
/// are peeled through to the commit they reference).
fn tag_map(repo: &Repository) -> HashMap<Oid, Vec<String>> {
    let mut map: HashMap<Oid, Vec<String>> = HashMap::new();
    if let Ok(names) = repo.tag_names(None) {
        for name in names.iter().flatten() {
            if let Ok(commit) = repo
                .revparse_single(name)
                .and_then(|obj| obj.peel_to_commit())
            {
                map.entry(commit.id()).or_default().push(name.to_string());
            }
        }
    }
    map
}

/// The files changed in a single commit (vs its first parent) plus its metadata.
pub fn commit_changes(path: &Path, sha: &str) -> AppResult<ChangeSet> {
    let repo = Repository::open(path)?;
    let commit = repo.revparse_single(sha)?.peel_to_commit()?;
    let tree = commit.tree()?;
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
    let mut opts = DiffOptions::new();
    let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))?;

    let files = diff_to_files(&diff);

    let summary = commit.summary().unwrap_or("").to_string();
    let author = commit.author().name().unwrap_or("unknown").to_string();
    let when = humanize_epoch(commit.time().seconds());
    Ok(ChangeSet {
        branch: None,
        summary: Some(summary),
        author: Some(author),
        when: Some(when),
        files,
        staged: Vec::new(),
        unstaged: Vec::new(),
        stashes: Vec::new(),
        ahead: 0,
        behind: 0,
        has_upstream: false,
    })
}

/// Diff a single file within a commit (vs its first parent).
pub fn commit_file_diff(path: &Path, sha: &str, file: &str, context: u32) -> AppResult<FileDiff> {
    let repo = Repository::open(path)?;
    let commit = repo.revparse_single(sha)?.peel_to_commit()?;
    let tree = commit.tree()?;
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
    let mut opts = DiffOptions::new();
    opts.context_lines(context).pathspec(file);
    let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))?;
    build_file_diff(&repo, &diff, file)
}

/// Convert a tree-to-tree diff into the normalized, path-sorted FileChange list.
fn diff_to_files(diff: &git2::Diff) -> Vec<FileChange> {
    let mut files = Vec::new();
    for delta in diff.deltas() {
        let status = match delta.status() {
            Delta::Added | Delta::Copied => "new",
            Delta::Deleted => "deleted",
            Delta::Renamed => "renamed",
            Delta::Typechange => "typechange",
            _ => "modified",
        };
        let p = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|x| x.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        let old_path = if delta.status() == Delta::Renamed {
            delta
                .old_file()
                .path()
                .map(|x| x.to_string_lossy().replace('\\', "/"))
        } else {
            None
        };
        files.push(FileChange {
            path: p,
            old_path,
            status: status.to_string(),
        });
    }
    files.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
    files
}

/// Resolve a PR branch name to a commit, trying the local ref first and then the
/// `origin/` remote-tracking ref (PR head/base branches are often only present
/// as remote refs after a fetch).
fn resolve_branch_commit<'r>(repo: &'r Repository, name: &str) -> AppResult<git2::Commit<'r>> {
    let candidates = [
        name.to_string(),
        format!("refs/heads/{name}"),
        format!("origin/{name}"),
        format!("refs/remotes/origin/{name}"),
    ];
    for cand in candidates {
        if let Ok(commit) = repo
            .revparse_single(&cand)
            .and_then(|obj| obj.peel_to_commit())
        {
            return Ok(commit);
        }
    }
    Err(AppError::msg(format!(
        "Branch \"{name}\" was not found locally. Fetch the repository to view this pull request's changes."
    )))
}

/// The two trees for a PR's three-dot diff (`base...head`): the merge-base of
/// base and head as the "before" tree and head's tree as "after", so only the
/// changes head introduces relative to base are shown.
fn pr_diff_trees<'r>(
    repo: &'r Repository,
    base: &str,
    head: &str,
) -> AppResult<(git2::Tree<'r>, git2::Tree<'r>)> {
    let base_commit = resolve_branch_commit(repo, base)?;
    let head_commit = resolve_branch_commit(repo, head)?;
    let before_oid = repo
        .merge_base(base_commit.id(), head_commit.id())
        .unwrap_or_else(|_| base_commit.id());
    let before = repo.find_commit(before_oid)?.tree()?;
    let after = head_commit.tree()?;
    Ok((before, after))
}

/// The files changed by a pull request (the `base...head` diff).
pub fn pr_changes(path: &Path, base: &str, head: &str) -> AppResult<ChangeSet> {
    let repo = Repository::open(path)?;
    let (before, after) = pr_diff_trees(&repo, base, head)?;
    let mut opts = DiffOptions::new();
    let diff = repo.diff_tree_to_tree(Some(&before), Some(&after), Some(&mut opts))?;
    Ok(ChangeSet {
        branch: Some(head.to_string()),
        summary: None,
        author: None,
        when: None,
        files: diff_to_files(&diff),
        staged: Vec::new(),
        unstaged: Vec::new(),
        stashes: Vec::new(),
        ahead: 0,
        behind: 0,
        has_upstream: false,
    })
}

/// Diff a single file within a pull request (the `base...head` diff).
pub fn pr_file_diff(path: &Path, base: &str, head: &str, file: &str, context: u32) -> AppResult<FileDiff> {
    let repo = Repository::open(path)?;
    let (before, after) = pr_diff_trees(&repo, base, head)?;
    let mut opts = DiffOptions::new();
    opts.context_lines(context).pathspec(file);
    let diff = repo.diff_tree_to_tree(Some(&before), Some(&after), Some(&mut opts))?;
    build_file_diff(&repo, &diff, file)
}

// ===================== Remote =====================

/// The raw URL of the `origin` remote (unlike `Repo.remote`, this is NOT
/// stripped of scheme/credentials — it's meant for copying/re-pasting as-is).
pub fn remote_url(path: &Path) -> AppResult<String> {
    let repo = Repository::open(path)?;
    let remote = repo
        .find_remote("origin")
        .map_err(|_| AppError::msg("This repository has no \"origin\" remote."))?;
    Ok(remote.url().unwrap_or_default().to_string())
}

/// Point `origin` at a new URL, creating the remote if it doesn't exist yet.
pub fn set_remote_url(path: &Path, url: &str) -> AppResult<()> {
    let url = url.trim();
    if url.is_empty() {
        return Err(AppError::msg("Enter a remote URL."));
    }
    let repo = Repository::open(path)?;
    if repo.find_remote("origin").is_ok() {
        repo.remote_set_url("origin", url)?;
    } else {
        repo.remote("origin", url)?;
    }
    Ok(())
}

/// All configured remotes.
pub fn list_remotes(path: &Path) -> AppResult<Vec<RemoteInfo>> {
    let repo = Repository::open(path)?;
    let mut out = Vec::new();
    for name in repo.remotes()?.iter().flatten() {
        if let Ok(remote) = repo.find_remote(name) {
            out.push(RemoteInfo {
                name: name.to_string(),
                url: remote.url().unwrap_or_default().to_string(),
            });
        }
    }
    Ok(out)
}

/// Add a new remote.
pub fn add_remote(path: &Path, name: &str, url: &str) -> AppResult<()> {
    let name = name.trim();
    let url = url.trim();
    if name.is_empty() || url.is_empty() {
        return Err(AppError::msg("Enter a remote name and URL."));
    }
    let repo = Repository::open(path)?;
    repo.remote(name, url)?;
    Ok(())
}

/// Remove a remote.
pub fn remove_remote(path: &Path, name: &str) -> AppResult<()> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::msg("Choose a remote to remove."));
    }
    let repo = Repository::open(path)?;
    repo.remote_delete(name)?;
    Ok(())
}

// ===================== Tags =====================

/// All tags in the repository (lightweight and annotated), newest name first.
pub fn list_git_tags(path: &Path) -> AppResult<Vec<GitTagInfo>> {
    let repo = Repository::open(path)?;
    let mut out = Vec::new();
    if let Ok(names) = repo.tag_names(None) {
        for name in names.iter().flatten() {
            let Ok(obj) = repo.revparse_single(name) else { continue };
            let (target, message) = match obj.as_tag() {
                Some(tag) => (
                    short_oid(tag.target_id()),
                    tag.message().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
                ),
                None => (short_oid(obj.id()), None),
            };
            out.push(GitTagInfo { name: name.to_string(), target, message });
        }
    }
    out.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(out)
}

/// Create a tag at `target` (a branch/commit ref, or empty for HEAD). Annotated
/// when `message` is non-empty, lightweight otherwise.
pub fn create_tag(path: &Path, name: &str, target: &str, message: &str) -> AppResult<()> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::msg("Enter a tag name."));
    }
    let repo = Repository::open(path)?;
    let obj = if target.trim().is_empty() {
        repo.head()?.peel(git2::ObjectType::Commit)?
    } else {
        repo.revparse_single(target.trim())?.peel(git2::ObjectType::Commit)?
    };
    let message = message.trim();
    if message.is_empty() {
        repo.tag_lightweight(name, &obj, false)?;
    } else {
        let sig = repo
            .signature()
            .or_else(|_| git2::Signature::now("DevCenter", "devcenter@local"))?;
        repo.tag(name, &obj, &sig, message, false)?;
    }
    Ok(())
}

/// Delete a tag.
pub fn delete_tag(path: &Path, name: &str) -> AppResult<()> {
    let repo = Repository::open(path)?;
    repo.tag_delete(name)?;
    Ok(())
}

/// Check out a tag (detached HEAD, like any other non-branch ref).
pub fn checkout_tag(path: &Path, name: &str) -> AppResult<()> {
    run_git(path, &["checkout", &format!("tags/{name}")])
}

/// Delete a tag on the `origin` remote (`git push origin --delete tag <name>`).
pub fn delete_remote_tag(path: &Path, name: &str) -> AppResult<()> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::msg("Enter a tag name."));
    }
    run_git(path, &["push", "origin", "--delete", "tag", name])
}

/// Push all local tags to `origin` (`git push origin --tags`).
pub fn push_tags(path: &Path) -> AppResult<()> {
    run_git(path, &["push", "origin", "--tags"])
}

// ===================== Worktrees =====================

/// All linked worktrees for this repository (the main working directory first).
pub fn list_worktrees(path: &Path) -> AppResult<Vec<WorktreeInfo>> {
    let output = git_cmd()
        .arg("-C")
        .arg(path)
        .args(["worktree", "list", "--porcelain"])
        .output()?;
    if !output.status.success() {
        return Err(AppError::msg(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut result = Vec::new();
    let mut cur_path: Option<String> = None;
    let mut cur_branch: Option<String> = None;
    let mut cur_locked = false;
    let mut first = true;
    let flush = |path: &mut Option<String>, branch: &mut Option<String>, locked: &mut bool, first: &mut bool, out: &mut Vec<WorktreeInfo>| {
        if let Some(p) = path.take() {
            let name = Path::new(&p)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| p.clone());
            out.push(WorktreeInfo {
                name,
                path: p.replace('\\', "/"),
                branch: branch.take(),
                is_main: *first,
                locked: *locked,
            });
            *first = false;
        }
        *locked = false;
    };
    for line in text.lines() {
        if line.is_empty() {
            flush(&mut cur_path, &mut cur_branch, &mut cur_locked, &mut first, &mut result);
            continue;
        }
        if let Some(rest) = line.strip_prefix("worktree ") {
            cur_path = Some(rest.to_string());
        } else if let Some(rest) = line.strip_prefix("branch ") {
            cur_branch = Some(rest.trim_start_matches("refs/heads/").to_string());
        } else if line == "locked" || line.starts_with("locked ") {
            cur_locked = true;
        }
    }
    flush(&mut cur_path, &mut cur_branch, &mut cur_locked, &mut first, &mut result);
    Ok(result)
}

/// Add a new linked worktree at `target_path` checked out to `branch`.
/// `create_branch` creates `branch` (from HEAD) instead of checking out an
/// existing one.
pub fn add_worktree(path: &Path, target_path: &str, branch: &str, create_branch: bool) -> AppResult<()> {
    let target_path = target_path.trim();
    let branch = branch.trim();
    if target_path.is_empty() {
        return Err(AppError::msg("Choose a folder for the new worktree."));
    }
    if branch.is_empty() {
        return Err(AppError::msg("Enter a branch name."));
    }
    let mut args: Vec<&str> = vec!["worktree", "add"];
    if create_branch {
        args.push("-b");
        args.push(branch);
        args.push(target_path);
    } else {
        args.push(target_path);
        args.push(branch);
    }
    run_git(path, &args)
}

/// Remove a linked worktree. `force` discards uncommitted changes in it.
pub fn remove_worktree(path: &Path, target_path: &str, force: bool) -> AppResult<()> {
    let mut args = vec!["worktree", "remove"];
    if force {
        args.push("--force");
    }
    args.push(target_path);
    run_git(path, &args)
}

// ===================== "Show Git Output" activity log =====================
// A lightweight, best-effort, in-memory record of the git actions DevCenter has
// run (newest first, capped) — purely for the "Show Git Output" panel. Not
// persisted; cleared on restart.

const GIT_LOG_CAP: usize = 300;
static GIT_LOG: OnceLock<Mutex<VecDeque<GitLogEntry>>> = OnceLock::new();

fn git_log_store() -> &'static Mutex<VecDeque<GitLogEntry>> {
    GIT_LOG.get_or_init(|| Mutex::new(VecDeque::new()))
}

fn now_clock() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let t = secs % 86_400;
    format!("{:02}:{:02}:{:02}", t / 3600, (t % 3600) / 60, t % 60)
}

/// Record one action in the activity log. Never fails the caller — logging is
/// best-effort.
pub fn record_action(path: &Path, action: &str, result: &Result<(), String>) {
    let repo = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| norm(path));
    let entry = GitLogEntry {
        time: now_clock(),
        repo,
        action: action.to_string(),
        ok: result.is_ok(),
        detail: result.as_ref().err().cloned(),
    };
    if let Ok(mut log) = git_log_store().lock() {
        log.push_front(entry);
        while log.len() > GIT_LOG_CAP {
            log.pop_back();
        }
    }
}

/// A snapshot of the activity log, newest first.
pub fn action_log() -> Vec<GitLogEntry> {
    git_log_store()
        .lock()
        .map(|l| l.iter().cloned().collect())
        .unwrap_or_default()
}

