//! Pull-request fetching across providers (GitHub + Azure DevOps).

pub mod azure;
pub mod github;

use crate::error::{AppError, AppResult};
use crate::models::{Account, PrThread, PullRequest};

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
/// `repo_id` is the repo's DevCenter id (its path), stamped onto each result.
pub fn fetch_for_repo(
    repo_ref: &RepoRef,
    token: &str,
    display: &str,
    repo_id: &str,
) -> AppResult<Vec<PullRequest>> {
    match repo_ref.provider.as_str() {
        "github" => github::fetch_pulls(repo_ref, token, display, repo_id),
        "azure" => azure::fetch_pulls(repo_ref, token, display, repo_id),
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

// ===================== PR review: comments + threads =====================

/// All comment threads (general discussion + inline code review) for a PR.
pub fn fetch_threads(repo_ref: &RepoRef, pr_id: u64, token: &str) -> AppResult<Vec<PrThread>> {
    match repo_ref.provider.as_str() {
        "github" => github::fetch_threads(repo_ref, pr_id, token),
        "azure" => azure::fetch_threads(repo_ref, pr_id, token),
        _ => Ok(vec![]),
    }
}

/// Post a comment: reply to `thread_id` when given (except GitHub's
/// synthesized "general" thread, which has no real id to reply to — it just
/// posts another general comment), otherwise start a new thread (inline when
/// `path`/`line` are given, general otherwise).
pub fn post_comment(
    repo_ref: &RepoRef,
    pr_id: u64,
    thread_id: Option<&str>,
    path: Option<&str>,
    line: Option<u32>,
    body: &str,
    token: &str,
) -> AppResult<()> {
    match repo_ref.provider.as_str() {
        "github" => match thread_id {
            Some(id) if id != "general" => github::post_reply(repo_ref, pr_id, id, body, token),
            _ => match path {
                Some(p) => github::post_inline_comment(repo_ref, pr_id, p, line.unwrap_or(1), body, token),
                None => github::post_general_comment(repo_ref, pr_id, body, token),
            },
        },
        "azure" => match thread_id {
            Some(id) => {
                let tid: u64 = id.parse().map_err(|_| AppError::msg("Invalid thread id."))?;
                azure::post_comment(repo_ref, pr_id, tid, body, token)
            }
            None => azure::create_thread(repo_ref, pr_id, body, path, line, token),
        },
        _ => Err(AppError::msg("Unsupported provider.")),
    }
}

/// Resolve/reopen a thread. GitHub's REST API has no such endpoint (GraphQL
/// only) — `PrThread.canResolve` is false for GitHub threads so the UI hides
/// the control there.
pub fn resolve_thread(repo_ref: &RepoRef, pr_id: u64, thread_id: &str, resolved: bool, token: &str) -> AppResult<()> {
    match repo_ref.provider.as_str() {
        "azure" => {
            let tid: u64 = thread_id.parse().map_err(|_| AppError::msg("Invalid thread id."))?;
            azure::resolve_thread(repo_ref, pr_id, tid, resolved, token)
        }
        _ => Err(AppError::msg("Resolving threads isn't supported for this provider yet.")),
    }
}

/// Submit a review. `review_type` is "approve" | "changes" | "comment".
pub fn submit_review(repo_ref: &RepoRef, pr_id: u64, review_type: &str, body: &str, token: &str) -> AppResult<()> {
    match repo_ref.provider.as_str() {
        "github" => {
            let event = match review_type {
                "approve" => "APPROVE",
                "changes" => "REQUEST_CHANGES",
                _ => "COMMENT",
            };
            github::submit_review(repo_ref, pr_id, event, body, token)
        }
        "azure" => {
            // Azure DevOps "review" = casting your own vote; a body (if any)
            // is posted as a separate general comment since votes have no
            // attached message of their own.
            let vote = match review_type {
                "approve" => 10,
                "changes" => -10,
                _ => 0,
            };
            azure::submit_review(repo_ref, pr_id, vote, token)?;
            if !body.trim().is_empty() {
                azure::create_thread(repo_ref, pr_id, body, None, None, token)?;
            }
            Ok(())
        }
        _ => Err(AppError::msg("Unsupported provider.")),
    }
}

