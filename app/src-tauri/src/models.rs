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
