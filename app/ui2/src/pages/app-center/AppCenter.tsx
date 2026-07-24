// App Center page — list/run/stop local apps, live logs, new/edit form.
// Ported from app/ui/js/app-center.js.

import { signal, useComputed, useSignal } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import { ipc } from "@/platform/ipc";
import { pickDirectory, pickFile, saveFileDialog } from "@/platform/tauri";
import { events } from "@/platform/events";
import { apps, appPresets, appsLoaded, upsertApp, removeAppLocal, reorderApps } from "@/state/apps";
import { loadFilterSet, saveFilterSet, escapeHtml } from "@/lib/helpers";
import { ICONS, Raw, EmptyState } from "@/lib/ico";
import { openMenu, openContextMenu, type MenuItem } from "@/components/menu";
import { modal } from "@/components/modal";
import { Multiselect, type MultiOption } from "@/components/Multiselect";
import { openTagEditor as tagEditorModal } from "@/components/TagEditor";
import * as LogFmt from "@/lib/logfmt";
import type { AppLogEvent, ManagedApp, ServeMode } from "@/types/models";
import styles from "./AppCenter.module.css";

const TAG_KEY = "dc.apps.tagFilter";
const search = signal("");
const statusFilter = signal<"all" | "running" | "stopped">("all");
const tagFilter = signal<Set<string>>(loadFilterSet(TAG_KEY));

function setTag(next: Set<string>) {
  tagFilter.value = next;
  saveFilterSet(TAG_KEY, next);
}

const STATUS_LABEL: Record<string, string> = { running: "Running", building: "Building", error: "Error" };

export function AppCenter() {
  const list = useComputed(() => {
    const f = search.value.toLowerCase();
    const sf = statusFilter.value;
    const tf = tagFilter.value;
    return apps.value.filter((a) => {
      const status = a.status || "stopped";
      const tags = a.tags || [];
      const matchText =
        a.name.toLowerCase().includes(f) ||
        (a.appType || "").toLowerCase().includes(f) ||
        (a.serveMode || "").includes(f) ||
        tags.some((t) => t.toLowerCase().includes(f));
      const matchStatus =
        sf === "all" ||
        (sf === "running" && (status === "running" || status === "building")) ||
        (sf === "stopped" && status !== "running" && status !== "building");
      const matchTag = tf.size === 0 || tags.some((t) => tf.has(t));
      return matchText && matchStatus && matchTag;
    });
  });

  const tagOptions = useComputed<MultiOption[]>(() => {
    const counts = new Map<string, number>();
    for (const a of apps.value) for (const t of a.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
    return [...counts.entries()]
      .sort((x, y) => x[0].localeCompare(y[0]))
      .map(([value, count]) => ({ value, label: value, count }));
  });

  return (
    <>
      <header class="page-head">
        <div>
          <h1>App Center</h1>
          <p class="page-desc">Build, run and monitor local applications from one place.</p>
        </div>
        <div class="page-actions">
          <div class="search">
            <Raw html={ICONS.search} />
            <input
              type="text"
              placeholder="Search applications…"
              value={search.value}
              onInput={(e) => (search.value = (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="seg" role="group" aria-label="Application status">
            {(["all", "running", "stopped"] as const).map((s) => (
              <button
                key={s}
                class={`seg-btn${statusFilter.value === s ? " active" : ""}`}
                type="button"
                aria-pressed={statusFilter.value === s}
                onClick={() => (statusFilter.value = s)}
              >
                {s === "all" ? "All" : s === "running" ? "Running" : "Stopped"}
              </button>
            ))}
          </div>
          {tagOptions.value.length > 0 ? (
            <Multiselect
              options={tagOptions.value}
              selected={tagFilter.value}
              onChange={setTag}
              allLabel="All tags"
              buttonIcon={ICONS.tag}
              countNoun="tags"
              ariaLabel="Application tags"
            />
          ) : null}
          <button class="btn btn-primary" onClick={() => openAppForm(null)}>
            <Raw html={ICONS.plus} />
            New application
          </button>
        </div>
      </header>

      <div class={styles.appList}>
        {list.value.map((a) => (
          <AppRow key={a.id} app={a} />
        ))}
        {list.value.length === 0 ? (
          <EmptyState
            message={
              !appsLoaded.value
                ? "Loading applications…"
                : search.value || statusFilter.value !== "all" || tagFilter.value.size
                  ? "No applications match your filters."
                  : 'No applications yet. Click "New application" to add one.'
            }
          />
        ) : null}
      </div>
    </>
  );
}

function AppRow({ app: a }: { app: ManagedApp }) {
  const busy = useSignal(false);
  const status = (["running", "building", "error", "stopped"] as const).includes(a.status) ? a.status : "stopped";
  const running = status === "running";
  const building = status === "building";
  const statusLabel = STATUS_LABEL[status] || "Stopped";

  const action = async (kind: "start" | "stop" | "restart") => {
    if (!ipc.hasBackend || busy.value) return;
    busy.value = true;
    try {
      if (kind === "start") await ipc.startApp(a.id);
      else if (kind === "stop") await ipc.stopApp(a.id);
      else await ipc.restartApp(a.id);
    } catch (e) {
      await modal.alert({ title: "Action failed", message: String(e) });
    } finally {
      busy.value = false;
    }
  };

  const menuItems = (): MenuItem[] => {
    const items: MenuItem[] = [
      { label: "Edit", icon: ICONS.pencil, onClick: () => openAppForm(a) },
      { label: "Edit tags", icon: ICONS.tag, onClick: () => openAppTagEditor(a) },
    ];
    if (ipc.hasBackend) {
      items.push(
        { label: "Open folder", icon: ICONS.folder, onClick: () => ipc.openPath(a.projectDir).catch(() => {}) },
        { label: "Open terminal", icon: ICONS.terminal, onClick: () => ipc.openTerminal(a.projectDir).catch(() => {}) },
      );
    }
    items.push({ separator: true });
    items.push({ label: "Delete", icon: ICONS.trash, danger: true, onClick: () => deleteApp(a) });
    return items;
  };

  const onDragStart = (e: PointerEvent, handle: HTMLElement) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const row = handle.closest(`.${styles.appRow}`) as HTMLElement | null;
    const listEl = row?.parentElement;
    if (!row || !listEl) return;
    const startY = e.clientY;
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientY - startY) < 4) return;
      moved = true;
      row.classList.add(styles.dragging);
      const others = [...listEl.querySelectorAll(`.${styles.appRow}:not(.${styles.dragging})`)] as HTMLElement[];
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
      row.classList.remove(styles.dragging);
      if (moved) {
        const orderedIds = [...listEl.querySelectorAll(`.${styles.appRow}`)].map((r) => Number((r as HTMLElement).dataset.row));
        const byId = new Map(apps.value.map((x) => [x.id, x]));
        const ordered = orderedIds.map((id) => byId.get(id)).filter((x): x is ManagedApp => !!x);
        await reorderApps(ordered);
      }
    };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
  };

  const spinning = busy.value || building;

  return (
    <div
      class={`${styles.appRow} ${styles[status]}`}
      data-row={a.id}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openContextMenu(e.clientX, e.clientY, menuItems());
      }}
    >
      <button
        class={styles.appDrag}
        type="button"
        title={`Reorder ${a.name}. Use Up and Down arrow keys.`}
        onPointerDown={(e) => onDragStart(e, e.currentTarget as HTMLElement)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          const cur = apps.value;
          const i = cur.findIndex((x) => x.id === a.id);
          if (i < 0) return;
          const j = e.key === "ArrowUp" ? i - 1 : i + 1;
          if (j < 0 || j >= cur.length) return;
          e.preventDefault();
          const next = cur.slice();
          [next[i], next[j]] = [next[j], next[i]];
          void reorderApps(next);
        }}
      >
        <Raw html={ICONS.grip} />
      </button>
      <span class={`${styles.statusDot} ${styles[status]}`} />
      <div class={styles.appMain}>
        <div class={styles.titleRow}>
          <span class={styles.appName}>{a.name}</span>
          <span class={`${styles.appState} ${styles[status]}`}>{statusLabel}</span>
          {(a.tags || []).map((t) => (
            <span class="chip tag-chip" key={t}>
              <Raw html={ICONS.tag} />
              {t}
            </span>
          ))}
        </div>
        <div class={styles.appSub}>
          {a.appType ? <span class={styles.appTypeLabel}>{a.appType}</span> : null}
          {a.port ? (
            running ? (
              <span class={`${styles.portBadge} ${styles.link}`} onClick={() => ipc.openUrl(`http://localhost:${a.port}`).catch(() => {})}>
                Port <b>{a.port}</b>
              </span>
            ) : (
              <span class={styles.portBadge}>
                Port <b>{a.port}</b>
              </span>
            )
          ) : null}
          <span class={styles.appPath} title={a.projectDir}>
            {a.projectDir}
          </span>
          {running && a.uptime ? (
            <>
              <span class={styles.appDot}>·</span>
              <span>{a.uptime}</span>
            </>
          ) : null}
        </div>
      </div>
      <div class={styles.appControls}>
        {building ? (
          <button class="btn btn-ghost btn-sm" onClick={() => action("stop")}>
            <span class="spin">
              <Raw html={ICONS.sync} />
            </span>
            Building…
          </button>
        ) : running ? (
          <>
            <button class={`btn btn-sm ${styles.btnStop}`} disabled={spinning} onClick={() => action("stop")}>
              <Raw html={ICONS.stop} />
              Stop
            </button>
            <button class="btn btn-icon btn-sm" title="Restart" disabled={spinning} onClick={() => action("restart")}>
              <Raw html={ICONS.sync} />
            </button>
          </>
        ) : (
          <button class={`btn btn-sm ${styles.btnStart}`} disabled={spinning} onClick={() => action("start")}>
            <Raw html={ICONS.play} />
            Start
          </button>
        )}
        <button class="btn btn-icon btn-sm" title="Logs" onClick={() => openAppLogs(a)}>
          <Raw html={ICONS.logs} />
        </button>
        <button class="btn btn-icon btn-sm" title="More actions" onClick={(e) => openMenu(e.currentTarget as HTMLElement, menuItems())}>
          <Raw html={ICONS.more} />
        </button>
      </div>
    </div>
  );
}

async function deleteApp(a: ManagedApp) {
  const ok = await modal.confirm({
    title: "Delete application",
    message: `Remove "${a.name}"? It will be stopped if running. This cannot be undone.`,
    confirmText: "Delete",
    danger: true,
  });
  if (!ok) return;
  try {
    if (ipc.hasBackend) await ipc.deleteApp(a.id);
    removeAppLocal(a.id);
  } catch (e) {
    await modal.alert({ title: "Couldn't delete", message: String(e) });
  }
}

async function openAppTagEditor(a: ManagedApp) {
  const suggestions = [...new Set(apps.value.flatMap((x) => x.tags || []))].sort();
  const result = await tagEditorModal({ title: `Tags · ${a.name}`, tags: a.tags || [], suggestions });
  if (result == null) return;
  try {
    if (ipc.hasBackend) await ipc.setAppTags(a.id, result);
    upsertApp({ ...a, tags: result });
  } catch (e) {
    await modal.alert({ title: "Couldn't save tags", message: String(e) });
  }
}

// ---------- New / Edit form ----------

const SERVE_MODES: { value: ServeMode; label: string }[] = [
  { value: "command", label: "Command" },
  { value: "static", label: "Static Folder" },
  { value: "script", label: "Script File" },
  { value: "apimock", label: "API Mock" },
];

function blankApp(): ManagedApp {
  return {
    id: 0,
    name: "",
    appType: "",
    serveMode: "command",
    projectDir: "",
    commands: [],
    staticDir: "",
    scriptFile: "",
    specFile: "",
    env: [],
    port: null,
    autostart: false,
    order: 0,
    status: "stopped",
    tags: [],
  };
}

function openAppForm(existing: ManagedApp | null) {
  void modal.custom<boolean>({
    title: existing ? `Edit · ${existing.name}` : "New application",
    wide: true,
    body: (close) => <AppForm existing={existing} close={close} />,
  });
}

function AppForm({ existing, close }: { existing: ManagedApp | null; close: (v: boolean) => void }) {
  const [f, setF] = useState<ManagedApp>(() =>
    existing ? JSON.parse(JSON.stringify(existing)) : blankApp(),
  );
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<ManagedApp>) => setF((prev) => ({ ...prev, ...patch }));

  const mode = f.serveMode;
  const showCmds = mode !== "apimock" && mode !== "script";

  const applyPreset = (value: string) => {
    const p = appPresets.value.find((x) => x.value === value);
    set({ appType: value });
    if (!p) return;
    set({
      appType: value,
      serveMode: (p.serveMode as ServeMode) || "command",
      port: p.port ?? null,
      commands: (p.commands || "").split("\n").map((s) => s.trim()).filter(Boolean),
      env: (p.env || "").split("\n").map((l) => l.trim()).filter(Boolean).map(envPair),
      staticDir: p.staticDir || "",
      name: f.name.trim() || p.label,
    });
  };

  const save = async () => {
    const def: Record<string, unknown> = {
      id: f.id || 0,
      name: f.name.trim(),
      appType: f.appType,
      serveMode: mode,
      projectDir: f.projectDir.trim(),
      commands: f.commands,
      staticDir: (f.staticDir || "").trim() || null,
      scriptFile: (f.scriptFile || "").trim() || null,
      specFile: (f.specFile || "").trim() || null,
      env: f.env,
      port: f.port ? Number(f.port) : null,
      autostart: f.autostart,
      order: f.order || 0,
      tags: f.tags || [],
    };
    if (!def.name) return setErr("Enter a name.");
    if (!def.projectDir && mode !== "apimock") return setErr("Choose a project directory.");
    if (mode === "command" && !(def.commands as string[]).length) return setErr("Add at least a run command.");
    if (mode === "script" && !def.scriptFile) return setErr("Choose a script file.");
    if (mode === "apimock" && !def.specFile) return setErr("Choose an OpenAPI/Swagger file.");
    setErr("");
    setSaving(true);
    try {
      let saved: ManagedApp;
      if (ipc.hasBackend) saved = existing ? await ipc.updateApp(def) : await ipc.createApp(def);
      else saved = { ...(def as unknown as ManagedApp), id: f.id || Date.now(), status: "stopped" };
      upsertApp(saved);
      close(true);
    } catch (e) {
      setErr(String(e));
      setSaving(false);
    }
  };

  return (
    <>
      <div class="form-grid">
        <div class="form-row">
          <label class="form-label">Name</label>
          <input class="modal-input" value={f.name} placeholder="My App" onInput={(e) => set({ name: (e.target as HTMLInputElement).value })} />
        </div>
        <div class="form-row">
          <label class="form-label">Type (preset)</label>
          <select class="modal-input" value={f.appType} onChange={(e) => applyPreset((e.target as HTMLSelectElement).value)}>
            <option value="">Custom</option>
            {appPresets.value.map((p) => (
              <option value={p.value} key={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div class="form-row">
        <label class="form-label">Project directory</label>
        <div class={styles.inputRow}>
          <input
            class="modal-input"
            value={f.projectDir}
            placeholder="C:\\path\\to\\project"
            spellcheck={false}
            onInput={(e) => set({ projectDir: (e.target as HTMLInputElement).value })}
          />
          <button
            class="btn btn-ghost btn-sm"
            onClick={async () => {
              const d = await pickDirectory("Choose project folder");
              if (d) set({ projectDir: d });
            }}
          >
            <Raw html={ICONS.folder} />
            Browse
          </button>
        </div>
      </div>
      <div class="form-grid">
        <div class="form-row">
          <label class="form-label">Serve mode</label>
          <select class="modal-input" value={mode} onChange={(e) => set({ serveMode: (e.target as HTMLSelectElement).value as ServeMode })}>
            {SERVE_MODES.map((m) => (
              <option value={m.value} key={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div class="form-row">
          <label class="form-label">Port</label>
          <input
            class="modal-input"
            type="number"
            min={1}
            max={65535}
            value={f.port ?? ""}
            placeholder="3000"
            onInput={(e) => set({ port: (e.target as HTMLInputElement).value ? Number((e.target as HTMLInputElement).value) : null })}
          />
        </div>
      </div>
      {showCmds ? (
        <div class="form-row">
          <label class="form-label">{mode === "command" ? "Build & run commands" : "Build commands"}</label>
          <textarea
            class="modal-input"
            rows={4}
            spellcheck={false}
            placeholder={"npm install\nnpm run dev"}
            value={(f.commands || []).join("\n")}
            onInput={(e) => set({ commands: (e.target as HTMLTextAreaElement).value.split("\n").map((s) => s.trim()).filter(Boolean) })}
          />
          <div class="form-hint">
            {mode === "command" ? "Run in order; the last line is the long-running run command." : "Optional build steps, run in order before serving."}
          </div>
        </div>
      ) : null}
      {mode === "static" ? (
        <div class="form-row">
          <label class="form-label">Static folder (relative to project)</label>
          <input class="modal-input" value={f.staticDir || ""} placeholder="./dist" spellcheck={false} onInput={(e) => set({ staticDir: (e.target as HTMLInputElement).value })} />
        </div>
      ) : null}
      {mode === "script" ? (
        <div class="form-row">
          <label class="form-label">Script file</label>
          <div class={styles.inputRow}>
            <input class="modal-input" value={f.scriptFile || ""} placeholder="run.ps1 / start.sh" spellcheck={false} onInput={(e) => set({ scriptFile: (e.target as HTMLInputElement).value })} />
            <button
              class="btn btn-ghost btn-sm"
              onClick={async () => {
                const d = await pickFile("Choose script file", [{ name: "Scripts", extensions: ["ps1", "bat", "cmd", "sh", "bash"] }]);
                if (d) set({ scriptFile: d });
              }}
            >
              <Raw html={ICONS.folder} />
              Browse
            </button>
          </div>
        </div>
      ) : null}
      {mode === "apimock" ? (
        <div class="form-row">
          <label class="form-label">OpenAPI / Swagger JSON</label>
          <div class={styles.inputRow}>
            <input class="modal-input" value={f.specFile || ""} placeholder="openapi.json" spellcheck={false} onInput={(e) => set({ specFile: (e.target as HTMLInputElement).value })} />
            <button
              class="btn btn-ghost btn-sm"
              onClick={async () => {
                const d = await pickFile("Choose OpenAPI/Swagger JSON", [{ name: "JSON", extensions: ["json"] }]);
                if (d) set({ specFile: d });
              }}
            >
              <Raw html={ICONS.folder} />
              Browse
            </button>
          </div>
        </div>
      ) : null}
      <div class="form-row">
        <label class="form-label">Environment variables (KEY=VALUE per line)</label>
        <textarea
          class="modal-input"
          rows={2}
          spellcheck={false}
          placeholder="NODE_ENV=development"
          value={(f.env || []).map(([k, v]) => `${k}=${v}`).join("\n")}
          onInput={(e) => set({ env: (e.target as HTMLTextAreaElement).value.split("\n").map((l) => l.trim()).filter(Boolean).map(envPair) })}
        />
      </div>
      <label class="form-check">
        <input type="checkbox" checked={f.autostart} onChange={(e) => set({ autostart: (e.target as HTMLInputElement).checked })} /> <span>Start automatically when {window.BRAND} launches</span>
      </label>
      {err ? <div class="modal-error">{err}</div> : null}
      <div class="modal-foot">
        <button class="btn btn-ghost" type="button" onClick={() => close(false)}>
          Cancel
        </button>
        <button class="btn btn-primary" type="button" disabled={saving} onClick={save}>
          {saving ? "Saving…" : existing ? "Save" : "Create"}
        </button>
      </div>
    </>
  );
}

function envPair(l: string): [string, string] {
  const i = l.indexOf("=");
  return i < 0 ? [l, ""] : [l.slice(0, i).trim(), l.slice(i + 1)];
}

// ---------- Live log viewer ----------

function openAppLogs(a: ManagedApp) {
  void modal.custom<boolean>({
    title: `Logs · ${a.name}`,
    wide: true,
    body: (close) => <LogsViewer app={a} close={close} />,
  });
}

function LogsViewer({ app: a, close }: { app: ManagedApp; close: (v: boolean) => void }) {
  const [lines, setLines] = useState<AppLogEvent[]>([]);
  const [filter, setFilter] = useState("");
  const [wrap, setWrap] = useState(true);
  const [following, setFollowingState] = useState(true);
  const viewRef = useRef<HTMLPreElement>(null);
  const followingRef = useRef(true);
  const setFollowing = (f: boolean) => {
    followingRef.current = f;
    setFollowingState(f);
  };

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let alive = true;
    if (ipc.hasBackend) {
      ipc.appLogs(a.id).then((snap) => alive && setLines(snap || [])).catch(() => {});
      events
        .onAppLog((l) => {
          if (String(l.id) !== String(a.id)) return;
          setLines((prev) => {
            const next = prev.length > 2000 ? prev.slice(prev.length - 2000) : prev.slice();
            next.push(l);
            return next;
          });
        })
        .then((u) => {
          if (alive) unsub = u;
          else u();
        });
    }
    return () => {
      alive = false;
      if (unsub) unsub();
    };
  }, [a.id]);

  const visible = filter ? lines.filter((l) => l.line.toLowerCase().includes(filter.toLowerCase())) : lines;

  useEffect(() => {
    const el = viewRef.current;
    if (el && followingRef.current) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  const asText = () => lines.map((l) => `${l.ts ? "[" + l.ts + "] " : ""}${l.line}`).join("\n");

  const onExport = async () => {
    try {
      const fname = `${(a.name || "app").replace(/[^\w.-]+/g, "_")}-logs.txt`;
      const path = await saveFileDialog("Export logs", fname, [{ name: "Log file", extensions: ["txt", "log"] }]);
      if (path) await ipc.writeTextFile(path, asText());
    } catch (e) {
      console.error("export failed", e);
    }
  };

  const html = visible
    .map((l) => {
      const lvl = LogFmt.detectLevel(l.line) || (l.level === "error" ? "error" : l.stream === "system" ? "sys" : "out");
      const lvlClass = lvl === "error" ? styles.logError : lvl === "warn" ? styles.logWarn : lvl === "sys" ? styles.logSys : "";
      const ts = l.ts ? `<span class="${styles.logTs}">${escapeHtml(l.ts)}</span>` : "";
      return `<span class="${styles.logLine} ${lvlClass}">${ts}<span class="${styles.logText}">${LogFmt.format(l.line)}</span></span>`;
    })
    .join("");

  return (
    <>
      <div class={styles.logBar}>
        <div class={`search ${styles.logSearch}`}>
          <Raw html={ICONS.search} />
          <input placeholder="Filter logs…" spellcheck={false} value={filter} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} />
        </div>
        <div class={styles.logActions}>
          <button
            class={`${styles.logPause}${following ? "" : ` ${styles.paused}`}`}
            type="button"
            title={following ? "Pause auto-scroll" : "Resume auto-scroll"}
            onClick={() => {
              if (followingRef.current) {
                setFollowing(false);
              } else {
                setFollowing(true);
                const el = viewRef.current;
                if (el) el.scrollTop = el.scrollHeight;
              }
            }}
          >
            <span class={styles.logPauseIco}>
              <Raw html={following ? ICONS.pause : ICONS.play} />
            </span>
            <span>{following ? "Pause" : "Resume"}</span>
          </button>
          <button class={`${styles.logIcon}${wrap ? ` ${styles.active}` : ""}`} type="button" title="Toggle line wrapping" onClick={() => setWrap((v) => !v)}>
            <Raw html={ICONS.swap} />
          </button>
          <button class={styles.logIcon} type="button" title="Copy logs" onClick={() => navigator.clipboard?.writeText(asText()).catch(() => {})}>
            <Raw html={ICONS.copy} />
          </button>
          <button class={styles.logIcon} type="button" title="Export logs to a file" onClick={onExport}>
            <Raw html={ICONS.archive} />
          </button>
        </div>
      </div>
      <pre
        ref={viewRef}
        class={`${styles.logView}${wrap ? ` ${styles.wrap}` : ""}`}
        onScroll={(e) => {
          const el = e.currentTarget;
          const f = el.scrollHeight - el.scrollTop - el.clientHeight < 28;
          if (f !== followingRef.current) setFollowing(f);
        }}
        onClick={(e) => {
          const link = (e.target as HTMLElement).closest("a.lg-link") as HTMLAnchorElement | null;
          if (link?.dataset.url) {
            e.preventDefault();
            ipc.openUrl(link.dataset.url).catch(() => {});
          }
        }}
        dangerouslySetInnerHTML={{
          __html: html || `<span class="${styles.logEmpty}">No log output ${filter ? "matches the filter" : "yet"}.</span>`,
        }}
      />
      <div class={styles.logStatus}>
        <span id="logCount">
          {filter ? `${visible.length} of ${lines.length} lines` : `${lines.length} line${lines.length === 1 ? "" : "s"}`}
        </span>
        <span class={`${styles.logLive}${following ? "" : ` ${styles.paused}`}`} title={following ? "Following new output" : "Paused — scrolled up"} />
      </div>
      <div class="modal-foot">
        <button
          class="btn btn-ghost"
          type="button"
          onClick={() => {
            setLines([]);
            setFollowing(true);
          }}
        >
          Clear
        </button>
        <button class="btn btn-primary" type="button" onClick={() => close(true)}>
          Close
        </button>
      </div>
    </>
  );
}
