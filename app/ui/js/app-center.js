// ---------- App Center render ----------
let appPresets = [];

const SERVE_LABELS = { command: "Command", static: "Static", script: "Script", apimock: "API Mock" };

function appRunLine(a) {
  if (a.serveMode === "command") return (a.commands || []).map((s) => s.trim()).filter(Boolean).slice(-1)[0] || "—";
  if (a.serveMode === "static") return a.staticDir || "./";
  if (a.serveMode === "script") return a.scriptFile || "—";
  if (a.serveMode === "apimock") return a.specFile || "—";
  return "";
}

// App summary panels were removed; kept as a no-op so callers stay harmless.
function renderAppStats() {}

const APP_TAG_FILTER_KEY = "dc.apps.tagFilter";
let appTagFilter = loadFilterSet(APP_TAG_FILTER_KEY); // selected tags; empty = all
let appStatusFilter = "all"; // "all" | "running" | "stopped"

function renderApps(filter = "") {
  // Re-rendering replaces the rows; close any open kebab menu first so it can't
  // be orphaned (its anchor button is about to be removed from the DOM).
  if (typeof Dropdown !== "undefined") Dropdown.close();
  renderAppTagFilter();
  const f = filter.toLowerCase();
  const list = apps.filter((a) => {
    const status = a.status || "stopped";
    const tags = a.tags || [];
    const matchText =
      a.name.toLowerCase().includes(f) ||
      (a.appType || "").toLowerCase().includes(f) ||
      (a.serveMode || "").includes(f) ||
      tags.some((t) => t.toLowerCase().includes(f));
    const matchStatus =
      appStatusFilter === "all" ||
      (appStatusFilter === "running" && (status === "running" || status === "building")) ||
      (appStatusFilter === "stopped" && status !== "running" && status !== "building");
    const matchTag = appTagFilter.size === 0 || tags.some((t) => appTagFilter.has(t));
    return matchText && matchStatus && matchTag;
  });
  document.getElementById("appList").innerHTML = list
    .map((a) => {
      const status = ["running", "building", "error", "stopped"].includes(a.status) ? a.status : "stopped";
      const id = Number(a.id);
      const running = status === "running";
      const building = status === "building";
      const statusLabel = { running: "Running", building: "Building", error: "Error" }[status] || "Stopped";
      const portBadge = a.port
        ? running
          ? `<span class="port-badge link" data-openurl="http://localhost:${a.port}">Port <b>${a.port}</b></span>`
          : `<span class="port-badge">Port <b>${a.port}</b></span>`
        : "";
      const meta = [];
      if (running && a.uptime) meta.push(escapeHtml(a.uptime));
      const tagChips = (a.tags || [])
        .map((t) => `<span class="chip tag-chip">${ICON.tag}${escapeHtml(t)}</span>`)
        .join("");
      const control = building
        ? `<button class="btn btn-ghost btn-sm" data-stop="${a.id}"><span class="spin">${ICON.sync}</span>Building…</button>`
        : running
        ? `<button class="btn btn-stop btn-sm" data-stop="${a.id}">${ICON.stop}Stop</button>
           <button class="btn btn-icon btn-sm" data-restart="${a.id}" title="Restart">${ICON.sync}</button>`
        : `<button class="btn btn-start btn-sm" data-start="${a.id}">${ICON.play}Start</button>`;
      return `
      <div class="app-row ${status}" data-row="${id}">
        <button class="app-drag" type="button" title="Reorder application" aria-label="Reorder ${escapeHtml(a.name)}. Use Up and Down arrow keys.">${ICON.grip}</button>
        <span class="app-status-dot ${status}"></span>
        <div class="app-main">
          <div class="app-title-row">
            <span class="app-name">${escapeHtml(a.name)}</span>
            <span class="app-state ${status}">${statusLabel}</span>
            ${tagChips}
          </div>
          <div class="app-sub">
            ${a.appType ? `<span class="app-type-label">${escapeHtml(a.appType)}</span>` : ""}
            ${portBadge}
            <span class="app-path" title="${escapeHtml(a.projectDir)}">${escapeHtml(a.projectDir)}</span>
            ${meta.length ? `<span class="app-dot">·</span><span>${meta.join(" · ")}</span>` : ""}
          </div>
        </div>
        <div class="app-controls">
          ${control}
          <button class="btn btn-icon btn-sm" data-logs="${a.id}" title="Logs">${ICON.logs}</button>
          <button class="btn btn-icon btn-sm" data-menu="${a.id}" title="More actions">${ICON.more}</button>
        </div>
      </div>`;
    })
    .join("");
  if (!list.length)
    document.getElementById("appList").innerHTML = empty(
      f || appStatusFilter !== "all" || appTagFilter.size
        ? "No applications match your filters."
        : "No applications yet. Click “New application” to add one."
    );

  setupAppListEvents();
}

// ---------- App tags: filter bar + editor (mirrors repo tags in tags.js) ----------
let appTagFilterSig = ""; // signature of the last-rendered tag menu (rebuild guard)
function renderAppTagFilter() {
  const select = document.getElementById("appTagSelect");
  const menu = document.getElementById("appTagMenu");
  const label = document.getElementById("appTagLabel");
  if (!select || !menu) return;
  // Aggregate tags across all apps with counts.
  const counts = new Map();
  apps.forEach((a) => (a.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  if (!counts.size) {
    select.hidden = true;
    // Only reset once apps have loaded; the initial pre-hydration render has an
    // empty list and would otherwise wipe the selection restored from storage.
    if (apps.length) { appTagFilter.clear(); saveFilterSet(APP_TAG_FILTER_KEY, appTagFilter); }
    appTagFilterSig = "";
    return;
  }
  select.hidden = false;
  const tags = [...counts.keys()].sort((a, b) => a.localeCompare(b));
  // Drop any selected tags that no longer exist.
  appTagFilter = new Set([...appTagFilter].filter((t) => counts.has(t)));
  saveFilterSet(APP_TAG_FILTER_KEY, appTagFilter);

  // Skip the DOM rebuild when nothing affecting the menu changed (WebView2-safe).
  const sig = tags.map((t) => `${t}:${counts.get(t)}`).join("|") + "#" + [...appTagFilter].sort().join(",");
  if (sig === appTagFilterSig) return;
  appTagFilterSig = sig;

  menu.innerHTML =
    `<label class="multiselect-opt all">
       <input type="checkbox" id="appTagAll" ${appTagFilter.size === 0 ? "checked" : ""} />
       <span>All tags</span>
     </label>
     <div class="multiselect-sep"></div>` +
    tags
      .map(
        (t) => `<label class="multiselect-opt">
          <input type="checkbox" value="${escapeHtml(t)}" ${appTagFilter.has(t) ? "checked" : ""} />
          <span>${escapeHtml(t)}</span>
          <span class="multiselect-count">${counts.get(t)}</span>
        </label>`
      )
      .join("");

  if (appTagFilter.size === 0) label.textContent = "All tags";
  else if (appTagFilter.size === 1) label.textContent = [...appTagFilter][0];
  else label.textContent = `${appTagFilter.size} tags`;

  const allBox = document.getElementById("appTagAll");
  if (allBox) {
    allBox.addEventListener("change", () => {
      appTagFilter.clear();
      saveFilterSet(APP_TAG_FILTER_KEY, appTagFilter);
      renderApps(document.getElementById("appSearch").value || "");
    });
  }
  on(menu, 'input[type="checkbox"][value]', "change", (box) => {
    if (box.checked) appTagFilter.add(box.value);
    else appTagFilter.delete(box.value);
    saveFilterSet(APP_TAG_FILTER_KEY, appTagFilter);
    renderApps(document.getElementById("appSearch").value || "");
  });
}

function openAppTagEditor(app) {
  let tags = [...(app.tags || [])];
  const suggestions = [...new Set(apps.flatMap((a) => a.tags || []))].sort();
  Modal.custom({
    title: `Tags · ${app.name}`,
    render: (body, foot, close, mkBtn) => {
      body.innerHTML = `
        <div class="tag-edit-list" id="appTagList"></div>
        <input class="modal-input" id="appTagInput" placeholder="Add a tag and press Enter" spellcheck="false" autocomplete="off" maxlength="24" />
        <div class="tag-suggest" id="appTagSuggest"></div>
        <div class="modal-error" id="appTagErr"></div>`;
      const listEl = body.querySelector("#appTagList");
      const input = body.querySelector("#appTagInput");
      const suggestEl = body.querySelector("#appTagSuggest");

      const drawList = () => {
        listEl.innerHTML = tags.length
          ? tags.map((t, i) => `<span class="tag-edit">${escapeHtml(t)}<button data-rm="${i}" title="Remove">${ICON.x}</button></span>`).join("")
          : `<span style="color:var(--text-faint);font-size:12.5px">No tags yet.</span>`;
        on(listEl, "[data-rm]", "click", (b) => {
          tags.splice(Number(b.dataset.rm), 1);
          drawList();
          drawSuggest();
        });
      };
      const addTag = (raw) => {
        const t = raw.trim();
        if (!t) return;
        if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t);
        input.value = "";
        drawList();
        drawSuggest();
      };
      const drawSuggest = () => {
        const avail = suggestions.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()));
        suggestEl.innerHTML = avail.length
          ? `<span class="tag-suggest-label">Existing tags</span>` + avail.map((s) => `<button data-add="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("")
          : "";
        on(suggestEl, "[data-add]", "click", (b) => addTag(b.dataset.add));
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          addTag(input.value);
        } else if (e.key === "Backspace" && !input.value && tags.length) {
          tags.pop();
          drawList();
          drawSuggest();
        }
      });
      drawList();
      drawSuggest();
      setTimeout(() => input.focus(), 40);

      const cancel = mkBtn("btn-ghost", "Cancel");
      cancel.addEventListener("click", () => close(null));
      const save = mkBtn("btn-primary", "Save");
      save.addEventListener("click", async () => {
        if (input.value.trim()) addTag(input.value);
        save.disabled = true;
        save.textContent = "Saving…";
        try {
          if (DC && DC.hasBackend) {
            const updated = await DC.setAppTags(Number(app.id), tags);
            const at = apps.findIndex((x) => String(x.id) === String(updated.id));
            if (at >= 0) apps[at] = updated;
          } else {
            app.tags = tags;
          }
          close(true);
          renderApps(document.getElementById("appSearch").value || "");
        } catch (e) {
          console.error("setAppTags failed", e);
          body.querySelector("#appTagErr").textContent = String(e);
          save.disabled = false;
          save.textContent = "Save";
        }
      });
      foot.append(cancel, save);
    },
  });
}

function appById(id) {
  return apps.find((a) => String(a.id) === String(id));
}

// App Center row interactions. Listeners are attached DIRECTLY to each button
// on every render — renderApps() rewrites #appList's innerHTML, so the buttons
// are fresh elements each time and get fresh listeners. This mirrors the Git
// Board rows. (A single delegated listener on the container was tried before,
// but delegated clicks on dynamically-inserted rows can silently fail to fire
// in WebView2, leaving the kebab/controls unresponsive.)
function setupAppListEvents() {
  const listEl = document.getElementById("appList");
  if (!listEl) return;

  const persistVisibleOrder = async () => {
    const visibleIds = [...listEl.querySelectorAll(".app-row")].map((row) => String(row.dataset.row));
    const visibleSet = new Set(visibleIds);
    let index = 0;
    apps = apps.map((app) => visibleSet.has(String(app.id)) ? appById(visibleIds[index++]) : app);
    if (DC && DC.hasBackend) {
      try { await DC.reorderApps(apps.map((app) => Number(app.id))); }
      catch (err) { console.error("reorderApps failed", err); }
    }
  };

  on(listEl, "[data-start]", "click", (btn) => appAction("start", btn.dataset.start, btn));
  on(listEl, "[data-stop]", "click", (btn) => appAction("stop", btn.dataset.stop, btn));
  on(listEl, "[data-restart]", "click", (btn) => appAction("restart", btn.dataset.restart, btn));
  on(listEl, "[data-logs]", "click", (btn) => openAppLogs(appById(btn.dataset.logs)));

  on(listEl, "[data-openurl]", "click", (el) => {
    if (DC && DC.hasBackend) DC.openUrl(el.dataset.openurl).catch((err) => console.error(err));
    else window.open(el.dataset.openurl, "_blank");
  });

  // Shared actions menu used by BOTH the kebab (click) and a right-click context
  // menu on the card — mirroring the Git Board repo cards.
  const appMenuItems = (a) => {
    const items = [{ label: "Edit", icon: ICON.pencil, onClick: () => openAppForm(a) }];      items.push({ label: "Edit tags", icon: ICON.tag, onClick: () => openAppTagEditor(a) });    if (DC && DC.hasBackend) {
      items.push(
        { label: "Open folder", icon: ICON.folder, onClick: () => DC.openPath(a.projectDir).catch((err) => console.error(err)) },
        { label: "Open terminal", icon: ICON.terminal, onClick: () => DC.openTerminal(a.projectDir).catch((err) => console.error(err)) }
      );
    }
    items.push({ separator: true });
    items.push({ label: "Delete", icon: ICON.trash, danger: true, onClick: () => deleteApp(a) });
    return items;
  };

  on(listEl, "[data-menu]", "click", (btn) => {
    if (Dropdown.isOpenFor(btn)) { Dropdown.close(); return; }
    const a = appById(btn.dataset.menu);
    if (a) Dropdown.menu(btn, appMenuItems(a));
  });

  // Right-click anywhere on a card opens the same actions menu (like Git Board).
  // Direct per-row listener (delegated handlers can silently fail in WebView2);
  // stopPropagation prevents the global "Reload" context menu from firing.
  on(listEl, ".app-row", "contextmenu", (row, e) => {
    const a = appById(row.dataset.row);
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    Dropdown.context(e.clientX, e.clientY, appMenuItems(a));
  });

  // Pointer-based reorder via the grip handle (no HTML5 `draggable`, which is
  // unreliable in WebView2 and can swallow sibling button clicks).
  listEl.querySelectorAll(".app-drag").forEach((handle) =>
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const row = handle.closest(".app-row");
      if (!row) return;
      const startY = e.clientY;
      let moved = false;

      const onMove = (ev) => {
        if (!moved && Math.abs(ev.clientY - startY) < 4) return;
        moved = true;
        row.classList.add("dragging");
        const others = [...listEl.querySelectorAll(".app-row:not(.dragging)")];
        const before = others.find((r) => {
          const rect = r.getBoundingClientRect();
          return ev.clientY < rect.top + rect.height / 2;
        });
        if (before) listEl.insertBefore(row, before);
        else listEl.appendChild(row);
      };
      const onUp = async () => {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onUp, true);
        row.classList.remove("dragging");
        if (moved) {
          await persistVisibleOrder();
          handle.focus();
        }
      };
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onUp, true);
    }));

  listEl.querySelectorAll(".app-drag").forEach((handle) =>
    handle.addEventListener("keydown", async (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const row = handle.closest(".app-row");
      if (!row) return;
      const sibling = e.key === "ArrowUp" ? row.previousElementSibling : row.nextElementSibling;
      if (!sibling || !sibling.classList.contains("app-row")) return;
      e.preventDefault();
      if (e.key === "ArrowUp") listEl.insertBefore(row, sibling);
      else listEl.insertBefore(sibling, row);
      await persistVisibleOrder();
      handle.focus();
    }));
}

async function appAction(kind, id, btn) {
  if (!DC || !DC.hasBackend) return;
  if (btn) btn.disabled = true;
  try {
    if (kind === "start") await DC.startApp(Number(id));
    else if (kind === "stop") await DC.stopApp(Number(id));
    else if (kind === "restart") await DC.restartApp(Number(id));
  } catch (e) {
    console.error(`${kind}App failed`, e);
    await Modal.alert({ title: "Action failed", message: String(e) });
    if (btn) btn.disabled = false;
  }
}

async function deleteApp(a) {
  if (!a) return;
  const ok = await Modal.confirm({
    title: "Delete application",
    message: `Remove “${a.name}”? It will be stopped if running. This cannot be undone.`,
    confirmText: "Delete",
    danger: true,
  });
  if (!ok) return;
  try {
    if (DC && DC.hasBackend) await DC.deleteApp(Number(a.id));
    apps = apps.filter((x) => x.id !== a.id);
    renderAppStats();
    renderApps(document.getElementById("appSearch").value || "");
  } catch (e) {
    await Modal.alert({ title: "Couldn't delete", message: String(e) });
  }
}

// ---------- App Center: New/Edit form ----------
const SERVE_MODES = [
  { value: "command", label: "Command" },
  { value: "static", label: "Static Folder" },
  { value: "script", label: "Script File" },
  { value: "apimock", label: "API Mock" },
];

async function pickFolder(title) {
  try {
    return await window.__TAURI__.dialog.open({ directory: true, multiple: false, title });
  } catch (e) {
    console.error("folder picker failed", e);
    return null;
  }
}
async function pickFile(title, filters) {
  try {
    return await window.__TAURI__.dialog.open({ directory: false, multiple: false, title, filters });
  } catch (e) {
    console.error("file picker failed", e);
    return null;
  }
}

function openAppForm(existing) {
  const a = existing
    ? JSON.parse(JSON.stringify(existing))
    : { id: 0, name: "", appType: "", serveMode: "command", projectDir: "", commands: [], staticDir: "", scriptFile: "", specFile: "", env: [], port: null, autostart: false };
  Modal.custom({
    title: existing ? `Edit · ${existing.name}` : "New application",
    wide: true,
    render: (body, foot, close, mkBtn) => {
      const presetOpts = ['<option value="">Custom</option>']
        .concat(appPresets.map((p) => `<option value="${p.value}" ${a.appType === p.value ? "selected" : ""}>${escapeHtml(p.label)}</option>`))
        .join("");
      const modeOpts = SERVE_MODES.map((m) => `<option value="${m.value}" ${a.serveMode === m.value ? "selected" : ""}>${m.label}</option>`).join("");
      body.innerHTML = `
        <div class="form-grid">
          <div class="form-row"><label class="form-label">Name</label>
            <input class="modal-input" id="afName" value="${escapeHtml(a.name)}" placeholder="My App" /></div>
          <div class="form-row"><label class="form-label">Type (preset)</label>
            <select class="modal-input" id="afType">${presetOpts}</select></div>
        </div>
        <div class="form-row"><label class="form-label">Project directory</label>
          <div class="input-row"><input class="modal-input" id="afDir" value="${escapeHtml(a.projectDir)}" placeholder="C:\\path\\to\\project" spellcheck="false" />
            <button class="btn btn-ghost btn-sm" id="afDirBrowse">${ICON.folder}Browse</button></div></div>
        <div class="form-grid">
          <div class="form-row"><label class="form-label">Serve mode</label>
            <select class="modal-input" id="afMode">${modeOpts}</select></div>
          <div class="form-row"><label class="form-label">Port</label>
            <input class="modal-input" id="afPort" type="number" min="1" max="65535" value="${a.port ?? ""}" placeholder="3000" /></div>
        </div>
        <div class="form-row" id="afCmdRow"><label class="form-label" id="afCmdLabel">Build &amp; run commands</label>
          <textarea class="modal-input" id="afCmds" rows="4" spellcheck="false" placeholder="npm install&#10;npm run dev">${escapeHtml((a.commands || []).join("\n"))}</textarea>
          <div class="form-hint" id="afCmdHint"></div></div>
        <div class="form-row" id="afStaticRow"><label class="form-label">Static folder (relative to project)</label>
          <input class="modal-input" id="afStatic" value="${escapeHtml(a.staticDir || "")}" placeholder="./dist" spellcheck="false" /></div>
        <div class="form-row" id="afScriptRow"><label class="form-label">Script file</label>
          <div class="input-row"><input class="modal-input" id="afScript" value="${escapeHtml(a.scriptFile || "")}" placeholder="run.ps1 / start.sh" spellcheck="false" />
            <button class="btn btn-ghost btn-sm" id="afScriptBrowse">${ICON.folder}Browse</button></div></div>
        <div class="form-row" id="afSpecRow"><label class="form-label">OpenAPI / Swagger JSON</label>
          <div class="input-row"><input class="modal-input" id="afSpec" value="${escapeHtml(a.specFile || "")}" placeholder="openapi.json" spellcheck="false" />
            <button class="btn btn-ghost btn-sm" id="afSpecBrowse">${ICON.folder}Browse</button></div></div>
        <div class="form-row"><label class="form-label">Environment variables (KEY=VALUE per line)</label>
          <textarea class="modal-input" id="afEnv" rows="2" spellcheck="false" placeholder="NODE_ENV=development">${escapeHtml((a.env || []).map(([k, v]) => `${k}=${v}`).join("\n"))}</textarea></div>
        <label class="form-check"><input type="checkbox" id="afAuto" ${a.autostart ? "checked" : ""} /> <span>Start automatically when ${window.BRAND} launches</span></label>
        <div class="modal-error" id="afErr"></div>`;

      const $ = (id) => body.querySelector(id);
      const applyMode = () => {
        const mode = $("#afMode").value;
        $("#afCmdRow").style.display = mode === "apimock" || mode === "script" ? "none" : "";
        $("#afStaticRow").style.display = mode === "static" ? "" : "none";
        $("#afScriptRow").style.display = mode === "script" ? "" : "none";
        $("#afSpecRow").style.display = mode === "apimock" ? "" : "none";
        $("#afCmdLabel").textContent = mode === "command" ? "Build & run commands" : "Build commands";
        $("#afCmdHint").textContent = mode === "command" ? "Run in order; the last line is the long-running run command." : "Optional build steps, run in order before serving.";
      };
      applyMode();
      $("#afMode").addEventListener("change", applyMode);

      // Preset fills defaults.
      $("#afType").addEventListener("change", () => {
        const p = appPresets.find((x) => x.value === $("#afType").value);
        if (!p) return;
        $("#afMode").value = p.serveMode;
        $("#afPort").value = p.port || "";
        $("#afCmds").value = p.commands || "";
        $("#afEnv").value = p.env || "";
        $("#afStatic").value = p.staticDir || "";
        if (!$("#afName").value.trim()) $("#afName").value = p.label;
        applyMode();
      });

      $("#afDirBrowse").addEventListener("click", async () => {
        const d = await pickFolder("Choose project folder");
        if (d) $("#afDir").value = d;
      });
      $("#afScriptBrowse").addEventListener("click", async () => {
        const d = await pickFile("Choose script file", [{ name: "Scripts", extensions: ["ps1", "bat", "cmd", "sh", "bash"] }]);
        if (d) $("#afScript").value = d;
      });
      $("#afSpecBrowse").addEventListener("click", async () => {
        const d = await pickFile("Choose OpenAPI/Swagger JSON", [{ name: "JSON", extensions: ["json"] }]);
        if (d) $("#afSpec").value = d;
      });

      const cancel = mkBtn("btn-ghost", "Cancel");
      cancel.addEventListener("click", () => close(null));
      const save = mkBtn("btn-primary", existing ? "Save" : "Create");
      save.addEventListener("click", async () => {
        const mode = $("#afMode").value;
        const def = {
          id: a.id || 0,
          name: $("#afName").value.trim(),
          appType: $("#afType").value,
          serveMode: mode,
          projectDir: $("#afDir").value.trim(),
          commands: $("#afCmds").value.split("\n").map((s) => s.trim()).filter(Boolean),
          staticDir: $("#afStatic").value.trim() || null,
          scriptFile: $("#afScript").value.trim() || null,
          specFile: $("#afSpec").value.trim() || null,
          env: $("#afEnv").value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.indexOf("="); return i < 0 ? [l, ""] : [l.slice(0, i).trim(), l.slice(i + 1)]; }),
          port: $("#afPort").value ? Number($("#afPort").value) : null,
          autostart: $("#afAuto").checked,
          order: a.order || 0,
        };
        const err = $("#afErr");
        if (!def.name) return (err.textContent = "Enter a name.");
        if (!def.projectDir && mode !== "apimock") return (err.textContent = "Choose a project directory.");
        if (mode === "command" && !def.commands.length) return (err.textContent = "Add at least a run command.");
        if (mode === "script" && !def.scriptFile) return (err.textContent = "Choose a script file.");
        if (mode === "apimock" && !def.specFile) return (err.textContent = "Choose an OpenAPI/Swagger file.");
        err.textContent = "";
        save.disabled = true;
        save.textContent = "Saving…";
        try {
          let saved;
          if (DC && DC.hasBackend) saved = existing ? await DC.updateApp(def) : await DC.createApp(def);
          else saved = { ...def, id: def.id || Date.now(), status: "stopped", uptime: "" };
          const at = apps.findIndex((x) => x.id === saved.id);
          if (at >= 0) apps[at] = saved;
          else apps.push(saved);
          close(true);
          renderAppStats();
          renderApps(document.getElementById("appSearch").value || "");
        } catch (e) {
          err.textContent = String(e);
          save.disabled = false;
          save.textContent = existing ? "Save" : "Create";
        }
      });
      foot.append(cancel, save);
    },
  });
}

// ---------- App Center: live log viewer ----------
let appLogUnsub = null;

function openAppLogs(a) {
  if (!a) return;
  Modal.custom({
    title: `Logs · ${a.name}`,
    wide: true,
    render: (body, foot, close, mkBtn) => {
      const I = {
        search: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
        wrap: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><path d="M3 12h15a3 3 0 1 1 0 6h-4"/><polyline points="16 16 14 18 16 20"/><line x1="3" y1="18" x2="10" y2="18"/></svg>`,
        copy: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
        save: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><polyline points="8 11 12 15 16 11"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>`,
        pause: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`,
        play: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>`,
      };
      body.innerHTML = `
        <div class="log-bar">
          <div class="search log-search">${I.search}<input id="logFilter" placeholder="Filter logs…" spellcheck="false" /></div>
          <div class="log-actions">
            <button class="log-icon active" id="logWrapBtn" type="button" title="Toggle line wrapping">${I.wrap}</button>
            <button class="log-icon" id="logCopyBtn" type="button" title="Copy logs">${I.copy}</button>
            <button class="log-icon" id="logExportBtn" type="button" title="Export logs to a file">${I.save}</button>
            <button class="log-pause" id="logPauseBtn" type="button" title="Pause auto-scroll"><span class="log-pause-ico">${I.pause}</span><span class="log-pause-label">Pause</span></button>
          </div>
        </div>
        <pre class="log-view wrap" id="logView"></pre>
        <div class="log-status">
          <span class="log-live" id="logLive"></span>
          <span id="logCount">0 lines</span>
        </div>`;
      const view = body.querySelector("#logView");
      const filterEl = body.querySelector("#logFilter");
      const pauseBtn = body.querySelector("#logPauseBtn");
      const pauseIco = pauseBtn.querySelector(".log-pause-ico");
      const pauseLabel = pauseBtn.querySelector(".log-pause-label");
      const liveEl = body.querySelector("#logLive");
      const countEl = body.querySelector("#logCount");
      let lines = [];
      let following = true; // auto-scroll while the view is pinned to the bottom

      // Format each line once (ANSI colours + linkified URLs + semantic
      // highlighting) and cache the HTML so live tailing doesn't re-run the
      // regex work on every redraw.
      const lineHtml = (l) => {
        if (l.__html == null) {
          const det = window.LogFmt ? LogFmt.detectLevel(l.line) : null;
          const lvl = det || (l.level === "error" ? "error" : l.stream === "system" ? "sys" : "out");
          const text = window.LogFmt ? LogFmt.format(l.line) : escapeHtml(l.line);
          const ts = l.ts ? `<span class="log-ts">${escapeHtml(l.ts)}</span>` : "";
          l.__html = `<span class="log-line log-${lvl}">${ts}<span class="log-text">${text}</span></span>`;
        }
        return l.__html;
      };
      const visible = () => {
        const q = filterEl.value.toLowerCase();
        return q ? lines.filter((l) => l.line.toLowerCase().includes(q)) : lines;
      };
      const atBottom = () => view.scrollHeight - view.scrollTop - view.clientHeight < 28;

      // Pause/Resume mirrors whether the view is following the tail. It's driven
      // automatically by scrolling (scroll up = pause, return to the bottom =
      // resume) and can also be toggled by clicking the button.
      const setFollowing = (f) => {
        following = f;
        pauseBtn.classList.toggle("paused", !f);
        pauseIco.innerHTML = f ? I.pause : I.play;
        pauseLabel.textContent = f ? "Pause" : "Resume";
        liveEl.className = "log-live" + (f ? "" : " paused");
        liveEl.title = f ? "Following new output" : "Paused — scrolled up";
      };
      const updateCount = (shownN) => {
        const total = lines.length;
        if (shownN == null) shownN = visible().length;
        countEl.textContent = filterEl.value
          ? `${shownN} of ${total} line${total === 1 ? "" : "s"}`
          : `${total} line${total === 1 ? "" : "s"}`;
      };
      const draw = () => {
        const shown = visible();
        const prevTop = view.scrollTop;
        view.innerHTML = shown.length
          ? shown.map(lineHtml).join("")
          : `<span class="log-empty">No log output ${filterEl.value ? "matches the filter" : "yet"}.</span>`;
        // Stick to the bottom while following; otherwise keep the reader's spot.
        view.scrollTop = following ? view.scrollHeight : prevTop;
        updateCount(shown.length);
      };
      filterEl.addEventListener("input", () => draw());

      // Scrolling drives the follow state: at the bottom → follow, scrolled up →
      // pause. rAF-debounced so rapid scroll events stay cheap.
      let scrollRaf = 0;
      view.addEventListener("scroll", () => {
        if (scrollRaf) return;
        scrollRaf = requestAnimationFrame(() => {
          scrollRaf = 0;
          const f = atBottom();
          if (f !== following) setFollowing(f);
        });
      });

      // Clicking a linkified URL opens it in the system browser.
      view.addEventListener("click", (e) => {
        const link = e.target.closest("a.lg-link");
        if (!link) return;
        e.preventDefault();
        if (link.dataset.url && DC && DC.openUrl) DC.openUrl(link.dataset.url);
      });

      const flash = (btn) => { if (!btn) return; btn.classList.add("flash"); setTimeout(() => btn.classList.remove("flash"), 900); };

      // Wrap toggle (on by default).
      const wrapBtn = body.querySelector("#logWrapBtn");
      wrapBtn.addEventListener("click", () => {
        wrapBtn.classList.toggle("active", view.classList.toggle("wrap"));
      });

      // Copy / Export operate on ALL captured lines (not just the filtered view).
      const asText = () => lines.map((l) => `${l.ts ? "[" + l.ts + "] " : ""}${l.line}`).join("\n");
      const copyBtn = body.querySelector("#logCopyBtn");
      copyBtn.addEventListener("click", async () => {
        await copyToClipboard(asText());
        flash(copyBtn);
      });
      const exportBtn = body.querySelector("#logExportBtn");
      exportBtn.addEventListener("click", async () => {
        try {
          const dlg = window.__TAURI__ && window.__TAURI__.dialog;
          if (!dlg || !dlg.save) return;
          const fname = `${(a.name || "app").replace(/[^\w.-]+/g, "_")}-logs.txt`;
          const path = await dlg.save({ title: "Export logs", defaultPath: fname, filters: [{ name: "Log file", extensions: ["txt", "log"] }] });
          if (!path) return;
          await DC.writeTextFile(path, asText());
          flash(exportBtn);
        } catch (err) { console.error("export failed", err); }
      });

      // Pause / resume auto-scroll. Resuming jumps straight to the latest output.
      pauseBtn.addEventListener("click", () => {
        if (following) setFollowing(false);
        else { setFollowing(true); view.scrollTop = view.scrollHeight; }
      });

      // Initial snapshot + live tail.
      if (DC && DC.hasBackend) {
        DC.appLogs(Number(a.id)).then((snap) => { lines = snap || []; draw(); }).catch((e) => console.error(e));
        DC.onAppLog((l) => {
          if (String(l.id) !== String(a.id)) return;
          lines.push(l);
          if (lines.length > 2000) lines.shift();
          draw();
        }).then((un) => { appLogUnsub = un; });
      } else {
        view.innerHTML = `<span class="log-empty">Logs stream in the desktop app.</span>`;
      }

      const clear = mkBtn("btn-ghost", "Clear");
      clear.addEventListener("click", () => { lines = []; setFollowing(true); draw(); });
      const done = mkBtn("btn-primary", "Close");
      const stop = () => { if (appLogUnsub) { appLogUnsub(); appLogUnsub = null; } close(true); };
      done.addEventListener("click", stop);
      foot.append(clear, done);
    },
  });
}
