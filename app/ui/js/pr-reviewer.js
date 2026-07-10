// ============================================================================
// PR Review page — full-screen file list + diff (with inline comment threads)
// + a Conversation tab (general discussion), plus Approve/Request changes/
// Comment review submission. Opened from the Pull Requests tab's "Review"
// button. Mirrors ConflictResolver's module shape (own `.page`, own `open()`).
// ============================================================================
const PrReviewer = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = escapeHtml;

  let repoId = null;
  let pr = null;           // the PullRequest object passed in from the PR tab
  let files = [];          // FileChange[] for the PR's base...head diff
  let threads = [];        // PrThread[] — general + inline, refreshed after any mutation
  let activeFile = null;
  let activeTab = "files"; // "files" | "conversation"
  let collapsed = new Set(); // collapsed folders in the file tree
  let busy = false;
  let returnPage = "changes"; // page to go back to — wherever "Review" was clicked from
  let loadGen = 0;

  function threadsFor(path) {
    return threads.filter((t) => t.path === path);
  }
  function generalThreads() {
    return threads.filter((t) => t.path == null);
  }

  function syncTabState(tab) {
    document.querySelectorAll(".prr-tab").forEach((t) => {
      const active = t.dataset.prrtab === tab;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", String(active));
      t.tabIndex = active ? 0 : -1;
    });
    $("prrLayout").dataset.tab = tab;
    $("prrFilesView").hidden = tab !== "files";
    $("prrConversationView").hidden = tab !== "conversation";
  }

  async function open(id, pullRequest, opts) {
    const gen = ++loadGen;
    repoId = id;
    pr = pullRequest;
    busy = false;
    returnPage = (opts && opts.returnTo) || "changes";
    files = []; threads = []; activeFile = null; activeTab = "files"; collapsed = new Set();
    document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === "page-pr-review"));
    syncTabState("files");
    renderHeader();
    $("prrFiles").innerHTML = `<div class="changes-empty">Loading…</div>`;
    showDiffEmpty("Loading…");
    await Promise.all([loadFiles(gen, id, pullRequest), loadThreads(gen, id, pullRequest)]);
    if (gen !== loadGen || repoId !== id || pr !== pullRequest) return;
    if (files.length) selectFile(files[0].path);
    else showDiffEmpty("This pull request has no file changes.");
  }

  function renderHeader() {
    $("prrTitle").textContent = pr.title || `Pull request #${pr.id}`;
    $("prrMeta").innerHTML = `${esc(pr.repo || "")} #${esc(String(pr.id))} · by ${esc(pr.author || "")} · <code>${esc(pr.branch)}</code> → <code>${esc(pr.base)}</code>`;
  }

  async function loadFiles(gen = loadGen, forRepo = repoId, forPr = pr) {
    try {
      const cs = await DC.prChanges(forRepo, forPr.base, forPr.branch);
      if (gen !== loadGen || repoId !== forRepo || pr !== forPr) return;
      files = cs.files || [];
    } catch (e) {
      if (gen !== loadGen || repoId !== forRepo || pr !== forPr) return;
      console.error("prChanges failed", e);
      files = [];
    }
    renderFileList();
  }

  async function loadThreads(gen = loadGen, forRepo = repoId, forPr = pr) {
    try {
      const data = await DC.fetchPrThreads(forRepo, forPr.id);
      if (gen !== loadGen || repoId !== forRepo || pr !== forPr) return;
      threads = data;
    } catch (e) {
      if (gen !== loadGen || repoId !== forRepo || pr !== forPr) return;
      console.error("fetchPrThreads failed", e);
      threads = [];
    }
    renderFileList();
    if (activeTab === "conversation") renderConversation();
    else if (activeFile) renderCurrentDiff();
  }

  // Same tree/list file explorer as the Changes page (renderFileTree, global).
  function renderFileList() {
    const list = $("prrFiles");
    if (!files.length) {
      list.innerHTML = `<div class="changes-empty">No file changes.</div>`;
      return;
    }
    renderFileTree(list, {
      files,
      collapsed,
      viewMode: "tree",
      group: null,
      activeFile,
      activeGroup: null,
      onSelect: (path) => selectFile(path),
      rerender: renderFileList,
      fileBadge: (path) => {
        const n = threadsFor(path).length;
        return n ? `<span class="prr-thread-badge">${n}</span>` : "";
      },
    });
  }

  function showDiffEmpty(msg) {
    $("prrDiffEmpty").textContent = msg;
    $("prrDiffEmpty").hidden = false;
    $("prrDiffContent").hidden = true;
  }

  async function selectFile(path) {
    const gen = loadGen;
    const forRepo = repoId;
    const forPr = pr;
    activeFile = path;
    // Switch to the Files view directly (without going through switchTab,
    // which would call back into selectFile via renderCurrentDiff).
    if (activeTab !== "files") {
      activeTab = "files";
      syncTabState("files");
    }
    renderFileList();
    showDiffEmpty("Loading diff…");
    try {
      const d = await DC.prFileDiff(forRepo, forPr.base, forPr.branch, path);
      if (gen !== loadGen || repoId !== forRepo || pr !== forPr || activeFile !== path) return;
      renderDiff(d);
    } catch (e) {
      if (gen !== loadGen || repoId !== forRepo || pr !== forPr || activeFile !== path) return;
      showDiffEmpty(String(e));
    }
  }

  function renderCurrentDiff() {
    if (!activeFile) return;
    selectFile(activeFile);
  }

  function lang(path) { return (window.Highlighter && Highlighter.langForPath(path)) || ""; }
  function hl(s, path) { return window.Highlighter ? Highlighter.line(s, lang(path)) : esc(s); }

  function diffHeadHtml(d) {
    return `<span class="diff-path" title="${esc(d.path)}">${esc(d.path)}</span><span class="diff-adds">+${d.additions}</span><span class="diff-dels">−${d.deletions}</span>`;
  }

  function renderDiff(d) {
    $("prrDiffEmpty").hidden = true;
    $("prrDiffContent").hidden = false;
    $("prrDiffHead").innerHTML = diffHeadHtml(d);
    const bodyEl = $("prrDiffBody");
    if (d.oldImage || d.newImage) {
      bodyEl.innerHTML = `<div class="diff-binary">Image file — open the Changes page to preview it.</div>`;
      return;
    }
    if (d.binary) {
      bodyEl.innerHTML = `<div class="diff-binary">Binary file — no text diff to display.</div>`;
      return;
    }
    if (!d.hunks.length) {
      bodyEl.innerHTML = `<div class="diff-binary">No textual changes to display.</div>`;
      return;
    }
    const rows = [];
    d.hunks.forEach((h) => {
      rows.push(`<div class="diff-hunk-head">${esc(h.header)}</div>`);
      h.lines.forEach((l) => {
        const cls = l.kind === "add" ? "add" : l.kind === "del" ? "del" : "";
        const oldN = l.oldLineno != null ? l.oldLineno : "";
        const newN = l.newLineno != null ? l.newLineno : "";
        const body = l.content ? hl(l.content, d.path) : "&nbsp;";
        const canComment = l.newLineno != null;
        rows.push(
          `<div class="diff-line ${cls}"${canComment ? ` data-line="${l.newLineno}"` : ""}>` +
            `<span class="diff-gutter"><span>${oldN}</span><span>${newN}</span>${canComment ? `<button class="prr-line-add" type="button" data-add-line="${l.newLineno}" title="Add a comment on this line">+</button>` : ""}</span>` +
            `<span class="diff-text">${body}</span></div>`
        );
      });
    });
    bodyEl.innerHTML = `<div class="diff-code" id="prrDiffCode">${rows.join("")}</div>`;

    // Second pass: inject existing threads + wire the "+" composer trigger.
    const code = $("prrDiffCode");
    threadsFor(d.path).forEach((t) => {
      if (t.line == null) return;
      const lineEl = code.querySelector(`.diff-line[data-line="${t.line}"]`);
      if (lineEl) lineEl.insertAdjacentHTML("afterend", threadHtml(t));
    });
    wireThreadActions(code);
    on(code, ".prr-line-add", "click", (btn) => openNewThreadComposer(code, d.path, Number(btn.dataset.addLine)));
  }

  function commentHtml(c) {
    const initials = (c.author || "?").slice(0, 2).toUpperCase();
    return `<div class="prr-comment">
      <div class="prr-comment-meta"><span class="avatar">${esc(initials)}</span><span class="prr-comment-author">${esc(c.author)}</span><span>${esc(c.created)}</span></div>
      <div class="prr-comment-body">${mdLite(c.body)}</div>
    </div>`;
  }

  function threadHtml(t) {
    const resolveBtn = t.canResolve
      ? `<button class="btn btn-ghost btn-sm" data-resolve-thread="${esc(t.id)}" data-resolved="${t.resolved ? "0" : "1"}">${t.resolved ? "Reopen" : "Resolve"}</button>`
      : "";
    return `<div class="prr-thread${t.resolved ? " resolved" : ""}" data-thread-id="${esc(t.id)}">
      <div class="prr-thread-head">
        <span class="prr-thread-path">${t.path ? esc(t.path) + (t.line != null ? ":" + t.line : "") : "General discussion"}</span>
        ${resolveBtn}
      </div>
      ${t.comments.map(commentHtml).join("")}
      <div class="prr-composer">
        <textarea placeholder="Reply…" data-reply-for="${esc(t.id)}"></textarea>
        <div class="prr-composer-actions"><button class="btn btn-primary btn-sm" data-reply-submit="${esc(t.id)}">Reply</button></div>
      </div>
    </div>`;
  }

  function wireThreadActions(scope) {
    on(scope, "[data-resolve-thread]", "click", (btn) => resolveThread(btn.dataset.resolveThread, btn.dataset.resolved === "1"));
    on(scope, "[data-reply-submit]", "click", (btn) => {
      const id = btn.dataset.replySubmit;
      const ta = scope.querySelector(`textarea[data-reply-for="${CSS.escape(id)}"]`);
      const body = (ta.value || "").trim();
      if (!body) return;
      postComment({ body, threadId: id });
    });
  }

  function openNewThreadComposer(code, path, line) {
    const existing = code.querySelector(`.prr-new-composer[data-line="${line}"]`);
    if (existing) { existing.querySelector("textarea").focus(); return; }
    const lineEl = code.querySelector(`.diff-line[data-line="${line}"]`);
    if (!lineEl) return;
    // Insert after the line (and after any existing thread already anchored there).
    let after = lineEl;
    let next = after.nextElementSibling;
    while (next && next.classList.contains("prr-thread")) { after = next; next = after.nextElementSibling; }
    after.insertAdjacentHTML(
      "afterend",
      `<div class="prr-thread prr-new-composer" data-line="${line}">
        <div class="prr-composer">
          <textarea placeholder="Add a comment…" autofocus></textarea>
          <div class="prr-composer-actions">
            <button class="btn btn-ghost btn-sm" data-cancel-new>Cancel</button>
            <button class="btn btn-primary btn-sm" data-submit-new>Comment</button>
          </div>
        </div>
      </div>`
    );
    const box = code.querySelector(`.prr-new-composer[data-line="${line}"]`);
    const ta = box.querySelector("textarea");
    ta.focus();
    box.querySelector("[data-cancel-new]").addEventListener("click", () => box.remove());
    box.querySelector("[data-submit-new]").addEventListener("click", () => {
      const body = (ta.value || "").trim();
      if (!body) return;
      postComment({ body, path, line });
    });
  }

  // Unified comment submit — reply (threadId set), new inline thread (path+line
  // set), or new general comment (neither set, used by the Conversation tab).
  async function postComment({ body, threadId, path, line }) {
    if (busy) return;
    const gen = loadGen;
    const forRepo = repoId;
    const forPr = pr;
    busy = true;
    try {
      const data = await DC.postPrComment(forRepo, forPr.id, body, threadId || null, path || null, line ?? null);
      if (gen !== loadGen || repoId !== forRepo || pr !== forPr) return;
      threads = data;
      renderFileList();
      if (activeTab === "conversation") renderConversation();
      else if (activeFile) renderCurrentDiff();
    } catch (e) {
      if (gen !== loadGen || repoId !== forRepo || pr !== forPr) return;
      console.error("postPrComment failed", e);
      await Modal.alert({ title: "Couldn't post comment", message: String(e) });
    } finally {
      if (gen === loadGen && repoId === forRepo && pr === forPr) busy = false;
    }
  }

  async function resolveThread(threadId, resolved) {
    if (busy) return;
    const gen = loadGen;
    const forRepo = repoId;
    const forPr = pr;
    busy = true;
    try {
      const data = await DC.resolvePrThread(forRepo, forPr.id, threadId, resolved);
      if (gen !== loadGen || repoId !== forRepo || pr !== forPr) return;
      threads = data;
      renderFileList();
      if (activeTab === "conversation") renderConversation();
      else if (activeFile) renderCurrentDiff();
    } catch (e) {
      if (gen !== loadGen || repoId !== forRepo || pr !== forPr) return;
      console.error("resolvePrThread failed", e);
      await Modal.alert({ title: "Couldn't update thread", message: String(e) });
    } finally {
      if (gen === loadGen && repoId === forRepo && pr === forPr) busy = false;
    }
  }

  function renderConversation() {
    const gen = generalThreads();
    const composer = `<div class="prr-thread-general">
      <div class="prr-composer">
        <textarea placeholder="Write a comment…" id="prrGeneralInput"></textarea>
        <div class="prr-composer-actions"><button class="btn btn-primary btn-sm" id="prrGeneralSubmit">Comment</button></div>
      </div>
    </div>`;
    const body = gen.length
      ? gen.map((t) => `<div class="prr-thread-general">${t.comments.map(commentHtml).join("")}</div>`).join("")
      : `<div class="changes-empty">No comments yet — start the discussion below.</div>`;
    $("prrConversationView").innerHTML = `<div class="prr-conversation">${body}${composer}</div>`;
    $("prrGeneralSubmit").addEventListener("click", () => {
      const ta = $("prrGeneralInput");
      const val = (ta.value || "").trim();
      if (!val) return;
      postComment({ body: val }).then(() => { if ($("prrGeneralInput")) $("prrGeneralInput").value = ""; });
    });
  }

  function switchTab(tab) {
    activeTab = tab;
    syncTabState(tab);
    if (tab === "conversation") renderConversation();
    else if (activeFile) renderCurrentDiff();
    else showDiffEmpty("This pull request has no file changes.");
  }

  async function openReviewDialog(type) {
    if (busy) return;
    const titles = { approve: "Approve pull request", changes: "Request changes", comment: "Add a review comment" };
    const confirmLabels = { approve: "Approve", changes: "Request changes", comment: "Submit" };
    const requireBody = type === "comment";
    const res = await openFieldsDialogArea({
      title: titles[type],
      label: requireBody ? "Comment (required)" : "Summary comment (optional)",
      confirmText: confirmLabels[type],
      danger: type === "changes",
      required: requireBody,
    });
    if (res === null) return;
    const gen = loadGen;
    const forRepo = repoId;
    const forPr = pr;
    busy = true;
    try {
      const data = await DC.submitPrReview(forRepo, forPr.id, type, res);
      if (gen !== loadGen || repoId !== forRepo || pr !== forPr) return;
      threads = data;
      renderFileList();
      if (activeTab === "conversation") renderConversation();
      await Modal.alert({ title: "Review submitted", message: titles[type] + " — done." });
    } catch (e) {
      if (gen !== loadGen || repoId !== forRepo || pr !== forPr) return;
      console.error("submitPrReview failed", e);
      await Modal.alert({ title: "Couldn't submit review", message: String(e) });
    } finally {
      if (gen === loadGen && repoId === forRepo && pr === forPr) busy = false;
    }
  }

  // A single-textarea confirm dialog (Modal.custom has no built-in textarea
  // prompt). Resolves to the trimmed text, or null if cancelled.
  function openFieldsDialogArea({ title, label, confirmText, danger, required }) {
    return Modal.custom({
      title,
      render: (body, foot, close, mkBtn) => {
        body.innerHTML = `
          <div class="form-row">
            <label class="form-label" for="prrReviewBody">${esc(label)}</label>
            <textarea class="modal-input" id="prrReviewBody" rows="4" spellcheck="true"></textarea>
          </div>
          <div class="modal-error" id="prrReviewErr"></div>`;
        const ta = body.querySelector("#prrReviewBody");
        const errEl = body.querySelector("#prrReviewErr");
        const cancel = mkBtn("btn-ghost", "Cancel");
        cancel.addEventListener("click", () => close(null));
        const ok = mkBtn(danger ? "btn-danger" : "btn-primary", confirmText);
        ok.addEventListener("click", () => {
          const val = (ta.value || "").trim();
          if (required && !val) { errEl.textContent = "Enter a comment."; return; }
          close(val);
        });
        foot.append(cancel, ok);
        setTimeout(() => ta.focus(), 40);
      },
    });
  }

  on(document, ".prr-tab", "click", (t) => switchTab(t.dataset.prrtab));
  on(document, ".prr-tab", "keydown", (t, e) => {
    const tabs = [...document.querySelectorAll(".prr-tab")];
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
  $("prrBackBtn") && $("prrBackBtn").addEventListener("click", () => showPage(returnPage));
  $("prrOpenBtn") && $("prrOpenBtn").addEventListener("click", () => { if (pr && pr.url) DC.openUrl(pr.url); });
  $("prrApproveBtn") && $("prrApproveBtn").addEventListener("click", () => openReviewDialog("approve"));
  $("prrChangesBtn") && $("prrChangesBtn").addEventListener("click", () => openReviewDialog("changes"));
  $("prrCommentReviewBtn") && $("prrCommentReviewBtn").addEventListener("click", () => openReviewDialog("comment"));

  return { open };
})();
window.PrReviewer = PrReviewer;

// Restore the last-viewed page across reloads (right-click → Reload keeps you here).
try {
  const savedPage = localStorage.getItem("dc.page");
  if (savedPage && [...navItems].some((n) => n.dataset.page === savedPage)) {
    showPage(savedPage);
  }
} catch (e) {}
