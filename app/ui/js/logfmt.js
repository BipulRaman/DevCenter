// Formats raw process-log lines into safe, colorful HTML for the App Center log
// viewer. It:
//   • parses ANSI SGR color codes (16-color, xterm-256 and truecolor) and strips
//     other escape/control sequences,
//   • linkifies http(s) URLs into clickable anchors (opened externally), and
//   • applies light semantic highlighting (log levels, numbers, strings, GUIDs,
//     IPs) to lines the producer didn't already colour.
// Everything is HTML-escaped; only a whitelisted set of <span>/<a> wrappers and
// self-generated colour values are emitted, so log-injected markup is inert.
(function () {
  "use strict";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Curated, high-contrast ANSI 16-colour palette (readable on the dark log bg).
  const BASIC = {
    30: "#6b7280", 31: "#e06c75", 32: "#98c379", 33: "#e5c07b",
    34: "#61afef", 35: "#c678dd", 36: "#56b6c2", 37: "#d6dbe6",
    90: "#8b93a7", 91: "#ff8787", 92: "#b5e890", 93: "#fde047",
    94: "#93c5fd", 95: "#d8b4fe", 96: "#7fe3ef", 97: "#ffffff",
  };

  function clampHex(r, g, b) {
    const h = (x) => Math.max(0, Math.min(255, x | 0)).toString(16).padStart(2, "0");
    return "#" + h(r) + h(g) + h(b);
  }

  // xterm-256 index → #rrggbb (for 38;5;n / 48;5;n extended colours).
  function xterm256(n) {
    n = n | 0;
    if (n < 16) return BASIC[n < 8 ? 30 + n : 82 + n] || "#d6dbe6";
    if (n >= 232) { const v = 8 + (n - 232) * 10; return clampHex(v, v, v); }
    n -= 16;
    const r = Math.floor(n / 36), g = Math.floor((n % 36) / 6), b = n % 6;
    const lvl = (x) => (x ? x * 40 + 55 : 0);
    return clampHex(lvl(r), lvl(g), lvl(b));
  }

  function newStyle() { return { fg: null, bold: false, dim: false, italic: false, underline: false }; }

  function applySgr(style, paramStr) {
    const codes = (paramStr === "" ? "0" : paramStr).split(";").map((x) => parseInt(x || "0", 10));
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) Object.assign(style, newStyle());
      else if (c === 1) style.bold = true;
      else if (c === 2) style.dim = true;
      else if (c === 3) style.italic = true;
      else if (c === 4) style.underline = true;
      else if (c === 22) { style.bold = false; style.dim = false; }
      else if (c === 23) style.italic = false;
      else if (c === 24) style.underline = false;
      else if (c === 39) style.fg = null;
      else if ((c >= 30 && c <= 37) || (c >= 90 && c <= 97)) style.fg = BASIC[c];
      else if (c === 38) {
        if (codes[i + 1] === 5) { style.fg = xterm256(codes[i + 2]); i += 2; }
        else if (codes[i + 1] === 2) { style.fg = clampHex(codes[i + 2], codes[i + 3], codes[i + 4]); i += 4; }
      }
      // Background codes (40-47/100-107/48) are ignored for legibility.
    }
  }

  // Split a raw line into styled runs, stripping non-colour escape/control bytes.
  function parseAnsi(raw) {
    raw = raw.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, ""); // OSC (titles/hyperlinks)
    const runs = [];
    const style = newStyle();
    // SGR (group 1) is applied; any other CSI / 2-char escape / stray control
    // char is matched and dropped.
    const re = /\x1b\[([0-9;]*)m|\x1b\[[0-9;?]*[A-Za-z]|\x1b[@-Z\\-_]|[\x00-\x08\x0b-\x1f\x7f]/g;
    let m, last = 0;
    while ((m = re.exec(raw))) {
      if (m.index > last) runs.push({ text: raw.slice(last, m.index), style: Object.assign({}, style) });
      if (m[1] !== undefined) applySgr(style, m[1]);
      last = re.lastIndex;
    }
    if (last < raw.length) runs.push({ text: raw.slice(last), style: Object.assign({}, style) });
    return runs.length ? runs : [{ text: "", style: newStyle() }];
  }

  function hasAnsi(raw) { return raw.indexOf("\x1b[") !== -1; }

  function levelClass(word) {
    const w = word.toLowerCase();
    if (["error", "err", "fail", "failed", "fatal", "ftl", "crit", "critical", "exception"].includes(w)) return "error";
    if (["warn", "warning", "wrn"].includes(w)) return "warn";
    if (["debug", "dbg"].includes(w)) return "debug";
    if (["trace", "trc", "vrb", "verbose"].includes(w)) return "trace";
    return "info";
  }

  function link(url) {
    // Don't swallow trailing punctuation that's really sentence punctuation.
    let trail = "";
    const mt = url.match(/[)\]}.,;:!?'"]+$/);
    if (mt) { trail = mt[0]; url = url.slice(0, url.length - trail.length); }
    const safe = esc(url);
    return `<a class="lg-link" data-url="${safe}" title="${safe}">${safe}</a>` + esc(trail);
  }

  const LEVELS =
    "TRACE|TRC|VRB|VERBOSE|DEBUG|DBG|INFORMATION|INFO|INF|WARNING|WARN|WRN|ERROR|ERR|FAILED|FAIL|FATAL|FTL|CRITICAL|CRIT|EXCEPTION";
  const NUMS =
    "\\b\\d{1,3}(?:\\.\\d{1,3}){3}(?::\\d+)?\\b|\\b0x[0-9a-fA-F]+\\b|\\b[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}\\b|\\b\\d+(?:\\.\\d+)?\\b";

  // Escape `text`, always linkifying URLs and (when `semantic`) colouring log
  // levels, quoted strings and numbers/GUIDs/IPs.
  function tokenize(text, semantic) {
    const parts = ["(https?:\\/\\/[^\\s'\"<>)\\]]+)"];
    if (semantic) {
      parts.push("(\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*')");
      parts.push("\\b(" + LEVELS + ")\\b");
      parts.push("(" + NUMS + ")");
    }
    const re = new RegExp(parts.join("|"), "gi");
    let out = "", last = 0, m;
    while ((m = re.exec(text))) {
      out += esc(text.slice(last, m.index));
      if (m[1]) out += link(m[1]);
      else if (semantic && m[2]) out += '<span class="lg-str">' + esc(m[0]) + "</span>";
      else if (semantic && m[3]) out += '<span class="lg-lvl lg-' + levelClass(m[3]) + '">' + esc(m[0]) + "</span>";
      else if (semantic && m[4]) out += '<span class="lg-num">' + esc(m[0]) + "</span>";
      else out += esc(m[0]);
      last = m.index + m[0].length;
      if (m[0].length === 0) re.lastIndex++;
    }
    out += esc(text.slice(last));
    return out;
  }

  function renderRun(run, semantic) {
    const colored = !!run.style.fg;
    const inner = tokenize(run.text, semantic && !colored);
    const cls = [];
    if (run.style.bold) cls.push("lg-b");
    if (run.style.dim) cls.push("lg-dim");
    if (run.style.italic) cls.push("lg-i");
    if (run.style.underline) cls.push("lg-u");
    const styleAttr = colored ? ' style="color:' + run.style.fg + '"' : "";
    if (!cls.length && !styleAttr) return inner;
    return '<span class="' + cls.join(" ") + '"' + styleAttr + ">" + inner + "</span>";
  }

  // Raw log line → safe, syntax-coloured HTML (no trailing newline).
  function format(raw) {
    raw = String(raw == null ? "" : raw);
    const semantic = !hasAnsi(raw);
    return parseAnsi(raw).map((r) => renderRun(r, semantic)).join("");
  }

  // Classify a line by its structured level prefix (".NET `info:`", Serilog
  // `[INF]`, …) → info|warn|error|debug|trace, or null when none is present.
  function detectLevel(raw) {
    const m = String(raw).match(
      new RegExp("(?:^|\\s|\\[)(" + LEVELS + ")\\b\\s*[:\\]]", "i"));
    return m ? levelClass(m[1]) : null;
  }

  window.LogFmt = { format: format, detectLevel: detectLevel };
})();
