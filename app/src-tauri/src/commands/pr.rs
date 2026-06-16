use std::collections::HashMap;
use std::path::Path;

use tauri::State;

use crate::error::{AppError, AppResult};
use crate::models::{Account, PullRequest};
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
            let rref = match pr::RepoRef::parse(&repo.remote, &repo.provider) {
                Some(x) => x,
                None => continue,
            };

            // Candidate accounts for this repo.
            let candidates: Vec<Account> = match rref.provider.as_str() {
                "github" => github_accounts.clone(),
                "azure" => {
                    let aid = rref.azure_account_id();
                    all_accounts.iter().filter(|a| a.id == aid).cloned().collect()
                }
                _ => Vec::new(),
            };
            if candidates.is_empty() {
                continue; // no account configured for this provider/org
            }

            // Try each candidate; the first that succeeds wins.
            let mut fetched = false;
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
                    Ok(mut prs) => {
                        out.append(&mut prs);
                        fetched = true;
                        break;
                    }
                    Err(e) => last_err = Some(format!("{}: {}", repo.name, e)),
                }
            }
            if !fetched {
                if let Some(e) = last_err {
                    errors.push(e);
                }
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
