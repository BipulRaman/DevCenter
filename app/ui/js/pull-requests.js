// ---------- Pull Requests render ----------
let prCurrentFilter = "all";
const PR_REPO_FILTER_KEY = "dc.pr.repoSelected";
let prRepoSelected = loadFilterSet(PR_REPO_FILTER_KEY); // empty = all watched repos
const PR_ACCOUNT_FILTER_KEY = "dc.pr.accountFilter";
let prAccountFilter = loadFilterSet(PR_ACCOUNT_FILTER_KEY); // selected account keys; empty = all

function watchedRepoNames() {
  return repos.filter((r) => r.watched).map((r) => r.name);
}

// The account (GitHub owner / Azure org) a PR belongs to, via its repo. null when
// the repo is unknown or has no usable remote.
function prAccountKey(p) {
  const r = repos.find((x) => x.name === p.repo);
  const a = r ? repoAccount(r) : null;
  return a ? a.key : null;
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
  // drop any selected repos that are no longer watched. Skip while nothing is
  // watched (also the pre-hydration state, repos not loaded yet) so the selection
  // restored from storage survives until real data arrives.
  if (names.length) {
    prRepoSelected = new Set([...prRepoSelected].filter((n) => names.includes(n)));
    saveFilterSet(PR_REPO_FILTER_KEY, prRepoSelected);
  }

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
      saveFilterSet(PR_REPO_FILTER_KEY, prRepoSelected);
      refreshPrRepoFilter();
      renderPulls(document.getElementById("prSearch").value);
    });
  }
  on(menu, 'input[type="checkbox"][value]', "change", (box) => {
    if (box.checked) prRepoSelected.add(box.value);
    else prRepoSelected.delete(box.value);
    saveFilterSet(PR_REPO_FILTER_KEY, prRepoSelected);
    refreshPrRepoFilter();
    renderPulls(document.getElementById("prSearch").value);
  });

  // Keep the account filter in sync — its options are derived from the same
  // watched-repo set, so it must rebuild whenever the watch/repo state changes.
  refreshPrAccountFilter();
}

function refreshPrAccountFilter() {
  const menu = document.getElementById("prAccountMenu");
  const label = document.getElementById("prAccountLabel");
  const select = document.getElementById("prAccountSelect");
  if (!menu || !select) return;

  // Aggregate accounts across watched repos (the only repos the PR page shows).
  const map = new Map(); // key -> { label, provider, count }
  repos.filter((r) => r.watched).forEach((r) => {
    const a = repoAccount(r);
    if (!a) return;
    const e = map.get(a.key) || { label: a.label, provider: a.provider, count: 0 };
    e.count++;
    map.set(a.key, e);
  });

  if (!map.size) {
    select.hidden = true;
    // Only reset once repos have loaded; the pre-hydration render has no repos
    // and would otherwise wipe the selection restored from storage.
    if (repos.length) { prAccountFilter.clear(); saveFilterSet(PR_ACCOUNT_FILTER_KEY, prAccountFilter); }
    return;
  }
  select.hidden = false;
  // Drop any selected accounts that no longer exist.
  prAccountFilter = new Set([...prAccountFilter].filter((k) => map.has(k)));
  saveFilterSet(PR_ACCOUNT_FILTER_KEY, prAccountFilter);

  const keys = [...map.keys()].sort((x, y) => map.get(x).label.localeCompare(map.get(y).label));
  const icon = (p) => (p === "github" ? ICON.github : p === "azure" ? ICON.azure : ICON.repo);

  menu.innerHTML =
    `<label class="multiselect-opt all">
       <input type="checkbox" id="prAccountAll" ${prAccountFilter.size === 0 ? "checked" : ""} />
       <span>All accounts</span>
     </label>
     <div class="multiselect-sep"></div>` +
    keys
      .map((k) => {
        const e = map.get(k);
        return `<label class="multiselect-opt">
          <input type="checkbox" value="${escapeHtml(k)}" ${prAccountFilter.has(k) ? "checked" : ""} />
          <span class="multiselect-ico">${icon(e.provider)}</span>
          <span>${escapeHtml(e.label)}</span>
          <span class="multiselect-count">${e.count}</span>
        </label>`;
      })
      .join("");

  if (prAccountFilter.size === 0) label.textContent = "All accounts";
  else if (prAccountFilter.size === 1) label.textContent = map.get([...prAccountFilter][0])?.label || "1 account";
  else label.textContent = `${prAccountFilter.size} accounts`;

  const iconHost = document.getElementById("prAccountIcon");
  if (iconHost) {
    const DEFAULT_ACCT_ICON =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 10h18"/></svg>';
    iconHost.innerHTML = prAccountFilter.size === 1 ? icon(map.get([...prAccountFilter][0])?.provider) : DEFAULT_ACCT_ICON;
  }

  const allBox = document.getElementById("prAccountAll");
  if (allBox) {
    allBox.addEventListener("change", () => {
      prAccountFilter.clear();
      saveFilterSet(PR_ACCOUNT_FILTER_KEY, prAccountFilter);
      refreshPrAccountFilter();
      renderPulls(document.getElementById("prSearch").value);
    });
  }
  on(menu, 'input[type="checkbox"][value]', "change", (box) => {
    if (box.checked) prAccountFilter.add(box.value);
    else prAccountFilter.delete(box.value);
    saveFilterSet(PR_ACCOUNT_FILTER_KEY, prAccountFilter);
    refreshPrAccountFilter();
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
    const acctKey = prAccountKey(p);
    const matchAccount = prAccountFilter.size === 0 || (acctKey && prAccountFilter.has(acctKey));
    const matchText = p.title.toLowerCase().includes(f) || p.repo.toLowerCase().includes(f) || p.author.toLowerCase().includes(f);
    const matchStatus = prCurrentFilter === "all" || p.status === prCurrentFilter;
    return isWatched && matchRepo && matchAccount && matchText && matchStatus;
  });
  document.getElementById("prList").innerHTML = list
    .map((p) => {
      const status = ["open", "draft", "merged"].includes(p.status) ? p.status : "open";
      const rev = prReviewChip(p);
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
