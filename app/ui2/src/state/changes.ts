// Changes page data — GitHub Desktop–style commit flow for one repo at a time.
// Ported from the core of app/ui/js/changes.js (commit/diff/stage/history).
// Advanced features (stash manager, conflict resolver, PR tab, file tree) are a
// later phase.

import { effect, signal } from "@preact/signals";
import { ipc } from "@/platform/ipc";
import { activePage, showPage } from "@/state/ui";
import { repos, upsertRepo } from "@/state/repos";
import type { ChangeSet, CommitInfo, FileChange, FileDiff, PullRequest } from "@/types/models";

export type ChangesTab = "changes" | "history" | "pulls";

const SEL_KEY = "dc.changes.repoId";

export const changesRepoId = signal<string | null>(null);
export const changeSet = signal<ChangeSet | null>(null);
export const changesTab = signal<ChangesTab>("changes");
export const changesLoading = signal(false);

export const selectedFile = signal<{ path: string; staged: boolean } | null>(null);
export const fileDiff = signal<FileDiff | null>(null);
export const diffLoading = signal(false);

/** When true, diffs show the whole file (large context) not just changed hunks. */
export const wholeFile = signal(false);

export const commits = signal<CommitInfo[]>([]);
export const selectedCommit = signal<string | null>(null);
export const historyFilter = signal("");

// History tab — the selected commit's files + the file diff shown in the
// middle/right columns (mode-history 3-column layout).
export const commitFiles = signal<FileChange[]>([]);
export const commitActiveFile = signal<string | null>(null);
export const commitDiff = signal<FileDiff | null>(null);
export const commitDiffLoading = signal(false);

export const repoPulls = signal<PullRequest[]>([]);
export const repoPullsLoading = signal(false);

// PR tab inline detail (3-column: list + PR detail + diff), mirrors vanilla
// selectPull. Reuses prChanges/prFileDiff against the PR's base..branch.
export const selectedPull = signal<PullRequest | null>(null);
export const pullFiles = signal<FileChange[]>([]);
export const pullActiveFile = signal<string | null>(null);
export const pullDiff = signal<FileDiff | null>(null);
export const pullDiffLoading = signal(false);

/** Open a repo in the Changes page (used by Git Board / PR list). */
export function openRepoById(repoId: string, tab: ChangesTab = "changes"): void {
  showPage("changes");
  changesTab.value = tab;
  if (changesRepoId.value !== repoId) {
    changesRepoId.value = repoId;
    try {
      localStorage.setItem(SEL_KEY, repoId);
    } catch {
      /* ignore */
    }
    selectedFile.value = null;
    fileDiff.value = null;
    selectedCommit.value = null;
    commitFiles.value = [];
    commitDiff.value = null;
    void loadChanges(repoId);
  }
  if (tab === "history") void loadHistory(repoId);
  if (tab === "pulls") void loadRepoPulls(repoId);
}

// Auto-select a repo when the Changes page is shown with none chosen: restore
// the last-used repo across restarts, else the first available. Mirrors the
// vanilla changes.js onShow() behaviour.
let autoSelectStarted = false;
export function startChangesAutoSelect(): void {
  if (autoSelectStarted) return;
  autoSelectStarted = true;
  effect(() => {
    const onChanges = activePage.value === "changes";
    const list = repos.value;
    if (!onChanges || changesRepoId.value || !list.length) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(SEL_KEY);
    } catch {
      /* ignore */
    }
    const target = (saved && list.find((r) => r.id === saved)) || list[0];
    if (target) openRepoById(target.id, changesTab.value);
  });
}

export async function loadChanges(repoId: string): Promise<void> {
  if (!ipc.hasBackend) return;
  changesLoading.value = true;
  try {
    const cs = await ipc.gitChanges(repoId);
    changeSet.value = cs;
    // Match the vanilla Changes tab: do NOT auto-select a file — the diff pane
    // shows "Select a file to view its diff." until the user picks one. Only
    // clear a stale selection when its file is gone.
    const files = [...(cs.staged || []), ...(cs.unstaged || [])];
    if (!files.length) {
      selectedFile.value = null;
      fileDiff.value = null;
    } else if (selectedFile.value && !files.some((f) => f.path === selectedFile.value!.path)) {
      selectedFile.value = null;
      fileDiff.value = null;
    }
  } catch (e) {
    console.error("gitChanges failed", e);
  } finally {
    changesLoading.value = false;
  }
}

export async function loadHistory(repoId: string): Promise<void> {
  if (!ipc.hasBackend) return;
  try {
    commits.value = await ipc.gitLog(repoId, 100);
    // Auto-select the newest commit so the detail + diff panes aren't empty.
    if (commits.value.length && !selectedCommit.value) {
      void selectCommit(commits.value[0].hash);
    }
  } catch (e) {
    console.error("gitLog failed", e);
  }
}

/** Select a commit in the History tab: load its files + first file diff. */
export async function selectCommit(sha: string): Promise<void> {
  const repoId = changesRepoId.value;
  if (!repoId) return;
  selectedCommit.value = sha;
  commitActiveFile.value = null;
  commitDiff.value = null;
  commitFiles.value = [];
  try {
    const cs = await ipc.gitChanges(repoId, sha);
    if (selectedCommit.value !== sha) return;
    commitFiles.value = cs.files || [];
    if (commitFiles.value.length) void selectCommitFile(commitFiles.value[0].path);
  } catch (e) {
    console.error("commit changes failed", e);
    commitFiles.value = [];
  }
}

export async function selectCommitFile(path: string): Promise<void> {
  const repoId = changesRepoId.value;
  const sha = selectedCommit.value;
  if (!repoId || !sha) return;
  commitActiveFile.value = path;
  commitDiffLoading.value = true;
  try {
    const d = await ipc.gitDiff(repoId, path, sha, false, wholeFile.value ? 100000 : null);
    if (commitActiveFile.value !== path) return;
    commitDiff.value = d;
  } catch (e) {
    console.error("gitDiff failed", e);
    commitDiff.value = null;
  } finally {
    if (commitActiveFile.value === path) commitDiffLoading.value = false;
  }
}

/** Toggle whole-file view and re-fetch the active diff. */
export function toggleWholeFile(): void {
  wholeFile.value = !wholeFile.value;
  if (changesTab.value === "history") {
    if (commitActiveFile.value) void selectCommitFile(commitActiveFile.value);
  } else if (changesTab.value === "pulls") {
    if (pullActiveFile.value) void selectPullFile(pullActiveFile.value);
  } else {
    const s = selectedFile.value;
    if (s) void selectFile(s.path, s.staged);
  }
}

/** Undo (soft-reset) the most recent commit — its changes return to staged. */
export async function undoCommit(sha: string): Promise<void> {
  const repoId = changesRepoId.value;
  if (!repoId) return;
  const cs = await ipc.undoCommit(repoId, sha);
  changeSet.value = cs;
  selectedCommit.value = null;
  await loadHistory(repoId);
  changesTab.value = "changes";
}

export async function loadRepoPulls(repoId: string): Promise<void> {
  if (!ipc.hasBackend) return;
  repoPullsLoading.value = true;
  try {
    const data = await ipc.listRepoPullRequests(repoId);
    repoPulls.value = Array.isArray(data) ? data : [];
    // Auto-select the first PR so the detail + diff panes aren't left empty
    // (mirrors vanilla selectPull(repoPulls[0].id)).
    if (repoPulls.value.length) {
      const keep = selectedPull.value && repoPulls.value.find((p) => p.id === selectedPull.value!.id);
      void selectPull(keep ? keep.id : repoPulls.value[0].id);
    } else {
      selectedPull.value = null;
      pullFiles.value = [];
      pullActiveFile.value = null;
      pullDiff.value = null;
    }
  } catch (e) {
    console.error("listRepoPullRequests failed", e);
    repoPulls.value = [];
  } finally {
    repoPullsLoading.value = false;
  }
}

/** Select a PR in the Changes PR tab: load its files + first file diff inline. */
export async function selectPull(id: number): Promise<void> {
  const repoId = changesRepoId.value;
  const pr = repoPulls.value.find((p) => p.id === id);
  if (!repoId || !pr) return;
  selectedPull.value = pr;
  pullActiveFile.value = null;
  pullDiff.value = null;
  pullFiles.value = [];
  try {
    const cs = await ipc.prChanges(repoId, pr.base, pr.branch);
    if (selectedPull.value?.id !== id) return;
    pullFiles.value = cs.files || [];
    if (pullFiles.value.length) void selectPullFile(pullFiles.value[0].path);
  } catch (e) {
    console.error("prChanges failed", e);
    pullFiles.value = [];
  }
}

export async function selectPullFile(path: string): Promise<void> {
  const repoId = changesRepoId.value;
  const pr = selectedPull.value;
  if (!repoId || !pr) return;
  pullActiveFile.value = path;
  pullDiffLoading.value = true;
  try {
    const d = await ipc.prFileDiff(repoId, pr.base, pr.branch, path, wholeFile.value ? 100000 : null);
    if (pullActiveFile.value !== path) return;
    pullDiff.value = d;
  } catch (e) {
    console.error("prFileDiff failed", e);
    pullDiff.value = null;
  } finally {
    if (pullActiveFile.value === path) pullDiffLoading.value = false;
  }
}

export async function selectFile(path: string, staged: boolean): Promise<void> {
  const repoId = changesRepoId.value;
  if (!repoId) return;
  selectedFile.value = { path, staged };
  diffLoading.value = true;
  try {
    fileDiff.value = await ipc.gitDiff(repoId, path, null, staged, wholeFile.value ? 100000 : null);
  } catch (e) {
    console.error("gitDiff failed", e);
    fileDiff.value = null;
  } finally {
    diffLoading.value = false;
  }
}

async function refresh(): Promise<void> {
  const repoId = changesRepoId.value;
  if (!repoId) return;
  await loadChanges(repoId);
  const sel = selectedFile.value;
  if (sel) await selectFile(sel.path, sel.staged);
}

export async function stageFiles(paths: string[]): Promise<void> {
  const repoId = changesRepoId.value;
  if (!repoId || !ipc.hasBackend) return;
  await ipc.gitStage(repoId, paths);
  await refresh();
}

export async function unstageFiles(paths: string[]): Promise<void> {
  const repoId = changesRepoId.value;
  if (!repoId || !ipc.hasBackend) return;
  await ipc.gitUnstage(repoId, paths);
  await refresh();
}

export async function discardFiles(paths: string[]): Promise<void> {
  const repoId = changesRepoId.value;
  if (!repoId || !ipc.hasBackend) return;
  await ipc.gitDiscard(repoId, paths);
  selectedFile.value = null;
  fileDiff.value = null;
  await refresh();
}

export async function commit(summary: string, description: string): Promise<void> {
  const repoId = changesRepoId.value;
  if (!repoId || !ipc.hasBackend) return;
  await ipc.gitCommit(repoId, summary, description, false, false, false);
  await refresh();
}

// --- Stash ------------------------------------------------------------------

export async function stashPush(message: string, includeUntracked: boolean): Promise<void> {
  const repoId = changesRepoId.value;
  if (!repoId || !ipc.hasBackend) return;
  await ipc.gitStashPush(repoId, message, includeUntracked);
  selectedFile.value = null;
  fileDiff.value = null;
  await refresh();
}

export async function stashApply(index: number): Promise<void> {
  const repoId = changesRepoId.value;
  if (!repoId || !ipc.hasBackend) return;
  await ipc.gitStashApply(repoId, index);
  await refresh();
}

export async function stashPop(index: number): Promise<void> {
  const repoId = changesRepoId.value;
  if (!repoId || !ipc.hasBackend) return;
  await ipc.gitStashPop(repoId, index);
  await refresh();
}

export async function stashDrop(index: number): Promise<void> {
  const repoId = changesRepoId.value;
  if (!repoId || !ipc.hasBackend) return;
  await ipc.gitStashDrop(repoId, index);
  await refresh();
}

export async function stashPushStaged(message: string): Promise<void> {
  const repoId = changesRepoId.value;
  if (!repoId || !ipc.hasBackend) return;
  await ipc.gitStashPushStaged(repoId, message);
  selectedFile.value = null;
  fileDiff.value = null;
  await refresh();
}

export async function stashClear(): Promise<void> {
  const repoId = changesRepoId.value;
  if (!repoId || !ipc.hasBackend) return;
  await ipc.gitStashClear(repoId);
  await refresh();
}

export function stashShow(index: number): Promise<string> {
  const repoId = changesRepoId.value;
  if (!repoId || !ipc.hasBackend) return Promise.resolve("");
  return ipc.gitStashShow(repoId, index);
}

export async function push(): Promise<ChangeSet | null> {
  const repoId = changesRepoId.value;
  if (!repoId || !ipc.hasBackend) return null;
  const cs = await ipc.gitPush(repoId);
  changeSet.value = cs;
  syncRepoBadges(repoId, cs);
  return cs;
}

export async function pull(): Promise<ChangeSet | null> {
  const repoId = changesRepoId.value;
  if (!repoId || !ipc.hasBackend) return null;
  const cs = await ipc.gitPull(repoId, false);
  changeSet.value = cs;
  syncRepoBadges(repoId, cs);
  await refresh();
  return cs;
}

/** Mirror a ChangeSet's ahead/behind/branch onto the Git Board repo card. */
function syncRepoBadges(repoId: string, cs: ChangeSet): void {
  const r = repos.value.find((x) => x.id === repoId);
  if (r) upsertRepo({ ...r, ahead: cs.ahead || 0, behind: cs.behind || 0, branch: cs.branch || r.branch });
}

export function allFiles(cs: ChangeSet | null): FileChange[] {
  if (!cs) return [];
  return [...(cs.staged || []), ...(cs.unstaged || [])];
}
