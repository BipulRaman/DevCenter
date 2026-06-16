//! Secure credential storage backed by the OS keychain (Windows Credential
//! Manager / macOS Keychain / Linux Secret Service) via the `keyring` crate.
//! Tokens are keyed by account id and never touch SQLite or logs.

use crate::error::{AppError, AppResult};

const SERVICE: &str = "com.devcenter.desktop";

fn entry(account_id: &str) -> AppResult<keyring::Entry> {
    keyring::Entry::new(SERVICE, account_id).map_err(|e| AppError::msg(e.to_string()))
}

/// Store (or overwrite) the token for an account.
pub fn set_token(account_id: &str, token: &str) -> AppResult<()> {
    entry(account_id)?
        .set_password(token)
        .map_err(|e| AppError::msg(e.to_string()))
}

/// Fetch the token for an account, if one is stored.
pub fn get_token(account_id: &str) -> AppResult<Option<String>> {
    match entry(account_id)?.get_password() {
        Ok(pw) => Ok(Some(pw)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::msg(e.to_string())),
    }
}

/// Remove the stored token for an account (no-op if absent).
pub fn delete_token(account_id: &str) -> AppResult<()> {
    match entry(account_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::msg(e.to_string())),
    }
}
