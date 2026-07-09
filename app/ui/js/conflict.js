// ---------- Merge-conflict resolver (separate full screen) ----------
const ConflictResolver = (() => {
  const $ = (id) => document.getElementById(id);
  const WARN =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  let repoId = null;
  let info = { kind: "none", ours: "", theirs: "", files: [] };
  let activeFile = null;
  let segments = null; // parsed segments of the active file's merged content

  async function open(id) {
    repoId = id;
    activeFile = null; segments = null;
    document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === "page-conflicts"));
    $("conflictMain").innerHTML = `<div class="conflict-empty">Loading…</div>`;
    await refresh();
    if (info.files.length) selectFile(info.files[0]);
  }

  async function refresh() {
    try { info = await DC.gitConflicts(repoId); }
    catch (e) { console.error("gitConflicts failed", e); info = { kind: "none", ours: "", theirs: "", files: [] }; }
    renderContext();
    renderFileList();
    updateDone();
  }

  function renderContext() {
    const repo = repos.find((r) => r.id === repoId);
    const name = repo ? repo.name : "";
    const verb = { rebase: "Rebasing", "cherry-pick": "Cherry-picking", revert: "Reverting" }[info.kind] || "Merging";
    const el = $("conflictContext");
    if (!info.files.length) el.textContent = name ? `No conflicts in ${name}.` : "No conflicts.";
    else el.innerHTML = `${escapeHtml(name)} · ${verb} <b>${escapeHtml(info.theirs)}</b> into <b>${escapeHtml(info.ours)}</b> · ${info.files.length} file${info.files.length === 1 ? "" : "s"} left`;
  }

  function renderFileList() {
    const list = $("conflictFiles");
    if (!info.files.length) { list.innerHTML = `<div class="conflict-empty" style="padding:24px">All conflicts resolved.</div>`; return; }
    list.innerHTML = "";
    info.files.forEach((f) => {
      const slash = f.lastIndexOf("/");
      const name = slash >= 0 ? f.slice(slash + 1) : f;
      const dir = slash >= 0 ? f.slice(0, slash + 1) : "";
      const row = document.createElement("div");
      row.className = "cfl-row" + (f === activeFile ? " active" : "");
      row.innerHTML = `<span class="cfl-ico">${WARN}</span><span class="cfl-name" title="${escapeHtml(f)}">${dir ? `<span class="cfl-dir">${escapeHtml(dir)}</span>` : ""}${escapeHtml(name)}</span><span class="cfl-badge">C</span>`;
      row.addEventListener("click", () => selectFile(f));
      list.appendChild(row);
    });
  }

  function updateDone() {
    const done = $("conflictDoneBtn");
    if (done) done.disabled = !(info.kind !== "none" && info.files.length === 0);
    const ab = $("conflictAbortBtn");
    if (ab) ab.disabled = info.kind === "none";
  }

  async function selectFile(f) {
    activeFile = f;
    renderFileList();
    $("conflictMain").innerHTML = `<div class="conflict-empty">Loading…</div>`;
    let cf;
    try { cf = await DC.gitConflictFile(repoId, f); }
    catch (e) { $("conflictMain").innerHTML = `<div class="conflict-empty">${escapeHtml(String(e))}</div>`; return; }
    if (cf.binary) { renderBinary(); return; }
    segments = parseConflicts(cf.merged);
    renderFile();
  }

  // Split the marked working-tree content into context + conflict segments.
  function parseConflicts(text) {
    const lines = text.split("\n");
    const segs = []; let ctx = []; let i = 0;
    const flush = () => { if (ctx.length) { segs.push({ type: "context", lines: ctx }); ctx = []; } };
    while (i < lines.length) {
      if (lines[i].startsWith("<<<<<<<")) {
        flush();
        const ours = [], theirs = []; i++;
        while (i < lines.length && !lines[i].startsWith("|||||||") && !lines[i].startsWith("=======")) ours.push(lines[i++]);
        if (i < lines.length && lines[i].startsWith("|||||||")) { i++; while (i < lines.length && !lines[i].startsWith("=======")) i++; }
        if (i < lines.length && lines[i].startsWith("=======")) i++;
        while (i < lines.length && !lines[i].startsWith(">>>>>>>")) theirs.push(lines[i++]);
        if (i < lines.length && lines[i].startsWith(">>>>>>>")) i++;
        segs.push({ type: "conflict", ours, theirs, choice: null });
      } else { ctx.push(lines[i++]); }
    }
    flush();
    return segs;
  }

  function lang() { return (window.Highlighter && window.Highlighter.langForPath(activeFile)) || ""; }
  function hl(line) { return window.Highlighter && window.Highlighter.line ? window.Highlighter.line(line, lang()) : escapeHtml(line); }
  function codeLines(arr) { return arr.map((l) => `<div class="cv-line">${l === "" ? "&nbsp;" : hl(l)}</div>`).join(""); }

  function renderFile() {
    const conflicts = segments.filter((s) => s.type === "conflict");
    const remaining = conflicts.filter((s) => !s.choice).length;
    const bar =
      `<div class="cv-bar">` +
        `<span class="cv-path" title="${escapeHtml(activeFile)}">${escapeHtml(activeFile)}</span>` +
        `<span class="cv-count">${conflicts.length - remaining}/${conflicts.length} resolved</span>` +
        `<div class="cv-actions">` +
          `<button class="btn btn-ghost btn-sm" data-act="ours">Take current</button>` +
          `<button class="btn btn-ghost btn-sm" data-act="theirs">Take incoming</button>` +
          `<button class="btn btn-ghost btn-sm" data-act="vscode" title="Open in VS Code">VS Code</button>` +
          `<button class="btn btn-primary btn-sm" data-act="save" ${remaining ? "disabled" : ""}>Mark resolved</button>` +
        `</div>` +
      `</div>`;
    let body = "";
    segments.forEach((s, idx) => { body += s.type === "context" ? `<div>${codeLines(s.lines)}</div>` : renderBlock(s, idx); });
    const main = $("conflictMain");
    main.innerHTML = bar + `<div class="cv-code">${body}</div>`;
    main.querySelector(".cv-actions").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]"); if (!btn) return;
      const act = btn.dataset.act;
      if (act === "ours" || act === "theirs") resolveSide(act);
      else if (act === "vscode") DC.openInVscode(repoId + "/" + activeFile).catch(() => DC.openInVscode(repoId).catch(() => {}));
      else if (act === "save") saveResolution();
    });
    main.querySelector(".cv-code").addEventListener("click", onBlockClick);
  }

  function renderBlock(s, idx) {
    if (s.choice) {
      const chosen = s.choice === "ours" ? s.ours : s.choice === "theirs" ? s.theirs : s.ours.concat(s.theirs);
      const label = s.choice === "ours" ? "Current change" : s.choice === "theirs" ? "Incoming change" : "Both changes";
      return `<div class="cv-block" data-idx="${idx}">` +
        `<div class="cv-side-label resolved"><span>✓ ${label}</span><span class="cv-side-actions"><span class="cv-undo" data-undo="${idx}">Undo</span></span></div>` +
        `<div class="cv-side-lines">${codeLines(chosen)}</div></div>`;
    }
    return `<div class="cv-block" data-idx="${idx}">` +
      `<div class="cv-side-label ours"><span>Current change · ${escapeHtml(info.ours)}</span><span class="cv-side-actions">` +
        `<button class="cv-mini ours" data-pick="ours" data-idx="${idx}">Accept current</button>` +
        `<button class="cv-mini" data-pick="both" data-idx="${idx}">Accept both</button></span></div>` +
      `<div class="cv-side-lines ours">${codeLines(s.ours)}</div>` +
      `<div class="cv-sep"></div>` +
      `<div class="cv-side-label theirs"><span>Incoming change · ${escapeHtml(info.theirs)}</span><span class="cv-side-actions">` +
        `<button class="cv-mini theirs" data-pick="theirs" data-idx="${idx}">Accept incoming</button></span></div>` +
      `<div class="cv-side-lines theirs">${codeLines(s.theirs)}</div></div>`;
  }

  function onBlockClick(e) {
    const pick = e.target.closest("[data-pick]");
    if (pick) { segments[+pick.dataset.idx].choice = pick.dataset.pick; updateBlock(+pick.dataset.idx); return; }
    const undo = e.target.closest("[data-undo]");
    if (undo) { segments[+undo.dataset.undo].choice = null; updateBlock(+undo.dataset.undo); }
  }

  // Re-render only the affected conflict block (keeps scroll position) and
  // refresh the resolved counter + "Mark resolved" button.
  function updateBlock(idx) {
    const main = $("conflictMain");
    const el = main.querySelector(`.cv-block[data-idx="${idx}"]`);
    if (el) el.outerHTML = renderBlock(segments[idx], idx);
    const conflicts = segments.filter((s) => s.type === "conflict");
    const remaining = conflicts.filter((s) => !s.choice).length;
    const countEl = main.querySelector(".cv-count");
    if (countEl) countEl.textContent = `${conflicts.length - remaining}/${conflicts.length} resolved`;
    const save = main.querySelector('[data-act="save"]');
    if (save) save.disabled = remaining > 0;
  }

  function buildContent() {
    const out = [];
    segments.forEach((s) => {
      if (s.type === "context") out.push(...s.lines);
      else if (s.choice === "ours") out.push(...s.ours);
      else if (s.choice === "theirs") out.push(...s.theirs);
      else if (s.choice === "both") out.push(...s.ours, ...s.theirs);
    });
    return out.join("\n");
  }

  function renderBinary() {
    $("conflictMain").innerHTML =
      `<div class="cv-bar"><span class="cv-path">${escapeHtml(activeFile)}</span><div class="cv-actions">` +
        `<button class="btn btn-ghost btn-sm" id="cvBinOurs">Keep current</button>` +
        `<button class="btn btn-ghost btn-sm" id="cvBinTheirs">Take incoming</button></div></div>` +
      `<div class="cv-binary">Binary file — choose which version to keep.</div>`;
    $("cvBinOurs").addEventListener("click", () => resolveSide("ours"));
    $("cvBinTheirs").addEventListener("click", () => resolveSide("theirs"));
  }

  async function resolveSide(side) {
    try { info = await DC.resolveConflict(repoId, activeFile, side, null); afterResolve(); }
    catch (e) { Modal.alert({ title: "Couldn't resolve", message: String(e) }); }
  }
  async function saveResolution() {
    try { info = await DC.resolveConflict(repoId, activeFile, null, buildContent()); afterResolve(); }
    catch (e) { Modal.alert({ title: "Couldn't save resolution", message: String(e) }); }
  }
  function afterResolve() {
    activeFile = info.files[0] || null;
    renderContext(); renderFileList(); updateDone();
    if (activeFile) selectFile(activeFile);
    else $("conflictMain").innerHTML = `<div class="conflict-empty">All conflicts resolved. Click <b>Complete</b> to finish.</div>`;
  }

  async function complete() {
    try { await DC.conflictContinue(repoId); finishBack(); }
    catch (e) { Modal.alert({ title: "Couldn't complete", message: String(e) }); }
  }
  async function abort() {
    const kind = info.kind === "none" ? "merge" : info.kind;
    const ok = await Modal.confirm({ title: `Abort ${kind}?`, message: "This discards the in-progress operation and restores your branch to its previous state.", confirmText: "Abort", danger: true });
    if (!ok) return;
    try { await DC.conflictAbort(repoId); finishBack(); }
    catch (e) { Modal.alert({ title: "Couldn't abort", message: String(e) }); }
  }
  function finishBack() {
    const id = repoId;
    showPage("changes");
    if (window.ChangesPage && window.ChangesPage.openRepoById) window.ChangesPage.openRepoById(id);
  }

  $("conflictBackBtn") && $("conflictBackBtn").addEventListener("click", () => showPage("changes"));
  $("conflictAbortBtn") && $("conflictAbortBtn").addEventListener("click", abort);
  $("conflictDoneBtn") && $("conflictDoneBtn").addEventListener("click", complete);

  return { open };
})();
window.ConflictResolver = ConflictResolver;
