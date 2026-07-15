// ============ CHANGES / COMMIT PAGE (GitHub Desktop / VS Code–style) ============
// Efficient handling of many files: collapsible file TREE (with single-child
// folder compaction, VS Code style) or flat LIST; tri-state folder checkboxes;
// keyboard navigation; and a 3-pane History view (commits | commit files | diff)
// so multi-file commits are fully navigable.
// Generic file-tree/list renderer shared by the Changes page (staged/unstaged/
// history/PR file lists) and the PR Review page, so every file explorer in the
// app looks and behaves identically (collapsible folders, VS Code-style single-
// child compaction, tree/list toggle).
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

const ChangesPage = (() => {
  let repoId = null;        // selected repo path (== id)
  let branch = "main";
  let tab = "changes";      // "changes" | "history" | "pulls"
  let changesView = "list"; // left panel (Changes): "tree" | "list" — default flat list
  let detailView = "tree";  // middle panel (History detail): "tree" | "list" — default tree

  // Changes tab state — git staging model (like VS Code's Source Control view).
  let staged = [];          // index changes [{path, oldPath, status}]
  let unstaged = [];        // working-tree changes [{path, oldPath, status}]
  let stashes = [];         // saved stashes [{index, message, branch, when}]
  let collapsedChanges = new Set(); // collapsed folders in the "Changes" group
  let collapsedStaged = new Set();  // collapsed folders in the "Staged Changes" group
  let collapsedGroups = new Set();  // collapsed top-level groups: "staged" / "unstaged"

  // History tab state.
  let history = [];
  let activeSha = null;     // selected commit hash (null = working tree)
  let commitFiles = [];     // files in the selected commit
  let collapsedDetail = new Set();

  // Pull Requests tab state.
  let repoPulls = [];       // PRs for the selected repo [{id, title, branch, base, status, ...}]
  let pullsLoaded = false;  // whether the PR list has been fetched for the current repo
  let activePull = null;    // currently selected PR (drives the detail + diff panes)
  let prFetch = null;       // in-flight `git fetch` so PR branches are available locally for diffs
  const repoPullsCache = new Map(); // repoId -> last-known PR[] (instant re-open, refreshed in bg)

  // Diff/navigation state.
  let activeFile = null;
  let activeGroup = null;   // "staged" | "unstaged" | null (history/commit)
  let navOrder = [];        // visible {path, group} in render order (prev/next + keys)
  let busy = false;
  let accountFilter = new Set(); // selected remote accounts; empty = all
  let accountFilterSig = "";

  // Bumped on every navigation away from the current context (repo switch,
  // tab switch). Async loads (loadChanges/loadHistory/loadRepoPulls/
  // selectCommit/selectFile/selectPull/…) capture this value before their
  // first await and re-check it after — if it changed, a newer navigation
  // has already superseded them, so their (now-stale) result is discarded
  // instead of overwriting whatever the user has since navigated to. This is
  // what prevents an old file/commit/PR/repo load from "winning" the race and
  // flashing stale data into the detail/diff panes.
  let loadGen = 0;
  // Separate generation for the PR *list* fetch, so the optimistic selectPull
  // (which bumps loadGen for its own diff race) can't abort loadRepoPulls'
  // background refresh of the list.
  let pullsGen = 0;

  const $ = (id) => document.getElementById(id);
  const esc = escapeHtml;

  const CHEV_UP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
  const CHEV_DOWN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  // Restore-from-stash: an up-arrow lifting out of a tray.
  const ACT_RESTORE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/><polyline points="8 8 12 4 16 8"/><line x1="12" y1="4" x2="12" y2="15"/></svg>';
  // Pull-request review state → chip styling.
  const REVIEW_MAP = {
    approved: { cls: "ok", icon: ICON.check, label: "Approved" },
    changes: { cls: "danger", icon: ICON.changes, label: "Changes requested" },
    pending: { cls: "muted", icon: ICON.clock, label: "Review pending" },
  };
  const prStateLabel = (s) => (s === "merged" ? "Merged" : s === "draft" ? "Draft" : "Open");
  function openPrUrl(url) {
    if (!url) return;
    if (DC && DC.hasBackend) DC.openUrl(url).catch((e) => console.error("openUrl failed", e));
    else window.open(url, "_blank");
  }

  // ---- repo picker ----
  function matchesAccountFilter(r) {
    if (accountFilter.size === 0) return true;
    const account = r && repoAccount(r);
    return !!account && accountFilter.has(account.key);
  }

  function clearSelectedRepo() {
    if (!repoId) return;
    loadGen++;
    repoId = null;
    branch = "";
    try { localStorage.removeItem("dc.changes.repoId"); } catch (e) {}

    $("chgRepoLabel").textContent = "Select repository";
    $("chgRepoLabel").removeAttribute("title");
    $("chgRepoIcon").innerHTML = providerIcon(null);
    $("chgBranchLabel").textContent = "—";

    activeSha = null; activeFile = null; activeGroup = null; activePull = null; navOrder = [];
    staged = []; unstaged = []; stashes = []; history = []; commitFiles = [];
    collapsedChanges = new Set(); collapsedStaged = new Set(); collapsedGroups = new Set(); collapsedDetail = new Set();
    repoPulls = []; pullsLoaded = false; prFetch = null;
    syncAhead = 0; syncBehind = 0; syncHasUpstream = false;
    renderSync({ ahead: 0, behind: 0, hasUpstream: false });

    $("changeCount").textContent = "No changes";
    $("changesList").innerHTML = `<div class="changes-empty">Select a repository to view changes.</div>`;
    $("historyList").innerHTML = `<div class="changes-empty">Select a repository to view commits.</div>`;
    $("repoPrList").innerHTML = `<div class="changes-empty">Select a repository to view pull requests.</div>`;
    $("detailHead").innerHTML = "";
    $("detailFileCount").textContent = "Files";
    $("detailFiles").innerHTML = `<div class="detail-empty">Select a repository to continue.</div>`;
    $("detailCollapseBtn").hidden = true;
    $("commitSummary").value = "";
    $("commitDesc").value = "";
    $("conflictBanner").hidden = true;
    showDiffEmpty("Select a repository to continue.");

    ["chgBranchBtn", "gitMenuBtn", "changeRefreshBtn", "historyRefreshBtn", "pullRefreshBtn"].forEach((id) => {
      const control = $(id);
      if (control) control.disabled = true;
    });
    updateCommitBtn();
  }

  function reconcileSelectedRepo() {
    if (!repoId || accountFilter.size === 0) return;
    const selected = repos.find((r) => r.id === repoId);
    if (!matchesAccountFilter(selected)) clearSelectedRepo();
  }

  function renderAccountFilter() {
    const select = $("chgAccountSelect");
    const menu = $("chgAccountMenu");
    const label = $("chgAccountLabel");
    if (!select || !menu || !label) return;

    const map = new Map();
    repos.forEach((r) => {
      const account = repoAccount(r);
      if (!account) return;
      const entry = map.get(account.key) || { label: account.label, provider: account.provider, count: 0 };
      entry.count++;
      map.set(account.key, entry);
    });
    if (!map.size) {
      select.hidden = true;
      accountFilter.clear();
      accountFilterSig = "";
      return;
    }

    select.hidden = false;
    accountFilter = new Set([...accountFilter].filter((key) => map.has(key)));
    const keys = [...map.keys()].sort((a, b) => map.get(a).label.localeCompare(map.get(b).label));
    const signature = keys.map((key) => {
      const entry = map.get(key);
      return `${key}:${entry.label}:${entry.provider}:${entry.count}`;
    }).join("|") + "#" + [...accountFilter].sort().join(",");
    if (signature === accountFilterSig) return;
    accountFilterSig = signature;

    const providerIco = (provider) => provider === "github" ? ICON.github : provider === "azure" ? ICON.azure : ICON.repo;
    menu.innerHTML = `
      <label class="multiselect-opt all">
        <input type="checkbox" id="chgAccountAll" ${accountFilter.size === 0 ? "checked" : ""} />
        <span>All accounts</span>
      </label>
      <div class="multiselect-sep"></div>` + keys.map((key) => {
        const entry = map.get(key);
        return `<label class="multiselect-opt">
          <input type="checkbox" value="${esc(key)}" ${accountFilter.has(key) ? "checked" : ""} />
          <span class="multiselect-ico">${providerIco(entry.provider)}</span>
          <span>${esc(entry.label)}</span>
          <span class="multiselect-count">${entry.count}</span>
        </label>`;
      }).join("");

    if (accountFilter.size === 0) label.textContent = "All accounts";
    else if (accountFilter.size === 1) label.textContent = map.get([...accountFilter][0])?.label || "1 account";
    else label.textContent = `${accountFilter.size} accounts`;

    const iconHost = $("chgAccountIcon");
    if (iconHost) {
      const defaultIcon = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 10h18"/></svg>';
      iconHost.innerHTML = accountFilter.size === 1
        ? providerIco(map.get([...accountFilter][0])?.provider)
        : defaultIcon;
    }

    $("chgAccountAll").addEventListener("change", () => {
      accountFilter.clear();
      reconcileSelectedRepo();
      renderAccountFilter();
      $("chgAccountAll")?.focus();
    });
    on(menu, 'input[type="checkbox"][value]', "change", (box) => {
      const value = box.value;
      if (box.checked) accountFilter.add(box.value);
      else accountFilter.delete(box.value);
      reconcileSelectedRepo();
      renderAccountFilter();
      menu.querySelector(`input[value="${CSS.escape(value)}"]`)?.focus();
    });
  }

  function openRepoPicker() {
    if (!repos.length) {
      Modal.alert({ title: "No repositories", message: "Add or clone a repository on the Git Board first." });
      return;
    }
    renderAccountFilter();
    const pickerRepos = repos.filter(matchesAccountFilter);
    const labels = [];
    const map = new Map();
    pickerRepos.forEach((r) => {
      let label = r.name, n = 2;
      while (map.has(label)) label = `${r.name} (${n++})`;
      map.set(label, r); labels.push(label);
    });
    Dropdown.open($("chgRepoBtn"), {
      header: "Select repository",
      options: labels,
      current: [...map.entries()].find(([, r]) => r.id === repoId)?.[0],
      search: labels.length > 7,
      searchPlaceholder: "Filter repositories…",
      emptyText: "No repositories.",
      minWidth: Math.max(320, $("chgRepoBtn").offsetWidth),
      optionIcon: (label) => {
        const r = map.get(label);
        return r ? providerIcon(r.provider) : "";
      },
      onSelect: (label) => { const r = map.get(label); if (r) selectRepo(r); },
    });
  }

  function selectRepo(r) {
    loadGen++; // cancel any in-flight load for the previously selected repo
    repoId = r.id;
    branch = r.branch || "main";
    try { localStorage.setItem("dc.changes.repoId", r.id); } catch (e) {}
    const repoLabel = $("chgRepoLabel");
    repoLabel.textContent = r.name;
    repoLabel.title = r.name;
    const repoIco = $("chgRepoIcon");
    if (repoIco) repoIco.innerHTML = providerIcon(r.provider);
    $("chgBranchLabel").textContent = branch;
    ["chgBranchBtn", "gitMenuBtn", "changeRefreshBtn", "historyRefreshBtn", "pullRefreshBtn"].forEach((id) => {
      const control = $(id);
      if (control) control.disabled = false;
    });
    // Fully reset every piece of state carried over from the previous repo —
    // otherwise a leftover value (stashes, sync counts, collapse state, …)
    // can flash/act stale until the new repo's data finishes loading.
    activeSha = null; activeFile = null; activeGroup = null; activePull = null; navOrder = [];
    staged = []; unstaged = []; stashes = []; history = []; commitFiles = [];
    collapsedChanges = new Set(); collapsedStaged = new Set(); collapsedGroups = new Set(); collapsedDetail = new Set();
    repoPulls = []; pullsLoaded = false; prFetch = null;
    syncAhead = 0; syncBehind = 0; syncHasUpstream = false;
    renderSync({ ahead: 0, behind: 0, hasUpstream: false });
    // Clear all three list panes immediately, regardless of which tab is
    // active, so switching tabs mid-load can never reveal the old repo's data.
    $("changesList").innerHTML = `<div class="changes-empty">Loading…</div>`;
    $("historyList").innerHTML = `<div class="changes-empty">Loading…</div>`;
    $("repoPrList").innerHTML = `<div class="changes-empty">Loading…</div>`;
    showDiffEmpty("Select a file to view its diff.");
    if (tab === "history") loadHistory();
    else if (tab === "pulls") loadRepoPulls();
    else loadChanges();
  }

  async function openBranchPicker() {
    if (!repoId || !DC || !DC.hasBackend || busy) return;
    const btn = $("chgBranchBtn");
    const r = repos.find((x) => x.id === repoId);
    if (!btn || !r) return;

    if (Dropdown.isOpenFor(btn)) { Dropdown.close(); return; }

    let branches;
    btn.disabled = true;
    try {
      branches = await DC.listBranches(repoId);
    } catch (e) {
      console.error("listBranches failed", e);
      await Modal.alert({ title: "Couldn't load branches", message: String(e) });
      return;
    } finally {
      btn.disabled = false;
    }

    // If the selected branch no longer exists (e.g. it was deleted), fall back
    // to the repo's default branch so the page never points at a missing branch.
    if (branch && branches.length && !branches.includes(branch)) {
      const fallback = defaultBranchFrom(branches);
      if (fallback && fallback !== branch) {
        try {
          const updated = await DC.checkoutBranch(repoId, fallback, false);
          const at = repos.findIndex((x) => x.id === updated.id);
          if (at >= 0) repos[at] = updated;
          branch = updated.branch || fallback;
          $("chgBranchLabel").textContent = branch;
          if (tab === "history") loadHistory(); else loadChanges();
        } catch (e) {
          console.error("auto-switch to default branch failed", e);
        }
      }
    }

    Dropdown.open(btn, {
      header: "Switch branch",
      headerAction: {
        label: "New branch",
        icon: ICON.plus,
        title: "Create a new branch",
        onClick: () =>
          openNewBranchDialog({
            branches,
            current: branch,
            onCreate: async (name, base) => {
              try {
                const updated = await DC.createBranch(repoId, name, base);
                const at = repos.findIndex((x) => x.id === updated.id);
                if (at >= 0) repos[at] = updated;
                branch = updated.branch || name;
                $("chgBranchLabel").textContent = branch;
                if (tab === "history") loadHistory(); else loadChanges();
              } catch (e) {
                console.error("createBranch failed", e);
                await Modal.alert({ title: "Couldn't create branch", message: String(e) });
              }
            },
          }),
      },
      options: branches,
      current: branch,
      search: true,
      searchPlaceholder: "Filter branches…",
      optionKind: "branch",
      optionIcon: () => ICON.branch,
      emptyText: "No local branches.",
      minWidth: Math.max(300, btn.offsetWidth),
      onContext: (opt, isCur, ev) =>
        openBranchContextMenu(ev, {
          repoId,
          branch: opt,
          isCurrent: isCur,
          branches,
          onChanged: (updated) => {
            if (updated) {
              const at = repos.findIndex((x) => x.id === updated.id);
              if (at >= 0) repos[at] = updated;
              branch = updated.branch || branch;
              $("chgBranchLabel").textContent = branch;
            }
            Dropdown.close();
            if (tab === "history") loadHistory(); else loadChanges();
          },
        }),
      onSelect: async (target) => {
        try {
          const rd = repos.find((x) => x.id === repoId);
          const dirty = (rd && rd.status === "dirty") || staged.length > 0 || unstaged.length > 0;
          const updated = await performBranchSwitch({ repoId, current: branch, target, dirty });
          if (!updated) return; // cancelled
          const at = repos.findIndex((x) => x.id === updated.id);
          if (at >= 0) repos[at] = updated;
          branch = updated.branch || target;
          $("chgBranchLabel").textContent = branch;
          if (tab === "history") loadHistory(); else loadChanges();
        } catch (e) {
          console.error("checkout failed", e);
          await Modal.alert({ title: "Switch failed", message: String(e) });
        }
      },
    });
  }

  function openRepoById(id) {
    const r = repos.find((x) => x.id === id);
    if (!r) return false;
    selectRepo(r);
    return true;
  }

  // Open a repo and jump straight to a specific tab ("changes" | "history" | "pulls").
  function openRepoTab(id, tabName) {
    if (!openRepoById(id)) return false;
    switchTab(tabName || "changes");
    return true;
  }

  // ---- changes tab ----
  async function loadChanges() {
    if (!repoId) return;
    loadGen++;
    const gen = loadGen;
    const forRepo = repoId;
    $("changesList").innerHTML = `<div class="changes-empty">Loading…</div>`;
    try {
      const cs = await DC.gitChanges(forRepo, null);
      if (gen !== loadGen || repoId !== forRepo) return; // superseded by a newer navigation
      branch = cs.branch || branch;
      $("chgBranchLabel").textContent = branch;
      collapsedChanges = new Set();
      collapsedStaged = new Set();
      activeFile = null; activeGroup = null;
      setChangeSet(cs);
    } catch (e) {
      if (gen !== loadGen || repoId !== forRepo) return;
      console.error("gitChanges failed", e);
      $("changesList").innerHTML = `<div class="changes-empty">${esc(String(e))}</div>`;
    }
  }

  // Re-fetch the working tree WITHOUT the "Loading…" flash or dropping the open
  // diff. Used by the focus auto-refresh so commits made outside DevCenter (e.g.
  // from VS Code) update the Push/Pull counts and file list in place.
  async function refreshChangesSilently() {
    if (!repoId) return;
    const gen = loadGen;
    const forRepo = repoId;
    try {
      const cs = await DC.gitChanges(forRepo, null);
      if (gen !== loadGen || repoId !== forRepo) return; // a real navigation/load has since taken over
      branch = cs.branch || branch;
      $("chgBranchLabel").textContent = branch;
      setChangeSet(cs);
      // If the file whose diff is open was committed/removed externally, clear it.
      if (activeFile && !staged.concat(unstaged).some((f) => f.path === activeFile)) {
        activeFile = null; activeGroup = null;
        showDiffEmpty("Select a file to view its diff.");
      }
    } catch (e) {
      console.error("gitChanges (focus refresh) failed", e);
    }
  }

  // Apply a fresh ChangeSet to the Changes tab (used by load/stage/commit/sync).
  function setChangeSet(cs) {
    staged = cs.staged || [];
    unstaged = cs.unstaged || [];
    stashes = cs.stashes || [];
    renderSync(cs);
    renderChanges();
  }

  // Show a banner linking to the conflict resolver while the repo has conflicts.
  function updateConflictBanner() {
    const banner = $("conflictBanner");
    if (!banner) return;
    const set = new Set();
    [...staged, ...unstaged].forEach((f) => { if (f.status === "conflicted") set.add(f.path); });
    const n = set.size;
    banner.hidden = n === 0;
    if (n) $("conflictBannerText").textContent = `${n} merge conflict${n === 1 ? "" : "s"}`;
  }

  function renderChanges() {
    // Keep the conflict banner in sync with the live change set on every render
    // (load, stage/unstage, discard, commit, filter) so it appears only while
    // real conflicts remain and hides the moment they're resolved.
    updateConflictBanner();
    const filter = ($("changeFilter").value || "").toLowerCase();
    const fStaged = filter ? staged.filter((f) => f.path.toLowerCase().includes(filter)) : staged;
    const fUnstaged = filter ? unstaged.filter((f) => f.path.toLowerCase().includes(filter)) : unstaged;
    const total = staged.length + unstaged.length;

    $("changeCount").textContent =
      total === 0 ? "No changes" : `${total} change${total === 1 ? "" : "s"}`;

    const list = $("changesList");
    if (total === 0 && !stashes.length) {
      list.innerHTML = `<div class="changes-empty">No uncommitted changes.</div>`;
      navOrder = []; updateCommitBtn(); return;
    }

    list.innerHTML = "";
    navOrder = [];

    const makeGroup = (groupKey, fileList, title, bulkActions) => {
      if (!fileList.length) return;
      const isCollapsed = collapsedGroups.has(groupKey);
      const section = document.createElement("div");
      section.className = "scm-group" + (isCollapsed ? " collapsed" : "");
      section.dataset.group = groupKey;
      const head = document.createElement("div");
      head.className = "scm-group-head";
      head.innerHTML =
        `<span class="tree-twisty${isCollapsed ? " collapsed" : ""}">${TREE_CARET}</span>` +
        `<span class="scm-group-title">${title}</span>` +
        `<span class="scm-group-actions">${bulkActions}</span>` +
        `<span class="scm-group-count">${fileList.length}</span>`;
      section.appendChild(head);
      list.appendChild(section);
      // Click the header (but not its action buttons) to expand/collapse the group.
      head.addEventListener("click", (e) => {
        if (e.target.closest(".scm-act")) return;
        if (collapsedGroups.has(groupKey)) collapsedGroups.delete(groupKey);
        else collapsedGroups.add(groupKey);
        renderChanges();
      });
      on(head, ".scm-act", "click", (b, e) => { e.stopPropagation(); bulkAction(b.dataset.act, groupKey); });
      if (isCollapsed) return; // body (and its files) hidden while collapsed
      const body = document.createElement("div");
      body.className = "scm-group-body";
      section.appendChild(body);
      const ord = renderFileTree(body, {
        files: fileList,
        collapsed: groupKey === "staged" ? collapsedStaged : collapsedChanges,
        viewMode: changesView,
        group: groupKey,
        activeFile,
        activeGroup,
        onSelect: selectFile,
        rerender: renderChanges,
        onAction: (act, path) => fileAction(act, path, groupKey),
        onFolderAction: (act, dirPath) => folderAction(act, dirPath, groupKey),
      });
      navOrder = navOrder.concat(ord);
    };

    const stageGroupActions =
      `<button class="scm-act" type="button" data-act="discard" title="Discard all changes">${ACT_DISCARD}</button>` +
      `<button class="scm-act" type="button" data-act="stage" title="Stage all changes">${ACT_STAGE}</button>`;
    const unstageGroupActions =
      `<button class="scm-act" type="button" data-act="unstage" title="Unstage all changes">${ACT_UNSTAGE}</button>`;

    makeGroup("staged", fStaged, "Staged Changes", unstageGroupActions);
    makeGroup("unstaged", fUnstaged, "Changes", stageGroupActions);
    renderStashGroup(list);

    // Nothing rendered (the filter hid every file and there are no stashes).
    if (!list.children.length) {
      list.innerHTML = `<div class="changes-empty">No files match the filter.</div>`;
    }

    updateCommitBtn();
  }

  // Render the collapsible "Stashes" group at the bottom of the changes list.
  function renderStashGroup(list) {
    if (!stashes.length) return;
    const groupKey = "stashes";
    const isCollapsed = collapsedGroups.has(groupKey);
    const section = document.createElement("div");
    section.className = "scm-group scm-stashes" + (isCollapsed ? " collapsed" : "");
    section.dataset.group = groupKey;
    const head = document.createElement("div");
    head.className = "scm-group-head";
    head.innerHTML =
      `<span class="tree-twisty${isCollapsed ? " collapsed" : ""}">${TREE_CARET}</span>` +
      `<span class="scm-group-title">Stashes</span>` +
      `<span class="scm-group-count">${stashes.length}</span>`;
    section.appendChild(head);
    list.appendChild(section);
    head.addEventListener("click", () => {
      if (collapsedGroups.has(groupKey)) collapsedGroups.delete(groupKey);
      else collapsedGroups.add(groupKey);
      renderChanges();
    });
    if (isCollapsed) return;
    const body = document.createElement("div");
    body.className = "scm-group-body";
    section.appendChild(body);
    stashes.forEach((st) => {
      const row = document.createElement("div");
      row.className = "stash-row";
      row.title = st.message;
      row.innerHTML =
        `<span class="stash-ico">${ICON.archive}</span>` +
        `<span class="stash-main">` +
          `<span class="stash-msg">${esc(st.message)}</span>` +
          `<span class="stash-meta">${st.branch ? esc(st.branch) + " · " : ""}${esc(st.when)}</span>` +
        `</span>` +
        `<span class="scm-actions">` +
          `<button class="scm-act" type="button" data-act="restore" title="Restore — apply &amp; remove">${ACT_RESTORE}</button>` +
          `<button class="scm-act" type="button" data-act="drop" title="Delete stash">${ICON.trash}</button>` +
        `</span>`;
      body.appendChild(row);
      row.querySelector('[data-act="restore"]').addEventListener("click", (e) => { e.stopPropagation(); stashRestore(st); });
      row.querySelector('[data-act="drop"]').addEventListener("click", (e) => { e.stopPropagation(); stashDrop(st); });
      row.addEventListener("contextmenu", (e) => { e.preventDefault(); openStashContextMenu(e, st); });
    });
  }

  // ---- stash actions ----
  function openStashDialog() {
    if (!repoId || (staged.length === 0 && unstaged.length === 0) || busy) return;
    Modal.custom({
      title: "Stash changes",
      render: (body, foot, close, mkBtn) => {
        body.innerHTML = `
          <p class="modal-msg">Saves your uncommitted changes to a stash and resets the working tree to a clean state. Restore them anytime from the Stashes list.</p>
          <div class="form-row">
            <label class="form-label" for="stashMsg">Message (optional)</label>
            <input class="modal-input" id="stashMsg" type="text" placeholder="Work in progress on ${esc(branch)}" spellcheck="false" autocomplete="off" />
          </div>
          <label class="form-check"><input type="checkbox" id="stashUntracked" checked /> <span>Include untracked files</span></label>`;
        const msgEl = body.querySelector("#stashMsg");
        const untrackedEl = body.querySelector("#stashUntracked");
        const submit = () => close({ message: msgEl.value.trim(), includeUntracked: untrackedEl.checked });
        msgEl.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
        const cancel = mkBtn("btn-ghost", "Cancel");
        cancel.addEventListener("click", () => close(null));
        const ok = mkBtn("btn-primary", "Stash changes");
        ok.addEventListener("click", submit);
        foot.append(cancel, ok);
        setTimeout(() => msgEl.focus(), 40);
      },
    }).then((res) => {
      if (res) runStaging(() => DC.gitStashPush(repoId, res.message, res.includeUntracked));
    });
  }

  function stashRestore(st) {
    runStaging(() => DC.gitStashPop(repoId, st.index));
  }

  function stashApply(st) {
    runStaging(() => DC.gitStashApply(repoId, st.index));
  }

  async function stashDrop(st) {
    const ok = await Modal.confirm({
      title: "Delete stash",
      message: `Delete this stash? The saved changes will be permanently lost.\n\n“${st.message}”`,
      confirmText: "Delete stash",
      danger: true,
    });
    if (ok) runStaging(() => DC.gitStashDrop(repoId, st.index));
  }

  function openStashContextMenu(e, st) {
    if (!DC || !DC.hasBackend) return;
    Dropdown.context(e.clientX, e.clientY, [
      { label: "Restore (apply & remove)", icon: ACT_RESTORE, onClick: () => stashRestore(st) },
      { label: "Apply (keep stash)", icon: ICON.copy, onClick: () => stashApply(st) },
      { separator: true },
      { label: "Delete stash", icon: ICON.trash, danger: true, onClick: () => stashDrop(st) },
    ]);
  }

  // ---- staging actions ----
  function setOf(groupKey) {
    return groupKey === "staged" ? staged : unstaged;
  }

  // Run a staging operation (returns a fresh ChangeSet), then re-render and keep
  // the open diff in sync.
  async function runStaging(fn) {
    if (busy || !repoId) return;
    busy = true; updateCommitBtn();
    try {
      const cs = await fn();
      staged = cs.staged || [];
      unstaged = cs.unstaged || [];
      stashes = cs.stashes || [];
      renderSync(cs);
      // If the open file no longer exists in its group, clear the diff; else
      // refresh it (its staged/unstaged content may have shifted).
      const stillThere = activeGroup && setOf(activeGroup).some((f) => f.path === activeFile);
      renderChanges();
      if (activeFile && activeGroup) {
        if (stillThere) selectFile(activeFile, activeGroup);
        else { activeFile = null; activeGroup = null; showDiffEmpty("Select a file to view its diff."); }
      }
    } catch (e) {
      console.error("staging op failed", e);
      await Modal.alert({ title: "Action failed", message: String(e) });
    } finally {
      busy = false; updateCommitBtn();
    }
  }

  function fileAction(act, path, groupKey) {
    if (act === "stage") runStaging(() => DC.gitStage(repoId, [path]));
    else if (act === "unstage") runStaging(() => DC.gitUnstage(repoId, [path]));
    else if (act === "discard") confirmDiscard([path], `Are you sure you want to discard changes in “${path}”? This cannot be undone.`);
  }

  function folderAction(act, dirPath, groupKey) {
    const paths = descFilesForPath(setOf(groupKey), dirPath);
    if (!paths.length) return;
    if (act === "stage") runStaging(() => DC.gitStage(repoId, paths));
    else if (act === "unstage") runStaging(() => DC.gitUnstage(repoId, paths));
    else if (act === "discard") confirmDiscard(paths, `Discard changes in ${paths.length} file${paths.length === 1 ? "" : "s"} under “${dirPath}”? This cannot be undone.`);
  }

  function bulkAction(act, groupKey) {
    if (act === "stage") runStaging(() => DC.gitStage(repoId, []));
    else if (act === "unstage") runStaging(() => DC.gitUnstage(repoId, []));
    else if (act === "discard") confirmDiscard([], `Are you sure you want to discard ALL ${unstaged.length} change${unstaged.length === 1 ? "" : "s"}? This cannot be undone.`);
  }

  async function confirmDiscard(paths, message) {
    const ok = await Modal.confirm({ title: "Discard changes", message, confirmText: "Discard changes", danger: true });
    if (ok) runStaging(() => DC.gitDiscard(repoId, paths));
  }

  function descFilesForPath(list, dirPath) {
    const pref = dirPath + "/";
    return list.filter((f) => f.path === dirPath || f.path.startsWith(pref)).map((f) => f.path);
  }

  // ---- git actions ("gear" menu: pull / push / fetch / sync / merge / branch / stash / commit) ----
  let syncAhead = 0, syncBehind = 0, syncHasUpstream = false;

  function renderSync(cs) {
    syncAhead = cs.ahead || 0;
    syncBehind = cs.behind || 0;
    syncHasUpstream = !!cs.hasUpstream;
    const total = syncAhead + syncBehind;
    const badge = $("gitMenuBadge");
    badge.hidden = total === 0;
    badge.textContent = total;
    $("gitMenuBtn").title = syncHasUpstream
      ? `${syncAhead} to push · ${syncBehind} to pull`
      : "Branch has no upstream yet — Publish to create one";
  }

  // Runs a pull/push/fetch/sync op with the gear button spinning; refreshes the
  // Changes tab with the resulting ChangeSet.
  async function doSync(kind) {
    if (busy || !repoId) return;
    const btn = $("gitMenuBtn");
    busy = true; btn.classList.add("busy");
    try {
      let cs;
      if (kind === "push") cs = await DC.gitPush(repoId);
      else if (kind === "pull") cs = await DC.gitPull(repoId, false);
      else if (kind === "sync") {
        // Combined pull-then-push: fetch to get current ahead/behind, pull
        // (fast-forward) if the remote is ahead, then push local commits
        // (or publish, if the branch has no upstream yet).
        await DC.fetchRepo(repoId);
        cs = await DC.gitChanges(repoId, null);
        if (cs.hasUpstream && cs.behind > 0) cs = await DC.gitPull(repoId, false);
        if (cs.ahead > 0 || !cs.hasUpstream) cs = await DC.gitPush(repoId);
      } else { await DC.fetchRepo(repoId); cs = await DC.gitChanges(repoId, null); }
      branch = cs.branch || branch;
      $("chgBranchLabel").textContent = branch;
      busy = false;
      setChangeSet(cs);
    } catch (e) {
      console.error(kind + " failed", e);
      await Modal.alert({ title: `${kind[0].toUpperCase() + kind.slice(1)} failed`, message: String(e) });
    } finally {
      busy = false; btn.classList.remove("busy");
      updateCommitBtn();
    }
  }

  // Generic wrapper for a one-shot git action that returns a ChangeSet: spins
  // the gear button, applies the result, and surfaces errors. Used by most
  // "gear" menu actions beyond doSync/doMerge (which have their own flow).
  async function runGitAction(label, fn) {
    if (busy || !repoId) return null;
    const btn = $("gitMenuBtn");
    busy = true; btn.classList.add("busy");
    try {
      const cs = await fn();
      branch = cs.branch || branch;
      $("chgBranchLabel").textContent = branch;
      busy = false;
      setChangeSet(cs);
      return cs;
    } catch (e) {
      console.error(label + " failed", e);
      await Modal.alert({ title: `${label} failed`, message: String(e) });
      return null;
    } finally {
      busy = false; btn.classList.remove("busy");
      updateCommitBtn();
    }
  }

  // After a merge-like op (merge/rebase/pull --rebase), open the conflict
  // resolver if it left conflicts in progress, else confirm success.
  async function afterMergeLike(cs, doneMessage) {
    if (!cs || !repoId) return;
    const info = await DC.gitConflicts(repoId).catch(() => null);
    if (info && info.kind !== "none") {
      if (window.ConflictResolver) window.ConflictResolver.open(repoId);
    } else if (doneMessage) {
      await Modal.alert({ title: "Done", message: doneMessage });
    }
  }

  async function pullRebaseFlow() {
    const cs = await runGitAction("Pull (rebase)", () => DC.gitPull(repoId, true));
    await afterMergeLike(cs, `Rebased “${branch}” on the latest from upstream.`);
  }

  async function pullFromFlow() {
    if (!repoId || busy) return;
    const res = await openFieldsDialog({
      title: "Pull from…",
      fields: [
        { label: "Remote", placeholder: "origin", value: "origin" },
        { label: "Branch", placeholder: "main" },
      ],
      confirmText: "Pull",
      validate: ([remote, br]) => (!remote || !br ? "Enter a remote and a branch." : null),
    });
    if (!res) return;
    const cs = await runGitAction("Pull from", () => DC.gitPullFrom(repoId, res[0], res[1]));
    await afterMergeLike(cs, `Pulled “${res[1]}” from “${res[0]}”.`);
  }

  async function pushToFlow() {
    if (!repoId || busy) return;
    const res = await openFieldsDialog({
      title: "Push to…",
      fields: [
        { label: "Remote", placeholder: "origin", value: "origin" },
        { label: "Branch", placeholder: branch, value: branch },
      ],
      confirmText: "Push",
      validate: ([remote, br]) => (!remote || !br ? "Enter a remote and a branch." : null),
    });
    if (!res) return;
    runGitAction("Push to", () => DC.gitPushTo(repoId, res[0], res[1]));
  }

  // ---- merge / rebase another branch into the current branch ----
  async function pickOtherBranch(purpose) {
    if (!repoId || !DC || !DC.hasBackend || busy) return null;
    let branches;
    try {
      branches = await DC.listBranches(repoId);
    } catch (e) {
      console.error("listBranches failed", e);
      await Modal.alert({ title: "Couldn't load branches", message: String(e) });
      return null;
    }
    const candidates = (branches || []).filter((b) => b !== branch);
    if (!candidates.length) {
      await Modal.alert({ title: "No other branches", message: `There are no other local branches to ${purpose}.` });
      return null;
    }
    return candidates;
  }

  async function openMergeDialog() {
    const candidates = await pickOtherBranch(`merge into “${branch}”`);
    if (!candidates) return;
    openMergeBranchDialog({ branches: candidates, current: branch, onMerge: (source) => doMerge(source) });
  }

  async function doMerge(source) {
    const cs = await runGitAction("Merge", () => DC.mergeBranch(repoId, source));
    await afterMergeLike(cs, `Merged “${source}” into “${branch}”.`);
  }

  async function rebaseBranchFlow() {
    const candidates = await pickOtherBranch(`rebase “${branch}” onto`);
    if (!candidates) return;
    const onto = await openPickDialog({
      title: "Rebase branch",
      message: `Rebase “${branch}” onto the selected branch. If both changed the same lines, you'll be asked to resolve conflicts.`,
      items: candidates,
      label: (b) => b,
      confirmText: "Rebase",
    });
    if (!onto) return;
    const cs = await runGitAction("Rebase", () => DC.rebaseBranch(repoId, onto));
    await afterMergeLike(cs, `Rebased “${branch}” onto “${onto}”.`);
  }

  // ---- new branch (standalone, from the git actions menu) ----
  async function newBranchFlow() {
    if (!repoId || !DC || !DC.hasBackend || busy) return;
    let branches;
    try {
      branches = await DC.listBranches(repoId);
    } catch (e) {
      console.error("listBranches failed", e);
      await Modal.alert({ title: "Couldn't load branches", message: String(e) });
      return;
    }
    openNewBranchDialog({
      branches,
      current: branch,
      onCreate: async (name, base) => {
        try {
          const updated = await DC.createBranch(repoId, name, base);
          const at = repos.findIndex((x) => x.id === updated.id);
          if (at >= 0) repos[at] = updated;
          branch = updated.branch || name;
          $("chgBranchLabel").textContent = branch;
          if (tab === "history") loadHistory(); else loadChanges();
        } catch (e) {
          console.error("createBranch failed", e);
          await Modal.alert({ title: "Couldn't create branch", message: String(e) });
        }
      },
    });
  }

  async function renameCurrentBranchFlow() {
    if (!repoId || busy) return;
    let branches;
    try {
      branches = await DC.listBranches(repoId);
    } catch (e) {
      console.error("listBranches failed", e);
      await Modal.alert({ title: "Couldn't load branches", message: String(e) });
      return;
    }
    openRenameBranchDialog({
      branch,
      existing: branches || [],
      onRename: async (newName) => {
        try {
          const updated = await DC.renameBranch(repoId, branch, newName);
          const at = repos.findIndex((x) => x.id === updated.id);
          if (at >= 0) repos[at] = updated;
          branch = updated.branch || newName;
          $("chgBranchLabel").textContent = branch;
        } catch (e) {
          console.error("renameBranch failed", e);
          await Modal.alert({ title: "Rename failed", message: String(e) });
        }
      },
    });
  }

  async function deleteBranchPickerFlow() {
    const candidates = await pickOtherBranch("delete");
    if (!candidates) return;
    const target = await openPickDialog({
      title: "Delete branch",
      items: candidates,
      label: (b) => b,
      confirmText: "Delete",
      danger: true,
    });
    if (!target) return;
    deleteBranchFlow({
      repoId,
      branch: target,
      onChanged: (updated) => {
        const at = repos.findIndex((x) => x.id === updated.id);
        if (at >= 0) repos[at] = updated;
        if (tab === "history") loadHistory(); else loadChanges();
      },
    });
  }

  async function deleteRemoteBranchFlow() {
    if (!repoId || busy) return;
    const name = await Modal.prompt({
      title: "Delete remote branch",
      label: "Branch name (on origin)",
      value: branch,
      confirmText: "Delete",
      validate: (v) => (v ? null : "Enter a branch name."),
    });
    if (!name) return;
    const ok = await Modal.confirm({
      title: "Delete remote branch",
      message: `Delete “${name}” from origin? This cannot be undone.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    runGitAction("Delete remote branch", () => DC.deleteRemoteBranch(repoId, name));
  }

  // ---- create pull request ----
  async function createPullRequestFlow() {
    if (!repoId || !DC || !DC.hasBackend || busy) return;
    const r = repos.find((x) => x.id === repoId);
    if (!r) return;
    if (r.provider !== "github" && r.provider !== "azure") {
      await Modal.alert({
        title: "Not supported",
        message: "Pull requests can be created for GitHub and Azure DevOps repositories only.",
      });
      return;
    }
    const head = branch;
    let branches = [];
    try { branches = (await DC.listBranches(repoId)) || []; } catch (e) { /* non-fatal */ }
    const bases = branches.filter((b) => b !== head);
    const defaultBase = defaultBranchFrom(bases) || defaultBranchFrom(branches) || "main";

    const created = await Modal.custom({
      title: "Create pull request",
      render: (body, foot, close, mkBtn) => {
        const baseList = bases.length ? bases : ["main", "master"];
        const baseOptions = baseList
          .map((b) => `<option value="${esc(b)}" ${b === defaultBase ? "selected" : ""}>${esc(b)}</option>`)
          .join("");
        body.innerHTML = `
          <div class="form-grid">
            <div class="form-row">
              <label class="form-label">From branch</label>
              <input class="modal-input" value="${esc(head)}" disabled />
            </div>
            <div class="form-row">
              <label class="form-label">Into branch</label>
              <select class="modal-input" id="prBase">${baseOptions}</select>
            </div>
          </div>
          <div class="form-row">
            <label class="form-label">Title</label>
            <input class="modal-input" id="prTitle" placeholder="Add a title" spellcheck="true" autocomplete="off" />
          </div>
          <div class="form-row">
            <label class="form-label">Description</label>
            <textarea class="modal-input" id="prBody" rows="4" placeholder="Describe your changes (optional)"></textarea>
          </div>
          <label class="form-check"><input type="checkbox" id="prDraft" /> Create as draft</label>
          <div class="form-hint">The compare branch must already be pushed to the remote.</div>
          <div class="modal-error" id="prErr"></div>`;
        const titleInput = body.querySelector("#prTitle");
        const err = body.querySelector("#prErr");
        const cancel = mkBtn("btn-ghost", "Cancel");
        cancel.addEventListener("click", () => close(null));
        const create = mkBtn("btn-primary", "Create pull request");
        create.addEventListener("click", async () => {
          const title = titleInput.value.trim();
          const base = body.querySelector("#prBase").value;
          const description = body.querySelector("#prBody").value;
          const draft = body.querySelector("#prDraft").checked;
          if (!title) { err.textContent = "Enter a title."; return; }
          if (!base) { err.textContent = "Choose a branch to merge into."; return; }
          if (base === head) { err.textContent = "The compare and base branches must differ."; return; }
          err.textContent = "";
          create.disabled = true;
          create.textContent = "Creating…";
          try {
            const pr = await DC.createPullRequest({ repoId, title, body: description, base, head, draft });
            close(pr);
          } catch (e) {
            err.textContent = String(e);
            create.disabled = false;
            create.textContent = "Create pull request";
          }
        });
        foot.append(cancel, create);
        setTimeout(() => titleInput.focus(), 40);
      },
    });

    if (!created) return;
    // Refresh PR views so the new PR is present, then open it straight into the
    // in-app PR review page.
    pullsLoaded = false;
    if (typeof hydratePulls === "function") { try { hydratePulls(); } catch (e) {} }
    if (window.PrReviewer) {
      window.PrReviewer.open(repoId, created, { returnTo: "changes" });
    } else if (created.url) {
      DC.openUrl(created.url).catch((e) => console.error("openUrl failed", e));
    }
  }

  // ---- remotes ----
  async function addRemoteFlow() {
    if (!repoId || busy) return;
    const res = await openFieldsDialog({
      title: "Add remote",
      fields: [
        { label: "Name", placeholder: "origin" },
        { label: "URL", placeholder: "https://github.com/owner/repo.git" },
      ],
      confirmText: "Add",
      validate: ([name, url]) => (!name || !url ? "Enter a remote name and URL." : null),
    });
    if (!res) return;
    runGitAction("Add remote", () => DC.gitAddRemote(repoId, res[0], res[1]));
  }

  async function removeRemoteFlow() {
    if (!repoId || busy) return;
    let remotes;
    try {
      remotes = await DC.gitListRemotes(repoId);
    } catch (e) {
      console.error("listRemotes failed", e);
      await Modal.alert({ title: "Couldn't load remotes", message: String(e) });
      return;
    }
    if (!remotes || !remotes.length) {
      await Modal.alert({ title: "No remotes", message: "This repository has no remotes configured." });
      return;
    }
    const target = await openPickDialog({
      title: "Remove remote",
      items: remotes,
      label: (r) => `${r.name} — ${r.url}`,
      confirmText: "Remove",
      danger: true,
    });
    if (!target) return;
    runGitAction("Remove remote", () => DC.gitRemoveRemote(repoId, target.name));
  }

  // ---- undo the most recent commit / abort a rebase (from the gear menu) ----
  async function undoLastCommitFromMenu() {
    if (!repoId || busy) return;
    let latest;
    try {
      latest = await DC.gitLog(repoId, 1);
    } catch (e) {
      console.error("gitLog failed", e);
      await Modal.alert({ title: "Couldn't load commit history", message: String(e) });
      return;
    }
    if (!latest || !latest.length) {
      await Modal.alert({ title: "Nothing to undo", message: "This repository has no commits yet." });
      return;
    }
    undoCommit(latest[0]);
  }

  function abortRebaseFlow() {
    runGitAction("Abort rebase", () => DC.conflictAbort(repoId));
  }

  // ---- commit variants (plain / staged / all, each optionally amend / signed off) ----
  async function doCommitVariant({ all, amend, signoff }) {
    if (busy) return;
    const summary = ($("commitSummary").value || "").trim();
    const desc = $("commitDesc").value || "";
    if (!summary) {
      await Modal.alert({ title: "Enter a summary", message: "Type a commit summary in the box before committing." });
      return;
    }
    busy = true; updateCommitBtn();
    try {
      const cs = await DC.gitCommit(repoId, summary, desc, all, amend, signoff);
      $("commitSummary").value = ""; $("commitDesc").value = "";
      branch = cs.branch || branch;
      $("chgBranchLabel").textContent = branch;
      activeFile = null; activeGroup = null;
      showDiffEmpty("Commit created. Select a file to view its diff.");
      setChangeSet(cs);
    } catch (e) {
      console.error("commit failed", e);
      await Modal.alert({ title: "Commit failed", message: String(e) });
    } finally {
      busy = false; updateCommitBtn();
    }
  }

  // Main Commit button: staged-only if anything is staged, else stage + commit
  // everything. Swaps the button label for a spinner while committing.
  async function doCommit() {
    if (busy) return;
    const summary = ($("commitSummary").value || "").trim();
    if (!summary || (staged.length === 0 && unstaged.length === 0)) return;
    const btn = $("commitBtn");
    const prev = btn.innerHTML;
    btn.innerHTML = `<span class="spin">${ICON.sync}</span>Committing…`;
    try {
      await doCommitVariant({ all: staged.length === 0, amend: false, signoff: false });
    } finally {
      btn.innerHTML = prev;
      updateCommitBtn();
    }
  }

  // ---- stash: pick-one flows ----
  function stashLabel(st) {
    return `${st.message || "(no message)"} — ${st.branch} · ${st.when}`;
  }

  async function pickStashFlow({ title, confirmText, danger }) {
    if (!stashes.length) {
      await Modal.alert({ title: "No stashes", message: "There are no stashes to pick from." });
      return null;
    }
    return openPickDialog({ title, items: stashes, label: stashLabel, confirmText, danger });
  }

  async function applyStashPickerFlow() {
    const st = await pickStashFlow({ title: "Apply stash", confirmText: "Apply" });
    if (st) stashApply(st);
  }
  async function popStashPickerFlow() {
    const st = await pickStashFlow({ title: "Pop stash", confirmText: "Pop" });
    if (st) stashRestore(st);
  }
  async function dropStashPickerFlow() {
    const st = await pickStashFlow({ title: "Drop stash", confirmText: "Drop", danger: true });
    if (st) stashDrop(st);
  }
  async function dropAllStashesFlow() {
    if (!stashes.length) {
      await Modal.alert({ title: "No stashes", message: "There are no stashes to drop." });
      return;
    }
    const ok = await Modal.confirm({
      title: "Drop all stashes",
      message: `Delete all ${stashes.length} stash${stashes.length === 1 ? "" : "es"}? This cannot be undone.`,
      confirmText: "Drop all",
      danger: true,
    });
    if (ok) runStaging(() => DC.gitStashClear(repoId));
  }
  async function viewStashPickerFlow() {
    const st = await pickStashFlow({ title: "View stash", confirmText: "View" });
    if (st) viewStashDialog(st);
  }
  async function viewStashDialog(st) {
    let text;
    try {
      text = await DC.gitStashShow(repoId, st.index);
    } catch (e) {
      console.error("stashShow failed", e);
      await Modal.alert({ title: "Couldn't load stash", message: String(e) });
      return;
    }
    Modal.custom({
      title: stashLabel(st),
      wide: true,
      render: (body, foot) => {
        body.innerHTML = `<pre class="git-output-pre">${escapeHtml(text || "(empty diff)")}</pre>`;
        foot.hidden = true;
      },
    });
  }

  // ---- tags ----
  async function createTagFlow() {
    if (!repoId || busy) return;
    const res = await openFieldsDialog({
      title: "Create tag",
      fields: [
        { label: "Tag name", placeholder: "v1.0.0" },
        { label: "Target (optional, defaults to HEAD)", placeholder: branch },
        { label: "Message (optional — creates an annotated tag)", placeholder: "" },
      ],
      confirmText: "Create",
      validate: ([name]) => (!name ? "Enter a tag name." : null),
    });
    if (!res) return;
    runGitAction("Create tag", () => DC.gitCreateTag(repoId, res[0], res[1], res[2]));
  }

  async function pickTagFlow({ title, confirmText, danger }) {
    let tags;
    try {
      tags = await DC.gitListGitTags(repoId);
    } catch (e) {
      console.error("listGitTags failed", e);
      await Modal.alert({ title: "Couldn't load tags", message: String(e) });
      return null;
    }
    if (!tags || !tags.length) {
      await Modal.alert({ title: "No tags", message: "This repository has no tags." });
      return null;
    }
    return openPickDialog({ title, items: tags, label: (t) => (t.message ? `${t.name} — ${t.message}` : t.name), confirmText, danger });
  }
  async function deleteTagFlow() {
    const t = await pickTagFlow({ title: "Delete tag", confirmText: "Delete", danger: true });
    if (t) runGitAction("Delete tag", () => DC.gitDeleteTag(repoId, t.name));
  }
  async function deleteRemoteTagFlow() {
    const t = await pickTagFlow({ title: "Delete remote tag", confirmText: "Delete", danger: true });
    if (t) runGitAction("Delete remote tag", () => DC.gitDeleteRemoteTag(repoId, t.name));
  }
  function pushTagsFlow() {
    runGitAction("Push tags", () => DC.gitPushTags(repoId));
  }

  // ---- worktrees ----
  async function addWorktreeFlow() {
    if (!repoId || busy) return;
    let dir;
    try {
      dir = await window.__TAURI__.dialog.open({ directory: true, multiple: false, title: "Choose a folder for the new worktree" });
    } catch (e) {
      console.error("folder picker failed", e);
      return;
    }
    if (!dir) return;
    let branches = [];
    try { branches = (await DC.listBranches(repoId)) || []; } catch (e) { /* non-fatal */ }
    const res = await openFieldsDialog({
      title: "Add worktree",
      message: `Folder: ${dir}`,
      fields: [{ label: "Branch (existing, or new)", placeholder: branch }],
      confirmText: "Add",
      validate: ([b]) => (!b ? "Enter a branch name." : null),
    });
    if (!res) return;
    const br = res[0];
    const createBranch = !branches.includes(br);
    runGitAction("Add worktree", () => DC.gitAddWorktree(repoId, dir, br, createBranch));
  }

  async function removeWorktreeFlow() {
    if (!repoId || busy) return;
    let list;
    try {
      list = await DC.gitListWorktrees(repoId);
    } catch (e) {
      console.error("listWorktrees failed", e);
      await Modal.alert({ title: "Couldn't load worktrees", message: String(e) });
      return;
    }
    const candidates = (list || []).filter((w) => !w.isMain);
    if (!candidates.length) {
      await Modal.alert({ title: "No worktrees", message: "There are no linked worktrees to remove." });
      return;
    }
    const target = await openPickDialog({
      title: "Remove worktree",
      items: candidates,
      label: (w) => (w.branch ? `${w.name} (${w.branch})` : w.name),
      confirmText: "Remove",
      danger: true,
    });
    if (!target) return;
    runGitAction("Remove worktree", () => DC.gitRemoveWorktree(repoId, target.path, false));
  }

  // ---- Show Git Output ----
  async function showGitOutputFlow() {
    let entries = [];
    try { entries = (await DC.gitActionLog()) || []; } catch (e) { /* ignore */ }
    Modal.custom({
      title: "Git Output",
      wide: true,
      render: (body, foot) => {
        if (!entries.length) {
          body.innerHTML = `<p class="modal-msg">No git actions have run yet this session.</p>`;
        } else {
          const lines = entries.map((e) => `[${e.time}] ${e.repo} — ${e.action} — ${e.ok ? "OK" : "ERROR: " + (e.detail || "")}`);
          body.innerHTML = `<pre class="git-output-pre">${escapeHtml(lines.join("\n"))}</pre>`;
        }
        foot.hidden = true;
      },
    });
  }

  // ---- clone (top-level "Clone" action) ----
  async function cloneRepoFlow() {
    const url = await Modal.prompt({
      title: "Clone repository",
      label: "Repository URL",
      placeholder: "https://github.com/owner/repo.git",
      confirmText: "Choose folder…",
      validate: (v) => (v ? null : "Enter a repository URL."),
    });
    if (!url) return;
    let dir;
    try {
      dir = await window.__TAURI__.dialog.open({ directory: true, multiple: false, title: "Choose a folder to clone into" });
    } catch (e) {
      console.error("folder picker failed", e);
      return;
    }
    if (!dir) return;
    try {
      const repo = await DC.cloneRepo(url, dir);
      if (repo && !repos.some((r) => r.id === repo.id)) repos.push(repo);
      rerenderGit();
      if (repo) openRepoById(repo.id);
    } catch (e) {
      console.error("cloneRepo failed", e);
      await Modal.alert({ title: "Clone failed", message: String(e) });
    }
  }

  // ---- Git actions "gear" menu (strictly mirrors the reference layout) ----
  function gitMenuItems(conflictKind) {
    const hasStaged = staged.length > 0;
    const hasUnstaged = unstaged.length > 0;
    const hasChanges = hasStaged || hasUnstaged;
    const hasStashes = stashes.length > 0;
    const hasSummary = !!($("commitSummary").value || "").trim();
    const pushLabel = syncHasUpstream ? "Push" : "Publish";
    const isRebasing = conflictKind === "rebase";

    return [
      { label: "Fetch", icon: ICON.sync, onClick: () => doSync("fetch") },
      { label: "Sync", icon: ICON.swap, onClick: () => doSync("sync") },
      { label: pushLabel, icon: ICON.up, onClick: () => doSync("push") },
      { label: "Pull", icon: ICON.down, onClick: () => doSync("pull") },
      { label: "Create Pull Request…", icon: ICON.pr, onClick: createPullRequestFlow },
      { label: "Checkout to…", icon: ICON.branch, onClick: openBranchPicker },
      { label: "Clone", icon: ICON.copy, onClick: cloneRepoFlow },
      { separator: true },
      {
        label: "Commit",
        icon: ICON.check,
        submenu: [
          { label: "Commit", icon: ICON.check, disabled: !hasChanges || !hasSummary, onClick: () => doCommitVariant({ all: !hasStaged, amend: false, signoff: false }) },
          { label: "Commit Staged", icon: ICON.check, disabled: !hasStaged || !hasSummary, onClick: () => doCommitVariant({ all: false, amend: false, signoff: false }) },
          { label: "Commit All", icon: ICON.check, disabled: !hasChanges || !hasSummary, onClick: () => doCommitVariant({ all: true, amend: false, signoff: false }) },
          { label: "Undo Last Commit", icon: ACT_DISCARD, onClick: undoLastCommitFromMenu },
          { label: "Abort Rebase", icon: ICON.x, danger: true, disabled: !isRebasing, onClick: abortRebaseFlow },
          { separator: true },
          { label: "Commit (Amend)", icon: ICON.pencil, disabled: !hasSummary, onClick: () => doCommitVariant({ all: !hasStaged, amend: true, signoff: false }) },
          { label: "Commit Staged (Amend)", icon: ICON.pencil, disabled: !hasStaged || !hasSummary, onClick: () => doCommitVariant({ all: false, amend: true, signoff: false }) },
          { label: "Commit All (Amend)", icon: ICON.pencil, disabled: !hasSummary, onClick: () => doCommitVariant({ all: true, amend: true, signoff: false }) },
          { separator: true },
          { label: "Commit (Signed Off)", icon: ICON.check, disabled: !hasChanges || !hasSummary, onClick: () => doCommitVariant({ all: !hasStaged, amend: false, signoff: true }) },
          { label: "Commit Staged (Signed Off)", icon: ICON.check, disabled: !hasStaged || !hasSummary, onClick: () => doCommitVariant({ all: false, amend: false, signoff: true }) },
          { label: "Commit All (Signed Off)", icon: ICON.check, disabled: !hasChanges || !hasSummary, onClick: () => doCommitVariant({ all: true, amend: false, signoff: true }) },
        ],
      },
      {
        label: "Changes",
        icon: ICON.changes,
        submenu: [
          { label: "Stage All Changes", icon: ICON.plus, disabled: !hasUnstaged, onClick: () => bulkAction("stage", "unstaged") },
          { label: "Unstage All Changes", icon: ICON.x, disabled: !hasStaged, onClick: () => bulkAction("unstage", "staged") },
          { label: "Discard All Changes", icon: ACT_DISCARD, danger: true, disabled: !hasUnstaged, onClick: () => bulkAction("discard", "unstaged") },
        ],
      },
      {
        label: "Pull, Push",
        icon: ICON.swap,
        submenu: [
          { label: "Sync", icon: ICON.swap, onClick: () => doSync("sync") },
          { separator: true },
          { label: "Pull", icon: ICON.down, onClick: () => doSync("pull") },
          { label: "Pull (Rebase)", icon: ICON.down, onClick: pullRebaseFlow },
          { label: "Pull from…", icon: ICON.down, onClick: pullFromFlow },
          { separator: true },
          { label: pushLabel, icon: ICON.up, onClick: () => doSync("push") },
          { label: "Push to…", icon: ICON.up, onClick: pushToFlow },
          { separator: true },
          { label: "Fetch", icon: ICON.sync, onClick: () => doSync("fetch") },
          { label: "Fetch (Prune)", icon: ICON.sync, onClick: () => runGitAction("Fetch (prune)", () => DC.gitFetchPrune(repoId)) },
          { label: "Fetch From All Remotes", icon: ICON.sync, onClick: () => runGitAction("Fetch (all remotes)", () => DC.gitFetchAll(repoId)) },
        ],
      },
      {
        label: "Branch",
        icon: ICON.branch,
        submenu: [
          { label: "Merge…", icon: ICON.mergeGit, onClick: openMergeDialog },
          { label: "Rebase Branch…", icon: ICON.swap, onClick: rebaseBranchFlow },
          { separator: true },
          { label: "Create Branch…", icon: ICON.plus, onClick: newBranchFlow },
          { label: "Create Branch From…", icon: ICON.plus, onClick: newBranchFlow },
          { separator: true },
          { label: "Rename Branch…", icon: ICON.pencil, onClick: renameCurrentBranchFlow },
          { label: "Delete Branch…", icon: ICON.trash, danger: true, onClick: deleteBranchPickerFlow },
          { label: "Delete Remote Branch…", icon: ICON.trash, danger: true, onClick: deleteRemoteBranchFlow },
          { separator: true },
          { label: "Publish Branch…", icon: ICON.up, disabled: syncHasUpstream, onClick: () => doSync("push") },
        ],
      },
      {
        label: "Remote",
        icon: ICON.external,
        submenu: [
          { label: "Add Remote…", icon: ICON.plus, onClick: addRemoteFlow },
          { label: "Remove Remote", icon: ICON.trash, danger: true, onClick: removeRemoteFlow },
        ],
      },
      {
        label: "Stash",
        icon: ICON.archive,
        submenu: [
          { label: "Stash", icon: ICON.archive, disabled: !hasChanges, onClick: () => runStaging(() => DC.gitStashPush(repoId, "", false)) },
          { label: "Stash (Include Untracked)", icon: ICON.archive, disabled: !hasChanges, onClick: () => runStaging(() => DC.gitStashPush(repoId, "", true)) },
          { label: "Stash Staged", icon: ICON.archive, disabled: !hasStaged, onClick: () => runStaging(() => DC.gitStashPushStaged(repoId, "")) },
          { separator: true },
          { label: "Apply Latest Stash", icon: ICON.copy, disabled: !hasStashes, onClick: () => stashApply(stashes[0]) },
          { label: "Apply Stash…", icon: ICON.copy, disabled: !hasStashes, onClick: applyStashPickerFlow },
          { separator: true },
          { label: "Pop Latest Stash", icon: ACT_RESTORE, disabled: !hasStashes, onClick: () => stashRestore(stashes[0]) },
          { label: "Pop Stash…", icon: ACT_RESTORE, disabled: !hasStashes, onClick: popStashPickerFlow },
          { separator: true },
          { label: "Drop Stash…", icon: ICON.trash, danger: true, disabled: !hasStashes, onClick: dropStashPickerFlow },
          { label: "Drop All Stashes…", icon: ICON.trash, danger: true, disabled: !hasStashes, onClick: dropAllStashesFlow },
          { separator: true },
          { label: "View Stash…", icon: ICON.eye, disabled: !hasStashes, onClick: viewStashPickerFlow },
        ],
      },
      {
        label: "Tags",
        icon: ICON.tag,
        submenu: [
          { label: "Create Tag…", icon: ICON.tag, onClick: createTagFlow },
          { label: "Delete Tag…", icon: ICON.trash, danger: true, onClick: deleteTagFlow },
          { label: "Delete Remote Tag…", icon: ICON.trash, danger: true, onClick: deleteRemoteTagFlow },
          { separator: true },
          { label: "Push Tags", icon: ICON.up, onClick: pushTagsFlow },
        ],
      },
      {
        label: "Worktrees",
        icon: ICON.folder,
        submenu: [
          { label: "Add Worktree…", icon: ICON.plus, onClick: addWorktreeFlow },
          { label: "Remove Worktree…", icon: ICON.trash, danger: true, onClick: removeWorktreeFlow },
        ],
      },
      { separator: true },
      { label: "Show Git Output", icon: ICON.terminal, onClick: showGitOutputFlow },
    ].reverse();
  }

  async function openGitMenu(anchor) {
    if (!repoId || !DC || !DC.hasBackend) return;
    let conflictKind = "none";
    try {
      const info = await DC.gitConflicts(repoId);
      conflictKind = (info && info.kind) || "none";
    } catch (e) { /* treat as none */ }
    Dropdown.flyout(anchor, gitMenuItems(conflictKind));
  }

  function updateCommitBtn() {
    const summary = ($("commitSummary").value || "").trim();
    const has = staged.length > 0 || unstaged.length > 0;
    $("commitBtn").disabled = busy || !summary || !has;
    if (!busy) $("commitBtn").textContent = staged.length > 0 ? "Commit" : "Commit all";
    const stashBtn = $("changeStashBtn");
    if (stashBtn) stashBtn.disabled = busy || !has;
  }

  // ---- history tab ----
  async function loadHistory() {
    if (!repoId) return;
    loadGen++;
    const gen = loadGen;
    const forRepo = repoId;
    $("historyList").innerHTML = `<div class="changes-empty">Loading…</div>`;
    try {
      const log = await DC.gitLog(forRepo, 200);
      if (gen !== loadGen || repoId !== forRepo) return; // superseded by a newer navigation
      history = log;
      renderHistory();
      // Auto-select the newest commit so the detail + diff panes aren't left
      // empty (fills the space and matches GitHub Desktop behaviour).
      if (history.length && !activeSha) selectCommit(history[0].hash);
    } catch (e) {
      if (gen !== loadGen || repoId !== forRepo) return;
      console.error("gitLog failed", e);
      $("historyList").innerHTML = `<div class="changes-empty">${esc(String(e))}</div>`;
    }
  }

  function renderHistory() {
    const filter = ($("historyFilter").value || "").toLowerCase();
    const shown = filter
      ? history.filter((c) => c.summary.toLowerCase().includes(filter) || c.author.toLowerCase().includes(filter) || c.id.includes(filter))
      : history;
    if (!shown.length) {
      $("historyList").innerHTML = `<div class="changes-empty">${history.length ? "No commits match." : "No commits yet."}</div>`;
      return;
    }
    $("historyList").innerHTML = shown
      .map((c) => {
        const tags = (c.tags || [])
          .map((t) => `<span class="history-tag" title="Tag: ${esc(t)}">${ICON.tag}<span>${esc(t)}</span></span>`)
          .join("");
        const unpushed = c.unpushed
          ? `<span class="history-unpushed" title="This commit hasn't been pushed yet">${ICON.up}</span>`
          : "";
        const badges = tags || unpushed ? `<div class="history-badges">${tags}${unpushed}</div>` : "";
        const selected = c.hash === activeSha;
        return `<div class="history-row${selected ? " selected" : ""}" data-sha="${c.hash}" role="option" aria-selected="${selected}" tabindex="0">
        <div class="history-main">
          <div class="history-summary" title="${esc(c.summary)}">${esc(c.summary)}</div>
          <div class="history-meta"><span class="history-hash">${c.id}</span><span class="history-author" title="${esc(c.author)}">${esc(c.author)}</span><span class="hm-dot">·</span><span class="history-when">${esc(c.when)}</span></div>
        </div>${badges}
      </div>`;
      })
      .join("");
    on($("historyList"), ".history-row", "click", (row) => selectCommit(row.dataset.sha));
    on($("historyList"), ".history-row", "keydown", (row, e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectCommit(row.dataset.sha);
        return;
      }
      const rows = [...$("historyList").querySelectorAll(".history-row")];
      const index = rows.indexOf(row);
      const next = e.key === "ArrowUp" ? index - 1 : e.key === "ArrowDown" ? index + 1 : index;
      if (next === index || !rows[next]) return;
      e.preventDefault();
      rows[next].focus();
    });
    on($("historyList"), ".history-row", "contextmenu", (row, e) => {
      e.preventDefault();
      const c = history.find((x) => x.hash === row.dataset.sha);
      if (c) openCommitContextMenu(e, c);
    });
  }

  function openCommitContextMenu(e, c) {
    if (!DC || !DC.hasBackend) return;
    const isLatest = history.length > 0 && history[0].hash === c.hash;
    Dropdown.context(e.clientX, e.clientY, [
      {
        label: "Undo commit",
        icon: ACT_DISCARD,
        disabled: !isLatest,
        onClick: () => undoCommit(c),
      },
    ]);
  }

  // Undo the most recent commit: soft-resets HEAD to its parent so the
  // commit's changes move back into Staged Changes instead of being lost.
  async function undoCommit(c) {
    if (busy || !repoId) return;
    const ok = await Modal.confirm({
      title: "Undo commit",
      message: `Undo “${c.summary}”? Its changes will move back to Staged Changes so you can edit or re-commit them.`,
      confirmText: "Undo commit",
    });
    if (!ok) return;
    busy = true;
    try {
      const cs = await DC.undoCommit(repoId, c.hash);
      history = history.filter((h) => h.hash !== c.hash);
      activeSha = null;
      setChangeSet(cs);
      switchTab("changes");
    } catch (e) {
      console.error("undoCommit failed", e);
      await Modal.alert({ title: "Undo commit failed", message: String(e) });
    } finally {
      busy = false;
    }
  }

  async function selectCommit(sha) {
    loadGen++;
    const gen = loadGen;
    const forRepo = repoId;
    activeSha = sha; activeFile = null; navOrder = [];
    $("historyList").querySelectorAll(".history-row").forEach((r) => {
      const selected = r.dataset.sha === sha;
      r.classList.toggle("selected", selected);
      r.setAttribute("aria-selected", String(selected));
    });
    const c = history.find((x) => x.hash === sha);
    $("detailHead").innerHTML = `<div class="detail-msg">${esc(c ? c.summary : "")}</div>
      <div class="detail-meta"><span class="avatar">${esc((c && c.author ? c.author : "?").slice(0, 2).toUpperCase())}</span><span class="detail-author" title="${esc(c ? c.author : "")}">${esc(c ? c.author : "")}</span><span class="hm-dot">·</span><span class="history-when">${esc(c ? c.when : "")}</span><span class="history-hash">${esc(c ? c.id : sha.slice(0, 7))}</span></div>`;
    $("detailFiles").innerHTML = `<div class="changes-empty">Loading…</div>`;
    $("detailCollapseBtn").hidden = true;
    showDiffEmpty("Loading commit…");
    collapsedDetail = new Set();
    try {
      const cs = await DC.gitChanges(forRepo, sha);
      // Bail if a newer navigation (another commit, repo, or tab) has since
      // taken over — otherwise this stale response can hijack whatever the
      // user is looking at now (it shares activeFile/diffBody with the
      // Changes tab and the Pull Requests tab).
      if (gen !== loadGen || repoId !== forRepo || activeSha !== sha) return;
      commitFiles = cs.files || [];
      renderDetail();
      if (commitFiles.length) selectFile(commitFiles[0].path, null);
      else showDiffEmpty("This commit has no file changes.");
    } catch (e) {
      if (gen !== loadGen || repoId !== forRepo || activeSha !== sha) return;
      console.error("commit changes failed", e);
      $("detailFiles").innerHTML = `<div class="changes-empty">${esc(String(e))}</div>`;
      showDiffEmpty(String(e));
    }
  }

  function renderDetail() {
    $("detailFileCount").textContent =
      `${commitFiles.length} file${commitFiles.length === 1 ? "" : "s"} changed`;
    $("detailCollapseBtn").hidden = detailView !== "tree" || !commitFiles.some((f) => f.path.includes("/"));
    if (!commitFiles.length) {
      $("detailFiles").innerHTML = `<div class="changes-empty">No file changes.</div>`;
      navOrder = []; return;
    }
    navOrder = renderFileTree($("detailFiles"), {
      files: commitFiles, collapsed: collapsedDetail, viewMode: detailView, group: null,
      activeFile, activeGroup, onSelect: selectFile, rerender: renderDetail,
    });
  }

  // ---- diff pane ----
  function showDiffEmpty(msg) {
    $("diffEmpty").textContent = msg;
    $("diffEmpty").hidden = false;
    $("diffContent").hidden = true;
  }

  function diffHeadHtml(path, addsStr, delsStr) {
    const idx = navOrder.findIndex((e) => e.path === activeFile && e.group === activeGroup);
    const nav = navOrder.length > 1
      ? `<div class="diff-nav">
          <button class="icon-mini" id="diffPrev" title="Previous file (↑)" ${idx <= 0 ? "disabled" : ""}>${CHEV_UP}</button>
          <span class="diff-pos">${idx + 1} / ${navOrder.length}</span>
          <button class="icon-mini" id="diffNext" title="Next file (↓)" ${idx >= navOrder.length - 1 ? "disabled" : ""}>${CHEV_DOWN}</button>
        </div>` : "";
    return `<span class="diff-path" title="${esc(path)}">${esc(path)}</span>${nav}<span class="diff-adds">${addsStr}</span><span class="diff-dels">${delsStr}</span>`;
  }

  function wireDiffNav() {
    const prev = $("diffPrev"), next = $("diffNext");
    if (prev) prev.addEventListener("click", () => step(-1));
    if (next) next.addEventListener("click", () => step(1));
  }

  function step(dir) {
    if (!navOrder.length) return;
    const idx = navOrder.findIndex((e) => e.path === activeFile && e.group === activeGroup);
    const ni = idx < 0 ? 0 : idx + dir;
    if (ni < 0 || ni >= navOrder.length) return;
    const e = navOrder[ni];
    selectFile(e.path, e.group);
  }

  async function selectFile(path, group) {
    group = group || null;
    loadGen++;
    const gen = loadGen;
    const forRepo = repoId;
    activeFile = path; activeGroup = group;
    // Highlight the row + scroll into view in whichever list is active.
    const listId = (tab === "history" || tab === "pulls") ? "detailFiles" : "changesList";
    const list = $(listId);
    list.querySelectorAll(".tree-file").forEach((r) => {
      const on = r.dataset.file === path && (r.dataset.group || "") === (group || "");
      r.classList.toggle("selected", on);
      if (on) r.scrollIntoView({ block: "nearest" });
    });
    $("diffEmpty").hidden = true;
    $("diffContent").hidden = false;
    $("diffHead").innerHTML = diffHeadHtml(path, "…", "");
    wireDiffNav();
    $("diffBody").innerHTML = `<div class="diff-binary">Loading diff…</div>`;
    try {
      const d = (tab === "pulls" && activePull)
        ? await DC.prFileDiff(forRepo, activePull.base, activePull.branch, path)
        : await DC.gitDiff(forRepo, path, activeSha, group === "staged");
      // Bail if a newer navigation (another file, repo, or tab) has since taken
      // over — the diff pane is shared by all three tabs.
      if (gen !== loadGen || repoId !== forRepo || activeFile !== path || activeGroup !== group) return;
      renderDiff(d);
    } catch (e) {
      if (gen !== loadGen || repoId !== forRepo || activeFile !== path || activeGroup !== group) return;
      console.error("gitDiff failed", e);
      $("diffBody").innerHTML = `<div class="diff-binary">${esc(String(e))}</div>`;
    }
  }

  function renderDiff(d) {
    $("diffHead").innerHTML = diffHeadHtml(d.path, `+${d.additions}`, `−${d.deletions}`);
    wireDiffNav();
    if (d.oldImage || d.newImage) { renderImageDiff(d); return; }
    if (d.binary) { $("diffBody").innerHTML = `<div class="diff-binary">Binary file — no text diff to display.</div>`; return; }
    if (!d.hunks.length) { $("diffBody").innerHTML = `<div class="diff-binary">No textual changes to display.</div>`; return; }
    const lang = (window.Highlighter && Highlighter.langForPath(d.path)) || "";
    const hl = (s) => (window.Highlighter ? Highlighter.line(s, lang) : esc(s));
    const rows = [];
    d.hunks.forEach((h) => {
      rows.push(`<div class="diff-hunk-head">${esc(h.header)}</div>`);
      h.lines.forEach((l) => {
        const cls = l.kind === "add" ? "add" : l.kind === "del" ? "del" : "";
        const oldN = l.oldLineno != null ? l.oldLineno : "";
        const newN = l.newLineno != null ? l.newLineno : "";
        const body = l.content ? hl(l.content) : "&nbsp;";
        rows.push(`<div class="diff-line ${cls}"><span class="diff-gutter"><span>${oldN}</span><span>${newN}</span></span><span class="diff-text">${body}</span></div>`);
      });
    });
    // Wrap rows in a max-content container so each row stretches to the widest
    // line — keeps the add/del row tints spanning the full width when the diff
    // is scrolled horizontally.
    $("diffBody").innerHTML = `<div class="diff-code">${rows.join("")}</div>`;
  }

  // Render an image file as a visual before/after preview instead of a text diff.
  // `src` is a backend-built data: URL for a whitelisted raster mime, so it's
  // safe to inline; the alt text is escaped.
  function renderImageDiff(d) {
    const fig = (label, src) =>
      `<figure class="diff-img-fig">` +
        `<figcaption class="diff-img-cap">${label}</figcaption>` +
        `<div class="diff-img-wrap"><img class="diff-img" src="${src}" alt="${esc(d.path)}" loading="lazy" /></div>` +
      `</figure>`;
    let inner;
    if (d.oldImage && d.newImage) inner = fig("Before", d.oldImage) + fig("After", d.newImage);
    else if (d.newImage) inner = fig("Added", d.newImage);
    else inner = fig("Removed", d.oldImage);
    $("diffBody").innerHTML = `<div class="diff-image">${inner}</div>`;
  }

  // ---- tabs / view mode ----
  function switchTab(next) {
    loadGen++; // cancel any in-flight load for the tab being left
    tab = next;
    $("cpane-changes").hidden = next !== "changes";
    $("cpane-history").hidden = next !== "history";
    $("cpane-pulls").hidden = next !== "pulls";
    $("commitDetail").hidden = next !== "history" && next !== "pulls";
    $("commitLayout").classList.toggle("mode-history", next === "history");
    $("commitLayout").classList.toggle("mode-pulls", next === "pulls");
    document.querySelectorAll(".commit-tab").forEach((t) => {
      const active = t.dataset.ctab === next;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", String(active));
      t.tabIndex = active ? 0 : -1;
    });
    activeFile = null; activeGroup = null; navOrder = [];
    // Drop the previous tab's detail-panel files immediately so "Collapse all"
    // (or anything else touching `commitFiles`) can't act on stale data from
    // the tab just left (e.g. History's last-selected commit) while the new
    // tab's own commit/PR is still loading.
    commitFiles = [];
    $("detailCollapseBtn").hidden = true;
    if (next === "history") {
      activeSha = null; activePull = null;
      $("detailHead").innerHTML = "";
      $("detailFiles").innerHTML = `<div class="detail-empty">Select a commit to see its files.</div>`;
      $("detailFileCount").textContent = "Files";
      showDiffEmpty("Select a commit, then a file to view its diff.");
      loadHistory();
    } else if (next === "pulls") {
      activeSha = null; activePull = null;
      $("detailHead").innerHTML = "";
      $("detailFiles").innerHTML = `<div class="detail-empty">Select a pull request to see its files.</div>`;
      $("detailFileCount").textContent = "Files";
      showDiffEmpty("Select a pull request, then a file to view its diff.");
      // Always refresh from the backend on switch-in (matches History) so PRs
      // opened/closed/updated elsewhere are never shown stale.
      loadRepoPulls();
    } else {
      activeSha = null; activePull = null;
      showDiffEmpty("Select a file to view its diff.");
      // Always refresh from the backend on switch-in — the working tree can
      // change externally (terminal, VS Code) while another tab was active.
      if (repoId) loadChanges(); else renderChanges();
    }
  }

  // ---- pull requests tab ----
  async function loadRepoPulls() {
    if (!repoId) return;
    loadGen++;                 // invalidate any in-flight loader from another tab
    pullsGen++;                // dedicated generation for THIS list fetch
    const pgen = pullsGen;
    const forRepo = repoId;
    pullsLoaded = false; activePull = null;
    // Fetch in the background so the PR's head/base branches are present locally
    // for the diff view. Runs in parallel with the PR list load; non-fatal on
    // failure (offline, no remote, auth, …).
    prFetch = DC.hasBackend
      ? DC.fetchRepo(forRepo).catch((e) => console.warn("PR branch fetch failed", e))
      : null;
    const sigPulls = (list) => (list || []).map((p) => `${p.id}:${p.status}:${p.updated}`).join("|");
    // INSTANT: paint the last-known PR list for this repo (if any) while the live
    // list refreshes below. The cache is keyed by repo, so another repo's list is
    // never shown, and the fetch ALWAYS runs and replaces it — so a cached list
    // can never linger as stale.
    const cached = repoPullsCache.get(forRepo);
    if (cached && cached.length) {
      repoPulls = cached; pullsLoaded = true;
      renderRepoPulls($("pullFilter").value || "");
      selectPull(repoPulls[0].id);
    } else {
      repoPulls = [];
      $("repoPrList").innerHTML = `<div class="changes-empty">Loading pull requests…</div>`;
    }
    try {
      const data = await DC.listRepoPullRequests(forRepo);
      if (pgen !== pullsGen || repoId !== forRepo) return; // newer list load / repo switch won
      const fresh = Array.isArray(data) ? data : [];
      repoPullsCache.set(forRepo, fresh);
      pullsLoaded = true;
      // Unchanged since the cached paint — already correct, avoid a needless
      // re-render (and diff reload).
      if (cached && cached.length && sigPulls(cached) === sigPulls(fresh)) {
        repoPulls = fresh;
        return;
      }
      const prevId = activePull ? String(activePull.id) : null;
      repoPulls = fresh;
      renderRepoPulls($("pullFilter").value || "");
      if (!repoPulls.length) {
        // The repo has no PRs anymore — clear any leftover detail/diff so nothing
        // stale from a previous selection remains on screen.
        activePull = null; activeSha = null; activeFile = null; navOrder = [];
        commitFiles = [];
        $("detailHead").innerHTML = "";
        $("detailFiles").innerHTML = `<div class="changes-empty">No pull requests.</div>`;
        $("detailCollapseBtn").hidden = true;
        showDiffEmpty("No open pull requests.");
        return;
      }
      // Rebind the selection to the FRESH list so its diff reflects the latest
      // data; fall back to the newest PR when the selected one is gone.
      const keep = prevId && repoPulls.find((p) => String(p.id) === prevId);
      selectPull(keep ? keep.id : repoPulls[0].id);
    } catch (e) {
      if (pgen !== pullsGen || repoId !== forRepo) return;
      console.error("listRepoPullRequests failed", e);
      // Keep a cached list on screen only if we had one; otherwise surface the
      // error rather than leaving stale data.
      if (!cached || !cached.length) {
        repoPulls = []; pullsLoaded = true;
        $("repoPrList").innerHTML = `<div class="changes-empty">${esc(String(e))}</div>`;
      }
    }
  }

  function renderRepoPulls(filter = "") {
    const host = $("repoPrList");
    if (!host) return;
    if (!repoPulls.length) {
      host.innerHTML = `<div class="changes-empty">No open pull requests for this repository.</div>`;
      return;
    }
    const f = filter.toLowerCase();
    const list = repoPulls.filter((p) =>
      (p.title || "").toLowerCase().includes(f) ||
      String(p.id).includes(f) ||
      (p.author || "").toLowerCase().includes(f) ||
      (p.branch || "").toLowerCase().includes(f));
    if (!list.length) {
      host.innerHTML = `<div class="changes-empty">No pull requests match the filter.</div>`;
      return;
    }
    // Compact rows that mirror the commit list; clicking opens the PR in the
    // detail + diff panes.
    host.innerHTML = list
      .map((p) => {
        const sel = activePull && String(activePull.id) === String(p.id) ? " selected" : "";
        return `<div class="history-row${sel}" data-pr-id="${esc(String(p.id))}" role="option" aria-selected="${!!sel}" tabindex="0">
        <div class="history-main">
          <div class="history-summary" title="${esc(p.title)}">${esc(p.title)}</div>
          <div class="history-meta"><span class="history-hash">#${esc(String(p.id))}</span><span class="history-author" title="${esc(p.author)}">${esc(p.author)}</span><span class="hm-dot">·</span><span class="history-when">${esc(p.updated)}</span></div>
        </div>
        <div class="history-badges"><span class="pr-state ${esc(p.status)}">${prStateLabel(p.status)}</span></div>
      </div>`;
      })
      .join("");
    on(host, ".history-row", "click", (row) => selectPull(row.dataset.prId));
    on(host, ".history-row", "keydown", (row, e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectPull(row.dataset.prId);
        return;
      }
      const rows = [...host.querySelectorAll(".history-row")];
      const index = rows.indexOf(row);
      const next = e.key === "ArrowUp" ? index - 1 : e.key === "ArrowDown" ? index + 1 : index;
      if (next === index || !rows[next]) return;
      e.preventDefault();
      rows[next].focus();
    });
  }

  async function selectPull(id) {
    const pr = repoPulls.find((p) => String(p.id) === String(id));
    if (!pr) return;
    loadGen++;
    const gen = loadGen;
    const forRepo = repoId;
    activePull = pr; activeSha = null; activeFile = null; navOrder = [];
    $("repoPrList").querySelectorAll(".history-row").forEach((r) => {
      const selected = r.dataset.prId === String(id);
      r.classList.toggle("selected", selected);
      r.setAttribute("aria-selected", String(selected));
    });
    const initials = (pr.author || "?").slice(0, 2).toUpperCase();
    const rev = REVIEW_MAP[pr.reviews] || REVIEW_MAP.pending;
    $("detailHead").innerHTML = `<div class="detail-msg">${esc(pr.title)}</div>
      <div class="detail-meta"><span class="avatar">${esc(initials)}</span><span class="detail-author" title="${esc(pr.author)}">${esc(pr.author)}</span><span class="hm-dot">·</span><span class="history-when">${esc(pr.updated)}</span><span class="pr-state ${esc(pr.status)}">${prStateLabel(pr.status)}</span></div>
      <div class="pr-detail-branch"><code title="${esc(pr.branch)}">${esc(pr.branch)}</code><span class="pr-arrow">→</span><code title="${esc(pr.base)}">${esc(pr.base)}</code></div>
      <div class="pr-detail-stats"><span class="chip review ${rev.cls}">${rev.icon}${rev.label}</span><button class="btn btn-primary btn-sm" id="prReviewBtn">Review</button><button class="btn btn-ghost btn-sm" id="prViewBtn">${ICON.external}View</button></div>`;
    const vb = $("prViewBtn");
    if (vb) vb.addEventListener("click", () => openPrUrl(pr.url));
    const rb = $("prReviewBtn");
    if (rb) rb.addEventListener("click", () => { if (window.PrReviewer) window.PrReviewer.open(repoId, pr, { returnTo: "changes" }); });
    $("detailFiles").innerHTML = `<div class="changes-empty">Loading…</div>`;
    $("detailCollapseBtn").hidden = true;
    showDiffEmpty("Loading pull request…");
    collapsedDetail = new Set();

    const stillCurrent = () => gen === loadGen && repoId === forRepo && activePull === pr;
    const sig = (files) => (files || []).map((f) => f.status + ":" + f.path).join("|");
    const apply = (cs) => {
      if (!stillCurrent()) return;
      const keep = activeFile;
      commitFiles = cs.files || [];
      renderDetail();
      if (!commitFiles.length) { showDiffEmpty("This pull request has no file changes."); return; }
      // Preserve the file the user is already viewing across a background refresh;
      // otherwise open the first file.
      const target = keep && commitFiles.some((f) => f.path === keep) ? keep : commitFiles[0].path;
      selectFile(target, null);
    };

    // 1) INSTANT: diff against the PR branches already present locally — no
    //    network wait, so the change list paints immediately in the common case
    //    (the repo was fetched recently).
    let shown = false;
    try {
      const cs = await DC.prChanges(forRepo, pr.base, pr.branch);
      if (!stillCurrent()) return;
      apply(cs); shown = true;
    } catch (_) { /* refs not local yet — the fetch below makes them available */ }

    // 2) FRESHEN: wait for the in-flight background fetch, then re-diff. Re-render
    //    only if nothing was shown yet, or the PR's file set actually changed —
    //    so the first paint stays instant while commits pushed since the last
    //    fetch are still picked up (fixes stale/empty local refs).
    try {
      if (prFetch) {
        if (!shown) showDiffEmpty("Fetching pull request branches…");
        try { await prFetch; } catch (_) { /* offline/auth — keep local result */ }
        if (!stillCurrent()) return;
      }
      const fresh = await DC.prChanges(forRepo, pr.base, pr.branch);
      if (!stillCurrent()) return;
      if (!shown || sig(fresh.files) !== sig(commitFiles)) apply(fresh);
    } catch (e) {
      if (!shown && stillCurrent()) {
        console.error("prChanges failed", e);
        commitFiles = []; navOrder = [];
        $("detailFileCount").textContent = "Files";
        $("detailFiles").innerHTML = `<div class="changes-empty">${esc(String(e))}</div>`;
        showDiffEmpty(String(e));
      }
    }
  }

  // The view toggle lives in the Changes panel and controls ONLY the left
  // (Changes) file list. The History detail (middle) panel stays in tree view.
  function setView(mode) {
    if (changesView === mode) return;
    changesView = mode;
    document.querySelectorAll("#chgViewToggle .seg-btn").forEach((b) => {
      const active = b.dataset.view === mode;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    renderChanges();
  }

  function collapseAll(set, list, rerender) {
    const dirs = allDirPaths(list);
    const allCollapsed = [...dirs].every((d) => set.has(d));
    set.clear();
    if (!allCollapsed) dirs.forEach((d) => set.add(d));
    rerender();
  }

  // Arrow-key navigation between files when a tree has focus.
  function onTreeKey(e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (!navOrder.length) return;
    e.preventDefault();
    step(e.key === "ArrowDown" ? 1 : -1);
  }

  function onShow() {
    renderAccountFilter();
    if (!DC || !DC.hasBackend) return;
    const availableRepos = repos.filter(matchesAccountFilter);
    const branchBtn = $("chgBranchBtn");
    if (branchBtn) branchBtn.disabled = !availableRepos.length;
    if (!repoId) {
      // Restore the last-used repo across app restarts; fall back to the first.
      let saved = null;
      try { saved = localStorage.getItem("dc.changes.repoId"); } catch (e) {}
      const target = (saved && availableRepos.find((r) => r.id === saved)) || availableRepos[0];
      if (target) selectRepo(target);
      return;
    }
    // A repo is already selected — refresh the active tab so changes made since
    // the last visit (or on another tab) are always shown.
    if (tab === "history") loadHistory();
    else if (tab === "pulls") loadRepoPulls();
    else loadChanges();
  }

  // Drag-to-resize the commit/diff columns; widths persist in localStorage.
  // Double-click a divider to reset that column to its default width.
  function initResizers() {
    const layout = $("commitLayout");
    if (!layout) return;
    const LIMITS = { side: [240, 560], detail: [200, 520] };
    ["--w-side", "--w-detail"].forEach((v) => {
      try { const s = localStorage.getItem("dc.commit" + v); if (s) layout.style.setProperty(v, s); } catch (e) {}
    });
    layout.querySelectorAll(".pane-resizer").forEach((rz) => {
      const which = rz.dataset.resize;
      const varName = which === "side" ? "--w-side" : "--w-detail";
      const [min, max] = LIMITS[which];
      const defaultWidth = which === "side" ? 300 : 240;
      const currentWidth = () => parseFloat(getComputedStyle(layout).getPropertyValue(varName)) || defaultWidth;
      const setWidth = (width, persist = true) => {
        const value = Math.max(min, Math.min(Math.round(width), max));
        layout.style.setProperty(varName, value + "px");
        rz.setAttribute("aria-valuenow", String(value));
        if (persist) {
          try { localStorage.setItem("dc.commit" + varName, value + "px"); } catch (e) {}
        }
      };
      rz.setAttribute("aria-valuemin", String(min));
      rz.setAttribute("aria-valuemax", String(max));
      rz.setAttribute("aria-valuenow", String(Math.round(currentWidth())));
      rz.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = currentWidth();
        rz.setPointerCapture(e.pointerId);
        rz.classList.add("dragging");
        document.body.classList.add("col-resizing");
        const move = (ev) => {
          setWidth(startW + (ev.clientX - startX), false);
        };
        const up = () => {
          rz.classList.remove("dragging");
          document.body.classList.remove("col-resizing");
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          setWidth(currentWidth());
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      });
      rz.addEventListener("dblclick", () => {
        layout.style.removeProperty(varName);
        rz.setAttribute("aria-valuenow", String(Math.round(currentWidth())));
        try { localStorage.removeItem("dc.commit" + varName); } catch (e) {}
      });
      rz.addEventListener("keydown", (e) => {
        let width = currentWidth();
        const step = e.shiftKey ? 32 : 8;
        if (e.key === "ArrowLeft") width -= step;
        else if (e.key === "ArrowRight") width += step;
        else if (e.key === "Home") width = min;
        else if (e.key === "End") width = max;
        else return;
        e.preventDefault();
        setWidth(width);
      });
    });
  }

  function init() {
    const repoBtn = $("chgRepoBtn");
    if (!repoBtn) return;
    repoBtn.addEventListener("click", openRepoPicker);
    on(document, ".commit-tab", "click", (t) => switchTab(t.dataset.ctab));
    on(document, ".commit-tab", "keydown", (t, e) => {
      const tabs = [...document.querySelectorAll(".commit-tab")];
      const index = tabs.indexOf(t);
      let next = index;
      if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      else if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      else return;
      e.preventDefault();
      tabs[next].click();
      tabs[next].focus();
    });
    on(document, "#chgViewToggle .seg-btn", "click", (b) => setView(b.dataset.view));
    $("changeFilter").addEventListener("input", debounce(renderChanges));
    $("historyFilter").addEventListener("input", debounce(renderHistory));
    $("pullFilter").addEventListener("input", debounce(() => renderRepoPulls($("pullFilter").value || "")));
    $("changeStashBtn").addEventListener("click", openStashDialog);
    // Per-tab refresh buttons inside each filter box (spin while reloading).
    const wireRefresh = (id, fn) => $(id).addEventListener("click", async () => {
      const b = $(id);
      if (!repoId || b.classList.contains("busy")) return;
      b.classList.add("busy");
      try { await fn(); } finally { b.classList.remove("busy"); }
    });
    wireRefresh("changeRefreshBtn", loadChanges);
    wireRefresh("historyRefreshBtn", loadHistory);
    wireRefresh("pullRefreshBtn", loadRepoPulls);
    $("detailCollapseBtn").addEventListener("click", () => collapseAll(collapsedDetail, commitFiles, renderDetail));
    $("commitSummary").addEventListener("input", updateCommitBtn);
    $("commitBtn").addEventListener("click", doCommit);
    $("chgBranchBtn").addEventListener("click", openBranchPicker);
    $("gitMenuBtn").addEventListener("click", () => openGitMenu($("gitMenuBtn")));
    $("conflictBanner").addEventListener("click", () => {
      if (window.ConflictResolver && repoId) window.ConflictResolver.open(repoId);
    });
    $("changesList").addEventListener("keydown", onTreeKey);
    $("detailFiles").addEventListener("keydown", onTreeKey);
    initResizers();

    // Auto-refresh when the app window regains focus so commits/changes made
    // outside DevCenter (VS Code, terminal, …) update the Push/Pull counts and
    // file lists without a manual Refresh. Debounced because focus +
    // visibilitychange can both fire when restoring the window.
    let lastFocusRefresh = 0;
    const refreshOnFocus = () => {
      if (!DC || !DC.hasBackend || !repoId) return;
      if (document.querySelector(".nav-item.active")?.dataset.page !== "changes") return;
      const now = Date.now();
      if (now - lastFocusRefresh < 400) return;
      lastFocusRefresh = now;
      if (tab === "history") loadHistory();
      else if (tab === "pulls") loadRepoPulls();
      else refreshChangesSilently();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshOnFocus();
    });
  }

  init();
  return { onShow, openRepoById, openRepoTab };
})();
window.ChangesPage = ChangesPage;
