use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use rusqlite::Connection;

use crate::apps::runner::AppRunner;
use crate::error::AppResult;
use crate::models::Account;

/// How long a resolved `git`-auth token is reused before it is re-fetched from
/// Git Credential Manager. Long enough to avoid a sign-in popup on every PR
/// action, short enough that a rotated/expired credential is picked up soon.
const TOKEN_TTL: Duration = Duration::from_secs(30 * 60);

/// A cached credential together with the moment it was resolved.
struct CachedToken {
    token: String,
    fetched: Instant,
}

/// Shared application state, registered once via `.manage()` and accessed in
/// commands through `tauri::State<'_, AppState>`.
///
/// The DB handle is wrapped in `Arc<Mutex<…>>` so it can be cheaply cloned into
/// `spawn_blocking` closures, keeping SQLite work off the async runtime thread.
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub runner: Arc<AppRunner>,
    /// In-memory cache of resolved `git`-auth tokens, keyed by account id, so
    /// repeated actions don't re-trigger Git Credential Manager's sign-in.
    token_cache: Arc<Mutex<HashMap<String, CachedToken>>>,
}

impl AppState {
    pub fn new(conn: Connection) -> Self {
        AppState {
            db: Arc::new(Mutex::new(conn)),
            runner: Arc::new(AppRunner::new()),
            token_cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Resolve an account's token, reusing a recently cached value when possible
    /// to avoid re-invoking Git Credential Manager (and its sign-in popup) on
    /// every action. `token`-auth accounts read the PAT from the keychain each
    /// time (cheap and non-interactive) and are not cached here.
    pub fn resolve_token(&self, account: &Account) -> AppResult<String> {
        if account.auth_kind != "git" {
            return crate::pr::resolve_token(account);
        }
        {
            let cache = self.token_cache.lock().unwrap();
            if let Some(c) = cache.get(&account.id) {
                if c.fetched.elapsed() < TOKEN_TTL {
                    return Ok(c.token.clone());
                }
            }
        }
        let token = crate::pr::resolve_token(account)?;
        self.token_cache.lock().unwrap().insert(
            account.id.clone(),
            CachedToken {
                token: token.clone(),
                fetched: Instant::now(),
            },
        );
        Ok(token)
    }

    /// Drop any cached token for an account so the next resolve re-fetches it —
    /// used after an auth failure (the credential may have expired) and when an
    /// account is added, re-tested, or removed.
    pub fn invalidate_token(&self, account_id: &str) {
        self.token_cache.lock().unwrap().remove(account_id);
    }
}
