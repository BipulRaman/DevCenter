# DevCenter — run in hot-reload development mode.
#   • Rust changes        -> auto recompile + relaunch the app
#   • HTML/CSS/JS changes  -> auto reload the WebView
# Usage:  ./scripts/dev.ps1
$ErrorActionPreference = "Stop"
$appDir = Join-Path $PSScriptRoot "..\app"
Push-Location $appDir
try {
    cargo tauri dev
}
finally {
    Pop-Location
}
