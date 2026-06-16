use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::SystemTime;

use git2::{Repository, StatusOptions};

use crate::error::{AppError, AppResult};
use crate::models::Repo;

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

/// Fetch all remotes for the repository at `path`.
pub fn fetch(path: &Path) -> AppResult<()> {
    let output = git_cmd()
        .arg("-C")
        .arg(path)
        .args(["fetch", "--all", "--prune"])
        .output()?;
    if !output.status.success() {
        return Err(AppError::msg(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
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
/// Delegates to system `git` so the index/working tree are updated correctly
/// and any conflicting local changes surface as a clear error.
pub fn checkout(path: &Path, branch: &str) -> AppResult<()> {
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
