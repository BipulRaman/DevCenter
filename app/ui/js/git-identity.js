// ============ DevCenter — Git Identities (multi-account gitconfig) ============
// Design and save a multi-account Git setup: one default identity plus
// per-repository "identities" that Git activates automatically via conditional
// includes (`includeIf`). Shares the global lexical scope with the other UI
// modules (classic scripts, no ES modules). Depends on DC, ICON, Modal, on(),
// escapeHtml() defined earlier in the load order.

let gitIdentity = null;

// Human labels + placeholders for the two condition kinds we support.
const IDENTITY_COND = {
  remoteUrl: {
    label: "Remote URL matches",
    short: "URL",
    placeholder: "https://dev.azure.com/Contoso/**",
    hint: "Glob against the repository's remote URL (needs Git 2.36+). Use ** to match anything.",
  },
  gitdir: {
    label: "Repository folder",
    short: "Folder",
    placeholder: "~/work/",
    hint: "Matches repositories located under this folder path.",
  },
};

function condLabel(kind) {
  return (IDENTITY_COND[kind] || IDENTITY_COND.remoteUrl).short;
}

// ---------- Rendering ----------
function renderGitIdentity() {
  const host = document.getElementById("gitIdentityRoot");
  if (!host) return;

  if (!DC || !DC.hasBackend) {
    host.innerHTML = `<div class="account-empty">${ICON.gear}<div>Git identity management is available in the desktop app.</div></div>`;
    return;
  }
  if (!gitIdentity) {
    host.innerHTML = `<div class="account-empty">${ICON.sync}<div>Loading your Git configuration…</div></div>`;
    return;
  }

  const g = gitIdentity;
  const defName = g.defaultName ? escapeHtml(g.defaultName) : "<em>Not set</em>";
  const defEmail = g.defaultEmail ? escapeHtml(g.defaultEmail) : "<em>Not set</em>";

  const profilesHtml = g.profiles.length
    ? g.profiles
        .map((p, i) => {
          const conds = p.conditions.length
            ? p.conditions
                .map(
                  (c) =>
                    `<span class="identity-chip"><span class="identity-chip-k">${condLabel(c.kind)}</span>${escapeHtml(c.value || "")}</span>`
                )
                .join("")
            : `<span class="identity-chip identity-chip-warn">No conditions — never activates</span>`;
          const creds = p.credentials && p.credentials.length
            ? `<div class="identity-creds">${ICON.key}<span>${p.credentials
                .map((c) => `${escapeHtml(c.org)} · ${escapeHtml(c.username)}`)
                .join(", ")}</span></div>`
            : "";
          return `
      <div class="identity-card">
        <div class="identity-card-head">
          <div class="identity-card-title">
            <span class="identity-name">${escapeHtml(p.name || p.key)}</span>
            <code class="identity-file">~/.gitconfig-${escapeHtml(p.key)}</code>
          </div>
          <div class="identity-card-actions">
            <button class="btn btn-ghost btn-sm" data-edit="${i}">${ICON.pencil}Edit</button>
            <button class="btn btn-icon btn-sm" data-remove="${i}" title="Remove identity">${ICON.trash}</button>
          </div>
        </div>
        <div class="identity-sub">${escapeHtml(p.email || "no email")}</div>
        <div class="identity-conds">${conds}</div>
        ${creds}
      </div>`;
        })
        .join("")
    : `<div class="account-empty">${ICON.branch}<div><strong>No conditional identities yet</strong><br>Add one to use a different name, email or Azure credential for specific repositories.</div><button class="btn btn-primary btn-sm" id="addIdentityEmpty">${ICON.plus}Add identity</button></div>`;

  host.innerHTML = `
    <div class="identity-default">
      <div class="identity-default-head">
        <div>
          <div class="identity-default-label">Default identity</div>
          <div class="identity-default-desc">Used for every repository that doesn't match a condition below.</div>
        </div>
        <button class="btn btn-ghost btn-sm" id="editDefaultBtn">${ICON.pencil}Edit</button>
      </div>
      <div class="identity-default-body">
        <div class="identity-kv"><span>Name</span><strong>${defName}</strong></div>
        <div class="identity-kv"><span>Email</span><strong>${defEmail}</strong></div>
      </div>
    </div>

    <div class="identity-section-head">
      <div class="identity-section-title">Conditional identities</div>
      <button class="btn btn-primary btn-sm" id="addIdentitySection">${ICON.plus}Add identity</button>
    </div>
    <div class="identity-list">${profilesHtml}</div>

    <div class="identity-foot">${ICON.gear}<span>Saved to <code>${escapeHtml(g.globalPath)}</code> and per-identity <code>~/.gitconfig-*</code> files. DevCenter only rewrites the sections it manages — your other settings are left untouched.</span></div>
  `;

  const editDefault = document.getElementById("editDefaultBtn");
  if (editDefault) editDefault.addEventListener("click", () => editDefaultIdentity());

  const addSection = document.getElementById("addIdentitySection");
  if (addSection) addSection.addEventListener("click", () => editProfile(null));
  const addEmpty = document.getElementById("addIdentityEmpty");
  if (addEmpty) addEmpty.addEventListener("click", () => editProfile(null));

  host.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => editProfile(Number(btn.dataset.edit)));
  });
  host.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => removeProfile(Number(btn.dataset.remove)));
  });
}

async function hydrateGitIdentity() {
  if (!DC || !DC.hasBackend) return;
  try {
    const data = await DC.readGitIdentity();
    if (data) {
      gitIdentity = data;
      renderGitIdentity();
    }
  } catch (e) {
    console.error("readGitIdentity failed", e);
    await Modal.alert({ title: "Couldn't read Git config", message: String(e) });
  }
}

// Persist the full config, refresh state, re-render. Returns true on success.
async function persistGitIdentity(next) {
  try {
    const saved = await DC.saveGitIdentity(next);
    gitIdentity = saved;
    renderGitIdentity();
    return true;
  } catch (e) {
    await Modal.alert({ title: "Couldn't save Git identities", message: String(e) });
    return false;
  }
}

// ---------- Default identity modal ----------
function editDefaultIdentity() {
  const g = gitIdentity;
  Modal.custom({
    title: "Default identity",
    render: (body, foot, close, mkBtn) => {
      body.innerHTML = `
        <div class="form-row">
          <label class="form-label">Name</label>
          <input class="modal-input" id="diName" placeholder="Jane Doe" spellcheck="false" autocomplete="off" />
        </div>
        <div class="form-row">
          <label class="form-label">Email</label>
          <input class="modal-input" id="diEmail" placeholder="jane@example.com" spellcheck="false" autocomplete="off" />
        </div>
        <div class="modal-error" id="diErr"></div>`;
      body.querySelector("#diName").value = g.defaultName || "";
      body.querySelector("#diEmail").value = g.defaultEmail || "";
      const err = body.querySelector("#diErr");

      const cancel = mkBtn("btn-ghost", "Cancel");
      cancel.addEventListener("click", () => close(null));
      const save = mkBtn("btn-primary", "Save");
      save.addEventListener("click", async () => {
        const name = body.querySelector("#diName").value.trim();
        const email = body.querySelector("#diEmail").value.trim();
        if (!name || !email) {
          err.textContent = "Enter both a name and an email.";
          return;
        }
        save.disabled = true;
        save.textContent = "Saving…";
        const next = { ...g, defaultName: name, defaultEmail: email };
        const ok = await persistGitIdentity(next);
        if (ok) close(true);
        else {
          save.disabled = false;
          save.textContent = "Save";
        }
      });
      foot.append(cancel, save);
    },
  });
}

// ---------- Profile (conditional identity) modal ----------
function editProfile(index) {
  const existing = index != null && index >= 0 ? gitIdentity.profiles[index] : null;
  openIdentityForm(existing).then(async (profile) => {
    if (!profile) return;
    const next = { ...gitIdentity, profiles: gitIdentity.profiles.slice() };
    if (existing) next.profiles[index] = profile;
    else next.profiles.push(profile);
    await persistGitIdentity(next);
  });
}

async function removeProfile(index) {
  const p = gitIdentity.profiles[index];
  if (!p) return;
  const ok = await Modal.confirm({
    title: "Remove identity",
    message: `Remove “${p.name || p.key}”? Its condition will be removed from ~/.gitconfig. The ~/.gitconfig-${p.key} file is left on disk in case you still need it.`,
    confirmText: "Remove",
    danger: true,
  });
  if (!ok) return;
  const next = { ...gitIdentity, profiles: gitIdentity.profiles.slice() };
  next.profiles.splice(index, 1);
  await persistGitIdentity(next);
}

// Build the add/edit form. Resolves to a profile object, or null if cancelled.
function openIdentityForm(existing) {
  return Modal.custom({
    title: existing ? "Edit identity" : "Add identity",
    wide: true,
    render: (body, foot, close, mkBtn) => {
      body.innerHTML = `
        <div class="form-grid-2">
          <div class="form-row">
            <label class="form-label">Identity name</label>
            <input class="modal-input" id="pfKey" placeholder="e.g. work" spellcheck="false" autocomplete="off" />
            <div class="form-hint">Used for the file <code id="pfFile">~/.gitconfig-…</code></div>
          </div>
          <div class="form-row">
            <label class="form-label">Git email</label>
            <input class="modal-input" id="pfEmail" placeholder="jane@contoso.com" spellcheck="false" autocomplete="off" />
          </div>
        </div>
        <div class="form-row">
          <label class="form-label">Git name</label>
          <input class="modal-input" id="pfName" placeholder="Jane Doe" spellcheck="false" autocomplete="off" />
        </div>

        <div class="form-row">
          <label class="form-label">Activate when…</label>
          <div class="identity-rows" id="pfConds"></div>
          <button type="button" class="btn btn-ghost btn-sm" id="pfAddCond" style="margin-top:8px">${ICON.plus}Add condition</button>
        </div>

        <details class="identity-advanced" id="pfAdvanced">
          <summary>Azure DevOps credential usernames (optional)</summary>
          <div class="form-hint" style="margin:8px 0">Maps a sign-in username to an Azure DevOps organization so the credential helper picks the right account.</div>
          <div class="identity-rows" id="pfCreds"></div>
          <button type="button" class="btn btn-ghost btn-sm" id="pfAddCred" style="margin-top:8px">${ICON.plus}Add credential</button>
        </details>

        <div class="modal-error" id="pfErr"></div>`;

      const keyInput = body.querySelector("#pfKey");
      const fileEl = body.querySelector("#pfFile");
      const condsHost = body.querySelector("#pfConds");
      const credsHost = body.querySelector("#pfCreds");
      const err = body.querySelector("#pfErr");

      keyInput.value = existing ? existing.key || "" : "";
      body.querySelector("#pfName").value = existing ? existing.name || "" : "";
      body.querySelector("#pfEmail").value = existing ? existing.email || "" : "";

      const slug = (s) =>
        (s || "")
          .trim()
          .replace(/[^A-Za-z0-9._-]+/g, "-")
          .replace(/^-+|-+$/g, "");
      const syncFile = () => {
        const k = slug(keyInput.value) || "…";
        fileEl.textContent = `~/.gitconfig-${k}`;
      };
      keyInput.addEventListener("input", syncFile);
      syncFile();

      // --- Condition rows ---
      const addCondRow = (cond) => {
        const kind = cond && cond.kind ? cond.kind : "remoteUrl";
        const row = document.createElement("div");
        row.className = "identity-row";
        row.innerHTML = `
          <select class="modal-input identity-row-kind">
            <option value="remoteUrl">${IDENTITY_COND.remoteUrl.label}</option>
            <option value="gitdir">${IDENTITY_COND.gitdir.label}</option>
          </select>
          <input class="modal-input identity-row-val" spellcheck="false" autocomplete="off" />
          <button type="button" class="btn btn-icon btn-sm identity-row-del" title="Remove">${ICON.x}</button>`;
        const sel = row.querySelector(".identity-row-kind");
        const val = row.querySelector(".identity-row-val");
        sel.value = kind;
        val.value = cond ? cond.value || "" : "";
        const applyPlaceholder = () => {
          val.placeholder = (IDENTITY_COND[sel.value] || IDENTITY_COND.remoteUrl).placeholder;
        };
        applyPlaceholder();
        sel.addEventListener("change", applyPlaceholder);
        row.querySelector(".identity-row-del").addEventListener("click", () => row.remove());
        condsHost.appendChild(row);
      };
      const initialConds = existing && existing.conditions && existing.conditions.length
        ? existing.conditions
        : [{ kind: "remoteUrl", value: "" }];
      initialConds.forEach(addCondRow);
      body.querySelector("#pfAddCond").addEventListener("click", () => addCondRow(null));

      // --- Credential rows ---
      const addCredRow = (cred) => {
        const row = document.createElement("div");
        row.className = "identity-row identity-row-cred";
        row.innerHTML = `
          <input class="modal-input identity-cred-org" placeholder="organization" spellcheck="false" autocomplete="off" />
          <input class="modal-input identity-cred-user" placeholder="user@contoso.com" spellcheck="false" autocomplete="off" />
          <button type="button" class="btn btn-icon btn-sm identity-row-del" title="Remove">${ICON.x}</button>`;
        row.querySelector(".identity-cred-org").value = cred ? cred.org || "" : "";
        row.querySelector(".identity-cred-user").value = cred ? cred.username || "" : "";
        row.dataset.authority = cred && cred.authority ? cred.authority : "";
        row.querySelector(".identity-row-del").addEventListener("click", () => row.remove());
        credsHost.appendChild(row);
      };
      const initialCreds = existing && existing.credentials ? existing.credentials : [];
      initialCreds.forEach(addCredRow);
      if (initialCreds.length) body.querySelector("#pfAdvanced").open = true;
      body.querySelector("#pfAddCred").addEventListener("click", () => addCredRow(null));

      const cancel = mkBtn("btn-ghost", "Cancel");
      cancel.addEventListener("click", () => close(null));
      const save = mkBtn("btn-primary", existing ? "Save identity" : "Add identity");
      save.addEventListener("click", () => {
        const key = slug(keyInput.value);
        const name = body.querySelector("#pfName").value.trim();
        const email = body.querySelector("#pfEmail").value.trim();
        if (!key) {
          err.textContent = "Enter an identity name.";
          return;
        }
        if (!name || !email) {
          err.textContent = "Enter a Git name and email for this identity.";
          return;
        }
        const conditions = [];
        condsHost.querySelectorAll(".identity-row").forEach((row) => {
          const kind = row.querySelector(".identity-row-kind").value;
          const value = row.querySelector(".identity-row-val").value.trim();
          if (value) conditions.push({ kind, value });
        });
        if (!conditions.length) {
          err.textContent = "Add at least one condition so this identity can activate.";
          return;
        }
        const credentials = [];
        let credError = false;
        credsHost.querySelectorAll(".identity-row-cred").forEach((row) => {
          const org = row.querySelector(".identity-cred-org").value.trim();
          const username = row.querySelector(".identity-cred-user").value.trim();
          if (!org && !username) return;
          if (!org || !username) credError = true;
          credentials.push({ org, username, authority: row.dataset.authority || null });
        });
        if (credError) {
          err.textContent = "Each Azure credential needs both an organization and a username.";
          return;
        }
        err.textContent = "";
        close({
          key,
          name,
          email,
          path: `~/.gitconfig-${key}`,
          conditions,
          credentials,
        });
      });
      foot.append(cancel, save);
    },
  });
}

// Wire the header "Add identity" button + first load.
(function () {
  const addBtn = document.getElementById("addIdentityBtn");
  if (addBtn) addBtn.addEventListener("click", () => editProfile(null));
  if (DC && DC.hasBackend) {
    hydrateGitIdentity();
  } else {
    renderGitIdentity();
  }
})();
