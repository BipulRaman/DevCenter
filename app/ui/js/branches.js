// ---------- New branch: validation + dialog ----------
// Validate a branch name against the (subset of) git ref-name rules that matter
// for a UI: no spaces, no special tokens, no `..`/`//`, no leading/trailing
// `/`/`.`, no `.lock` suffix, and not a duplicate of an existing branch.
function validateBranchName(name, existing) {
  if (!name) return "Branch name is required.";
  if (/\s/.test(name)) return "Branch name cannot contain spaces.";
  if (/[~^:?*[\\]/.test(name)) return "Branch name cannot contain ~ ^ : ? * [ or \\.";
  if (/[\x00-\x1f\x7f]/.test(name)) return "Branch name cannot contain control characters.";
  if (name.includes("..")) return "Branch name cannot contain '..'.";
  if (name.includes("//")) return "Branch name cannot contain '//'.";
  if (name.startsWith("/") || name.endsWith("/")) return "Branch name cannot start or end with '/'.";
  if (name.startsWith(".") || name.endsWith(".")) return "Branch name cannot start or end with '.'.";
  if (name.endsWith(".lock")) return "Branch name cannot end with '.lock'.";
  if (name.includes("@{") || name === "@") return "Branch name cannot contain '@{' or be '@'.";
  if (existing && existing.includes(name)) return "A branch with this name already exists.";
  return null;
}

// Open the "Create a branch" dialog. `branches` is the list of base candidates,
// `current` is preselected as the base. `onCreate(name, base)` runs on confirm.
function openNewBranchDialog({ branches, current, onCreate }) {
  const bases = branches && branches.length ? branches.slice() : [];
  const base0 = current && bases.includes(current) ? current : bases[0] || "";
  Modal.custom({
    title: "Create a branch",
    render: (body, foot, close, mkBtn) => {
      body.innerHTML = `
        <div class="form-row">
          <label class="form-label" for="nbName">New branch name</label>
          <input class="modal-input" id="nbName" type="text" placeholder="feature/my-change" spellcheck="false" autocomplete="off" />
        </div>
        <div class="form-row">
          <label class="form-label" for="nbBase">Base branch</label>
          <select class="modal-input" id="nbBase"></select>
          <div class="form-hint">The new branch will start from the tip of this branch.</div>
        </div>
        <div class="modal-error" id="nbErr"></div>`;
      const nameEl = body.querySelector("#nbName");
      const baseEl = body.querySelector("#nbBase");
      const errEl = body.querySelector("#nbErr");
      if (!bases.length) {
        const o = document.createElement("option");
        o.value = "";
        o.textContent = "(current branch)";
        baseEl.appendChild(o);
        baseEl.disabled = true;
      } else {
        bases.forEach((b) => {
          const o = document.createElement("option");
          o.value = b;
          o.textContent = b;
          if (b === base0) o.selected = true;
          baseEl.appendChild(o);
        });
      }

      const submit = () => {
        const name = nameEl.value.trim();
        const base = baseEl.value;
        const msg = validateBranchName(name, bases);
        if (msg) {
          errEl.textContent = msg;
          nameEl.focus();
          return;
        }
        close({ name, base });
      };
      nameEl.addEventListener("input", () => (errEl.textContent = ""));
      nameEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });
      const cancel = mkBtn("btn-ghost", "Cancel");
      cancel.addEventListener("click", () => close(null));
      const create = mkBtn("btn-primary", "Create branch");
      create.addEventListener("click", submit);
      foot.append(cancel, create);
      setTimeout(() => nameEl.focus(), 40);
    },
  }).then((res) => {
    if (res) onCreate(res.name, res.base);
  });
}

// Open the "Merge into <current>" dialog. `branches` are the candidate source
// branches (current already excluded). `onMerge(source)` runs on confirm.
function openMergeBranchDialog({ branches, current, onMerge }) {
  Modal.custom({
    title: `Merge into “${current}”`,
    render: (body, foot, close, mkBtn) => {
      body.innerHTML = `
        <div class="form-row">
          <label class="form-label" for="mbSource">Branch to merge</label>
          <select class="modal-input" id="mbSource"></select>
          <div class="form-hint">Merges the selected branch's history into “${escapeHtml(current)}”. If both branches changed the same lines, you'll be asked to resolve conflicts.</div>
        </div>`;
      const sel = body.querySelector("#mbSource");
      branches.forEach((b) => {
        const o = document.createElement("option");
        o.value = b;
        o.textContent = b;
        sel.appendChild(o);
      });
      const cancel = mkBtn("btn-ghost", "Cancel");
      cancel.addEventListener("click", () => close(null));
      const merge = mkBtn("btn-primary", "Merge branch");
      merge.addEventListener("click", () => close(sel.value));
      foot.append(cancel, merge);
      setTimeout(() => sel.focus(), 40);
    },
  }).then((source) => {
    if (source) onMerge(source);
  });
}

// Copy text to the clipboard, with a textarea fallback for non-secure contexts.
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}

// Generic multi-field text-input dialog — used by several git-menu flows
// (Add Remote, Pull from…, Push to…, Create Tag…). `fields` is an array of
// { label, placeholder, value }. Resolves to an array of trimmed values (same
// order as `fields`), or null if cancelled.
function openFieldsDialog({ title, message, fields, confirmText, validate }) {
  return Modal.custom({
    title,
    render: (body, foot, close, mkBtn) => {
      body.innerHTML =
        (message ? `<p class="modal-msg">${escapeHtml(message)}</p>` : "") +
        fields
          .map(
            (f, i) => `
          <div class="form-row">
            <label class="form-label" for="fd${i}">${escapeHtml(f.label)}</label>
            <input class="modal-input" id="fd${i}" type="text" placeholder="${escapeHtml(f.placeholder || "")}" value="${escapeHtml(f.value || "")}" spellcheck="false" autocomplete="off" />
          </div>`
          )
          .join("") + `<div class="modal-error" id="fdErr"></div>`;
      const inputs = fields.map((_, i) => body.querySelector(`#fd${i}`));
      const errEl = body.querySelector("#fdErr");
      const submit = () => {
        const values = inputs.map((el) => el.value.trim());
        const msg = validate ? validate(values) : null;
        if (msg) {
          errEl.textContent = msg;
          return;
        }
        close(values);
      };
      inputs.forEach((el) =>
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter") submit();
        })
      );
      const cancel = mkBtn("btn-ghost", "Cancel");
      cancel.addEventListener("click", () => close(null));
      const ok = mkBtn("btn-primary", confirmText || "OK");
      ok.addEventListener("click", submit);
      foot.append(cancel, ok);
      setTimeout(() => inputs[0] && inputs[0].focus(), 40);
    },
  });
}

// Generic "pick one item from a list, then confirm" dialog — used by several
// git-menu flows (choose a stash/tag/remote/branch to act on). `items` is a
// plain array; `label(item)` returns the option's display text. Resolves to
// the chosen item, or null if cancelled.
function openPickDialog({ title, message, items, label, confirmText, danger }) {
  return Modal.custom({
    title,
    render: (body, foot, close, mkBtn) => {
      body.innerHTML =
        (message ? `<p class="modal-msg">${escapeHtml(message)}</p>` : "") +
        `<div class="form-row"><select class="modal-input" id="pickSel"></select></div>`;
      const sel = body.querySelector("#pickSel");
      items.forEach((it, i) => {
        const o = document.createElement("option");
        o.value = String(i);
        o.textContent = label(it);
        sel.appendChild(o);
      });
      const cancel = mkBtn("btn-ghost", "Cancel");
      cancel.addEventListener("click", () => close(null));
      const ok = mkBtn(danger ? "btn-danger" : "btn-primary", confirmText || "OK");
      ok.addEventListener("click", () => close(items[Number(sel.value)]));
      foot.append(cancel, ok);
    },
  });
}

// Rename dialog for a branch. `existing` is the full branch list (for dup check).
function openRenameBranchDialog({ branch, existing, onRename }) {
  Modal.prompt({
    title: "Rename branch",
    label: `New name for “${branch}”`,
    value: branch,
    confirmText: "Rename",
    validate: (v) => {
      if (!v) return "Branch name is required.";
      if (v === branch) return "Enter a different name.";
      return validateBranchName(v, existing);
    },
  }).then((v) => {
    if (v && v !== branch) onRename(v);
  });
}

// Confirm + delete a branch, offering a force-delete fallback when git reports
// the branch is not fully merged.
async function deleteBranchFlow({ repoId, branch, onChanged }) {
  const ok = await Modal.confirm({
    title: "Delete branch",
    message: `Are you sure you want to delete the branch “${branch}”? This cannot be undone.`,
    confirmText: "Delete",
    danger: true,
  });
  if (!ok) return;
  try {
    const updated = await DC.deleteBranch(repoId, branch, false);
    if (onChanged) onChanged(updated);
  } catch (e) {
    const msg = String(e);
    if (/not fully merged/i.test(msg)) {
      const force = await Modal.confirm({
        title: "Branch not fully merged",
        message: `“${branch}” has commits that aren't merged anywhere else. Delete it anyway? Those commits may be lost.`,
        confirmText: "Delete anyway",
        danger: true,
      });
      if (!force) return;
      try {
        const updated = await DC.deleteBranch(repoId, branch, true);
        if (onChanged) onChanged(updated);
      } catch (e2) {
        console.error("deleteBranch (force) failed", e2);
        await Modal.alert({ title: "Delete failed", message: String(e2) });
      }
    } else {
      console.error("deleteBranch failed", e);
      await Modal.alert({ title: "Delete failed", message: msg });
    }
  }
}

// Right-click menu for a branch row: Rename / Copy name / Delete. `isCurrent`
// disables Delete (you can't delete the checked-out branch). `onChanged(repo)`
// runs after a successful rename/delete to refresh the surrounding view.
function openBranchContextMenu(e, { repoId, branch, isCurrent, branches, onChanged }) {
  if (!DC || !DC.hasBackend) return;
  const existing = branches || [];
  Dropdown.context(e.clientX, e.clientY, [
    {
      label: "Rename…",
      icon: ICON.pencil,
      onClick: () =>
        openRenameBranchDialog({
          branch,
          existing,
          onRename: async (newName) => {
            try {
              const updated = await DC.renameBranch(repoId, branch, newName);
              if (onChanged) onChanged(updated);
            } catch (err) {
              console.error("renameBranch failed", err);
              await Modal.alert({ title: "Rename failed", message: String(err) });
            }
          },
        }),
    },
    {
      label: "Copy branch name",
      icon: ICON.copy,
      onClick: () => copyToClipboard(branch),
    },
    { separator: true },
    {
      label: "Delete…",
      icon: ICON.trash,
      danger: true,
      disabled: !!isCurrent,
      onClick: () => deleteBranchFlow({ repoId, branch, onChanged }),
    },
  ]);
}

// GitHub Desktop-style prompt shown when switching branches with uncommitted
// changes. Resolves to "leave" (stash the work on the current branch), "bring"
// (carry it to the target), or null if cancelled.
function openSwitchBranchDialog({ current, target }) {
  return Modal.custom({
    title: "Switch branch",
    render: (body, foot, close, mkBtn) => {
      body.innerHTML = `
        <p class="modal-msg">You have changes on this branch. What would you like to do with them?</p>
        <div class="switch-opts">
          <label class="switch-opt">
            <input type="radio" name="switchChoice" value="leave" checked />
            <span class="switch-opt-body">
              <span class="switch-opt-title">Leave my changes on ${escapeHtml(current)}</span>
              <span class="switch-opt-desc">Your in-progress work will be stashed on this branch for you to return to later</span>
            </span>
          </label>
          <label class="switch-opt">
            <input type="radio" name="switchChoice" value="bring" />
            <span class="switch-opt-body">
              <span class="switch-opt-title">Bring my changes to ${escapeHtml(target)}</span>
              <span class="switch-opt-desc">Your in-progress work will follow you to the new branch</span>
            </span>
          </label>
        </div>`;
      const opts = [...body.querySelectorAll(".switch-opt")];
      const sync = () => opts.forEach((o) => o.classList.toggle("active", o.querySelector("input").checked));
      opts.forEach((o) => o.querySelector("input").addEventListener("change", sync));
      sync();
      const cancel = mkBtn("btn-ghost", "Cancel");
      cancel.addEventListener("click", () => close(null));
      const ok = mkBtn("btn-primary", "Switch branch");
      ok.addEventListener("click", () => {
        const sel = body.querySelector('input[name="switchChoice"]:checked');
        close(sel ? sel.value : null);
      });
      foot.append(cancel, ok);
      setTimeout(() => ok.focus(), 40);
    },
  });
}

// Switch `repoId` to `target`. When the working tree is dirty, first ask the
// user what to do with the changes (leave/stash vs bring/carry). Returns the
// refreshed Repo, or null if the user cancelled.
async function performBranchSwitch({ repoId, current, target, dirty }) {
  let stash = false;
  if (dirty) {
    const choice = await openSwitchBranchDialog({ current, target });
    if (!choice) return null; // cancelled
    stash = choice === "leave";
  }
  return DC.checkoutBranch(repoId, target, stash);
}
