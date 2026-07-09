// ---------- Initial render ----------
renderAppStats();
renderApps();
refreshPrRepoFilter();
renderPrStats();

// Whether VS Code is installed (drives the optional "Open in VS Code" menu item).
let hasVscode = false;

if (DC && DC.hasBackend) {
  // Repositories and pull requests load from the backend (see hydration below).
  // Show loading placeholders so no stale or sample data is ever shown.
  document.getElementById("repoGrid").innerHTML = empty("Loading repositories…");
  document.getElementById("prList").innerHTML = empty("Loading pull requests…");
  DC.vscodeAvailable().then((v) => { hasVscode = !!v; }).catch(() => {});
} else {
  renderRepos();
  renderPulls();
}

// ---------- Backend hydration (Tauri desktop) ----------
function rerenderGit() {
  renderRepos(document.getElementById("repoSearch").value || "");
  refreshPrRepoFilter();
  renderPrStats();
  renderPulls(document.getElementById("prSearch").value || "");
}

async function hydrateFromBackend() {
  try {
    const data = await DC.listRepos();
    if (Array.isArray(data)) {
      repos = data;
      rerenderGit();
      // If the Changes page was restored across a reload, it now has repos to pick from.
      if (window.ChangesPage && document.querySelector(".nav-item.active")?.dataset.page === "changes") {
        window.ChangesPage.onShow();
      }
    }
  } catch (e) {
    console.error("listRepos failed", e);
  }
}

// ---------- Pull Requests (backend) ----------
async function hydratePulls() {
  if (!DC || !DC.hasBackend) return;
  if (!watchedRepoNames().length) {
    renderPrStats();
    renderPulls(document.getElementById("prSearch").value || "");
    return;
  }
  const prList = document.getElementById("prList");
  if (prList) prList.innerHTML = empty("Loading pull requests…");
  try {
    const data = await DC.listPullRequests(null);
    if (Array.isArray(data)) {
      pulls = data;
      renderPrStats();
      renderPulls(document.getElementById("prSearch").value || "");
    }
  } catch (e) {
    console.error("listPullRequests failed", e);
    if (prList) prList.innerHTML = empty(String(e));
  }
}

// ---------- Accounts (backend) ----------
let accounts = [];

function providerMeta(p) {
  return p === "azure"
    ? { icon: ICON.azure, cls: "azure", name: "Azure DevOps" }
    : { icon: ICON.github, cls: "github", name: "GitHub" };
}

function renderAccounts() {
  const host = document.getElementById("accountList");
  if (!host) return;
  if (!DC || !DC.hasBackend) {
    host.innerHTML = `<div class="account-empty">${ICON.key}<div>Account management is available in the desktop app.</div></div>`;
    return;
  }
  if (!accounts.length) {
    host.innerHTML = `<div class="account-empty">${ICON.key}<div><strong>No accounts connected</strong><br>Add a GitHub or Azure DevOps account to load pull requests for your watched repositories.</div></div>`;
    return;
  }
  host.innerHTML = accounts
    .map((a, i) => {
      const m = providerMeta(a.provider);
      const stateCls = a.status === "connected" ? "connected" : a.status === "error" ? "error" : "unverified";
      const stateLabel = a.status === "connected" ? "Connected" : a.status === "error" ? "Error" : "Unverified";
      const who = a.username ? `<code>${a.username}</code>` : "Token";
      const org = a.organization ? ` · ${a.organization}` : "";
      return `
      <div class="account-row">
        <div class="account-icon ${m.cls}">${m.icon}</div>
        <div class="account-main">
          <div class="account-title-row">
            <span class="account-name">${a.label}</span>
            <span class="account-state ${stateCls}">${stateLabel}</span>
          </div>
          <div class="account-sub">${m.name}${org} · ${who}</div>
        </div>
        <div class="account-actions">
          <button class="btn btn-ghost btn-sm" data-test="${i}">${ICON.sync}Test</button>
          <button class="btn btn-icon btn-sm" data-remove="${i}" title="Remove account">${ICON.trash}</button>
        </div>
      </div>`;
    })
    .join("");

  on(host, "[data-test]", "click", async (btn) => {
    const a = accounts[Number(btn.dataset.test)];
    btn.disabled = true;
    btn.innerHTML = `<span class="spin">${ICON.sync}</span>Testing…`;
    try {
      const updated = await DC.testAccount(a.id);
      const i = accounts.findIndex((x) => x.id === updated.id);
      if (i >= 0) accounts[i] = updated;
      renderAccounts();
      hydratePulls();
    } catch (e) {
      const i = accounts.findIndex((x) => x.id === a.id);
      if (i >= 0) accounts[i].status = "error";
      renderAccounts();
      await Modal.alert({ title: "Connection failed", message: String(e) });
    }
  });

  on(host, "[data-remove]", "click", async (btn) => {
    const a = accounts[Number(btn.dataset.remove)];
    const ok = await Modal.confirm({
      title: "Remove account",
      message: `Remove “${a.label}”? Its stored token will be deleted from this machine.`,
      confirmText: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await DC.removeAccount(a.id);
      accounts = accounts.filter((x) => x.id !== a.id);
      renderAccounts();
      hydratePulls();
    } catch (e) {
      await Modal.alert({ title: "Couldn't remove account", message: String(e) });
    }
  });
}

async function hydrateAccounts() {
  if (!DC || !DC.hasBackend) return;
  try {
    const data = await DC.listAccounts();
    if (Array.isArray(data)) {
      accounts = data;
      renderAccounts();
    }
  } catch (e) {
    console.error("listAccounts failed", e);
  }
}

// ---------- App Center (backend) ----------
async function hydrateApps() {
  if (!DC || !DC.hasBackend) return;
  try {
    const [list, presets] = await Promise.all([DC.listApps(), DC.listPresets()]);
    if (Array.isArray(presets)) appPresets = presets;
    if (Array.isArray(list)) {
      apps = list;
      renderAppStats();
      renderApps(document.getElementById("appSearch").value || "");
    }
  } catch (e) {
    console.error("listApps failed", e);
  }
}

function openAddAccount() {
  let provider = "github";
  // Normalize an ADO org input (bare slug, dev.azure.com URL, or
  // {org}.visualstudio.com URL) down to just the org slug — for the browser link.
  const normalizeOrg = (s) => {
    s = (s || "").trim().replace(/^https?:\/\//, "");
    const vs = s.indexOf(".visualstudio.com");
    if (vs >= 0) return s.slice(0, vs);
    if (s.startsWith("dev.azure.com/")) return s.slice("dev.azure.com/".length).split("/")[0];
    return s.split("/")[0].trim();
  };
  return Modal.custom({
    title: "Add account",
    render: (body, foot, close, mkBtn) => {
      body.innerHTML = `
        <div class="form-row">
          <label class="form-label">Provider</label>
          <div class="form-choice" id="acProvider">
            <button type="button" class="form-opt active" data-p="github">${ICON.github}GitHub</button>
            <button type="button" class="form-opt" data-p="azure">${ICON.azure}Azure DevOps</button>
          </div>
        </div>
        <div class="form-row" id="acUserRow">
          <label class="form-label">Username (optional)</label>
          <input class="modal-input" id="acUser" placeholder="auto-detected if left blank" spellcheck="false" autocomplete="off" />
        </div>
        <div class="form-row" id="acOrgRow" style="display:none">
          <label class="form-label">Organization</label>
          <input class="modal-input" id="acOrg" placeholder="e.g. contoso — or paste your Azure DevOps URL" spellcheck="false" autocomplete="off" />
        </div>
        <div class="form-row">
          <label class="form-label">Authentication</label>
          <button type="button" class="btn btn-primary" id="acAuthBtn" style="width:100%;justify-content:center">${ICON.external}Sign in with Git in browser</button>
          <div class="form-hint" id="acHint"></div>
        </div>
        <div class="form-row">
          <label class="form-label">Or paste a token</label>
          <input class="modal-input" id="acToken" type="password" placeholder="Personal access token" spellcheck="false" autocomplete="off" />
          <button type="button" class="btn btn-ghost btn-sm" id="acTokenLink" style="margin-top:8px">${ICON.key}Create a token…</button>
        </div>
        <div class="modal-error" id="acErr"></div>`;

      const userRow = body.querySelector("#acUserRow");
      const orgRow = body.querySelector("#acOrgRow");
      const hint = body.querySelector("#acHint");
      const err = body.querySelector("#acErr");
      // Auth mode: "git" (Credential Manager, token not stored) or "token" (PAT).
      let mode = "token";
      let gitHost = null;
      const setHint = () => {
        hint.textContent =
          provider === "azure"
            ? "Reuses Git Credential Manager — the same Microsoft sign-in you saw when cloning. Or paste a token below."
            : "Reuses Git Credential Manager — the same GitHub sign-in you saw when cloning. Or paste a token below.";
      };
      const resetGit = () => {
        mode = "token";
        gitHost = null;
        const ab = body.querySelector("#acAuthBtn");
        if (ab) ab.innerHTML = `${ICON.external}Sign in with Git in browser`;
      };
      const applyProvider = () => {
        userRow.style.display = provider === "github" ? "" : "none";
        orgRow.style.display = provider === "azure" ? "" : "none";
        resetGit();
        setHint();
      };
      applyProvider();

      on(body, "#acProvider .form-opt", "click", (o) => {
        provider = o.dataset.p;
        body.querySelectorAll("#acProvider .form-opt").forEach((x) => x.classList.toggle("active", x === o));
        applyProvider();
      });

      // Typing a PAT switches back to token mode.
      body.querySelector("#acToken").addEventListener("input", () => {
        if (body.querySelector("#acToken").value) resetGit();
      });

      // Sign in via Git Credential Manager (same flow Git uses for clone/fetch).
      // On success we mark the account as git-auth; the token is NOT pulled into
      // the form (the backend re-resolves it via GCM and never stores it).
      body.querySelector("#acAuthBtn").addEventListener("click", async () => {
        err.textContent = "";
        let host;
        if (provider === "azure") {
          const raw = body.querySelector("#acOrg").value.trim();
          const org = normalizeOrg(raw);
          if (!org) {
            err.textContent = "Enter your Azure DevOps organization first.";
            return;
          }
          host = /visualstudio\.com/i.test(raw) ? `${org}.visualstudio.com` : "dev.azure.com";
        } else {
          host = "github.com";
        }
        if (!DC || !DC.hasBackend) {
          err.textContent = "Browser sign-in is only available in the desktop app.";
          return;
        }
        const ab = body.querySelector("#acAuthBtn");
        const orig = `${ICON.external}Sign in with Git in browser`;
        ab.disabled = true;
        ab.innerHTML = `<span class="spin">${ICON.sync}</span>Waiting for sign-in…`;
        try {
          const cred = await DC.gitToken(host);
          if (provider === "github" && cred.username && /^[a-zA-Z0-9-]+$/.test(cred.username)) {
            const u = body.querySelector("#acUser");
            if (!u.value.trim()) u.value = cred.username;
          }
          body.querySelector("#acToken").value = "";
          mode = "git";
          gitHost = host;
          ab.disabled = false;
          ab.innerHTML = `${ICON.check}Signed in — click “Add account”`;
        } catch (e) {
          err.textContent = String(e);
          ab.disabled = false;
          ab.innerHTML = orig;
        }
      });

      // Open the provider's token-creation page (PAT alternative).
      body.querySelector("#acTokenLink").addEventListener("click", () => {
        let url;
        if (provider === "azure") {
          const org = normalizeOrg(body.querySelector("#acOrg").value);
          if (!org) {
            err.textContent = "Enter your Azure DevOps organization first.";
            return;
          }
          url = `https://dev.azure.com/${encodeURIComponent(org)}/_usersSettings/tokens`;
        } else {
          url = "https://github.com/settings/tokens/new?description=DevCenter&scopes=repo";
        }
        err.textContent = "";
        if (DC && DC.hasBackend) DC.openUrl(url).catch((e) => console.error("openUrl failed", e));
        else window.open(url, "_blank");
      });

      const cancel = mkBtn("btn-ghost", "Cancel");
      cancel.addEventListener("click", () => close(null));
      const save = mkBtn("btn-primary", "Add account");
      save.addEventListener("click", async () => {
        const username = body.querySelector("#acUser").value.trim();
        const organization = body.querySelector("#acOrg").value.trim();
        const token = body.querySelector("#acToken").value;
        if (provider === "azure" && !organization) {
          err.textContent = "Enter your Azure DevOps organization.";
          return;
        }
        if (mode !== "git" && !token) {
          err.textContent = "Sign in with Git, or paste a token.";
          return;
        }
        err.textContent = "";
        save.disabled = true;
        save.textContent = "Connecting…";
        try {
          const account = await DC.addAccount({
            provider,
            username: provider === "github" ? username : null,
            organization: provider === "azure" ? organization : null,
            authKind: mode,
            host: mode === "git" ? gitHost : null,
            token: mode === "git" ? null : token,
            label: null,
          });
          close(account);
        } catch (e) {
          err.textContent = String(e);
          save.disabled = false;
          save.textContent = "Add account";
        }
      });
      foot.append(cancel, save);
    },
  });
}

if (DC && DC.hasBackend) {
  hydrateFromBackend().then(hydratePulls);
  hydrateAccounts();
  hydrateApps();
  DC.onReposUpdated((data) => {
    if (Array.isArray(data)) {
      repos = data;
      rerenderGit();
    }
  });

  // Live app status updates → patch the matching app and re-render.
  DC.onAppStatus((s) => {
    const at = apps.findIndex((a) => String(a.id) === String(s.id));
    if (at >= 0) {
      apps[at] = { ...apps[at], status: s.status, pid: s.pid, uptime: s.uptime };
      renderAppStats();
      renderApps(document.getElementById("appSearch").value || "");
    }
  });

  // Startup update check found an update → ask the user before installing,
  // because installing restarts the app. We never auto-install/restart. Prompt
  // only once per session.
  let updatePrompted = false;
  DC.onUpdateState(async (s) => {
    if (!s || s.status !== "available" || updatePrompted) return;
    updatePrompted = true;
    const go = await Modal.confirm({
      title: "Update available",
      message: `DevCenter ${s.version || ""} is available. Install it now? DevCenter will restart to finish updating.`,
      confirmText: "Update & restart",
    });
    if (go) {
      try { await DC.installUpdate(); }
      catch (e) { await Modal.alert({ title: "Update failed", message: String(e) }); }
    }
  });

  // New application.
  const newAppBtn = document.getElementById("newAppBtn");
  if (newAppBtn) newAppBtn.addEventListener("click", () => openAppForm(null));

  // Add account — open the connect form, then refresh accounts + PRs.
  const addAccountBtn = document.getElementById("addAccountBtn");
  if (addAccountBtn) {
    addAccountBtn.addEventListener("click", async () => {
      const account = await openAddAccount();
      if (!account) return;
      const i = accounts.findIndex((a) => a.id === account.id);
      if (i >= 0) accounts[i] = account;
      else accounts.push(account);
      renderAccounts();
      hydratePulls();
    });
  }

  // Clone repository — ask for a URL, pick a destination folder, clone, then refresh.
  const cloneBtn = document.getElementById("cloneBtn");
  if (cloneBtn) {
    cloneBtn.addEventListener("click", async () => {
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
      cloneBtn.disabled = true;
      try {
        const repo = await DC.cloneRepo(url, dir);
        if (repo && !repos.some((r) => r.id === repo.id)) repos.push(repo);
        rerenderGit();
      } catch (e) {
        console.error("cloneRepo failed", e);
        await Modal.alert({ title: "Clone failed", message: String(e) });
      } finally {
        cloneBtn.disabled = false;
      }
    });
  }

  // Add existing repository — pick an already-cloned folder and register it.
  const addRepoBtn = document.getElementById("addRepoBtn");
  if (addRepoBtn) {
    addRepoBtn.addEventListener("click", async () => {
      let dir;
      try {
        dir = await window.__TAURI__.dialog.open({ directory: true, multiple: false, title: "Select a repository folder (or a folder containing repositories)" });
      } catch (e) {
        console.error("folder picker failed", e);
        return;
      }
      if (!dir) return;
      const originalLabel = addRepoBtn.innerHTML;
      addRepoBtn.disabled = true;
      addRepoBtn.innerHTML = `<span class="spin">${ICON.sync}</span>Scanning…`;
      try {
        // First try the picked folder as a single repository.
        let repo = null;
        try { repo = await DC.addRepo(dir); } catch (_) { repo = null; }
        if (repo) {
          const exists = repos.some((r) => r.id === repo.id);
          if (!exists) repos.push(repo);
          rerenderGit();
          if (exists) await Modal.alert({ title: "Already added", message: `“${repo.name}” is already in your list.` });
        } else {
          // Not a repo itself — scan it for repositories nested inside and add them all.
          const before = new Set(repos.map((r) => r.id));
          const all = await DC.scanRepos([dir]);
          if (Array.isArray(all)) repos = all;
          rerenderGit();
          const added = repos.filter((r) => !before.has(r.id)).length;
          if (added > 0) {
            await Modal.alert({ title: "Repositories added", message: `Added ${added} ${added === 1 ? "repository" : "repositories"} from that folder.` });
          } else {
            await Modal.alert({ title: "No repositories found", message: "That folder isn’t a Git repository and doesn’t contain any." });
          }
        }
      } catch (e) {
        console.error("addRepo failed", e);
        await Modal.alert({ title: "Couldn't add repository", message: String(e) });
      } finally {
        addRepoBtn.disabled = false;
        addRepoBtn.innerHTML = originalLabel;
      }
    });
  }
}
