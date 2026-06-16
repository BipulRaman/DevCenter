//! Pull-request fetching across providers (GitHub + Azure DevOps).

pub mod azure;
pub mod github;

use crate::error::{AppError, AppResult};
use crate::models::{Account, PullRequest};

/// Parsed coordinates of a repository on its hosting provider, derived from the
/// repo's cleaned remote URL (scheme/`.git` already stripped) + provider tag.
pub struct RepoRef {
    pub provider: String,
    /// Hosting host, e.g. "github.com", "dev.azure.com", "org.visualstudio.com".
    pub host: String,
    /// GitHub owner, or Azure DevOps organization.
    pub owner: String,
    /// Azure DevOps project (None for GitHub).
    pub project: Option<String>,
    pub repo: String,
}

impl RepoRef {
    pub fn parse(remote: &str, provider: &str) -> Option<RepoRef> {
        let segs: Vec<&str> = remote.split('/').filter(|s| !s.is_empty()).collect();
        if segs.len() < 2 {
            return None;
        }
        let host = segs[0];
        match provider {
            "github" => {
                // github.com/owner/repo
                if segs.len() < 3 {
                    return None;
                }
                Some(RepoRef {
                    provider: "github".into(),
                    host: host.to_string(),
                    owner: segs[1].to_string(),
                    project: None,
                    repo: segs[2].to_string(),
                })
            }
            "azure" => {
                // dev.azure.com/{org}/{project}/_git/{repo}
                // or            {org}.visualstudio.com/{project}/_git/{repo}
                let gi = segs.iter().position(|s| *s == "_git")?;
                if gi + 1 >= segs.len() {
                    return None;
                }
                let repo = segs[gi + 1].to_string();
                let (org, project) = if host.ends_with(".visualstudio.com") {
                    (
                        host.trim_end_matches(".visualstudio.com").to_string(),
                        segs[1..gi].join("/"),
                    )
                } else {
                    (
                        segs.get(1).copied().unwrap_or("").to_string(),
                        segs[2..gi].join("/"),
                    )
                };
                if org.is_empty() || project.is_empty() {
                    return None;
                }
                Some(RepoRef {
                    provider: "azure".into(),
                    host: host.to_string(),
                    owner: org,
                    project: Some(project),
                    repo,
                })
            }
            _ => None,
        }
    }

    /// Candidate account id for an Azure repo (org-scoped). GitHub repos can be
    /// served by any GitHub account, so they are resolved by the caller instead.
    pub fn azure_account_id(&self) -> String {
        format!("azure:{}", self.owner)
    }
}

/// The collection/auth URL used to obtain a credential for an account from Git
/// Credential Manager (and as the API base for verification).
pub fn account_auth_url(account: &Account) -> String {
    match account.provider.as_str() {
        "azure" => azure::collection_base(
            &account.host,
            account.organization.as_deref().unwrap_or(""),
        ),
        _ => format!("https://{}", account.host),
    }
}

/// Resolve the token for an account. `git`-auth accounts re-fetch a fresh token
/// from Git Credential Manager on demand (handles Entra token expiry and avoids
/// storing oversized tokens); `token`-auth accounts read the PAT from the OS
/// keychain.
pub fn resolve_token(account: &Account) -> AppResult<String> {
    if account.auth_kind == "git" {
        let url = account_auth_url(account);
        Ok(crate::git::credential_fill(&url)?.1)
    } else {
        crate::secrets::get_token(&account.id)?
            .ok_or_else(|| AppError::msg("No saved token. Open Accounts to reconnect."))
    }
}

/// Fetch pull requests for a single repo using its matching account.
pub fn fetch_for_repo(
    repo_ref: &RepoRef,
    token: &str,
    display: &str,
) -> AppResult<Vec<PullRequest>> {
    match repo_ref.provider.as_str() {
        "github" => github::fetch_pulls(repo_ref, token, display),
        "azure" => azure::fetch_pulls(repo_ref, token, display),
        _ => Ok(vec![]),
    }
}

/// Verify an account's credentials, returning the resolved display name.
pub fn verify(account: &Account, token: &str) -> AppResult<String> {
    match account.provider.as_str() {
        "github" => github::verify(token),
        "azure" => azure::verify(account, token),
        _ => Err(AppError::msg("Unknown provider")),
    }
}

/// Trim an ISO-8601 timestamp to its `YYYY-MM-DD` date portion.
pub fn short_date(s: &str) -> String {
    s.chars().take(10).collect()
}
