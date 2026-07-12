use rusqlite::Connection;

use crate::apps::AppDef;
use crate::error::AppResult;
use crate::models::Account;

/// Open (creating if needed) the SQLite database at `path` and ensure the
/// schema exists. Persists the repo registry (which paths are known/watched)
/// and provider accounts (GitHub / Azure DevOps). Tokens are NOT stored here —
/// they live in the OS keychain. All live Git state is computed on demand.
pub fn open(path: &std::path::Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    // Wait (rather than immediately erroring with SQLITE_BUSY) if another
    // connection briefly holds a write lock — e.g. a second app instance, or the
    // dev hot-reload relaunch overlapping the exiting process. Without this the
    // schema init below can fail and leave AppState unmanaged.
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         CREATE TABLE IF NOT EXISTS repos (
             path       TEXT PRIMARY KEY,
             watched    INTEGER NOT NULL DEFAULT 0,
             added_at   TEXT NOT NULL DEFAULT (datetime('now'))
         );
         CREATE TABLE IF NOT EXISTS accounts (
             id           TEXT PRIMARY KEY,
             provider     TEXT NOT NULL,
             label        TEXT NOT NULL,
             host         TEXT NOT NULL,
             organization TEXT,
             username     TEXT,
             auth_kind    TEXT NOT NULL DEFAULT 'token',
             status       TEXT NOT NULL DEFAULT 'unverified',
             added_at     TEXT NOT NULL DEFAULT (datetime('now'))
         );
         CREATE TABLE IF NOT EXISTS repo_tags (
             path TEXT NOT NULL,
             tag  TEXT NOT NULL,
             PRIMARY KEY (path, tag)
         );
         CREATE TABLE IF NOT EXISTS apps (
             id          INTEGER PRIMARY KEY AUTOINCREMENT,
             name        TEXT NOT NULL,
             app_type    TEXT NOT NULL DEFAULT '',
             serve_mode  TEXT NOT NULL DEFAULT 'command',
             project_dir TEXT NOT NULL DEFAULT '',
             commands    TEXT NOT NULL DEFAULT '[]',
             static_dir  TEXT,
             script_file TEXT,
             spec_file   TEXT,
             env         TEXT NOT NULL DEFAULT '[]',
             port        INTEGER,
             autostart   INTEGER NOT NULL DEFAULT 0,
             ord         INTEGER NOT NULL DEFAULT 0
         );",
    )?;
    Ok(conn)
}

/// Register a repository path if it isn't already known. No-op if present.
pub fn ensure_repo(conn: &Connection, path: &str) -> AppResult<()> {
    conn.execute(
        "INSERT OR IGNORE INTO repos (path, watched) VALUES (?1, 0)",
        [path],
    )?;
    Ok(())
}

/// Return all registered repo paths together with their `watched` flag.
pub fn list_paths(conn: &Connection) -> AppResult<Vec<(String, bool)>> {
    let mut stmt = conn.prepare("SELECT path, watched FROM repos ORDER BY path")?;
    let rows = stmt.query_map([], |row| {
        let path: String = row.get(0)?;
        let watched: i64 = row.get(1)?;
        Ok((path, watched != 0))
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

/// Set the watched flag for a repo path.
pub fn set_watched(conn: &Connection, path: &str, watched: bool) -> AppResult<()> {
    conn.execute(
        "UPDATE repos SET watched = ?2 WHERE path = ?1",
        rusqlite::params![path, watched as i64],
    )?;
    Ok(())
}

/// Unregister a repo from DevCenter (does not touch the files on disk). Also
/// removes its tags.
pub fn remove_repo(conn: &Connection, path: &str) -> AppResult<()> {
    conn.execute("DELETE FROM repo_tags WHERE path = ?1", [path])?;
    conn.execute("DELETE FROM repos WHERE path = ?1", [path])?;
    Ok(())
}

/// Whether the repo registry is empty (used to trigger a first-run scan).
pub fn is_empty(conn: &Connection) -> AppResult<bool> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM repos", [], |r| r.get(0))?;
    Ok(count == 0)
}

// ---------- Repo tags ----------

/// Tags for a single repo path, sorted.
pub fn tags_for(conn: &Connection, path: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare("SELECT tag FROM repo_tags WHERE path = ?1 ORDER BY tag")?;
    let rows = stmt.query_map([path], |r| r.get::<_, String>(0))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

/// Map of path -> tags for all repos (used when building the full list).
pub fn tags_by_path(conn: &Connection) -> AppResult<std::collections::HashMap<String, Vec<String>>> {
    let mut stmt = conn.prepare("SELECT path, tag FROM repo_tags ORDER BY path, tag")?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    })?;
    let mut map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    for r in rows {
        let (path, tag) = r?;
        map.entry(path).or_default().push(tag);
    }
    Ok(map)
}

/// Replace the full set of tags for a repo path.
pub fn set_tags(conn: &mut Connection, path: &str, tags: &[String]) -> AppResult<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM repo_tags WHERE path = ?1", [path])?;
    {
        let mut stmt =
            tx.prepare("INSERT OR IGNORE INTO repo_tags (path, tag) VALUES (?1, ?2)")?;
        for tag in tags {
            let t = tag.trim();
            if !t.is_empty() {
                stmt.execute(rusqlite::params![path, t])?;
            }
        }
    }
    tx.commit()?;
    Ok(())
}

/// All distinct tags in use, sorted (for filter options).
pub fn all_tags(conn: &Connection) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare("SELECT DISTINCT tag FROM repo_tags ORDER BY tag")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

// ---------- Accounts ----------

fn row_to_account(row: &rusqlite::Row) -> rusqlite::Result<Account> {
    Ok(Account {
        id: row.get(0)?,
        provider: row.get(1)?,
        label: row.get(2)?,
        host: row.get(3)?,
        organization: row.get(4)?,
        username: row.get(5)?,
        auth_kind: row.get(6)?,
        status: row.get(7)?,
    })
}

const ACCOUNT_COLS: &str = "id, provider, label, host, organization, username, auth_kind, status";

/// Return all configured accounts, ordered by provider then label.
pub fn list_accounts(conn: &Connection) -> AppResult<Vec<Account>> {
    let sql = format!("SELECT {ACCOUNT_COLS} FROM accounts ORDER BY provider, label");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], row_to_account)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

/// Look up one account by id.
pub fn get_account(conn: &Connection, id: &str) -> AppResult<Option<Account>> {
    let sql = format!("SELECT {ACCOUNT_COLS} FROM accounts WHERE id = ?1");
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query_map([id], row_to_account)?;
    match rows.next() {
        Some(r) => Ok(Some(r?)),
        None => Ok(None),
    }
}

/// Insert or update an account (upsert by id).
pub fn upsert_account(conn: &Connection, a: &Account) -> AppResult<()> {
    conn.execute(
        "INSERT INTO accounts (id, provider, label, host, organization, username, auth_kind, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
            provider=excluded.provider, label=excluded.label, host=excluded.host,
            organization=excluded.organization, username=excluded.username,
            auth_kind=excluded.auth_kind, status=excluded.status",
        rusqlite::params![
            a.id, a.provider, a.label, a.host, a.organization, a.username, a.auth_kind, a.status
        ],
    )?;
    Ok(())
}

/// Update only the resolved username and status for an account.
pub fn update_account_status(
    conn: &Connection,
    id: &str,
    username: Option<&str>,
    status: &str,
) -> AppResult<()> {
    conn.execute(
        "UPDATE accounts SET username = ?2, status = ?3 WHERE id = ?1",
        rusqlite::params![id, username, status],
    )?;
    Ok(())
}

/// Remove an account.
pub fn delete_account(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM accounts WHERE id = ?1", [id])?;
    Ok(())
}

// ---------- Apps (App Center) ----------

fn row_to_app(row: &rusqlite::Row) -> rusqlite::Result<AppDef> {
    let commands: String = row.get(5)?;
    let env: String = row.get(9)?;
    Ok(AppDef {
        id: row.get(0)?,
        name: row.get(1)?,
        app_type: row.get(2)?,
        serve_mode: row.get(3)?,
        project_dir: row.get(4)?,
        commands: serde_json::from_str(&commands).unwrap_or_default(),
        static_dir: row.get(6)?,
        script_file: row.get(7)?,
        spec_file: row.get(8)?,
        env: serde_json::from_str(&env).unwrap_or_default(),
        port: row.get::<_, Option<i64>>(10)?.map(|p| p as u16),
        autostart: row.get::<_, i64>(11)? != 0,
        order: row.get(12)?,
    })
}

const APP_COLS: &str =
    "id, name, app_type, serve_mode, project_dir, commands, static_dir, script_file, spec_file, env, port, autostart, ord";

/// List all apps ordered by display order then id.
pub fn list_apps(conn: &Connection) -> AppResult<Vec<AppDef>> {
    let sql = format!("SELECT {APP_COLS} FROM apps ORDER BY ord, id");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], row_to_app)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

/// Fetch one app by id.
pub fn get_app(conn: &Connection, id: i64) -> AppResult<Option<AppDef>> {
    let sql = format!("SELECT {APP_COLS} FROM apps WHERE id = ?1");
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query_map([id], row_to_app)?;
    match rows.next() {
        Some(r) => Ok(Some(r?)),
        None => Ok(None),
    }
}

/// Insert a new app, returning its assigned id.
pub fn insert_app(conn: &Connection, a: &AppDef) -> AppResult<i64> {
    let next_order: i64 =
        conn.query_row("SELECT COALESCE(MAX(ord), 0) + 1 FROM apps", [], |r| r.get(0))?;
    conn.execute(
        "INSERT INTO apps (name, app_type, serve_mode, project_dir, commands, static_dir, script_file, spec_file, env, port, autostart, ord)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        rusqlite::params![
            a.name,
            a.app_type,
            a.serve_mode,
            a.project_dir,
            serde_json::to_string(&a.commands).unwrap_or_else(|_| "[]".into()),
            a.static_dir,
            a.script_file,
            a.spec_file,
            serde_json::to_string(&a.env).unwrap_or_else(|_| "[]".into()),
            a.port.map(|p| p as i64),
            a.autostart as i64,
            next_order,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Update an existing app's configuration.
pub fn update_app(conn: &Connection, a: &AppDef) -> AppResult<()> {
    conn.execute(
        "UPDATE apps SET name=?2, app_type=?3, serve_mode=?4, project_dir=?5, commands=?6,
            static_dir=?7, script_file=?8, spec_file=?9, env=?10, port=?11, autostart=?12 WHERE id=?1",
        rusqlite::params![
            a.id,
            a.name,
            a.app_type,
            a.serve_mode,
            a.project_dir,
            serde_json::to_string(&a.commands).unwrap_or_else(|_| "[]".into()),
            a.static_dir,
            a.script_file,
            a.spec_file,
            serde_json::to_string(&a.env).unwrap_or_else(|_| "[]".into()),
            a.port.map(|p| p as i64),
            a.autostart as i64,
        ],
    )?;
    Ok(())
}

/// Delete an app.
pub fn delete_app(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM apps WHERE id = ?1", [id])?;
    Ok(())
}

/// Persist a new display order for the given app ids.
pub fn reorder_apps(conn: &mut Connection, ids: &[i64]) -> AppResult<()> {
    let tx = conn.transaction()?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE apps SET ord = ?2 WHERE id = ?1",
            rusqlite::params![id, i as i64],
        )?;
    }
    tx.commit()?;
    Ok(())
}
