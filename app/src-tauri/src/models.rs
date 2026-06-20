use serde::{Deserialize, Serialize};

/// A Git repository as presented to the UI. Field names serialize to camelCase
/// to match the shapes the existing front-end already consumes.
///
/// `id` is the canonical absolute path, which is also a stable, unique handle
/// used by `git_fetch`, `set_repo_watched`, etc.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Repo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub branch: String,
    pub remote: String,
    /// "github" | "azure" | "other"
    pub provider: String,
    /// "clean" | "dirty"
    pub status: String,
    pub ahead: u32,
    pub behind: u32,
    /// Humanized relative time of the last fetch (from `.git/FETCH_HEAD`), or null.
    pub last_fetch: Option<String>,
    pub watched: bool,
    /// User-assigned tags for grouping/filtering.
    pub tags: Vec<String>,
}

/// A configured provider account (GitHub or Azure DevOps) used to call the
/// provider's REST API for pull requests. The credential itself is never part
/// of this struct — it lives in the OS keychain (for `authKind = "token"`) or
/// is resolved on demand from Git Credential Manager (for `authKind = "git"`).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    /// Stable id: "github.com" for GitHub, "azure:{org}" for Azure DevOps.
    pub id: String,
    /// "github" | "azure"
    pub provider: String,
    /// Display label shown in the UI.
    pub label: String,
    /// API host, e.g. "github.com" or "dev.azure.com".
    pub host: String,
    /// Azure DevOps organization (None for GitHub).
    pub organization: Option<String>,
    /// Username/display name resolved from the provider on the last test.
    pub username: Option<String>,
    /// "token" (PAT in keychain) | "git" (use Git Credential Manager).
    pub auth_kind: String,
    /// "connected" | "error" | "unverified"
    pub status: String,
}

/// A pull request normalized across providers for the UI.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PullRequest {
    pub id: u64,
    pub title: String,
    /// Display name of the repository this PR belongs to.
    pub repo: String,
    pub author: String,
    pub branch: String,
    pub base: String,
    /// "open" | "draft" | "merged"
    pub status: String,
    /// "approved" | "changes" | "pending"
    pub reviews: String,
    pub comments: u32,
    pub additions: u32,
    pub deletions: u32,
    /// Humanized relative time since last update.
    pub updated: String,
    /// Deep link to the PR in the provider's web UI.
    pub url: String,
}

/// A single changed file — in the working tree (Changes tab) or within a commit
/// (History tab). Paths use forward slashes regardless of OS.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    /// Previous path when the file was renamed.
    pub old_path: Option<String>,
    /// "new" | "modified" | "deleted" | "renamed" | "untracked" | "conflicted" | "typechange".
    pub status: String,
}

/// A single entry in `git stash list` (working-tree snapshots saved for later).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StashEntry {
    /// Stash index (`stash@{index}`); 0 is the most recent.
    pub index: usize,
    /// The stash message (custom message, or the auto WIP description).
    pub message: String,
    /// Branch the stash was created on.
    pub branch: String,
    /// Humanized relative time the stash was created.
    pub when: String,
}

/// The set of changes shown on the Changes page — either the working tree
/// (`branch` set) or a single commit (`summary`/`author`/`when` set).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChangeSet {
    pub branch: Option<String>,
    pub summary: Option<String>,
    pub author: Option<String>,
    pub when: Option<String>,
    pub files: Vec<FileChange>,
    /// Working-tree changes split into the index (staged) and the working tree
    /// (unstaged). Empty for commit views. A path may appear in both when it has
    /// staged *and* further unstaged edits.
    #[serde(default)]
    pub staged: Vec<FileChange>,
    #[serde(default)]
    pub unstaged: Vec<FileChange>,
    /// Saved stashes for this repo (most recent first). Empty for commit views.
    #[serde(default)]
    pub stashes: Vec<StashEntry>,
    /// Working-tree sync state vs the upstream branch (0 for commit views).
    #[serde(default)]
    pub ahead: u32,
    #[serde(default)]
    pub behind: u32,
    /// Whether the current branch has a configured upstream (push/pull target).
    #[serde(default)]
    pub has_upstream: bool,
}

/// One line within a diff hunk.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    /// "add" | "del" | "ctx".
    pub kind: String,
    pub content: String,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
}

/// A contiguous block of changes within a file diff.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub header: String,
    pub lines: Vec<DiffLine>,
}

/// A parsed unified diff for a single file.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub binary: bool,
    pub additions: u32,
    pub deletions: u32,
    pub hunks: Vec<DiffHunk>,
}

/// State of an in-progress operation that left merge conflicts in a repo.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConflictInfo {
    /// "merge" | "rebase" | "cherry-pick" | "revert" | "none" (no conflicts).
    pub kind: String,
    /// The branch currently checked out ("ours" side of the conflict).
    pub ours: String,
    /// The branch/commit being merged/replayed ("theirs" side).
    pub theirs: String,
    /// Paths (forward slashes) of files with unresolved conflicts.
    pub files: Vec<String>,
}

/// The three sides of a single conflicted file plus the marked working-tree
/// content git wrote (with `<<<<<<<` / `=======` / `>>>>>>>` markers).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConflictFile {
    pub path: String,
    /// Common-ancestor content (empty for add/add conflicts).
    pub base: String,
    /// Our full version of the file.
    pub ours: String,
    /// Their full version of the file.
    pub theirs: String,
    /// Working-tree content with conflict markers.
    pub merged: String,
    /// True when any side is binary — the marker view isn't usable.
    pub binary: bool,
}

/// One entry in a repository's commit history.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    /// Short hash (7 chars).
    pub id: String,
    /// Full hash (used for diff lookups).
    pub hash: String,
    pub summary: String,
    pub author: String,
    pub when: String,
    /// True when this commit is ahead of the upstream branch (not yet pushed).
    #[serde(default)]
    pub unpushed: bool,
    /// Names of any tags that point at this commit.
    #[serde(default)]
    pub tags: Vec<String>,
}
