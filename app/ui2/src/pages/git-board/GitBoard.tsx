// Git Board page — repo list with search, account/tag filters, and per-repo
// actions (fetch, push/pull, watch, branch switch, kebab menu). Ported from
// app/ui/js/git-board.js + the clone/add wiring in backend.js.

import { useComputed, useSignal, signal } from "@preact/signals";
import { useState } from "preact/hooks";
import { ipc } from "@/platform/ipc";
import { pickDirectory } from "@/platform/tauri";
import {
  repos,
  reposLoaded,
  repoAccount,
  repoWebUrl,
  defaultBranchFrom,
  upsertRepo,
  removeRepoLocal,
  refreshRepos,
  hasVscode,
  hasVscodeInsiders,
} from "@/state/repos";
import { openRepoById } from "@/state/changes";
import { loadFilterSet, saveFilterSet } from "@/lib/helpers";
import { ICONS, providerIconHtml, Raw, EmptyState } from "@/lib/ico";
import { openMenu, openContextMenu, type MenuItem } from "@/components/menu";
import { openBranchPicker } from "@/components/BranchPicker";
import { modal } from "@/components/modal";
import { Multiselect, type MultiOption } from "@/components/Multiselect";
import { openTagEditor as tagEditorModal } from "@/components/TagEditor";
import type { Repo } from "@/types/models";

const ACCT_KEY = "dc.repos.accountFilter";
const TAG_KEY = "dc.repos.tagFilter";

const search = signal("");
const acctFilter = signal<Set<string>>(loadFilterSet(ACCT_KEY));
const tagFilter = signal<Set<string>>(loadFilterSet(TAG_KEY));

function setAcct(next: Set<string>) {
  acctFilter.value = next;
  saveFilterSet(ACCT_KEY, next);
}
function setTag(next: Set<string>) {
  tagFilter.value = next;
  saveFilterSet(TAG_KEY, next);
}

export function GitBoard() {
  const list = useComputed(() => {
    const f = search.value.toLowerCase();
    const acc = acctFilter.value;
    const tags = tagFilter.value;
    return repos.value.filter((r) => {
      const rTags = r.tags || [];
      const matchText =
        r.name.toLowerCase().includes(f) ||
        (r.remote || "").toLowerCase().includes(f) ||
        rTags.some((t) => t.toLowerCase().includes(f));
      const matchTag = tags.size === 0 || rTags.some((t) => tags.has(t));
      const a = repoAccount(r);
      const matchAcct = acc.size === 0 || (a != null && acc.has(a.key));
      return matchText && matchTag && matchAcct;
    });
  });

  const acctOptions = useComputed<MultiOption[]>(() => {
    const map = new Map<string, MultiOption>();
    for (const r of repos.value) {
      const a = repoAccount(r);
      if (!a) continue;
      const e = map.get(a.key) || { value: a.key, label: a.label, count: 0, icon: providerIconHtml(a.provider) };
      e.count = (e.count || 0) + 1;
      map.set(a.key, e);
    }
    return [...map.values()].sort((x, y) => x.label.localeCompare(y.label));
  });

  const tagOptions = useComputed<MultiOption[]>(() => {
    const map = new Map<string, number>();
    for (const r of repos.value) for (const t of r.tags || []) map.set(t, (map.get(t) || 0) + 1);
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: value, count, icon: ICONS.tag }));
  });

  return (
    <>
      <header class="page-head">
        <div>
          <h1>Git Board</h1>
          <p class="page-desc">Clone, track and manage Git repositories on this machine.</p>
        </div>
        <div class="page-actions">
          <div class="search">
            <Raw html={SEARCH_SVG} />
            <input
              type="text"
              placeholder="Search repositories…"
              value={search.value}
              onInput={(e) => (search.value = (e.target as HTMLInputElement).value)}
            />
          </div>
          {acctOptions.value.length > 0 ? (
            <Multiselect
              options={acctOptions.value}
              selected={acctFilter.value}
              onChange={setAcct}
              allLabel="All accounts"
              buttonIcon={ACCT_SVG}
              countNoun="accounts"
              ariaLabel="Repository accounts"
            />
          ) : null}
          {tagOptions.value.length > 0 ? (
            <Multiselect
              options={tagOptions.value}
              selected={tagFilter.value}
              onChange={setTag}
              allLabel="All tags"
              buttonIcon={ICONS.tag}
              countNoun="tags"
              ariaLabel="Repository tags"
            />
          ) : null}
          <AddExistingButton />
          <CloneButton />
        </div>
      </header>

      <div class="repo-list">
        {list.value.map((r) => (
          <RepoRow key={r.id} repo={r} />
        ))}
        {list.value.length === 0 ? (
          <EmptyState
            message={
              !reposLoaded.value
                ? "Loading repositories…"
                : search.value || acctFilter.value.size || tagFilter.value.size
                  ? "No repositories match your filters."
                  : "No repositories yet. Clone or add an existing one to get started."
            }
          />
        ) : null}
      </div>
    </>
  );
}

const SEARCH_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
const ACCT_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 10h18"/></svg>';

function RepoRow({ repo: r }: { repo: Repo }) {
  const busy = useSignal(false);
  const provider = r.provider === "github" || r.provider === "azure" ? r.provider : "other";
  const ahead = r.ahead || 0;
  const behind = r.behind || 0;
  const dotClass = r.status === "dirty" ? "error" : "running";
  const canSync = ipc.hasBackend;

  const openInChanges = (tab: "changes" | "history" | "pulls" = "changes") => {
    openRepoById(r.id, tab);
  };

  const doFetch = async () => {
    if (!ipc.hasBackend || busy.value) return;
    busy.value = true;
    try {
      const updated = await ipc.fetchRepo(r.id);
      if (updated) upsertRepo(updated);
    } catch (e) {
      await modal.alert({ title: "Fetch failed", message: String(e) });
    } finally {
      busy.value = false;
    }
  };

  const doPush = async () => {
    if (!ipc.hasBackend || busy.value) return;
    busy.value = true;
    try {
      await ipc.gitPush(r.id);
      const updated = await ipc.fetchRepo(r.id);
      if (updated) upsertRepo(updated);
    } catch (e) {
      await modal.alert({ title: "Push failed", message: String(e) });
    } finally {
      busy.value = false;
    }
  };

  const doPull = async () => {
    if (!ipc.hasBackend || busy.value) return;
    busy.value = true;
    try {
      const cs = await ipc.gitPull(r.id, false);
      const conflicted = cs && Array.isArray(cs.files) && cs.files.some((f) => f.status === "conflicted");
      const updated = await ipc.fetchRepo(r.id).catch(() => null);
      if (updated) upsertRepo(updated);
      if (conflicted) openInChanges();
    } catch (e) {
      await modal.alert({ title: "Pull failed", message: String(e) });
    } finally {
      busy.value = false;
    }
  };

  const toggleWatch = async () => {
    const next = !r.watched;
    upsertRepo({ ...r, watched: next });
    if (ipc.hasBackend) ipc.setWatched(r.id, next).catch((e) => console.error("setWatched failed", e));
  };

  const openBranchMenu = async (anchor: HTMLElement) => {
    if (!ipc.hasBackend) return;
    let branches: string[];
    try {
      branches = await ipc.listBranches(r.id);
    } catch (e) {
      await modal.alert({ title: "Couldn't load branches", message: String(e) });
      return;
    }
    // If the current branch no longer exists, switch to the default instead.
    if (r.branch && branches.length && !branches.includes(r.branch)) {
      const fallback = defaultBranchFrom(branches);
      if (fallback && fallback !== r.branch) {
        try {
          upsertRepo(await ipc.checkoutBranch(r.id, fallback, false));
          return;
        } catch {
          /* fall through to the picker */
        }
      }
    }
    openBranchPicker(anchor, {
      repoId: r.id,
      branches,
      current: r.branch,
      dirty: r.status === "dirty",
      onSwitched: (updated) => upsertRepo(updated),
      onCreated: (updated) => upsertRepo(updated),
    });
  };

  const menuItems = (): MenuItem[] => {
    const items: MenuItem[] = [
      { label: "View Changes", icon: ICONS.changes, onClick: () => openInChanges("changes") },
      { label: "View Commits", icon: ICONS.clock, onClick: () => openInChanges("history") },
      { label: "View Pull Requests", icon: ICONS.pr, onClick: () => openInChanges("pulls") },
      { separator: true },
    ];
    if (ipc.hasBackend) items.push({ label: "Fetch", icon: ICONS.sync, onClick: doFetch });
    items.push({
      label: r.watched ? "Stop watching PRs" : "Watch PRs",
      icon: r.watched ? ICONS.eye : ICONS.eyeOff,
      onClick: toggleWatch,
    });
    items.push({ separator: true });
    items.push({ label: "Edit tags", icon: ICONS.tag, onClick: () => openTagEditor(r) });
    if (ipc.hasBackend) {
      items.push(
        { label: "Open folder", icon: ICONS.folder, onClick: () => ipc.openPath(r.path).catch(() => {}) },
        { label: "Open terminal", icon: ICONS.terminal, onClick: () => ipc.openTerminal(r.path).catch(() => {}) },
      );
      if (hasVscode.value)
        items.push({ label: "Open in VS Code", icon: ICONS.vscode, onClick: () => ipc.openInVscode(r.path).catch(() => {}) });
      if (hasVscodeInsiders.value)
        items.push({
          label: "Open in VS Code (I)",
          icon: ICONS.vscode,
          onClick: () => ipc.openInVscodeInsiders(r.path).catch(() => {}),
        });
      const web = repoWebUrl(r.remote);
      if (web) items.push({ label: "Open in browser", icon: ICONS.external, onClick: () => ipc.openUrl(web).catch(() => {}) });
    }
    items.push({ separator: true });
    items.push({ label: "Remove from list", icon: ICONS.trash, danger: true, onClick: () => confirmRemove(r) });
    return items;
  };

  const spinning = busy.value;

  return (
    <div
      class={`repo-row ${dotClass}`}
      onContextMenu={(e) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, menuItems());
      }}
    >
      <div class={`repo-icon ${provider}`}>
        <Raw html={providerIconHtml(provider)} />
      </div>
      <div class="repo-main">
        <div class="repo-title-row">
          <span class="repo-name repo-open-link" title="Open in Changes" onClick={() => openInChanges()}>
            {r.name || ""}
          </span>
          {canSync ? (
            <button class="chip branch switchable" title="Switch branch" onClick={(e) => openBranchMenu(e.currentTarget as HTMLElement)}>
              <Raw html={ICONS.branch} />
              {r.branch || ""}
              <Raw html={ICONS.caret} />
            </button>
          ) : (
            <span class="chip branch">
              <Raw html={ICONS.branch} />
              {r.branch || ""}
            </span>
          )}
          {ahead > 0 ? (
            <button class="chip sync-chip sync-push" title={`Push ${ahead} commit(s)`} onClick={doPush}>
              <span>
                <Raw html={ICONS.up} />
                {ahead}
              </span>
            </button>
          ) : null}
          {behind > 0 ? (
            <button class="chip sync-chip sync-pull" title={`Pull ${behind} commit(s)`} onClick={doPull}>
              <span>
                <Raw html={ICONS.down} />
                {behind}
              </span>
            </button>
          ) : null}
          {r.status === "dirty" ? (
            <span class="chip dirty-chip" title="Uncommitted changes">
              <Raw html={ICONS.dot} />
              Uncommitted
            </span>
          ) : null}
          {(r.tags || []).map((t) => (
            <span class="chip tag-chip" key={t}>
              <Raw html={ICONS.tag} />
              {t}
            </span>
          ))}
        </div>
        <div class="repo-sub">
          <span class="repo-path">{r.path || ""}</span>
          <span class="repo-dot">·</span>
          <span
            class={`repo-fetch${spinning ? " fetching" : ""}`}
            title={canSync ? "Fetch now" : undefined}
            onClick={canSync ? doFetch : undefined}
          >
            <Raw html={ICONS.sync} />
            {r.lastFetch ? `Fetched ${r.lastFetch}` : "Never fetched"}
          </span>
        </div>
      </div>
      <div class="repo-actions">
        {r.watched ? (
          <button class="btn btn-ghost btn-sm watching" title="Stop watching PRs" onClick={toggleWatch}>
            <Raw html={ICONS.eye} />
            Watching
          </button>
        ) : (
          <button class="btn btn-ghost btn-sm" title="Watch this repo's PRs" onClick={toggleWatch}>
            <Raw html={ICONS.eyeOff} />
            Watch PRs
          </button>
        )}
        <button class="btn btn-icon btn-sm" title="Fetch" disabled={spinning} onClick={doFetch}>
          <span class={spinning ? "spin" : undefined}>
            <Raw html={ICONS.sync} />
          </span>
        </button>
        <button class="btn btn-icon btn-sm" title="More actions" onClick={(e) => openMenu(e.currentTarget as HTMLElement, menuItems())}>
          <Raw html={ICONS.more} />
        </button>
      </div>
    </div>
  );
}

async function confirmRemove(r: Repo) {
  const ok = await modal.confirm({
    title: "Remove repository",
    message: `Remove "${r.name}" from ${window.BRAND}? This only removes it from the list — the files on disk are left untouched.`,
    confirmText: "Remove",
    danger: true,
  });
  if (!ok) return;
  try {
    if (ipc.hasBackend) await ipc.removeRepo(r.id);
    removeRepoLocal(r.id);
  } catch (e) {
    await modal.alert({ title: "Couldn't remove repository", message: String(e) });
  }
}

async function openTagEditor(r: Repo) {
  const suggestions = [...new Set(repos.value.flatMap((x) => x.tags || []))].sort();
  const result = await tagEditorModal({ title: `Tags · ${r.name}`, tags: r.tags || [], suggestions });
  if (result == null) return;
  try {
    if (ipc.hasBackend) await ipc.setRepoTags(r.id, result);
    upsertRepo({ ...r, tags: result });
  } catch (e) {
    await modal.alert({ title: "Couldn't save tags", message: String(e) });
  }
}

function AddExistingButton() {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    const dir = await pickDirectory("Select a repository folder (or a folder containing repositories)");
    if (!dir) return;
    setBusy(true);
    try {
      let repo: Repo | null = null;
      try {
        repo = await ipc.addRepo(dir);
      } catch {
        repo = null;
      }
      if (repo) {
        const exists = repos.value.some((x) => x.id === repo!.id);
        upsertRepo(repo);
        if (exists) await modal.alert({ title: "Already added", message: `"${repo.name}" is already in your list.` });
      } else {
        const before = new Set(repos.value.map((x) => x.id));
        const all = await ipc.scanRepos([dir]);
        if (Array.isArray(all)) repos.value = all;
        const added = repos.value.filter((x) => !before.has(x.id)).length;
        await modal.alert(
          added > 0
            ? { title: "Repositories added", message: `Added ${added} ${added === 1 ? "repository" : "repositories"} from that folder.` }
            : { title: "No repositories found", message: "That folder isn't a Git repository and doesn't contain any." },
        );
      }
    } catch (e) {
      await modal.alert({ title: "Couldn't add repository", message: String(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button class="btn btn-ghost" disabled={busy} onClick={onClick}>
      {busy ? (
        <span class="spin">
          <Raw html={ICONS.sync} />
        </span>
      ) : (
        <Raw html={ADD_SVG} />
      )}
      {busy ? "Scanning…" : "Add existing"}
    </button>
  );
}

const ADD_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="9" y1="13" x2="15" y2="13"/></svg>';

function CloneButton() {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    const url = await modal.prompt({
      title: "Clone repository",
      label: "Repository URL",
      placeholder: "https://github.com/owner/repo.git",
      confirmText: "Choose folder…",
      validate: (v) => (v ? null : "Enter a repository URL."),
    });
    if (!url) return;
    const dir = await pickDirectory("Choose a folder to clone into");
    if (!dir) return;
    setBusy(true);
    try {
      const repo = await ipc.cloneRepo(url, dir);
      if (repo) upsertRepo(repo);
    } catch (e) {
      await modal.alert({ title: "Clone failed", message: String(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button class="btn btn-ghost" disabled={busy} onClick={onClick}>
      <Raw html={ICONS.plus} />
      Clone repository
    </button>
  );
}

/** Fetch every repo in parallel (from the page context menu "Fetch All"). */
export async function fetchAllRepos(): Promise<void> {
  if (!ipc.hasBackend || !repos.value.length) return;
  await Promise.allSettled(
    repos.value.slice().map(async (r) => {
      try {
        const updated = await ipc.fetchRepo(r.id);
        if (updated) upsertRepo(updated);
      } catch (e) {
        console.error("fetchRepo failed", r.id, e);
      }
    }),
  );
  await refreshRepos();
}
