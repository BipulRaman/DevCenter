use tauri::State;

use crate::error::{AppError, AppResult};
use crate::models::Account;
use crate::state::AppState;
use crate::{pr, secrets, store};

/// Normalize an Azure DevOps organization input to its slug. Accepts a bare
/// org ("contoso"), a dev.azure.com URL, or a legacy "{org}.visualstudio.com"
/// URL (with or without scheme/trailing path) and returns just "contoso".
fn normalize_org(input: &str) -> String {
    let mut s = input.trim();
    for p in ["https://", "http://"] {
        if let Some(r) = s.strip_prefix(p) {
            s = r;
            break;
        }
    }
    if let Some(idx) = s.find(".visualstudio.com") {
        return s[..idx].to_string();
    }
    if let Some(rest) = s.strip_prefix("dev.azure.com/") {
        return rest.split('/').next().unwrap_or("").to_string();
    }
    s.split('/').next().unwrap_or("").trim().to_string()
}

/// List all configured provider accounts.
#[tauri::command]
pub async fn list_accounts(state: State<'_, AppState>) -> AppResult<Vec<Account>> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = st.db.lock().unwrap();
        store::list_accounts(&conn)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Add (or update) a provider account. Multiple accounts are supported: GitHub
/// accounts are keyed by username (`github:{username}`) and Azure DevOps
/// accounts by organization (`azure:{org}`). The PAT is stored in the OS
/// keychain and the credentials are verified against the provider before the
/// account is saved.
/// Add (or update) a provider account. Multiple accounts are supported: GitHub
/// accounts are keyed by username (`github:{username}`) and Azure DevOps
/// accounts by organization (`azure:{org}`).
///
/// `auth_kind` selects how the credential is obtained:
/// - `"git"`: use Git Credential Manager (the same browser sign-in as clone).
///   The token is re-fetched on demand and **never stored** — this avoids the
///   keychain size limit for large Entra tokens and handles their expiry.
/// - `"token"`: a pasted PAT, stored in the OS keychain.
///
/// `host` lets the caller pin a legacy `{org}.visualstudio.com` host; when
/// absent, Azure defaults to `dev.azure.com`.
#[tauri::command]
pub async fn add_account(
    provider: String,
    organization: Option<String>,
    username: Option<String>,
    auth_kind: Option<String>,
    host: Option<String>,
    token: Option<String>,
    label: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Account> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Account> {
        let provider = provider.to_lowercase();
        let auth_kind = match auth_kind.as_deref() {
            Some("git") => "git",
            _ => "token",
        };

        // Determine identity + host per provider.
        let (id, acc_host, organization, default_label) = match provider.as_str() {
            "github" => {
                let user = username
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty());
                // Placeholder; the real id/label is finalized after we know the login.
                (
                    user.as_ref().map(|u| format!("github:{}", u.to_lowercase())),
                    "github.com".to_string(),
                    None,
                    user,
                )
            }
            "azure" => {
                let org = normalize_org(&organization.unwrap_or_default());
                if org.is_empty() {
                    return Err(AppError::msg("Organization is required for Azure DevOps."));
                }
                let host = host
                    .map(|h| h.trim().to_lowercase())
                    .filter(|h| h.contains("visualstudio.com"))
                    .unwrap_or_else(|| "dev.azure.com".to_string());
                (
                    Some(format!("azure:{org}")),
                    host,
                    Some(org.clone()),
                    Some(org),
                )
            }
            _ => return Err(AppError::msg("Unknown provider.")),
        };

        // Build a provisional account so we can resolve a token and verify.
        let mut account = Account {
            id: id.clone().unwrap_or_default(),
            provider: provider.clone(),
            label: label
                .as_ref()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .or(default_label.clone())
                .unwrap_or_default(),
            host: acc_host,
            organization,
            username: None,
            auth_kind: auth_kind.to_string(),
            status: "unverified".to_string(),
        };

        // Obtain the token: from GCM (git) or the pasted PAT (token).
        let tok = if auth_kind == "git" {
            let url = pr::account_auth_url(&account);
            crate::git::credential_fill(&url)?.1
        } else {
            token
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| AppError::msg("A token is required."))?
        };

        // Verify, deriving the GitHub login when we don't have one yet.
        let who = pr::verify(&account, &tok)?;
        account.username = Some(who.clone());
        account.status = "connected".to_string();

        // Finalize GitHub identity from the verified login when needed.
        if provider == "github" && account.id.is_empty() {
            account.id = format!("github:{}", who.to_lowercase());
            if account.label.is_empty() {
                account.label = who.clone();
            }
        }
        if account.label.is_empty() {
            account.label = account.username.clone().unwrap_or_else(|| provider.clone());
        }

        // Only PATs are stored; git-auth re-resolves via GCM each time.
        if auth_kind == "token" {
            secrets::set_token(&account.id, &tok)?;
        } else {
            // Ensure no stale PAT lingers for this id.
            let _ = secrets::delete_token(&account.id);
        }

        let conn = st.db.lock().unwrap();
        store::upsert_account(&conn, &account)?;
        drop(conn);
        // Drop any previously cached token for this id so the fresh credential
        // is used from now on.
        st.invalidate_token(&account.id);
        Ok(account)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Re-test an existing account's credentials and refresh its status/username.
#[tauri::command]
pub async fn test_account(id: String, state: State<'_, AppState>) -> AppResult<Account> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Account> {
        let mut account = {
            let conn = st.db.lock().unwrap();
            store::get_account(&conn, &id)?
        }
                .ok_or_else(|| AppError::msg("Account not found."))?;

        // Re-testing should hit the provider with a freshly resolved credential.
        st.invalidate_token(&id);
        let tok = pr::resolve_token(&account)?;
        match pr::verify(&account, &tok) {
            Ok(username) => {
                account.username = Some(username.clone());
                account.status = "connected".to_string();
                let conn = st.db.lock().unwrap();
                store::update_account_status(&conn, &id, Some(&username), "connected")?;
                Ok(account)
            }
            Err(e) => {
                let conn = st.db.lock().unwrap();
                store::update_account_status(&conn, &id, account.username.as_deref(), "error")?;
                Err(e)
            }
        }
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Remove an account and delete any stored token.
#[tauri::command]
pub async fn remove_account(id: String, state: State<'_, AppState>) -> AppResult<()> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<()> {
        {
            let conn = st.db.lock().unwrap();
            store::delete_account(&conn, &id)?;
        }
        let _ = secrets::delete_token(&id);
        st.invalidate_token(&id);
        Ok(())
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// A credential retrieved from Git Credential Manager.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCred {
    pub username: String,
    pub token: String,
}

/// Obtain a credential for `host` via Git Credential Manager — the same browser
/// sign-in Git uses for clone/fetch. Returns a cached credential instantly when
/// available, or triggers GCM's interactive sign-in. The token is returned to
/// the UI so it can flow through `add_account` (which stores it in the keychain).
#[tauri::command]
pub async fn git_token(host: String) -> AppResult<GitCred> {
    tauri::async_runtime::spawn_blocking(move || -> AppResult<GitCred> {
        let host = host.trim();
        if host.is_empty() {
            return Err(AppError::msg("Host is required."));
        }
        let (username, token) = crate::git::credential_fill(host)?;
        Ok(GitCred { username, token })
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}
