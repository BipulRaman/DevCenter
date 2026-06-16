use std::sync::{Arc, Mutex};

use rusqlite::Connection;

use crate::apps::runner::AppRunner;

/// Shared application state, registered once via `.manage()` and accessed in
/// commands through `tauri::State<'_, AppState>`.
///
/// The DB handle is wrapped in `Arc<Mutex<…>>` so it can be cheaply cloned into
/// `spawn_blocking` closures, keeping SQLite work off the async runtime thread.
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub runner: Arc<AppRunner>,
}

impl AppState {
    pub fn new(conn: Connection) -> Self {
        AppState {
            db: Arc::new(Mutex::new(conn)),
            runner: Arc::new(AppRunner::new()),
        }
    }
}
