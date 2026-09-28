//! Secure credential storage backed by the OS keychain via the `keyring` crate:
//! Windows Credential Manager, macOS Keychain, and — on Linux — the kernel
//! keyutils cache backed by the D-Bus Secret Service (gnome-keyring / KWallet)
//! so tokens survive a logout or reboot. Tokens are keyed by account id and
//! never touch SQLite or logs.

use crate::error::{AppError, AppResult};

/// Turn a `keyring` error into a message the user can act on.
///
/// On Linux the Secret Service is a separate daemon that may be missing (a bare
/// window manager), not running, or locked. The raw D-Bus error that surfaces in
/// that case is meaningless to the user, so say what to do about it instead.
fn keyring_err(e: keyring::Error) -> AppError {
    #[cfg(target_os = "linux")]
    if matches!(
        e,
        keyring::Error::PlatformFailure(_) | keyring::Error::NoStorageAccess(_)
    ) {
        return AppError::msg(format!(
            "Couldn't reach the system keyring, so the token can't be saved. Install and \
             unlock a Secret Service provider (on Ubuntu: `sudo apt install gnome-keyring \
             seahorse`), then sign in again. ({e})"
        ));
    }
    AppError::msg(e.to_string())
}

fn entry(account_id: &str) -> AppResult<keyring::Entry> {
    keyring::Entry::new(crate::app_identifier(), account_id).map_err(keyring_err)
}

/// Store (or overwrite) the token for an account.
pub fn set_token(account_id: &str, token: &str) -> AppResult<()> {
    entry(account_id)?.set_password(token).map_err(keyring_err)
}

/// Fetch the token for an account, if one is stored.
pub fn get_token(account_id: &str) -> AppResult<Option<String>> {
    match entry(account_id)?.get_password() {
        Ok(pw) => Ok(Some(pw)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(keyring_err(e)),
    }
}

/// Remove the stored token for an account (no-op if absent).
pub fn delete_token(account_id: &str) -> AppResult<()> {
    match entry(account_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(keyring_err(e)),
    }
}
