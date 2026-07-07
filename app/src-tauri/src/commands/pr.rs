use std::collections::HashMap;
use std::path::Path;

use tauri::State;

use crate::error::{AppError, AppResult};
use crate::models::{Account, PrThread, PullRequest, Repo};
use crate::state::AppState;
use crate::{git, pr, store};

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

        let mut token_cache: HashMap<String, Option<String>> = HashMap::new();
        let mut out: Vec<PullRequest> = Vec::new();
        let mut errors: Vec<String> = Vec::new();

        for repo in &repos {
            let (mut prs, err) =
                fetch_repo_prs(repo, &github_accounts, &all_accounts, &mut token_cache);
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
        let mut token_cache: HashMap<String, Option<String>> = HashMap::new();
        let (prs, err) = fetch_repo_prs(&repo, &github_accounts, &all_accounts, &mut token_cache);
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
    token_cache: &mut HashMap<String, Option<String>>,
) -> (Vec<PullRequest>, Option<String>) {
    let rref = match pr::RepoRef::parse(&repo.remote, &repo.provider) {
        Some(x) => x,
        None => return (Vec::new(), None),
    };
    // Candidate accounts for this repo.
    let candidates: Vec<Account> = match rref.provider.as_str() {
        "github" => github_accounts.to_vec(),
        "azure" => {
            let aid = rref.azure_account_id();
            all_accounts
                .iter()
                .filter(|a| a.id == aid)
                .cloned()
                .collect()
        }
        _ => Vec::new(),
    };
    if candidates.is_empty() {
        return (Vec::new(), None); // no account configured for this provider/org
    }
    // Try each candidate; the first that succeeds wins.
    let mut last_err: Option<String> = None;
    for account in &candidates {
        if !token_cache.contains_key(&account.id) {
            token_cache.insert(account.id.clone(), pr::resolve_token(account).ok());
        }
        let token = match token_cache.get(&account.id).and_then(|t| t.clone()) {
            Some(t) => t,
            None => continue,
        };
        match pr::fetch_for_repo(&rref, &token, &repo.name, &repo.id) {
            Ok(prs) => return (prs, None),
            Err(e) => last_err = Some(format!("{}: {}", repo.name, e)),
        }
    }
    (Vec::new(), last_err)
}

// ===================== PR review: comments + threads =====================

/// Resolve a repo (by path id) to its provider ref + a working account/token,
/// trying every candidate account until one succeeds.
fn resolve_repo_account(
    repo_id: &str,
    all_accounts: &[Account],
) -> AppResult<(pr::RepoRef, String)> {
    let repo = git::repo_info(Path::new(repo_id), false, Vec::new())?;
    let rref = pr::RepoRef::parse(&repo.remote, &repo.provider)
        .ok_or_else(|| AppError::msg("Couldn't determine the provider repository from its remote."))?;
    let candidates: Vec<Account> = match rref.provider.as_str() {
        "github" => all_accounts.iter().filter(|a| a.provider == "github").cloned().collect(),
        "azure" => {
            let aid = rref.azure_account_id();
            all_accounts.iter().filter(|a| a.id == aid).cloned().collect()
        }
        _ => Vec::new(),
    };
    if candidates.is_empty() {
        return Err(AppError::msg(
            "No connected account for this repository's provider. Add one in Accounts.",
        ));
    }
    let mut last_err: Option<String> = None;
    for account in &candidates {
        match pr::resolve_token(account) {
            Ok(token) => return Ok((rref, token)),
            Err(e) => last_err = Some(e.to_string()),
        }
    }
    Err(AppError::msg(last_err.unwrap_or_else(|| "Couldn't resolve a token for this account.".to_string())))
}

fn accounts(state: &AppState) -> AppResult<Vec<Account>> {
    let conn = state.db.lock().unwrap();
    store::list_accounts(&conn)
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
        let all_accounts = accounts(&st)?;
        let (rref, token) = resolve_repo_account(&repo_id, &all_accounts)?;
        pr::fetch_threads(&rref, pr_id, &token)
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
        let all_accounts = accounts(&st)?;
        let (rref, token) = resolve_repo_account(&repo_id, &all_accounts)?;
        pr::post_comment(&rref, pr_id, thread_id.as_deref(), path.as_deref(), line, &body, &token)?;
        pr::fetch_threads(&rref, pr_id, &token)
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
        let all_accounts = accounts(&st)?;
        let (rref, token) = resolve_repo_account(&repo_id, &all_accounts)?;
        pr::resolve_thread(&rref, pr_id, &thread_id, resolved, &token)?;
        pr::fetch_threads(&rref, pr_id, &token)
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
        let all_accounts = accounts(&st)?;
        let (rref, token) = resolve_repo_account(&repo_id, &all_accounts)?;
        pr::submit_review(&rref, pr_id, &review_type, &body, &token)?;
        pr::fetch_threads(&rref, pr_id, &token)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

