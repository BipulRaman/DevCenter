// ============================================================================
// PR Review page — full-screen file list + diff (with inline comment threads)
// + a Conversation tab (general discussion), plus Approve/Request changes/
// Comment review submission. Opened from the Pull Requests tab's "Review"
// button. Mirrors ConflictResolver's module shape (own `.page`, own `open()`).
// ============================================================================
const PrReviewer = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = escapeHtml;

  const OPEN_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';
  const PUBLISH_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
  // Vote states, normalized to Azure's scale (GitHub uses only 10/0/-10).
  // `btn` is a compact label shown on the button (full `label` stays in the menu).
  const VOTES = {
    "10": { label: "Approved", cls: "ok" },
    "5": { label: "Approved with suggestions", cls: "ok", btn: "Approved+" },
    "0": { label: "No vote", cls: "muted" },
    "-5": { label: "Waiting for author", cls: "warn", btn: "Waiting" },
    "-10": { label: "Rejected", cls: "danger" },
  };
  let repoId = null;
  let pr = null;           // the PullRequest object passed in from the PR tab
  let provider = "github"; // "github" | "azure" — drives which review options show
  let myVote = 0;          // the signed-in user's current vote (Azure scale)
  let files = [];          // FileChange[] for the PR's base...head diff
  let loadError = null;    // set when the base...head diff couldn't be computed (e.g. branches not fetched)
  let threads = [];        // PrThread[] — general + inline, refreshed after any mutation
  let activeFile = null;
  let activeTab = "files"; // "files" | "conversation"
  let wholeFile = false;   // when true, the diff shows the entire file, not just changed hunks
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
    // Provider decides the review options (Azure's 5 vote states vs GitHub's 3).
    provider = ((typeof repos !== "undefined" && repos.find((r) => r.id === id)) || {}).provider || "github";
    myVote = 0;
    files = []; loadError = null; threads = []; activeFile = null; activeTab = "files"; wholeFile = false; collapsed = new Set();
    document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === "page-pr-review"));
    syncTabState("files");
    renderHeader();
    // Reflect the signed-in user's current vote in the action bar once known.
    DC.prMyVote(id, pullRequest.id)
      .then((v) => { if (gen === loadGen && repoId === id && pr === pullRequest) { myVote = v || 0; renderHeader(); } })
      .catch(() => {});
    $("prrFiles").innerHTML = `<div class="changes-empty">Loading…</div>`;
    showDiffEmpty("Loading…");
    await Promise.all([loadFiles(gen, id, pullRequest), loadThreads(gen, id, pullRequest)]);
    if (gen !== loadGen || repoId !== id || pr !== pullRequest) return;
    if (files.length) selectFile(files[0].path);
    else showDiffEmpty(loadError || "This pull request has no file changes.");
  }

  function renderHeader() {
    $("prrTitle").textContent = pr.title || `Pull request #${pr.id}`;
    $("prrMeta").innerHTML = `
      <span class="prr-meta-row">
        <span class="prr-repo">${esc(pr.repo || "")}</span>
        <span class="prr-num">#${esc(String(pr.id))}</span>
        <span class="prr-dot">·</span>
        <span class="prr-by">${esc(pr.author || "")}</span>
      </span>
      <span class="prr-branches">
        <span class="prr-branch-name" title="${esc(pr.branch)}">${esc(pr.branch)}</span>
        <svg class="prr-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
        <span class="prr-branch-name base" title="${esc(pr.base)}">${esc(pr.base)}</span>
      </span>`;
    renderActions();
  }

  // A single menu row inside the Azure "Vote" dropdown.
  function voteOpt(type, label, val) {
    const active = myVote === val;
    const cls = (VOTES[String(val)] || {}).cls || "";
    return `<button class="prr-vote-item${active ? " active" : ""}" data-prr="${type}" role="menuitem" type="button">
      <span class="prr-vote-dot ${cls}"></span><span class="prr-vote-label">${esc(label)}</span>${active ? '<span class="prr-vote-check">✓</span>' : ""}</button>`;
  }

  // Build the provider-aware review action bar, reflecting the current vote.
  function renderActions() {
    const host = $("prrActions");
    if (!host) return;
    const rv = prReviewChip(pr);
    const statusPill = `<span class="prr-status ${rv.cls}" title="Overall review status"><span class="prr-vote-dot ${rv.cls}"></span>${rv.label}</span>`;
    const openBtn = `<button class="btn btn-ghost btn-sm" data-prr="open" type="button">${OPEN_ICON}Open</button>`;
    const commentBtn = `<button class="btn btn-ghost btn-sm" data-prr="comment" type="button">Comment</button>`;
    // Draft PRs can't be voted on — they offer a "Publish" action instead.
    const isDraft = pr.status === "draft";
    let html;
    if (isDraft) {
      // A draft shows Publish (mark ready for review) in place of the vote control.
      html = `${statusPill}${openBtn}${commentBtn}
        <button class="btn btn-primary btn-sm prr-publish-btn" data-prr="publish" type="button" title="Mark this draft ready for review">${PUBLISH_ICON}Publish</button>`;
    } else if (provider === "azure") {
      const voted = myVote !== 0;
      const cur = VOTES[String(myVote)] || VOTES["0"];
      html = `${statusPill}${openBtn}${commentBtn}
        <div class="prr-vote" id="prrVote">
          <button class="btn ${voted ? "btn-primary" : "btn-ghost"} btn-sm prr-vote-btn" id="prrVoteBtn" type="button" aria-haspopup="true" aria-expanded="false">
            <span class="prr-vote-dot ${cur.cls}"></span><span>Vote</span>
            <svg class="caret" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="prr-vote-menu" id="prrVoteMenu" role="menu" hidden>
            ${voteOpt("approve", "Approve", 10)}
            ${voteOpt("approve_suggestions", "Approve with suggestions", 5)}
            ${voteOpt("wait", "Wait for author", -5)}
            ${voteOpt("reject", "Reject", -10)}
            <div class="prr-vote-sep"></div>
            <button class="prr-vote-item" data-prr="reset" role="menuitem" type="button"><span class="prr-vote-dot muted"></span><span class="prr-vote-label">Reset feedback</span></button>
          </div>
        </div>`;
    } else {
      // GitHub: three fixed review actions; the current one is highlighted.
      const approved = myVote >= 5;
      const rejected = myVote <= -5;
      html = `${statusPill}${openBtn}${commentBtn}
        <button class="btn btn-danger btn-sm${rejected ? " is-current" : ""}" data-prr="changes" type="button">${rejected ? "Changes requested ✓" : "Request changes"}</button>
        <button class="btn btn-primary btn-sm${approved ? " is-current" : ""}" data-prr="approve" type="button">${approved ? "Approved ✓" : "Approve"}</button>`;
    }
    host.innerHTML = html;
    on(host, "[data-prr]", "click", (el) => {
      const act = el.dataset.prr;
      closeVoteMenu();
      if (act === "open") { if (pr && pr.url) DC.openUrl(pr.url); return; }
      if (act === "publish") { publishDraft(); return; }
      submitReview(act);
    });
    const voteBtn = $("prrVoteBtn");
    if (voteBtn) voteBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleVoteMenu(); });
  }

  function onDocClickVote(e) { if (!e.target.closest("#prrVote")) closeVoteMenu(); }
  function closeVoteMenu() {
    const m = $("prrVoteMenu"), b = $("prrVoteBtn");
    if (m) m.hidden = true;
    if (b) b.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onDocClickVote, true);
  }
  function toggleVoteMenu() {
    const m = $("prrVoteMenu"), b = $("prrVoteBtn");
    if (!m) return;
    const willOpen = m.hidden;
    m.hidden = !willOpen;
    if (b) b.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) setTimeout(() => document.addEventListener("click", onDocClickVote, true), 0);
    else document.removeEventListener("click", onDocClickVote, true);
  }

  async function loadFiles(gen = loadGen, forRepo = repoId, forPr = pr) {
    loadError = null;
    try {
      const cs = await DC.prChanges(forRepo, forPr.base, forPr.branch);
      if (gen !== loadGen || repoId !== forRepo || pr !== forPr) return;
      files = cs.files || [];
    } catch (e) {
      if (gen !== loadGen || repoId !== forRepo || pr !== forPr) return;
      // The PR's base/head branches are often only present locally after a
      // fetch. If they're missing, fetch once and retry before giving up.
      const msg = String((e && e.message) || e || "");
      if (/not found locally|Fetch the repository/i.test(msg)) {
        try {
          $("prrFiles").innerHTML = `<div class="changes-empty">Fetching latest…</div>`;
          showDiffEmpty("Fetching latest…");
          await DC.fetchRepo(forRepo);
          if (gen !== loadGen || repoId !== forRepo || pr !== forPr) return;
          const cs = await DC.prChanges(forRepo, forPr.base, forPr.branch);
          if (gen !== loadGen || repoId !== forRepo || pr !== forPr) return;
          files = cs.files || [];
          renderFileList();
          return;
        } catch (e2) {
          if (gen !== loadGen || repoId !== forRepo || pr !== forPr) return;
          console.error("prChanges retry after fetch failed", e2);
          files = [];
          loadError = String((e2 && e2.message) || e2 || "") ||
            "Couldn't load this pull request's changes. Fetch the repository and try again.";
        }
      } else {
        console.error("prChanges failed", e);
        files = [];
        loadError = msg || "Couldn't load this pull request's changes.";
      }
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
      list.innerHTML = `<div class="changes-empty">${esc(loadError || "No file changes.")}</div>`;
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
      const d = await DC.prFileDiff(forRepo, forPr.base, forPr.branch, path, wholeFile ? 100000 : null);
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
    return `<span class="diff-path" title="${esc(d.path)}">${esc(d.path)}</span><span class="diff-adds">+${d.additions}</span><span class="diff-dels">−${d.deletions}</span>`
      + `<button class="btn btn-ghost btn-sm diff-expand-btn" id="prrExpandBtn" type="button" title="${wholeFile ? "Show only changed lines" : "Show the whole file"}">${wholeFile ? "Collapse" : "Whole file"}</button>`;
  }

  function renderDiff(d) {
    $("prrDiffEmpty").hidden = true;
    $("prrDiffContent").hidden = false;
    $("prrDiffHead").innerHTML = diffHeadHtml(d);
    const expandBtn = $("prrExpandBtn");
    if (expandBtn) expandBtn.addEventListener("click", () => { wholeFile = !wholeFile; renderCurrentDiff(); });
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

  // Publish a draft PR (mark it ready for review), then flip the header to the
  // normal (non-draft) review controls.
  async function publishDraft() {
    if (busy) return;
    const ok = await Modal.confirm({
      title: "Publish pull request",
      message: "Publish this draft pull request so it's ready for review?",
      confirmText: "Publish",
    });
    if (!ok) return;
    const gen = loadGen;
    const forRepo = repoId;
    const forPr = pr;
    busy = true;
    try {
      await DC.publishPr(forRepo, forPr.id);
      if (gen !== loadGen || repoId !== forRepo || pr !== forPr) return;
      forPr.status = "open"; // reflect the change locally
      renderHeader();
      await Modal.alert({ title: "Published", message: "The pull request is now open for review." });
    } catch (e) {
      if (gen !== loadGen || repoId !== forRepo || pr !== forPr) return;
      console.error("publishPr failed", e);
      await Modal.alert({ title: "Couldn't publish", message: String(e) });
    } finally {
      if (gen === loadGen && repoId === forRepo && pr === forPr) busy = false;
    }
  }

  async function submitReview(type) {
    if (busy) return;
    // Draft PRs can't be voted on — only "comment" is allowed.
    if (pr && pr.status === "draft" && type !== "comment") {
      await Modal.alert({ title: "Draft pull request", message: "This pull request is a draft and can't be approved yet." });
      return;
    }
    const META = {
      approve: { title: "Approve pull request", confirm: "Approve", danger: false, require: false },
      approve_suggestions: { title: "Approve with suggestions", confirm: "Approve with suggestions", danger: false, require: false },
      wait: { title: "Wait for author", confirm: "Wait for author", danger: false, require: false },
      reject: { title: "Reject pull request", confirm: "Reject", danger: true, require: false },
      changes: { title: "Request changes", confirm: "Request changes", danger: true, require: false },
      reset: { title: "Reset feedback", confirm: "Reset", danger: false, require: false },
      comment: { title: "Add a review comment", confirm: "Submit", danger: false, require: true },
    };
    const meta = META[type] || META.comment;
    let body = "";
    if (type === "reset") {
      const ok = await Modal.confirm({ title: meta.title, message: "Remove your vote from this pull request?", confirmText: "Reset" });
      if (!ok) return;
    } else {
      const res = await openFieldsDialogArea({
        title: meta.title,
        label: meta.require ? "Comment (required)" : "Summary comment (optional)",
        confirmText: meta.confirm,
        danger: meta.danger,
        required: meta.require,
      });
      if (res === null) return;
      body = res;
    }
    const gen = loadGen;
    const forRepo = repoId;
    const forPr = pr;
    busy = true;
    try {
      const data = await DC.submitPrReview(forRepo, forPr.id, type, body);
      if (gen !== loadGen || repoId !== forRepo || pr !== forPr) return;
      threads = data;
      renderFileList();
      if (activeTab === "conversation") renderConversation();
      // Refresh the live vote so the action bar reflects the new state.
      try {
        const v = await DC.prMyVote(forRepo, forPr.id);
        if (gen === loadGen && repoId === forRepo && pr === forPr) myVote = v || 0;
      } catch (_) {}
      if (gen === loadGen && repoId === forRepo && pr === forPr) renderHeader();
      await Modal.alert({ title: "Review submitted", message: meta.title + " — done." });
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

  // Draggable divider between the file list and the diff pane (persisted).
  (function initPrrResizer() {
    const layout = $("prrLayout");
    const rz = layout && layout.querySelector(".pane-resizer");
    if (!layout || !rz) return;
    const VAR = "--prr-side", KEY = "dc.prr.side", MIN = 200, MAX = 620, DEF = 290;
    try { const s = localStorage.getItem(KEY); if (s) layout.style.setProperty(VAR, s); } catch (e) {}
    const cur = () => parseFloat(getComputedStyle(layout).getPropertyValue(VAR)) || DEF;
    const set = (w, persist = true) => {
      const v = Math.max(MIN, Math.min(Math.round(w), MAX));
      layout.style.setProperty(VAR, v + "px");
      rz.setAttribute("aria-valuenow", String(v));
      if (persist) { try { localStorage.setItem(KEY, v + "px"); } catch (e) {} }
    };
    rz.setAttribute("aria-valuemin", String(MIN));
    rz.setAttribute("aria-valuemax", String(MAX));
    rz.setAttribute("aria-valuenow", String(Math.round(cur())));
    rz.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = cur();
      rz.setPointerCapture(e.pointerId);
      rz.classList.add("dragging");
      document.body.classList.add("col-resizing");
      const move = (ev) => set(startW + (ev.clientX - startX), false);
      const up = () => {
        rz.classList.remove("dragging");
        document.body.classList.remove("col-resizing");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        set(cur());
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
    rz.addEventListener("dblclick", () => {
      layout.style.removeProperty(VAR);
      rz.setAttribute("aria-valuenow", String(Math.round(cur())));
      try { localStorage.removeItem(KEY); } catch (e) {}
    });
    rz.addEventListener("keydown", (e) => {
      let w = cur();
      const step = e.shiftKey ? 32 : 8;
      if (e.key === "ArrowLeft") w -= step;
      else if (e.key === "ArrowRight") w += step;
      else if (e.key === "Home") w = MIN;
      else if (e.key === "End") w = MAX;
      else return;
      e.preventDefault();
      set(w);
    });
  })();

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
