use std::path::Path;

use tauri::State;

use crate::error::{AppError, AppResult};
use crate::models::{Account, PrThread, PullRequest, Repo};
use crate::state::AppState;
use crate::{git, pr, store};

fn account_matches_repo(account: &Account, repo_ref: &pr::RepoRef) -> bool {
    match repo_ref.provider.as_str() {
        "github" => account.provider == "github",
        "azure" => account
            .id
            .eq_ignore_ascii_case(&repo_ref.azure_account_id()),
        _ => false,
    }
}

/// Fetch pull requests for the watched repositories. When `repo_ids` is given,
/// only those repos (by path id) are queried. Each repo is mapped to its
/// provider account; repos with no matching account are skipped. Provider
/// tokens are resolved once per account.
#[tauri::command]
pub async fn list_pull_requests(
    repo_ids: Option<Vec<String>>,
    state: State<'_, AppState>,
) -> AppResult<Vec<PullRequest>> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Vec<PullRequest>> {
        // Resolve watched repositories with live remote/provider info.
        let paths = {
            let conn = st.db.lock().unwrap();
            store::list_paths(&conn)?
        };
        let mut repos: Vec<_> = paths
            .into_iter()
            .filter(|(_, watched)| *watched)
            .filter_map(|(p, w)| git::repo_info(Path::new(&p), w, Vec::new()).ok())
            .collect();

        if let Some(ids) = &repo_ids {
            if !ids.is_empty() {
                repos.retain(|r| ids.contains(&r.id));
            }
        }

        // Load all accounts once. GitHub repos can be served by any GitHub
        // account; Azure repos by the account matching their org.
        let all_accounts = {
            let conn = st.db.lock().unwrap();
            store::list_accounts(&conn)?
        };
        let github_accounts: Vec<Account> = all_accounts
            .iter()
            .filter(|a| a.provider == "github")
            .cloned()
            .collect();

        let mut out: Vec<PullRequest> = Vec::new();
        let mut errors: Vec<String> = Vec::new();

        for repo in &repos {
            let (mut prs, err) =
                fetch_repo_prs(repo, &github_accounts, &all_accounts, &st);
            out.append(&mut prs);
            if let Some(e) = err {
                errors.push(e);
            }
        }

        // Surface an error only when nothing came back at all.
        if out.is_empty() && !errors.is_empty() {
            return Err(AppError::msg(errors.join("\n")));
        }
        Ok(out)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Fetch pull requests for a SINGLE repository by its path id, regardless of
/// whether the repo is "watched". Backs the per-repo Pull Requests tab on the
/// Changes page.
#[tauri::command]
pub async fn list_repo_pull_requests(
    repo_id: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<PullRequest>> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Vec<PullRequest>> {
        let repo = git::repo_info(Path::new(&repo_id), false, Vec::new())?;
        let all_accounts = {
            let conn = st.db.lock().unwrap();
            store::list_accounts(&conn)?
        };
        let github_accounts: Vec<Account> = all_accounts
            .iter()
            .filter(|a| a.provider == "github")
            .cloned()
            .collect();
        let (prs, err) = fetch_repo_prs(&repo, &github_accounts, &all_accounts, &st);
        if prs.is_empty() {
            if let Some(e) = err {
                return Err(AppError::msg(e));
            }
        }
        Ok(prs)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Fetch pull requests for a single repository using the first provider account
/// whose token works. Returns the PRs (possibly empty) and, when every candidate
/// account failed, the last error message. Repos with no parseable remote or no
/// configured provider account yield an empty list and no error (skipped).
fn fetch_repo_prs(
    repo: &Repo,
    github_accounts: &[Account],
    all_accounts: &[Account],
    st: &AppState,
) -> (Vec<PullRequest>, Option<String>) {
    let rref = match pr::RepoRef::parse(&repo.remote, &repo.provider) {
        Some(x) => x,
        None => return (Vec::new(), None),
    };
    // Candidate accounts for this repo.
    let candidates: Vec<Account> = match rref.provider.as_str() {
        "github" => github_accounts.to_vec(),
        "azure" => all_accounts
            .iter()
            .filter(|account| account_matches_repo(account, &rref))
            .cloned()
            .collect(),
        _ => Vec::new(),
    };
    if candidates.is_empty() {
        return (Vec::new(), None); // no account configured for this provider/org
    }
    // Try each candidate; the first that succeeds wins. Tokens are resolved
    // through the shared state cache so repeated refreshes reuse a `git`-auth
    // credential instead of re-triggering a sign-in popup.
    let mut last_err: Option<String> = None;
    for account in &candidates {
        let token = match st.resolve_token(account) {
            Ok(t) => t,
            Err(_) => continue,
        };
        match pr::fetch_for_repo(&rref, &token, &repo.name, &repo.id) {
            Ok(prs) => return (prs, None),
            Err(e) => {
                // A cached `git`-auth token may have expired — drop it and try
                // once more with a freshly resolved credential.
                if account.auth_kind == "git" {
                    st.invalidate_token(&account.id);
                    if let Ok(token) = st.resolve_token(account) {
                        if let Ok(prs) = pr::fetch_for_repo(&rref, &token, &repo.name, &repo.id) {
                            return (prs, None);
                        }
                    }
                }
                last_err = Some(format!("{}: {}", repo.name, e));
            }
        }
    }
    (Vec::new(), last_err)
}

// ===================== PR review: comments + threads =====================

/// Resolve a repo (by path id) to its provider ref + a working account/token,
/// trying every candidate account until one succeeds. Returns the winning
/// account so the caller can invalidate its cached token on a later auth error.
fn resolve_repo_account(
    repo_id: &str,
    all_accounts: &[Account],
    st: &AppState,
) -> AppResult<(pr::RepoRef, Account, String)> {
    let repo = git::repo_info(Path::new(repo_id), false, Vec::new())?;
    let rref = pr::RepoRef::parse(&repo.remote, &repo.provider)
        .ok_or_else(|| AppError::msg("Couldn't determine the provider repository from its remote."))?;
    let candidates: Vec<Account> = all_accounts
        .iter()
        .filter(|account| account_matches_repo(account, &rref))
        .cloned()
        .collect();
    if candidates.is_empty() {
        return Err(AppError::msg(
            "No connected account for this repository's provider. Add one in Accounts.",
        ));
    }
    let mut last_err: Option<String> = None;
    for account in candidates {
        match st.resolve_token(&account) {
            Ok(token) => return Ok((rref, account, token)),
            Err(e) => last_err = Some(e.to_string()),
        }
    }
    Err(AppError::msg(last_err.unwrap_or_else(|| "Couldn't resolve a token for this account.".to_string())))
}

/// Run a PR operation against a repo's resolved account/token, retrying once
/// with a freshly resolved credential if the first attempt fails on a
/// `git`-auth account (its cached token may have expired).
fn with_repo_token<T>(
    st: &AppState,
    repo_id: &str,
    op: impl Fn(&pr::RepoRef, &str) -> AppResult<T>,
) -> AppResult<T> {
    let all_accounts = accounts(st)?;
    let (rref, account, token) = resolve_repo_account(repo_id, &all_accounts, st)?;
    match op(&rref, &token) {
        Ok(v) => Ok(v),
        Err(e) if account.auth_kind == "git" => {
            st.invalidate_token(&account.id);
            let token = st.resolve_token(&account)?;
            op(&rref, &token).map_err(|_| e)
        }
        Err(e) => Err(e),
    }
}

fn accounts(state: &AppState) -> AppResult<Vec<Account>> {
    let conn = state.db.lock().unwrap();
    store::list_accounts(&conn)
}

#[cfg(test)]
mod tests {
    use super::account_matches_repo;
    use crate::models::Account;
    use crate::pr::RepoRef;

    #[test]
    fn azure_account_matching_ignores_organization_case() {
        let account = Account {
            id: "azure:Contoso".into(),
            provider: "azure".into(),
            label: "Contoso".into(),
            host: "dev.azure.com".into(),
            organization: Some("Contoso".into()),
            username: None,
            auth_kind: "git".into(),
            status: "connected".into(),
        };
        let repo_ref =
            RepoRef::parse("dev.azure.com/contoso/Project/_git/Repository", "azure").unwrap();

        assert!(account_matches_repo(&account, &repo_ref));
    }
}

/// All comment threads (general discussion + inline code review) for a PR.
#[tauri::command]
pub async fn fetch_pr_threads(
    repo_id: String,
    pr_id: u64,
    state: State<'_, AppState>,
) -> AppResult<Vec<PrThread>> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Vec<PrThread>> {
        with_repo_token(&st, &repo_id, |rref, token| pr::fetch_threads(rref, pr_id, token))
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Post a comment — a reply to `thread_id` if given, else a new thread
/// (inline when `path`/`line` are given, general otherwise). Returns the
/// refreshed thread list.
#[tauri::command]
pub async fn post_pr_comment(
    repo_id: String,
    pr_id: u64,
    body: String,
    thread_id: Option<String>,
    path: Option<String>,
    line: Option<u32>,
    state: State<'_, AppState>,
) -> AppResult<Vec<PrThread>> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Vec<PrThread>> {
        with_repo_token(&st, &repo_id, |rref, token| {
            pr::post_comment(rref, pr_id, thread_id.as_deref(), path.as_deref(), line, &body, token)?;
            pr::fetch_threads(rref, pr_id, token)
        })
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Resolve/reopen a thread. Returns the refreshed thread list.
#[tauri::command]
pub async fn resolve_pr_thread(
    repo_id: String,
    pr_id: u64,
    thread_id: String,
    resolved: bool,
    state: State<'_, AppState>,
) -> AppResult<Vec<PrThread>> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Vec<PrThread>> {
        with_repo_token(&st, &repo_id, |rref, token| {
            pr::resolve_thread(rref, pr_id, &thread_id, resolved, token)?;
            pr::fetch_threads(rref, pr_id, token)
        })
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Submit a review (`review_type` = "approve" | "changes" | "comment").
/// Returns the refreshed thread list.
#[tauri::command]
pub async fn submit_pr_review(
    repo_id: String,
    pr_id: u64,
    review_type: String,
    body: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<PrThread>> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Vec<PrThread>> {
        with_repo_token(&st, &repo_id, |rref, token| {
            pr::submit_review(rref, pr_id, &review_type, &body, token)?;
            pr::fetch_threads(rref, pr_id, token)
        })
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// The signed-in user's own vote on a PR, normalized to the Azure scale
/// (10 approved, 5 approved-with-suggestions, 0 none, -5 waiting, -10 rejected).
/// GitHub maps onto 10 / 0 / -10. Backs the PR Review page's live vote status.
#[tauri::command]
pub async fn pr_my_vote(
    repo_id: String,
    pr_id: u64,
    state: State<'_, AppState>,
) -> AppResult<i32> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<i32> {
        with_repo_token(&st, &repo_id, |rref, token| pr::my_vote(rref, pr_id, token))
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Publish a draft pull request (mark it ready for review). Returns nothing.
#[tauri::command]
pub async fn publish_pr(
    repo_id: String,
    pr_id: u64,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<()> {
        with_repo_token(&st, &repo_id, |rref, token| pr::publish(rref, pr_id, token))
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Create a pull request from `head` into `base` (branch names) for the repo.
/// Returns the created PR so the UI can list/open it.
#[tauri::command]
pub async fn create_pull_request(
    repo_id: String,
    title: String,
    body: String,
    base: String,
    head: String,
    draft: bool,
    state: State<'_, AppState>,
) -> AppResult<PullRequest> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<PullRequest> {
        let display = git::repo_info(Path::new(&repo_id), false, Vec::new())
            .map(|r| r.name)
            .unwrap_or_else(|_| repo_id.clone());
        with_repo_token(&st, &repo_id, |rref, token| {
            pr::create_pr(rref, &title, &body, &base, &head, draft, &display, &repo_id, token)
        })
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

