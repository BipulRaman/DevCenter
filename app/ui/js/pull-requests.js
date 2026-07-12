// ---------- Pull Requests render ----------
let prCurrentFilter = "all";
let prRepoSelected = new Set(); // empty = all watched repos

function watchedRepoNames() {
  return repos.filter((r) => r.watched).map((r) => r.name);
}

function watchedPulls() {
  const names = watchedRepoNames();
  return pulls.filter((p) => names.includes(p.repo));
}

// PR summary panels were removed; kept as a no-op so callers stay harmless.
function renderPrStats() {}

function refreshPrRepoFilter() {
  const menu = document.getElementById("prRepoMenu");
  const label = document.getElementById("prRepoLabel");
  if (!menu) return;
  const names = watchedRepoNames();
  // drop any selected repos that are no longer watched
  prRepoSelected = new Set([...prRepoSelected].filter((n) => names.includes(n)));

  // Map each watched repo name to its provider for icons.
  const providerOf = (name) => {
    const r = repos.find((x) => x.name === name);
    return r ? r.provider : "other";
  };
  const icon = (p) => (p === "github" ? ICON.github : p === "azure" ? ICON.azure : ICON.repo);

  if (!names.length) {
    menu.innerHTML = `<div class="multiselect-empty">No watched repos</div>`;
  } else {
    menu.innerHTML =
      `<label class="multiselect-opt all">
         <input type="checkbox" id="prRepoAll" ${prRepoSelected.size === 0 ? "checked" : ""} />
         <span>All watched repos</span>
       </label>
       <div class="multiselect-sep"></div>` +
      names
        .map(
          (n) => `<label class="multiselect-opt">
            <input type="checkbox" value="${escapeHtml(n)}" ${prRepoSelected.has(n) ? "checked" : ""} />
            <span class="multiselect-ico">${icon(providerOf(n))}</span>
            <span>${escapeHtml(n)}</span>
          </label>`
        )
        .join("");
  }

  // label text
  if (prRepoSelected.size === 0) label.textContent = "All watched repos";
  else if (prRepoSelected.size === 1) label.textContent = [...prRepoSelected][0];
  else label.textContent = `${prRepoSelected.size} repos`;

  // button icon: provider glyph when exactly one repo is selected
  const iconHost = document.getElementById("prRepoIcon");
  if (iconHost) {
    const DEFAULT_REPO_ICON =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6a2 2 0 0 1 2-2h14v16H5a2 2 0 0 1-2-2Z"/><path d="M19 16H5a2 2 0 0 0-2 2"/></svg>';
    iconHost.innerHTML = prRepoSelected.size === 1 ? icon(providerOf([...prRepoSelected][0])) : DEFAULT_REPO_ICON;
  }

  // wire option checkboxes
  const allBox = document.getElementById("prRepoAll");
  if (allBox) {
    allBox.addEventListener("change", () => {
      prRepoSelected.clear();
      refreshPrRepoFilter();
      renderPulls(document.getElementById("prSearch").value);
    });
  }
  on(menu, 'input[type="checkbox"][value]', "change", (box) => {
    if (box.checked) prRepoSelected.add(box.value);
    else prRepoSelected.delete(box.value);
    refreshPrRepoFilter();
    renderPulls(document.getElementById("prSearch").value);
  });
}

function renderPulls(filter = "") {
  const f = filter.toLowerCase();
  const watchedNames = watchedRepoNames();
  if (!watchedNames.length) {
    document.getElementById("prList").innerHTML = empty(
      "No repositories are being watched. Enable \u201cWatch PRs\u201d on a repo in Git Board to see its pull requests here."
    );
    return;
  }
  const list = pulls.filter((p) => {
    const isWatched = watchedNames.includes(p.repo);
    const matchRepo = prRepoSelected.size === 0 || prRepoSelected.has(p.repo);
    const matchText = p.title.toLowerCase().includes(f) || p.repo.toLowerCase().includes(f) || p.author.toLowerCase().includes(f);
    const matchStatus = prCurrentFilter === "all" || p.status === prCurrentFilter;
    return isWatched && matchRepo && matchText && matchStatus;
  });
  const reviewMap = {
    approved: { cls: "ok", icon: ICON.check, label: "Approved" },
    changes: { cls: "danger", icon: ICON.changes, label: "Changes requested" },
    pending: { cls: "muted", icon: ICON.clock, label: "Review pending" },
  };
  document.getElementById("prList").innerHTML = list
    .map((p) => {
      const status = ["open", "draft", "merged"].includes(p.status) ? p.status : "open";
      const rev = reviewMap[p.reviews] || reviewMap.pending;
      const id = escapeHtml(p.id);
      const repoId = escapeHtml(p.repoId || "");
      const statusTag =
        status === "merged"
          ? `<span class="pr-state merged">${ICON.merge}Merged</span>`
          : status === "draft"
          ? `<span class="pr-state draft">${ICON.pr}Draft</span>`
          : `<span class="pr-state open">${ICON.pr}Open</span>`;
      return `
      <div class="pr-row ${status}">
        <div class="pr-icon ${status}">${status === "merged" ? ICON.merge : ICON.pr}</div>
        <div class="pr-main">
          <div class="pr-title-row">
            <span class="pr-name${p.repoId ? " repo-open-link" : ""}"${p.repoId ? ` data-pr-open="${id}" data-pr-repo="${repoId}" title="Open in PR Review"` : ""}>${escapeHtml(p.title || "")}</span>
            ${statusTag}
          </div>
          <div class="pr-sub">
            <span>${p.repoId ? `<span class="repo-open-link" data-repo-open="${repoId}" title="Open in Changes">${escapeHtml(p.repo || "")}</span>` : escapeHtml(p.repo || "")} #${id}</span>
            <span class="repo-dot">·</span>
            <span><code>${escapeHtml(p.branch || "")}</code> → <code>${escapeHtml(p.base || "")}</code></span>
            <span class="repo-dot">·</span>
            <span>by ${escapeHtml(p.author || "")}</span>
            <span class="repo-dot">·</span>
            <span>${escapeHtml(p.updated || "")}</span>
          </div>
        </div>
        <div class="pr-meta">
          <span class="chip review ${rev.cls}">${rev.icon}${rev.label}</span>
          <span class="chip">${ICON.comment}${escapeHtml(p.comments ?? 0)}</span>
          <span class="pr-diff"><span class="add">+${escapeHtml(p.additions ?? 0)}</span> <span class="del">−${escapeHtml(p.deletions ?? 0)}</span></span>
        </div>
        <div class="pr-actions">
          ${p.repoId ? `<button class="btn btn-primary btn-sm" data-pr-review="${id}" data-pr-repo="${repoId}">Review</button>` : ""}
          <button class="btn btn-ghost btn-sm" data-pr-url="${escapeHtml(p.url || "")}">${ICON.external}View</button>
        </div>
      </div>`;
    })
    .join("");
  if (!list.length) document.getElementById("prList").innerHTML = empty("No pull requests match your filters.");

  on(document, "#prList [data-pr-url]", "click", (btn) => {
    const url = btn.dataset.prUrl;
    if (!url) return;
    if (DC && DC.hasBackend) DC.openUrl(url).catch((e) => console.error("openUrl failed", e));
    else window.open(url, "_blank");
  });
  on(document, "#prList [data-pr-review]", "click", (btn) => {
    const pr = pulls.find((p) => String(p.id) === btn.dataset.prReview && p.repoId === btn.dataset.prRepo);
    if (pr && window.PrReviewer) window.PrReviewer.open(pr.repoId, pr, { returnTo: "pull-requests" });
  });
  // PR title → open the PR Review page.
  on(document, "#prList [data-pr-open]", "click", (el) => {
    const pr = pulls.find((p) => String(p.id) === el.dataset.prOpen && p.repoId === el.dataset.prRepo);
    if (pr && window.PrReviewer) window.PrReviewer.open(pr.repoId, pr, { returnTo: "pull-requests" });
  });
  // Repo name → open that repository on the Changes page.
  on(document, "#prList [data-repo-open]", "click", (el) => {
    const rid = el.dataset.repoOpen;
    if (!rid) return;
    showPage("changes");
    const cp = window.ChangesPage;
    if (cp && typeof cp.openRepoTab === "function") cp.openRepoTab(rid, "changes");
    else if (cp && typeof cp.openRepoById === "function") cp.openRepoById(rid);
  });
}
