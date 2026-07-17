// ---------- Git Board render ----------

// Derive the "account" a repo belongs to from its remote: the GitHub owner or
// the Azure DevOps organization. Returns null for repos with no usable remote.
function repoAccount(r) {
  const segs = (r.remote || "").split("/").filter(Boolean);
  if (r.provider === "github") {
    const owner = segs[1] || "";
    return owner ? { key: "github:" + owner.toLowerCase(), label: owner, provider: "github" } : null;
  }
  if (r.provider === "azure") {
    const host = segs[0] || "";
    const org = host.includes(".visualstudio.com") ? host.replace(".visualstudio.com", "") : segs[1] || "";
    return org ? { key: "azure:" + org.toLowerCase(), label: org, provider: "azure" } : null;
  }
  const host = segs[0] || "";
  return host ? { key: "other:" + host.toLowerCase(), label: host, provider: "other" } : null;
}

const REPO_ACCOUNT_FILTER_KEY = "dc.repos.accountFilter";
let repoAccountFilter = loadFilterSet(REPO_ACCOUNT_FILTER_KEY); // selected account keys; empty = all
let acctFilterSig = ""; // signature of the last-rendered account menu (rebuild guard)

function renderAccountFilter() {
  const select = document.getElementById("repoAccountSelect");
  const menu = document.getElementById("repoAccountMenu");
  const label = document.getElementById("repoAccountLabel");
  if (!select || !menu) return;
  const map = new Map(); // key -> { label, provider, count }
  repos.forEach((r) => {
    const a = repoAccount(r);
    if (!a) return;
    const e = map.get(a.key) || { label: a.label, provider: a.provider, count: 0 };
    e.count++;
    map.set(a.key, e);
  });
  if (map.size === 0) {
    select.hidden = true;
    // Only reset once repos have actually loaded (repos.length > 0). On the
    // initial pre-hydration render repos is empty; clearing here would wipe the
    // selection restored from storage before the data arrives.
    if (repos.length) { repoAccountFilter.clear(); saveFilterSet(REPO_ACCOUNT_FILTER_KEY, repoAccountFilter); }
    acctFilterSig = "";
    return;
  }
  select.hidden = false;
  // Drop any selected accounts that no longer exist.
  repoAccountFilter = new Set([...repoAccountFilter].filter((k) => map.has(k)));
  saveFilterSet(REPO_ACCOUNT_FILTER_KEY, repoAccountFilter);
  const keys = [...map.keys()].sort((x, y) => map.get(x).label.localeCompare(map.get(y).label));
  const icon = (p) => (p === "github" ? ICON.github : p === "azure" ? ICON.azure : ICON.repo);

  // Skip the DOM rebuild (and listener re-binding) when nothing affecting the
  // menu changed — e.g. on every search keystroke. Leaving the menu DOM intact
  // keeps its existing direct listeners valid (WebView2-safe).
  const sig =
    keys.map((k) => { const e = map.get(k); return `${k}:${e.label}:${e.count}:${e.provider}`; }).join("|") +
    "#" + [...repoAccountFilter].sort().join(",");
  if (sig === acctFilterSig) return;
  acctFilterSig = sig;

  menu.innerHTML =
    `<label class="multiselect-opt all">
       <input type="checkbox" id="repoAccountAll" ${repoAccountFilter.size === 0 ? "checked" : ""} />
       <span>All accounts</span>
     </label>
     <div class="multiselect-sep"></div>` +
    keys
      .map((k) => {
        const e = map.get(k);
        return `<label class="multiselect-opt">
          <input type="checkbox" value="${escapeHtml(k)}" ${repoAccountFilter.has(k) ? "checked" : ""} />
          <span class="multiselect-ico">${icon(e.provider)}</span>
          <span>${escapeHtml(e.label)}</span>
          <span class="multiselect-count">${e.count}</span>
        </label>`;
      })
      .join("");

  if (repoAccountFilter.size === 0) label.textContent = "All accounts";
  else if (repoAccountFilter.size === 1) label.textContent = map.get([...repoAccountFilter][0])?.label || "1 account";
  else label.textContent = `${repoAccountFilter.size} accounts`;

  // Show the provider icon on the button when exactly one account is selected,
  // otherwise the default "accounts" glyph.
  const iconHost = document.getElementById("repoAccountIcon");
  if (iconHost) {
    const DEFAULT_ACCT_ICON =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 10h18"/></svg>';
    if (repoAccountFilter.size === 1) {
      iconHost.innerHTML = icon(map.get([...repoAccountFilter][0])?.provider);
    } else {
      iconHost.innerHTML = DEFAULT_ACCT_ICON;
    }
  }

  const allBox = document.getElementById("repoAccountAll");
  if (allBox) {
    allBox.addEventListener("change", () => {
      repoAccountFilter.clear();
      saveFilterSet(REPO_ACCOUNT_FILTER_KEY, repoAccountFilter);
      renderRepos(document.getElementById("repoSearch").value || "");
    });
  }
  on(menu, 'input[type="checkbox"][value]', "change", (box) => {
    if (box.checked) repoAccountFilter.add(box.value);
    else repoAccountFilter.delete(box.value);
    saveFilterSet(REPO_ACCOUNT_FILTER_KEY, repoAccountFilter);
    renderRepos(document.getElementById("repoSearch").value || "");
  });
}

const REPO_TAG_FILTER_KEY = "dc.repos.tagFilter";
let repoTagFilter = loadFilterSet(REPO_TAG_FILTER_KEY); // selected tags; empty = all

function renderRepos(filter = "") {
  if (typeof Dropdown !== "undefined") Dropdown.close();
  const f = filter.toLowerCase();
  const list = repos.filter((r) => {
    const tags = r.tags || [];
    const matchText =
      r.name.toLowerCase().includes(f) ||
      r.remote.toLowerCase().includes(f) ||
      tags.some((t) => t.toLowerCase().includes(f));
    const matchTag = repoTagFilter.size === 0 || tags.some((t) => repoTagFilter.has(t));
    const acct = repoAccount(r);
    const matchAcct = repoAccountFilter.size === 0 || (acct && repoAccountFilter.has(acct.key));
    return matchText && matchTag && matchAcct;
  });
  renderAccountFilter();
  renderTagFilter();
  document.getElementById("repoGrid").innerHTML = list
    .map((r) => {
      const i = repos.indexOf(r);
      const provider = r.provider === "github" || r.provider === "azure" ? r.provider : "other";
      const dirtyChip =
        r.status === "dirty"
          ? `<span class="chip dirty-chip" title="Uncommitted changes">${ICON.dot}Uncommitted</span>`
          : "";
      const aheadN = r.ahead || 0;
      const behindN = r.behind || 0;
      const canSync = DC && DC.hasBackend;
      // Ahead ↑ = local commits to PUSH; behind ↓ = remote commits to PULL.
      // On the desktop app each is a button; in the browser they're plain badges.
      // The inner <span> keeps the icon+count on one normalized line box so the
      // button height matches the sibling chips (branch/dirty).
      const pushChip = !aheadN
        ? ""
        : canSync
          ? `<button class="chip sync-chip sync-push" data-push="${i}" title="Push ${aheadN} commit${aheadN === 1 ? "" : "s"} to the remote"><span>${ICON.up}${aheadN}</span></button>`
          : `<span class="chip sync-chip sync-push"><span>${ICON.up}${aheadN}</span></span>`;
      const pullChip = !behindN
        ? ""
        : canSync
          ? `<button class="chip sync-chip sync-pull" data-pull="${i}" title="Pull ${behindN} commit${behindN === 1 ? "" : "s"} from the remote"><span>${ICON.down}${behindN}</span></button>`
          : `<span class="chip sync-chip sync-pull"><span>${ICON.down}${behindN}</span></span>`;
      const syncChip = pushChip + pullChip;
      const dotClass = r.status === "dirty" ? "error" : "running";
      const tagChips = (r.tags || [])
        .map((t) => `<span class="chip tag-chip">${ICON.tag}${escapeHtml(t)}</span>`)
        .join("");
      const watchBtn = r.watched
        ? `<button class="btn btn-ghost btn-sm watching" data-watch="${i}" title="Stop watching PRs">${ICON.eye}Watching</button>`
        : `<button class="btn btn-ghost btn-sm" data-watch="${i}" title="Watch this repo's PRs">${ICON.eyeOff}Watch PRs</button>`;
      const branchChip =
        DC && DC.hasBackend
          ? `<button class="chip branch switchable" data-branch="${i}" title="Switch branch">${ICON.branch}${escapeHtml(r.branch || "")}${ICON.caret}</button>`
          : `<span class="chip branch">${ICON.branch}${escapeHtml(r.branch || "")}</span>`;
      const fetchLabel = r.lastFetch ? `Fetched ${escapeHtml(r.lastFetch)}` : "Never fetched";
      return `
      <div class="repo-row ${dotClass}">
        <div class="repo-icon ${provider}">${providerIcon(provider)}</div>
        <div class="repo-main">
          <div class="repo-title-row">
            <span class="repo-name repo-open-link" data-open-changes="${i}" title="Open in Changes">${escapeHtml(r.name || "")}</span>
            ${branchChip}
            ${syncChip}${dirtyChip}${tagChips}
          </div>
          <div class="repo-sub">
            <span class="repo-path">${escapeHtml(r.path || "")}</span>
            <span class="repo-dot">·</span>
            <span class="repo-fetch" data-fetch-status="${i}"${canSync ? ` data-fetch-now="${i}" title="Fetch now"` : ""}>${ICON.sync}${fetchLabel}</span>
          </div>
        </div>
        <div class="repo-actions">
          ${watchBtn}
          <button class="btn btn-icon btn-sm" data-fetch="${i}" title="Fetch">${ICON.sync}</button>
          <button class="btn btn-icon btn-sm" data-menu="${i}" title="More actions">${ICON.more}</button>
        </div>
      </div>`;
    })
    .join("");
  if (!list.length)
    document.getElementById("repoGrid").innerHTML = empty(
      f || repoTagFilter.size || repoAccountFilter.size
        ? "No repositories match your filters."
        : "No repositories yet. Clone or add an existing one to get started."
    );

  // Scope every row-button query to the repo grid so they never bind to App
  // Center kebabs, which also use [data-menu]. A document-wide query here would
  // cross-wire the two pages' menus.
  const grid = document.getElementById("repoGrid");

  // Open the selected repository directly in the Changes page.
  on(grid, "[data-open-changes]", "click", (el, e) => {
    e.preventDefault();
    e.stopPropagation();
    const idx = Number(el.dataset.openChanges);
    const r = repos[idx];
    if (!r) return;
    showPage("changes");
    if (window.ChangesPage && typeof window.ChangesPage.openRepoById === "function") {
      window.ChangesPage.openRepoById(r.id);
    }
  });

  on(grid, "[data-watch]", "click", (btn) => {
    const idx = Number(btn.dataset.watch);
    repos[idx].watched = !repos[idx].watched;
    if (DC && DC.hasBackend) DC.setWatched(repos[idx].id, repos[idx].watched).catch((e) => console.error("setWatched failed", e));
    renderRepos(document.getElementById("repoSearch").value);
    refreshPrRepoFilter();
    renderPrStats();
    renderPulls(document.getElementById("prSearch").value);
    if (DC && DC.hasBackend) hydratePulls();
  });

  // Kebab menu — Add tag, Open folder, Terminal, Remove.
  const removeRepo = async (r) => {
    const ok = await Modal.confirm({
      title: "Remove repository",
      message: `Remove “${r.name}” from DevCenter? This only removes it from the list — the files on disk are left untouched.`,
      confirmText: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      if (DC && DC.hasBackend) await DC.removeRepo(r.id);
      repos = repos.filter((x) => x.id !== r.id);
      rerenderGit();
      if (DC && DC.hasBackend) hydratePulls();
    } catch (e) {
      console.error("removeRepo failed", e);
      await Modal.alert({ title: "Couldn't remove repository", message: String(e) });
    }
  };

  // Fetch from the remote, then refresh the affected row. Spins the sync icon
  // next to “Fetched … ago” while in flight (menu / right-click entry point).
  const fetchRepoAction = async (r) => {
    if (!DC || !DC.hasBackend) return;
    const statusEl = document.querySelector(`.repo-fetch[data-fetch-status="${repos.indexOf(r)}"]`);
    if (statusEl) statusEl.classList.add("fetching");
    try {
      const updated = await DC.fetchRepo(r.id);
      const at = repos.findIndex((x) => x.id === updated.id);
      if (at >= 0) repos[at] = updated;
      renderRepos(document.getElementById("repoSearch").value);
    } catch (e) {
      console.error("fetchRepo failed", e);
      if (statusEl) statusEl.classList.remove("fetching");
      await Modal.alert({ title: "Fetch failed", message: String(e) });
    }
  };

  // Toggle PR watching for a repo and refresh dependent views.
  const toggleWatch = (r) => {
    const idx = repos.findIndex((x) => x.id === r.id);
    if (idx < 0) return;
    repos[idx].watched = !repos[idx].watched;
    if (DC && DC.hasBackend) DC.setWatched(repos[idx].id, repos[idx].watched).catch((e) => console.error("setWatched failed", e));
    renderRepos(document.getElementById("repoSearch").value);
    refreshPrRepoFilter();
    renderPrStats();
    renderPulls(document.getElementById("prSearch").value);
    if (DC && DC.hasBackend) hydratePulls();
  };

  // Open the repository in the Changes page on a specific tab ("changes" | "history" | "pulls").
  const openInChanges = (r, tab) => {
    showPage("changes");
    const cp = window.ChangesPage;
    if (cp && typeof cp.openRepoTab === "function") cp.openRepoTab(r.id, tab || "changes");
    else if (cp && typeof cp.openRepoById === "function") cp.openRepoById(r.id);
  };

  // The full set of repo actions, shared by the kebab and the right-click menu.
  const repoMenuItems = (r) => {
    const items = [
      { label: "View Changes", icon: ICON.changes, onClick: () => openInChanges(r, "changes") },
      { label: "View Commits", icon: ICON.clock, onClick: () => openInChanges(r, "history") },
      { label: "View Pull Requests", icon: ICON.pr, onClick: () => openInChanges(r, "pulls") },
    ];
    items.push({ separator: true });
    if (DC && DC.hasBackend) items.push({ label: "Fetch", icon: ICON.sync, onClick: () => fetchRepoAction(r) });
    items.push({ label: r.watched ? "Stop watching PRs" : "Watch PRs", icon: r.watched ? ICON.eye : ICON.eyeOff, onClick: () => toggleWatch(r) });
    items.push({ separator: true });
    items.push({ label: "Edit tags", icon: ICON.tag, onClick: () => openTagEditor(r) });
    if (DC && DC.hasBackend) {
      items.push(
        { label: "Open folder", icon: ICON.folder, onClick: () => DC.openPath(r.path).catch((e) => console.error("openPath failed", e)) },
        { label: "Open terminal", icon: ICON.terminal, onClick: () => DC.openTerminal(r.path).catch((e) => console.error("openTerminal failed", e)) }
      );
      if (hasVscode) items.push({ label: "Open in VS Code", icon: ICON.vscode, onClick: () => DC.openInVscode(r.path).catch((e) => console.error("openInVscode failed", e)) });
      if (hasVscodeInsiders) items.push({ label: "Open in VS Code (I)", icon: ICON.vscode, onClick: () => DC.openInVscodeInsiders(r.path).catch((e) => console.error("openInVscodeInsiders failed", e)) });
      const web = repoWebUrl(r.remote);
      if (web) items.push({ label: "Open in browser", icon: ICON.external, onClick: () => DC.openUrl(web).catch((e) => console.error("openUrl failed", e)) });
    }
    items.push({ separator: true });
    items.push({ label: "Remove from list", icon: ICON.trash, danger: true, onClick: () => removeRepo(r) });
    return items;
  };
  on(grid, "[data-menu]", "click", (btn) => {
    if (Dropdown.isOpenFor(btn)) { Dropdown.close(); return; }
    const r = repos[Number(btn.dataset.menu)];
    Dropdown.menu(btn, repoMenuItems(r));
  });

  // Right-click anywhere on a repo card opens the same full actions menu.
  on(grid, ".repo-row", "contextmenu", (row, e, k) => {
    const r = list[k];
    if (!r) return;
    e.preventDefault();
    e.stopPropagation();
    Dropdown.context(e.clientX, e.clientY, repoMenuItems(r));
  });

  // Fetch (desktop only) — pulls from the remote, then refreshes the row
  on(grid, "[data-fetch]", "click", async (btn) => {
    if (!DC || !DC.hasBackend) return;
    const r = repos[Number(btn.dataset.fetch)];
    btn.disabled = true;
    btn.innerHTML = `<span class="spin">${ICON.sync}</span>`;
    try {
      const updated = await DC.fetchRepo(r.id);
      const at = repos.findIndex((x) => x.id === updated.id);
      if (at >= 0) repos[at] = updated;
      renderRepos(document.getElementById("repoSearch").value);
    } catch (e) {
      console.error("fetchRepo failed", e);
      await Modal.alert({ title: "Fetch failed", message: String(e) });
      btn.disabled = false;
      btn.innerHTML = ICON.sync;
    }
  });

  // Clicking the “Fetched … ago” status (icon + label) fetches now, spinning
  // the icon via fetchRepoAction. Ignore repeat clicks while already fetching.
  on(grid, "[data-fetch-now]", "click", (el, e) => {
    e.stopPropagation();
    if (el.classList.contains("fetching")) return;
    const r = repos[Number(el.dataset.fetchNow)];
    if (r) fetchRepoAction(r);
  });

  // Push local commits (ahead ↑) to the remote, then refresh the row.
  on(grid, "[data-push]", "click", async (btn, e) => {
    e.stopPropagation();
    if (!DC || !DC.hasBackend) return;
    const r = repos[Number(btn.dataset.push)];
    if (!r || btn.disabled) return;
    const prev = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spin">${ICON.sync}</span>`;
    try {
      const cs = await DC.gitPush(r.id);
      const at = repos.findIndex((x) => x.id === r.id);
      if (at >= 0 && cs) {
        repos[at].ahead = cs.ahead || 0;
        repos[at].behind = cs.behind || 0;
        if (cs.branch) repos[at].branch = cs.branch;
      }
      renderRepos(document.getElementById("repoSearch").value);
    } catch (err) {
      console.error("push failed", err);
      btn.disabled = false;
      btn.innerHTML = prev;
      await Modal.alert({ title: "Push failed", message: String(err) });
    }
  });

  // Pull remote commits (behind ↓). A merge conflict is left in-progress by the
  // backend (not an error) — jump into the Changes page for that repo so its
  // conflict banner / resolver can handle it.
  on(grid, "[data-pull]", "click", async (btn, e) => {
    e.stopPropagation();
    if (!DC || !DC.hasBackend) return;
    const r = repos[Number(btn.dataset.pull)];
    if (!r || btn.disabled) return;
    const prev = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spin">${ICON.sync}</span>`;
    try {
      const cs = await DC.gitPull(r.id, false);
      const conflicted = cs && Array.isArray(cs.files) && cs.files.some((f) => f.status === "conflicted");
      const at = repos.findIndex((x) => x.id === r.id);
      if (at >= 0 && cs) {
        repos[at].ahead = cs.ahead || 0;
        repos[at].behind = cs.behind || 0;
        if (cs.branch) repos[at].branch = cs.branch;
        if (conflicted) repos[at].status = "dirty";
      }
      if (conflicted) { openInChanges(r, "changes"); return; }
      renderRepos(document.getElementById("repoSearch").value);
    } catch (err) {
      console.error("pull failed", err);
      btn.disabled = false;
      btn.innerHTML = prev;
      await Modal.alert({ title: "Pull failed", message: String(err) });
    }
  });

  // Switch branch (desktop only) — click the branch chip to open an anchored dropdown
  grid.querySelectorAll("[data-branch]").forEach((chip) => {
    chip.addEventListener("click", async () => {
      if (!DC || !DC.hasBackend || chip.classList.contains("loading")) return;
      if (Dropdown.isOpenFor(chip)) { Dropdown.close(); return; }
      const r = repos[Number(chip.dataset.branch)];
      let branches;
      chip.classList.add("loading");
      try {
        branches = await DC.listBranches(r.id);
      } catch (e) {
        console.error("listBranches failed", e);
        await Modal.alert({ title: "Couldn't load branches", message: String(e) });
        chip.classList.remove("loading");
        return;
      }
      chip.classList.remove("loading");

      // If this repo's current branch no longer exists (e.g. it was deleted),
      // switch it to the default branch instead of showing a missing branch.
      if (r.branch && branches.length && !branches.includes(r.branch)) {
        const fallback = defaultBranchFrom(branches);
        if (fallback && fallback !== r.branch) {
          try {
            const updated = await DC.checkoutBranch(r.id, fallback, false);
            const at = repos.findIndex((x) => x.id === updated.id);
            if (at >= 0) repos[at] = updated;
            renderRepos(document.getElementById("repoSearch").value);
            return; // the chip was re-rendered; reopen to pick a branch
          } catch (e) {
            console.error("auto-switch to default branch failed", e);
          }
        }
      }
      Dropdown.open(chip, {
        header: "Switch branch",
        headerAction: {
          label: "New branch",
          icon: ICON.plus,
          title: "Create a new branch",
          onClick: () =>
            openNewBranchDialog({
              branches,
              current: r.branch,
              onCreate: async (name, base) => {
                try {
                  const updated = await DC.createBranch(r.id, name, base);
                  const at = repos.findIndex((x) => x.id === updated.id);
                  if (at >= 0) repos[at] = updated;
                  renderRepos(document.getElementById("repoSearch").value);
                } catch (e) {
                  console.error("createBranch failed", e);
                  await Modal.alert({ title: "Couldn't create branch", message: String(e) });
                }
              },
            }),
        },
        options: branches,
        current: r.branch,
        search: true,
        searchPlaceholder: "Filter branches…",
        optionKind: "branch",
        optionIcon: () => ICON.branch,
        emptyText: "No local branches.",
        onContext: (opt, isCur, ev) =>
          openBranchContextMenu(ev, {
            repoId: r.id,
            branch: opt,
            isCurrent: isCur,
            branches,
            onChanged: (updated) => {
              if (updated) {
                const at = repos.findIndex((x) => x.id === updated.id);
                if (at >= 0) repos[at] = updated;
              }
              Dropdown.close();
              renderRepos(document.getElementById("repoSearch").value);
            },
          }),
        onSelect: async (target) => {
          try {
            const updated = await performBranchSwitch({
              repoId: r.id,
              current: r.branch,
              target,
              dirty: r.status === "dirty",
            });
            if (!updated) return; // cancelled
            const at = repos.findIndex((x) => x.id === updated.id);
            if (at >= 0) repos[at] = updated;
            // If the new branch has uncommitted changes carried over or merge
            // conflicts (both surface as status "dirty"), take the user to the
            // Changes page so they can resolve/commit before continuing.
            if (updated.status === "dirty") {
              Dropdown.close();
              openInChanges(updated, "changes");
              return;
            }
            renderRepos(document.getElementById("repoSearch").value);
          } catch (e) {
            console.error("checkout failed", e);
            await Modal.alert({ title: "Switch failed", message: String(e) });
          }
        },
      });
    });
  });
}

// Fetch every repository in the list (from the global “Fetch All” context-menu
// action on the Git Board). Runs in parallel, spinning each row's fetch icon,
// then re-renders once all fetches settle.
async function fetchAllRepos() {
  if (!DC || !DC.hasBackend || !repos.length) return;
  document.querySelectorAll(".repo-fetch[data-fetch-now]").forEach((el) => el.classList.add("fetching"));
  const targets = repos.slice();
  await Promise.allSettled(
    targets.map(async (r) => {
      try {
        const updated = await DC.fetchRepo(r.id);
        const at = repos.findIndex((x) => x.id === updated.id);
        if (at >= 0) repos[at] = updated;
      } catch (e) {
        console.error("fetchRepo failed", r.id, e);
      }
    })
  );
  const search = document.getElementById("repoSearch");
  renderRepos(search ? search.value : "");
}
