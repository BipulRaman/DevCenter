//! App Center — local application management, ported from AppNest
//! (https://github.com/BipulRaman/AppNest). Supports four serve modes:
//! Command, Static Folder, Script File and API Mock.

pub mod runner;
pub mod serve;

use serde::{Deserialize, Serialize};

/// A local application configuration (persisted in SQLite).
///
/// `commands` are build/run lines executed in order. For `serveMode = "command"`
/// the **last** line is the long-running run command and the earlier lines are
/// build steps; for the other modes every line is a build step.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppDef {
    #[serde(default)]
    pub id: i64,
    pub name: String,
    /// Preset key: "dotnet" | "node" | "react" | … | "static" | "apimock".
    #[serde(default)]
    pub app_type: String,
    /// "command" | "static" | "script" | "apimock".
    pub serve_mode: String,
    pub project_dir: String,
    #[serde(default)]
    pub commands: Vec<String>,
    /// Build-output directory served in "static" mode (e.g. "./dist").
    #[serde(default)]
    pub static_dir: Option<String>,
    /// Script path for "script" mode (.ps1/.bat/.sh/.cmd).
    #[serde(default)]
    pub script_file: Option<String>,
    /// Swagger 2.0 / OpenAPI 3.x JSON path for "apimock" mode.
    #[serde(default)]
    pub spec_file: Option<String>,
    /// Extra environment variables (KEY, VALUE) merged onto the OS environment.
    #[serde(default)]
    pub env: Vec<(String, String)>,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub autostart: bool,
    #[serde(default)]
    pub order: i64,
}

/// An application with its live runtime state, returned to the UI.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppView {
    #[serde(flatten)]
    pub def: AppDef,
    /// "stopped" | "building" | "running" | "error".
    pub status: String,
    pub pid: Option<u32>,
    /// Humanized uptime (e.g. "1h 23m"), empty when not running.
    pub uptime: String,
}

/// A single live log line emitted to the UI.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub id: i64,
    /// "build" | "run" | "system".
    pub stream: String,
    pub line: String,
    /// "info" | "error".
    pub level: String,
    pub ts: String,
}

/// Runtime status payload emitted on every lifecycle transition.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StatusEvent {
    pub id: i64,
    pub status: String,
    pub pid: Option<u32>,
    pub uptime: String,
}

/// A framework preset that pre-fills the New Application form.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub value: String,
    pub label: String,
    pub serve_mode: String,
    pub port: u16,
    /// Build/run lines, newline-joined.
    pub commands: String,
    /// "KEY=VALUE" lines.
    pub env: String,
    pub static_dir: String,
}

fn preset(
    value: &str,
    label: &str,
    serve_mode: &str,
    port: u16,
    commands: &str,
    env: &str,
    static_dir: &str,
) -> Preset {
    Preset {
        value: value.into(),
        label: label.into(),
        serve_mode: serve_mode.into(),
        port,
        commands: commands.into(),
        env: env.into(),
        static_dir: static_dir.into(),
    }
}

/// Framework presets (dev defaults), adapted from AppNest's presets.json.
pub fn presets() -> Vec<Preset> {
    vec![
        preset(".net", ".NET", "command", 5000, "dotnet run", "ASPNETCORE_ENVIRONMENT=Development", ""),
        preset("node", "Node.js", "command", 3000, "npm install\nnpm run dev", "NODE_ENV=development", ""),
        preset("react", "React", "command", 5173, "npm install\nnpm run dev", "NODE_ENV=development", ""),
        preset("nextjs", "Next.js", "command", 3000, "npm install\nnpm run dev", "NODE_ENV=development", ""),
        preset("angular", "Angular", "command", 4200, "npm install\nnpm start", "NODE_ENV=development", ""),
        preset("vue", "Vue", "command", 5173, "npm install\nnpm run dev", "NODE_ENV=development", ""),
        preset("express", "Express", "command", 3000, "npm install\nnpm run dev", "NODE_ENV=development", ""),
        preset("static", "Static Folder", "static", 8080, "npm install\nnpm run build", "", "./dist"),
        preset("apimock", "API Mock", "apimock", 4010, "", "", ""),
    ]
}
