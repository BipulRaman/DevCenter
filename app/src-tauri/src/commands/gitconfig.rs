use crate::error::{AppError, AppResult};
use crate::gitconfig::{self, GitIdentityConfig};

/// Read the user's Git identity configuration (default identity + conditional
/// identities driven by `includeIf`).
#[tauri::command]
pub async fn read_git_identity() -> AppResult<GitIdentityConfig> {
    tauri::async_runtime::spawn_blocking(gitconfig::read)
        .await
        .map_err(|e| AppError::msg(e.to_string()))?
}

/// Persist the identity configuration, regenerating DevCenter's managed
/// sections of `~/.gitconfig` and each profile's include file. Returns the
/// freshly re-read configuration.
#[tauri::command]
pub async fn save_git_identity(config: GitIdentityConfig) -> AppResult<GitIdentityConfig> {
    tauri::async_runtime::spawn_blocking(move || gitconfig::write(&config))
        .await
        .map_err(|e| AppError::msg(e.to_string()))?
}
