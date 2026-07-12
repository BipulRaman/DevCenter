$ErrorActionPreference = "Stop"
$root = "d:/GitHub/DevCenter"
$json = Get-Content "$root/app/ui/icons/vs-seti-icon-theme.json" -Raw | ConvertFrom-Json

# Build id -> [codepointHex, color]. Remap near-white colors to a mid gray so
# icons stay visible on BOTH the light and dark canvases.
function Normalize-Color([string]$c) {
  if (-not $c) { return "#8a94a6" }
  $h = $c.TrimStart('#')
  if ($h.Length -ge 6) {
    $r = [Convert]::ToInt32($h.Substring(0,2),16)
    $g = [Convert]::ToInt32($h.Substring(2,2),16)
    $b = [Convert]::ToInt32($h.Substring(4,2),16)
    # very light / low-contrast on a light canvas -> neutral mid gray
    if ($r -gt 196 -and $g -gt 196 -and $b -gt 196) { return "#8a94a6" }
  }
  return $c.ToLower()
}

$defs = [ordered]@{}
foreach ($p in $json.iconDefinitions.PSObject.Properties) {
  $fc = [string]$p.Value.fontCharacter
  $hex = $fc.TrimStart('\').ToLower()
  $color = Normalize-Color([string]$p.Value.fontColor)
  $defs[$p.Name] = @($hex, $color)
}

$exts = [ordered]@{}
foreach ($p in $json.fileExtensions.PSObject.Properties) { $exts[$p.Name.ToLower()] = [string]$p.Value }
$names = [ordered]@{}
foreach ($p in $json.fileNames.PSObject.Properties) { $names[$p.Name.ToLower()] = [string]$p.Value }
$langs = [ordered]@{}
foreach ($p in $json.languageIds.PSObject.Properties) { $langs[$p.Name.ToLower()] = [string]$p.Value }

function J($o) { $o | ConvertTo-Json -Compress -Depth 5 }

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("// AUTO-GENERATED from VS Code's official Seti icon theme (extensions/theme-seti).")
[void]$sb.AppendLine("// Source: microsoft/vscode  vs-seti-icon-theme.json + seti.woff. Do not edit by hand.")
[void]$sb.AppendLine("window.SetiIcons = (function () {")
[void]$sb.AppendLine("  const D = " + (J $defs) + ";")
[void]$sb.AppendLine("  const E = " + (J $exts) + ";")
[void]$sb.AppendLine("  const N = " + (J $names) + ";")
[void]$sb.AppendLine("  const L = " + (J $langs) + ";")
[void]$sb.AppendLine("  const DEF = " + (J ([string]$json.file)) + ";")
[void]$sb.AppendLine(@'
  // VS Code associates most common file types by *language id*, not by file
  // extension, so the Seti theme's fileExtensions map is sparse (no js/ts/rs/
  // css/...). This mirrors VS Code's built-in extension -> languageId
  // contributions so we can fall back to the languageIds (L) map and match the
  // everyday file types correctly.
  const X2L = {
    js:"javascript", mjs:"javascript", cjs:"javascript", es6:"javascript",
    jsx:"javascriptreact", ts:"typescript", mts:"typescript", cts:"typescript",
    tsx:"typescriptreact", json:"json", jsonc:"json", json5:"json",
    css:"css", scss:"scss", sass:"sass", less:"less",
    html:"html", htm:"html", xhtml:"html", vue:"vue",
    md:"markdown", markdown:"markdown", mdown:"markdown", mkd:"markdown",
    xml:"xml", xsd:"xml", xsl:"xml", xslt:"xml", plist:"xml", svg:"xml",
    yml:"yaml", yaml:"yaml", toml:"toml",
    py:"python", pyw:"python", pyi:"python",
    rs:"rust", go:"go", java:"java",
    c:"c", h:"c", cpp:"cpp", cc:"cpp", cxx:"cpp", hpp:"cpp", hh:"cpp", hxx:"cpp",
    cs:"csharp", csx:"csharp", fs:"fsharp", fsi:"fsharp", fsx:"fsharp",
    rb:"ruby", gemspec:"ruby", php:"php", phtml:"php",
    swift:"swift", kt:"kotlin", kts:"kotlin",
    sh:"shellscript", bash:"shellscript", zsh:"shellscript", ksh:"shellscript",
    ps1:"powershell", psm1:"powershell", psd1:"powershell",
    sql:"sql", lua:"lua", dart:"dart", r:"r", pl:"perl", pm:"perl",
    m:"objective-c", mm:"objective-cpp",
    groovy:"groovy", clj:"clojure", cljs:"clojure", cljc:"clojure",
    coffee:"coffeescript", scala:"scala", sc:"scala",
    tex:"latex", hs:"haskell", erl:"erlang", hrl:"erlang", jl:"julia",
    bat:"bat", cmd:"bat", ex:"elixir", exs:"elixir", elm:"elm",
    graphql:"graphql", gql:"graphql", ini:"ini"
  };
  function defFor(id) { return D[id] || D[DEF]; }
  function idForFile(name) {
    const lower = (name || "").toLowerCase();
    if (N[lower]) return N[lower];
    const parts = lower.split(".");
    // Longest trailing extension first (".d.ts", ".test.js", "vite.config.ts").
    for (let i = 1; i < parts.length; i++) {
      const ext = parts.slice(i).join(".");
      if (E[ext]) return E[ext];
      const lang = X2L[ext];
      if (lang && L[lang]) return L[lang];
    }
    return DEF;
  }
  function forFile(name) {
    const d = defFor(idForFile(name));
    return { char: String.fromCodePoint(parseInt(d[0], 16)), color: d[1] };
  }
  return { forFile, idForFile, D, E, N, L, X2L, DEF };
})();
'@)
Set-Content -Path "$root/app/ui/js/seti-icons.js" -Value $sb.ToString() -Encoding UTF8
"Generated seti-icons.js  (defs=$($defs.Count) exts=$($exts.Count) names=$($names.Count))"
