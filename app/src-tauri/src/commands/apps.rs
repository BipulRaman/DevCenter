use tauri::{AppHandle, State};

use crate::apps::{AppDef, AppView, LogLine, Preset};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::{apps, store};

/// Merge an app's stored config with its live runtime status.
fn view_of(state: &AppState, def: AppDef) -> AppView {
    let (status, pid, uptime) = state.runner.status_of(def.id);
    AppView { def, status, pid, uptime }
}

/// The framework presets used by the New Application form.
#[tauri::command]
pub fn list_presets() -> Vec<Preset> {
    apps::presets()
}

/// List all configured apps with live status.
#[tauri::command]
pub async fn list_apps(state: State<'_, AppState>) -> AppResult<Vec<AppView>> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<Vec<AppView>> {
        let defs = {
            let conn = st.db.lock().unwrap();
            store::list_apps(&conn)?
        };
        Ok(defs.into_iter().map(|d| view_of(&st, d)).collect())
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Create a new app and return it.
#[tauri::command]
pub async fn create_app(app: AppDef, state: State<'_, AppState>) -> AppResult<AppView> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<AppView> {
        let id = {
            let conn = st.db.lock().unwrap();
            store::insert_app(&conn, &app)?
        };
        let def = {
            let conn = st.db.lock().unwrap();
            store::get_app(&conn, id)?.ok_or_else(|| AppError::msg("App not found after insert"))?
        };
        Ok(view_of(&st, def))
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Update an existing app's configuration and return it.
#[tauri::command]
pub async fn update_app(app: AppDef, state: State<'_, AppState>) -> AppResult<AppView> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<AppView> {
        {
            let conn = st.db.lock().unwrap();
            store::update_app(&conn, &app)?;
        }
        let def = {
            let conn = st.db.lock().unwrap();
            store::get_app(&conn, app.id)?.ok_or_else(|| AppError::msg("App not found"))?
        };
        Ok(view_of(&st, def))
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Update just an app's tags (from the tag editor) and return the refreshed view.
#[tauri::command]
pub async fn set_app_tags(id: i64, tags: Vec<String>, state: State<'_, AppState>) -> AppResult<AppView> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<AppView> {
        {
            let conn = st.db.lock().unwrap();
            store::set_app_tags(&conn, id, &tags)?;
        }
        let def = {
            let conn = st.db.lock().unwrap();
            store::get_app(&conn, id)?.ok_or_else(|| AppError::msg("App not found"))?
        };
        Ok(view_of(&st, def))
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Stop (if running) and delete an app.
#[tauri::command]
pub async fn delete_app(id: i64, state: State<'_, AppState>, app: AppHandle) -> AppResult<()> {
    let _ = state.runner.stop(&app, id);
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<()> {
        let conn = st.db.lock().unwrap();
        store::delete_app(&conn, id)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

/// Persist a new display order.
#[tauri::command]
pub async fn reorder_apps(ids: Vec<i64>, state: State<'_, AppState>) -> AppResult<()> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<()> {
        let mut conn = st.db.lock().unwrap();
        store::reorder_apps(&mut conn, &ids)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))?
}

fn def_for(state: &AppState, id: i64) -> AppResult<AppDef> {
    let conn = state.db.lock().unwrap();
    store::get_app(&conn, id)?.ok_or_else(|| AppError::msg("App not found"))
}

/// Start an app (runs build steps then launches its serve mode).
#[tauri::command]
pub async fn start_app(id: i64, state: State<'_, AppState>, app: AppHandle) -> AppResult<()> {
    let def = def_for(state.inner(), id)?;
    state.runner.start(&app, def).map_err(AppError::msg)
}

/// Stop a running app.
#[tauri::command]
pub async fn stop_app(id: i64, state: State<'_, AppState>, app: AppHandle) -> AppResult<()> {
    state.runner.stop(&app, id).map_err(AppError::msg)
}

/// Restart an app: stop, then start again.
#[tauri::command]
pub async fn restart_app(id: i64, state: State<'_, AppState>, app: AppHandle) -> AppResult<()> {
    let _ = state.runner.stop(&app, id);
    // Brief delay so ports/handles are released before relaunch.
    tokio::time::sleep(std::time::Duration::from_millis(400)).await;
    let def = def_for(state.inner(), id)?;
    state.runner.start(&app, def).map_err(AppError::msg)
}

/// Start every stopped app.
#[tauri::command]
pub async fn start_all_apps(state: State<'_, AppState>, app: AppHandle) -> AppResult<()> {
    let st = state.inner().clone();
    let defs = tauri::async_runtime::spawn_blocking(move || -> AppResult<Vec<AppDef>> {
        let conn = st.db.lock().unwrap();
        store::list_apps(&conn)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))??;
    for def in defs {
        if !state.runner.is_active(def.id) {
            let _ = state.runner.start(&app, def);
        }
    }
    Ok(())
}

/// Stop every running app.
#[tauri::command]
pub async fn stop_all_apps(state: State<'_, AppState>, app: AppHandle) -> AppResult<()> {
    state.runner.stop_all(&app);
    Ok(())
}

/// Buffered log snapshot for an app (for the log viewer's initial load).
#[tauri::command]
pub async fn app_logs(id: i64, state: State<'_, AppState>) -> AppResult<Vec<LogLine>> {
    Ok(state.runner.logs(id))
}
