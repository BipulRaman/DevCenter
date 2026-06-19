use std::collections::HashMap;
use std::path::Path;

use tauri::State;

use crate::error::{AppError, AppResult};
use crate::models::{Account, PullRequest, Repo};
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
        match pr::fetch_for_repo(&rref, &token, &repo.name) {
            Ok(prs) => return (prs, None),
            Err(e) => last_err = Some(format!("{}: {}", repo.name, e)),
        }
    }
    (Vec::new(), last_err)
}
