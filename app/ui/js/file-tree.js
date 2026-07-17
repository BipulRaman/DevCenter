// ============ Shared file tree / list renderer ============
// Generic file-tree/list renderer shared by the Changes page (staged/unstaged/
// history/PR file lists) and the PR Review page, so every file explorer in the
// app looks and behaves identically (collapsible folders, VS Code-style single-
// child compaction, tree/list toggle). Extracted from changes.js so both pages
// share one home for the explorer.
// Classic script (shares the global lexical scope). Loaded BEFORE changes.js
// and pr-reviewer.js in index.html.
// Depends on globals: escapeHtml + on() (helpers.js), window.SetiIcons
// (seti-icons.js, checked at call time so load order is irrelevant for it).

const FOLDER_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>';
const TREE_CARET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
// Source-control row/group action icons (stage +, unstage −, discard ↩).
const ACT_STAGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const ACT_UNSTAGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const ACT_DISCARD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path d="M3.00098 2.5C3.00098 2.22386 3.22483 2 3.50098 2C3.77712 2 4.00098 2.22386 4.00098 2.5V6.34262L7.17202 3.17157C8.73412 1.60948 11.2668 1.60948 12.8289 3.17157C14.391 4.73367 14.391 7.26633 12.8289 8.82843L7.80375 13.8536C7.60849 14.0488 7.2919 14.0488 7.09664 13.8536C6.90138 13.6583 6.90138 13.3417 7.09664 13.1464L12.1218 8.12132C13.2933 6.94975 13.2933 5.05025 12.1218 3.87868C10.9502 2.70711 9.0507 2.70711 7.87913 3.87868L4.75781 7H8.50098C8.77712 7 9.00098 7.22386 9.00098 7.5C9.00098 7.77614 8.77712 8 8.50098 8H3.60098C3.26961 8 3.00098 7.73137 3.00098 7.4V2.5Z"/></svg>';

const statBadge = (s) =>
  ({ new: "A", untracked: "U", modified: "M", deleted: "D", renamed: "R", conflicted: "C", typechange: "T" }[s] || "M");

// ---- VS Code–style file-type icons (inline SVG, no sprite/asset needed) ----
// A compact "mini icon theme": one line-glyph per category + a per-extension
// colour, so common file types read at a glance like VS Code's explorer.
const FILE_GLYPHS = {
  // document with < > brackets — source code
  code: '<path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M15 3v4h4"/><polyline points="10.5 12.5 8.5 14.5 10.5 16.5"/><polyline points="13.5 12.5 15.5 14.5 13.5 16.5"/>',
  // document with </> — markup
  markup: '<path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M15 3v4h4"/><polyline points="10 13 8.5 14.5 10 16"/><line x1="12.5" y1="12.5" x2="11.5" y2="16.5"/><polyline points="14 13 15.5 14.5 14 16"/>',
  // document with { } — data/config
  data: '<path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M15 3v4h4"/><path d="M11 12.5c-1 0-1 1-1 1.5s0 1-1 1c1 0 1 .5 1 1.5s0 1.5 1 1.5"/><path d="M14 12.5c1 0 1 1 1 1.5s0 1 1 1c-1 0-1 .5-1 1.5s0 1.5-1 1.5"/>',
  // document with # — stylesheet
  style: '<path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M15 3v4h4"/><line x1="10" y1="12.5" x2="9" y2="17"/><line x1="14" y1="12.5" x2="13" y2="17"/><line x1="8.5" y1="14" x2="15" y2="14"/><line x1="8" y1="15.8" x2="14.5" y2="15.8"/>',
  // document with text lines — prose/docs
  doc: '<path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M15 3v4h4"/><line x1="8.5" y1="12.5" x2="15" y2="12.5"/><line x1="8.5" y1="15" x2="15" y2="15"/><line x1="8.5" y1="17.5" x2="12.5" y2="17.5"/>',
  // picture — images
  image: '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9.5" r="1.4"/><path d="m5 17 4-4 3.5 3.5L15 14l4 4"/>',
  // box — archives
  archive: '<path d="M4 7 12 3l8 4v10l-8 4-8-4V7Z"/><path d="M4 7l8 4 8-4"/><line x1="12" y1="11" x2="12" y2="21"/>',
  // plain document — fallback
  file: '<path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M15 3v4h4"/>',
};
// extension -> [category, colour]
const FILE_ICONS = (() => {
  const m = {};
  const add = (exts, cat, color) => exts.split(" ").forEach((e) => (m[e] = [cat, color]));
  add("js mjs cjs jsx", "code", "#f1dd35");
  add("ts tsx", "code", "#3178c6");
  add("rs", "code", "#ffa657");
  add("py pyw", "code", "#ffd43b");
  add("go", "code", "#00add8");
  add("java class", "code", "#f89820");
  add("c h", "code", "#659ad2");
  add("cpp cxx cc hpp hxx", "code", "#659ad2");
  add("cs", "code", "#a074c4");
  add("rb", "code", "#cc342d");
  add("php", "code", "#777bb4");
  add("swift", "code", "#f05138");
  add("kt kts", "code", "#a97bff");
  add("sh bash zsh", "code", "#4eaa25");
  add("ps1 psm1 psd1", "code", "#2b7cd3");
  add("sql", "code", "#e38c00");
  add("dart", "code", "#00b4ab");
  add("lua", "code", "#3d6cd3");
  add("html htm xhtml", "markup", "#e34c26");
  add("xml xaml", "markup", "#f16529");
  add("vue", "markup", "#41b883");
  add("svelte", "markup", "#ff3e00");
  add("css", "style", "#2965f1");
  add("scss sass less styl", "style", "#cd6799");
  add("json jsonc json5", "data", "#f1dd35");
  add("yml yaml", "data", "#cb4b16");
  add("toml", "data", "#9c6b4f");
  add("ini cfg conf env properties", "data", "#9aa0aa");
  add("lock", "data", "#8a8f98");
  add("md markdown mdx", "doc", "#519aba");
  add("txt log rst", "doc", "#9aa0aa");
  add("pdf", "doc", "#e5534b");
  add("csv tsv", "doc", "#4caf50");
  add("png jpg jpeg gif webp bmp ico avif", "image", "#26a269");
  add("svg", "image", "#ffb13b");
  add("zip tar gz tgz 7z rar xz bz2", "archive", "#f0a500");
  return m;
})();
function fileIcon(name) {
  // Preferred: the official VS Code Seti icon font (window.SetiIcons), loaded
  // from js/seti-icons.js. Falls back to the inline SVG mini-set when the font
  // mapping isn't present (e.g. the browser design-mode build).
  if (window.SetiIcons) {
    const { char, color } = window.SetiIcons.forFile(name);
    return `<span class="tree-ico seti-ico" style="color:${color}">${char}</span>`;
  }
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const [cat, color] = FILE_ICONS[ext] || ["file", "#8a94a6"];
  const glyph = FILE_GLYPHS[cat] || FILE_GLYPHS.file;
  return `<span class="tree-ico file-ico" style="color:${color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg></span>`;
}

function buildTree(list) {
  const root = { name: "", path: "", dirs: new Map(), files: [] };
  for (const f of list) {
    const parts = f.path.split("/");
    const fname = parts.pop();
    let node = root, prefix = "";
    for (const part of parts) {
      prefix = prefix ? prefix + "/" + part : part;
      let child = node.dirs.get(part);
      if (!child) { child = { name: part, path: prefix, dirs: new Map(), files: [] }; node.dirs.set(part, child); }
      node = child;
    }
    node.files.push({ ...f, name: fname });
  }
  return root;
}
function collectFiles(node) {
  let out = node.files.slice();
  for (const d of node.dirs.values()) out = out.concat(collectFiles(d));
  return out;
}
function allDirPaths(list) {
  const s = new Set();
  for (const f of list) {
    const parts = f.path.split("/"); parts.pop();
    let p = "";
    for (const part of parts) { p = p ? p + "/" + part : part; s.add(p); }
  }
  return s;
}

/**
 * Render a file tree/list into `container`.
 * opts: { files, collapsed, viewMode, rerender, group, onAction, onFolderAction,
 *         activeFile, activeGroup, onSelect, fileBadge }
 *   group: "staged" | "unstaged" | null (null = history/PR/commit, no hover actions)
 *   onSelect(path, group): called when a file row is clicked
 *   fileBadge(path): optional extra HTML shown before the change-stat badge
 *     (e.g. the PR Review page's comment-thread count)
 * Returns the ordered list of visible { path, group } entries (for keyboard nav).
 */
function renderFileTree(container, opts) {
  const order = [];
  const rows = [];
  const group = opts.group || null;
  const withActions = group !== null;
  const esc = escapeHtml;

  // Hover action buttons for a file/folder row, scoped to the group.
  const actionsHtml = (scope, key) => {
    if (!withActions) return "";
    const attr = scope === "folder" ? "data-act-folder" : "data-act-file";
    const btn = (act, title, icon) =>
      `<button class="scm-act" type="button" data-act="${act}" ${attr}="${esc(key)}" title="${title}">${icon}</button>`;
    let inner = "";
    if (group === "unstaged") inner = btn("discard", "Discard changes", ACT_DISCARD) + btn("stage", "Stage changes", ACT_STAGE);
    else if (group === "staged") inner = btn("unstage", "Unstage changes", ACT_UNSTAGE);
    return `<span class="scm-actions">${inner}</span>`;
  };
  const badgeHtml = (path) => (opts.fileBadge ? opts.fileBadge(path) : "");

  const fileRow = (f, depth) => {
    const on = opts.activeFile === f.path && (opts.activeGroup || null) === group;
    order.push({ path: f.path, group });
    return `<div class="tree-row tree-file${on ? " selected" : ""}" data-file="${esc(f.path)}" data-group="${group || ""}" style="--d:${depth}" title="${esc(f.path)}">
      <span class="tree-twisty" style="visibility:hidden">${TREE_CARET}</span>
      ${fileIcon(f.name)}
      <span class="tree-name">${esc(f.name)}</span>
      ${actionsHtml("file", f.path)}
      ${badgeHtml(f.path)}
      <span class="change-stat ${f.status}" title="${f.status}">${statBadge(f.status)}</span>
    </div>`;
  };

  const walk = (node, depth) => {
    const dirs = [...node.dirs.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    for (const dir of dirs) {
      // Compact single-child folder chains (a/b/c) like VS Code.
      let label = dir.name, eff = dir;
      while (eff.files.length === 0 && eff.dirs.size === 1) {
        const only = [...eff.dirs.values()][0];
        label += "/" + only.name; eff = only;
      }
      const isCollapsed = opts.collapsed.has(eff.path);
      const desc = collectFiles(eff);
      rows.push(`<div class="tree-row tree-folder" data-folder-row="${esc(eff.path)}" style="--d:${depth}">
        <span class="tree-twisty ${isCollapsed ? "collapsed" : ""}" data-twisty="${esc(eff.path)}">${TREE_CARET}</span>
        <span class="tree-ico">${FOLDER_ICO}</span>
        <span class="tree-name" title="${esc(eff.path)}">${esc(label)}</span>
        ${actionsHtml("folder", eff.path)}
        <span class="tree-count">${desc.length}</span>
      </div>`);
      if (!isCollapsed) walk(eff, depth + 1);
    }
    const fs = node.files.slice().sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    for (const f of fs) rows.push(fileRow(f, depth));
  };

  if (opts.viewMode === "list") {
    opts.files.slice()
      .sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()))
      .forEach((f) => {
        const i = f.path.lastIndexOf("/");
        const dir = i < 0 ? "" : f.path.slice(0, i + 1);
        const name = i < 0 ? f.path : f.path.slice(i + 1);
        const on = opts.activeFile === f.path && (opts.activeGroup || null) === group;
        order.push({ path: f.path, group });
        rows.push(`<div class="tree-row tree-file${on ? " selected" : ""}" data-file="${esc(f.path)}" data-group="${group || ""}" title="${esc(f.path)}" style="--d:0">
          ${fileIcon(name)}
          <span class="tree-name"><span class="change-dir">${esc(dir)}</span>${esc(name)}</span>
          ${actionsHtml("file", f.path)}
          ${badgeHtml(f.path)}
          <span class="change-stat ${f.status}" title="${f.status}">${statBadge(f.status)}</span>
        </div>`);
      });
  } else {
    walk(buildTree(opts.files), 0);
  }

  container.innerHTML = rows.join("") || `<div class="changes-empty">No files.</div>`;

  // Listeners (direct, re-attached each render — reliable in WebView2).
  on(container, "[data-twisty], .tree-folder", "click", (el, e) => {
    const key = el.dataset.twisty || el.dataset.folderRow;
    if (!key) return;
    if (e.target.closest(".scm-act")) return;
    e.stopPropagation();
    if (opts.collapsed.has(key)) opts.collapsed.delete(key); else opts.collapsed.add(key);
    opts.rerender();
  });
  if (withActions) {
    on(container, ".scm-act", "click", (b, e) => {
      e.stopPropagation();
      const act = b.dataset.act;
      if (b.dataset.actFile != null) opts.onAction(act, b.dataset.actFile);
      else if (b.dataset.actFolder != null) opts.onFolderAction(act, b.dataset.actFolder);
    });
  }
  on(container, ".tree-file", "click", (row, e) => {
    if (e.target.closest(".scm-act")) return;
    opts.onSelect(row.dataset.file, row.dataset.group || null);
  });

  return order;
}
