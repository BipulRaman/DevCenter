// Changes page — GitHub Desktop–style commit flow. Ported from the core of
// app/ui/js/changes.js (repo picker, staged/unstaged lists, diff, commit,
// push/pull, branch switch, history). Advanced features are a later phase.

import { signal, useComputed } from "@preact/signals";
import { useState, useEffect, useRef } from "preact/hooks";
import { ipc } from "@/platform/ipc";
import { Avatar } from "@/components/Avatar";
import { pickDirectory } from "@/platform/tauri";
import { repos, upsertRepo, repoAccount } from "@/state/repos";
import {
  changesRepoId,
  changeSet,
  changesTab,
  changesLoading,
  selectedFile,
  fileDiff,
  diffLoading,
  wholeFile,
  toggleWholeFile,
  commits,
  selectedCommit,
  historyFilter,
  commitFiles,
  commitActiveFile,
  commitDiff,
  commitDiffLoading,
  selectCommit,
  selectCommitFile,
  undoCommit,
  repoPulls,
  repoPullsLoading,
  selectedPull,
  pullFiles,
  pullActiveFile,
  pullDiff,
  pullDiffLoading,
  selectPull,
  selectPullFile,
  openRepoById,
  loadChanges,
  loadHistory,
  loadRepoPulls,
  selectFile,
  stageFiles,
  unstageFiles,
  discardFiles,
  commit as doCommit,
  push as doPush,
  pull as doPull,
  stashPush,
  stashApply,
  stashPop,
  stashDrop,
  stashPushStaged,
  stashClear,
  stashShow,
} from "@/state/changes";
import { openConflict } from "@/state/conflict";
import { openReviewer } from "@/state/reviewer";
import { prReviewChip } from "@/lib/helpers";
import { loadFilterSet, saveFilterSet } from "@/lib/helpers";
import { ICONS, providerIconHtml, Raw, EmptyState } from "@/lib/ico";
import { openMenu, openContextMenu, type MenuItem } from "@/components/menu";
import { openBranchPicker, openNewBranchDialog, validateBranchName, defaultBranchFrom } from "@/components/BranchPicker";
import { modal } from "@/components/modal";
import { FileTree, fileOrder, allDirPaths, treeStyles, type FileAction } from "@/lib/file-tree";
import { Multiselect, type MultiOption } from "@/components/Multiselect";
import { PaneResizer } from "@/components/PaneResizer";
import { DiffView, diffStyles } from "@/components/DiffView";
import type { FileChange, FileDiff, GitTagInfo, RemoteInfo, StashEntry, WorktreeInfo } from "@/types/models";
import styles from "./Changes.module.css";

const FILE_TREE_ACTION_CLASSES = { actions: styles.scmActions, action: styles.scmAct };

const viewMode = signal<"tree" | "list">(
  (localStorage.getItem("dc.changes.view") as "tree" | "list") || "list",
);
function setViewMode(m: "tree" | "list") {
  viewMode.value = m;
  try {
    localStorage.setItem("dc.changes.view", m);
  } catch {
    /* ignore */
  }
}

// Filter for the staged/unstaged file lists (Changes tab).
const changeFilter = signal("");
// Shared "a git action is running" flag — drives the commit-box gear spin and
// disables the commit button (mirrors vanilla `busy` + gitMenuBtn.classList busy).
const gitBusy = signal(false);
// Collapsed top-level groups in the Changes tab: "staged" / "unstaged" / "stashes".
const collapsedGroups = signal<Set<string>>(new Set());
function toggleGroup(key: string) {
  const next = new Set(collapsedGroups.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsedGroups.value = next;
}

// Account filter that scopes the repo picker (persisted).
const CHG_ACCT_KEY = "dc.changes.accountFilter";
const chgAcct = signal<Set<string>>(loadFilterSet(CHG_ACCT_KEY));
function matchesChgAccount(r: { provider: string; remote: string }): boolean {
  if (chgAcct.value.size === 0) return true;
  const a = repoAccount(r as never);
  return a != null && chgAcct.value.has(a.key);
}
function setChgAcct(next: Set<string>) {
  chgAcct.value = next;
  saveFilterSet(CHG_ACCT_KEY, next);
  // If the selected repo no longer matches, jump to the first matching one.
  const id = changesRepoId.value;
  if (!id || next.size === 0) return;
  const cur = repos.value.find((r) => r.id === id);
  if (cur && !matchesChgAccount(cur)) {
    const nextRepo = repos.value.find(matchesChgAccount);
    if (nextRepo) openRepoById(nextRepo.id, changesTab.value);
  }
}

export function Changes() {
  const repoId = changesRepoId.value;
  // Read the signal INSIDE the computed so it stays current across renders
  // (useComputed memoizes the closure once — capturing `repoId` would go stale).
  const repo = useComputed(() => repos.value.find((r) => r.id === changesRepoId.value) || null);

  const pickRepo = (anchor: HTMLElement) => {
    const items: MenuItem[] = repos.value.filter(matchesChgAccount).map((r) => ({
      label: r.name,
      icon: providerIconHtml(r.provider),
      onClick: () => openRepoById(r.id, changesTab.value),
    }));
    if (!items.length) items.push({ label: "No repositories", disabled: true });
    openMenu(anchor, items);
  };

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

  return (
    <>
      <header class="page-head">
        <div>
          <h1>Changes</h1>
          <p class="page-desc">Review changes, write a message and commit, view commits and PRs.</p>
        </div>
        <div class="page-actions">
          {acctOptions.value.length > 1 ? (
            <Multiselect
              options={acctOptions.value}
              selected={chgAcct.value}
              onChange={setChgAcct}
              allLabel="All accounts"
              buttonIcon={ICONS.card}
              countNoun="accounts"
              ariaLabel="Repository accounts"
            />
          ) : null}
          <button class={styles.chgRepoBtn} type="button" aria-haspopup="true" onClick={(e) => pickRepo(e.currentTarget as HTMLElement)}>
            <span class={styles.chgRepoIco}>
              <Raw html={repo.value ? providerIconHtml(repo.value.provider) : ICONS.repo} />
            </span>
            <span class={styles.chgRepoLabel}>{repo.value ? repo.value.name : "Select repository"}</span>
            <Raw html={ICONS.caret} class={styles.caret} />
          </button>
        </div>
      </header>

      {!repoId ? (
        <EmptyState message="Select a repository to review and commit its changes." />
      ) : (
        <div class={`${styles.commitLayout}${changesTab.value === "history" ? ` ${styles.modeHistory}` : changesTab.value === "pulls" ? ` ${styles.modePulls}` : ""}`}>
          <aside class={styles.commitSide}>
            <div class={styles.commitTabs} role="tablist">
              <button
                class={`${styles.commitTab}${changesTab.value === "changes" ? ` ${styles.active}` : ""}`}
                type="button"
                role="tab"
                onClick={() => (changesTab.value = "changes")}
              >
                <span class={styles.ctIco}>
                  <Raw html={ICONS.changes} />
                </span>
                <span>Changes</span>
              </button>
              <button
                class={`${styles.commitTab}${changesTab.value === "history" ? ` ${styles.active}` : ""}`}
                type="button"
                role="tab"
                onClick={() => {
                  changesTab.value = "history";
                  if (repoId) void loadHistory(repoId);
                }}
              >
                <span class={styles.ctIco}>
                  <Raw html={ICONS.clock} />
                </span>
                <span>Commits</span>
              </button>
              <button
                class={`${styles.commitTab}${changesTab.value === "pulls" ? ` ${styles.active}` : ""}`}
                type="button"
                role="tab"
                onClick={() => {
                  changesTab.value = "pulls";
                  if (repoId) void loadRepoPulls(repoId);
                }}
              >
                <span class={styles.ctIco}>
                  <Raw html={ICONS.pr} />
                </span>
                <span class={styles.ctFull}>Pull Requests</span>
                <span class={styles.ctShort}>PRs</span>
              </button>
            </div>

            {changesTab.value === "changes" ? <ChangesPane /> : changesTab.value === "history" ? <HistoryPane /> : <PullsPane />}
          </aside>

          <PaneResizer resize="side" varName="--w-side" storageKey="dc.changes.side" min={200} max={520} def={300} ariaLabel="Resize repository panel" />
          {changesTab.value === "history" ? (
            <>
              <CommitDetail />
              <PaneResizer resize="detail" extraClass={styles.rzDetail} varName="--w-detail" storageKey="dc.changes.detail" min={180} max={480} def={240} ariaLabel="Resize detail panel" />
            </>
          ) : changesTab.value === "pulls" ? (
            <>
              <PrDetail />
              <PaneResizer resize="detail" extraClass={styles.rzDetail} varName="--w-detail" storageKey="dc.changes.detail" min={180} max={480} def={240} ariaLabel="Resize detail panel" />
            </>
          ) : null}

          <DiffPane />
        </div>
      )}
    </>
  );
}

function ChangesPane() {
  const cs = changeSet.value;
  const staged = cs?.staged || [];
  const unstaged = cs?.unstaged || [];
  const stashes = cs?.stashes || [];
  const total = staged.length + unstaged.length;
  const conflicts = [...staged, ...unstaged].filter((f) => f.status === "conflicted");
  const filter = changeFilter.value.toLowerCase();
  const fStaged = filter ? staged.filter((f) => f.path.toLowerCase().includes(filter)) : staged;
  const fUnstaged = filter ? unstaged.filter((f) => f.path.toLowerCase().includes(filter)) : unstaged;

  const onStash = async () => {
    const res = await modal.custom<{ message: string; includeUntracked: boolean } | null>({
      title: "Stash changes",
      body: (close) => <StashDialogBody branch={cs?.branch || ""} close={close} />,
    });
    if (!res) return;
    try {
      await stashPush(res.message, res.includeUntracked);
    } catch (e) {
      await modal.alert({ title: "Stash failed", message: String(e) });
    }
  };

  return (
    <div class={styles.commitPane}>
      {conflicts.length > 0 ? (
        <button class={styles.conflictBanner} type="button" onClick={() => changesRepoId.value && openConflict(changesRepoId.value)}>
          <svg class={styles.conflictBannerIco} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span class={styles.conflictBannerText}>
            {conflicts.length} merge conflict{conflicts.length === 1 ? "" : "s"}
          </span>
          <span class={styles.conflictBannerGo}>Resolve →</span>
        </button>
      ) : null}
      <div class={styles.commitFilter}>
        <Raw html={ICONS.search} />
        <input
          type="text"
          placeholder="Filter files…"
          spellcheck={false}
          value={changeFilter.value}
          onInput={(e) => (changeFilter.value = (e.target as HTMLInputElement).value)}
        />
        <button class={styles.iconMini} type="button" title="Refresh changes" onClick={() => changesRepoId.value && loadChanges(changesRepoId.value)}>
          <Raw html={ICONS.sync} />
        </button>
      </div>
      <div class={styles.changesHead}>
        <span class={styles.changesHeadTitle}>{total ? `${total} change${total === 1 ? "" : "s"}` : "No changes"}</span>
        <div class={styles.changesHeadActions}>
          <div class={`seg ${styles.viewToggle}`} role="group" aria-label="File display" title="Toggle file tree / flat list">
            <button class={`seg-btn${viewMode.value === "tree" ? " active" : ""}`} type="button" title="Tree view" aria-pressed={viewMode.value === "tree"} onClick={() => setViewMode("tree")}>
              <Raw html={ICONS.treeView} />
            </button>
            <button class={`seg-btn${viewMode.value === "list" ? " active" : ""}`} type="button" title="Flat list" aria-pressed={viewMode.value === "list"} onClick={() => setViewMode("list")}>
              <Raw html={ICONS.listView} />
            </button>
          </div>
          <div class="seg">
            <button class="seg-btn" type="button" title="Stash changes" disabled={total === 0} onClick={onStash}>
              <Raw html={ICONS.archive} />
            </button>
          </div>
        </div>
      </div>

      <div
        class={treeStyles.fileTree}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          const files = [
            ...fileOrder(fStaged, viewMode.value).map((path) => ({ path, staged: true })),
            ...fileOrder(fUnstaged, viewMode.value).map((path) => ({ path, staged: false })),
          ];
          if (!files.length) return;
          const sel = selectedFile.value;
          let idx = files.findIndex((f) => f.path === sel?.path && f.staged === sel?.staged);
          idx = idx < 0 ? 0 : idx + (e.key === "ArrowDown" ? 1 : -1);
          if (idx < 0 || idx >= files.length) return;
          e.preventDefault();
          void selectFile(files[idx].path, files[idx].staged);
        }}
      >
        {changesLoading.value && !cs ? (
          <div class={treeStyles.changesEmpty}>Loading…</div>
        ) : total === 0 && stashes.length === 0 ? (
          <div class={treeStyles.changesEmpty}>No uncommitted changes.</div>
        ) : filter && fStaged.length === 0 && fUnstaged.length === 0 && stashes.length === 0 ? (
          <div class={treeStyles.changesEmpty}>No files match the filter.</div>
        ) : (
          <>
            {fStaged.length > 0 ? (
              <ScmGroup
                groupKey="staged"
                title="Staged Changes"
                count={fStaged.length}
                files={fStaged}
                staged
                onGroupAction={() => unstageFiles(fStaged.map((f) => f.path))}
                groupActionIcon={ICONS.up}
                groupActionTitle="Unstage all"
              />
            ) : null}
            {fUnstaged.length > 0 ? (
              <ScmGroup
                groupKey="unstaged"
                title="Changes"
                count={fUnstaged.length}
                files={fUnstaged}
                staged={false}
                onGroupAction={() => stageFiles(fUnstaged.map((f) => f.path))}
                groupActionIcon={ICONS.plus}
                groupActionTitle="Stage all"
              />
            ) : null}
            <StashGroup stashes={stashes} />
          </>
        )}
      </div>

      <CommitBox stagedCount={staged.length} unstagedCount={unstaged.length} />
    </div>
  );
}

function StashDialogBody({ branch, close }: { branch: string; close: (v: { message: string; includeUntracked: boolean } | null) => void }) {
  const [message, setMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const msgRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => msgRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, []);
  const submit = () => close({ message: message.trim(), includeUntracked });
  return (
    <>
      <p class="modal-msg">
        Saves your uncommitted changes to a stash and resets the working tree to a clean state. Restore them anytime from the Stashes list.
      </p>
      <div class="form-row">
        <label class="form-label">Message (optional)</label>
        <input
          ref={msgRef}
          class="modal-input"
          type="text"
          placeholder={`Work in progress on ${branch}`}
          spellcheck={false}
          autocomplete="off"
          value={message}
          onInput={(e) => setMessage((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      <label class="form-check">
        <input type="checkbox" checked={includeUntracked} onChange={(e) => setIncludeUntracked((e.target as HTMLInputElement).checked)} /> <span>Include untracked files</span>
      </label>
      <div class="modal-foot">
        <button class="btn btn-ghost" type="button" onClick={() => close(null)}>
          Cancel
        </button>
        <button class="btn btn-primary" type="button" onClick={submit}>
          Stash changes
        </button>
      </div>
    </>
  );
}

function StashGroup({ stashes }: { stashes: StashEntry[] }) {
  if (!stashes.length) return null;
  const dropStash = async (s: StashEntry) => {
    const ok = await modal.confirm({
      title: "Delete stash",
      message: `Delete this stash? The saved changes will be permanently lost.\n\n"${s.message}"`,
      confirmText: "Delete stash",
      danger: true,
    });
    if (ok) stashDrop(s.index).catch((e) => modal.alert({ title: "Drop failed", message: String(e) }));
  };
  const ctxMenu = (e: MouseEvent, s: StashEntry) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, [
      { label: "Restore (apply & remove)", icon: ICONS.restore, onClick: () => stashPop(s.index).catch((err) => modal.alert({ title: "Restore failed", message: String(err) })) },
      { label: "Apply (keep stash)", icon: ICONS.copy, onClick: () => stashApply(s.index).catch((err) => modal.alert({ title: "Apply failed", message: String(err) })) },
      { label: "View…", icon: ICONS.eye, onClick: () => viewStash(s) },
      { separator: true },
      { label: "Delete stash", icon: ICONS.trash, danger: true, onClick: () => dropStash(s) },
    ]);
  };
  return (
    <div class={`${styles.scmGroup} ${styles.scmStashes}${collapsedGroups.value.has("stashes") ? ` ${styles.collapsed}` : ""}`}>
      <div class={styles.scmGroupHead} onClick={() => toggleGroup("stashes")}>
        <span class={`${treeStyles.treeTwisty}${collapsedGroups.value.has("stashes") ? ` ${treeStyles.collapsed}` : ""}`} dangerouslySetInnerHTML={{ __html: ICONS.chevronDown }} />
        <span class={styles.scmGroupTitle}>Stashes</span>
        <span class={styles.scmGroupCount}>{stashes.length}</span>
      </div>
      {collapsedGroups.value.has("stashes") ? null : (
        <div class={styles.scmGroupBody}>
          {stashes.map((s) => (
            <div class={styles.stashRow} key={s.index} title={s.message} onContextMenu={(e) => ctxMenu(e, s)}>
              <span class={styles.stashIco}>
                <Raw html={ICONS.archive} />
              </span>
              <div class={styles.stashMain}>
                <span class={styles.stashMsg}>{s.message}</span>
                <span class={styles.stashMeta}>
                  {s.branch ? `${s.branch} · ` : ""}
                  {s.when}
                </span>
              </div>
              <div class={styles.scmActions}>
                <button
                  class={styles.scmAct}
                  type="button"
                  title="Restore — apply & remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    stashPop(s.index).catch((err) => modal.alert({ title: "Restore failed", message: String(err) }));
                  }}
                >
                  <Raw html={ICONS.restore} />
                </button>
                <button
                  class={styles.scmAct}
                  type="button"
                  title="Delete stash"
                  onClick={(e) => {
                    e.stopPropagation();
                    void dropStash(s);
                  }}
                >
                  <Raw html={ICONS.trash} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScmGroup({
  groupKey,
  title,
  count,
  files,
  staged,
  onGroupAction,
  groupActionIcon,
  groupActionTitle,
}: {
  groupKey: string;
  title: string;
  count: number;
  files: FileChange[];
  staged: boolean;
  onGroupAction: () => void;
  groupActionIcon: string;
  groupActionTitle: string;
}) {
  if (!files.length) return null;
  const collapsed = collapsedGroups.value.has(groupKey);
  const onSelect = (path: string) => selectFile(path, staged);
  const onAction = (act: FileAction, path: string) => {
    if (act === "discard") void confirmDiscard(path);
    else if (act === "stage") void stageFiles([path]);
    else if (act === "unstage") void unstageFiles([path]);
  };
  const onFolderAction = (act: FileAction, folder: string) => {
    const prefix = folder.endsWith("/") ? folder : folder + "/";
    const paths = files.filter((f) => f.path.startsWith(prefix)).map((f) => f.path);
    if (!paths.length) return;
    if (act === "discard") void confirmDiscardMany(paths);
    else if (act === "stage") void stageFiles(paths);
    else if (act === "unstage") void unstageFiles(paths);
  };
  return (
    <div class={`${styles.scmGroup}${collapsed ? ` ${styles.collapsed}` : ""}`}>
      <div class={styles.scmGroupHead} onClick={(e) => {
        if ((e.target as HTMLElement).closest(`.${styles.scmAct}`)) return;
        toggleGroup(groupKey);
      }}>
        <span class={`${treeStyles.treeTwisty}${collapsed ? ` ${treeStyles.collapsed}` : ""}`} dangerouslySetInnerHTML={{ __html: ICONS.chevronDown }} />
        <span class={styles.scmGroupTitle}>{title}</span>
        <div class={styles.scmGroupActions}>
          <button class={styles.scmAct} type="button" title={groupActionTitle} onClick={(e) => { e.stopPropagation(); onGroupAction(); }}>
            <Raw html={groupActionIcon} />
          </button>
        </div>
        <span class={styles.scmGroupCount}>{count}</span>
      </div>
      {collapsed ? null : (
        <div class={styles.scmGroupBody}>
          <FileTree
            files={files}
            viewMode={viewMode.value}
            group={staged ? "staged" : "unstaged"}
            activeFile={selectedFile.value?.staged === staged ? selectedFile.value?.path : null}
            onSelect={onSelect}
            onAction={onAction}
            onFolderAction={onFolderAction}
            actionClasses={FILE_TREE_ACTION_CLASSES}
          />
        </div>
      )}
    </div>
  );
}

async function confirmDiscard(path: string) {
  const ok = await modal.confirm({
    title: "Discard changes",
    message: `Discard all changes to "${path}"? This cannot be undone.`,
    confirmText: "Discard",
    danger: true,
  });
  if (ok) void discardFiles([path]);
}

async function confirmDiscardMany(paths: string[]) {
  const ok = await modal.confirm({
    title: "Discard changes",
    message: `Discard all changes to ${paths.length} file${paths.length === 1 ? "" : "s"}? This cannot be undone.`,
    confirmText: "Discard",
    danger: true,
  });
  if (ok) void discardFiles(paths);
}

function CommitBox({ stagedCount, unstagedCount }: { stagedCount: number; unstagedCount: number }) {
  const [summary, setSummary] = useState("");
  const [desc, setDesc] = useState("");
  const busy = gitBusy;
  const cs = changeSet.value;
  const branch = cs?.branch || "";
  const canCommit = summary.trim().length > 0 && (stagedCount > 0 || unstagedCount > 0) && !busy.value;

  const openBranchMenu = async (anchor: HTMLElement) => {
    const repoId = changesRepoId.value;
    if (!repoId) return;
    let branches: string[];
    try {
      branches = await ipc.listBranches(repoId);
    } catch (e) {
      await modal.alert({ title: "Couldn't load branches", message: String(e) });
      return;
    }
    openBranchPicker(anchor, {
      repoId,
      branches,
      current: branch,
      dirty: (cs?.staged?.length || 0) + (cs?.unstaged?.length || 0) > 0,
      onSwitched: (updated) => {
        upsertRepo(updated);
        void loadChanges(repoId);
      },
      onCreated: (updated) => {
        upsertRepo(updated);
        void loadChanges(repoId);
      },
    });
  };

  const commitVariant = async (opts: { all: boolean; amend: boolean; signoff: boolean }) => {
    const repoId = changesRepoId.value;
    const s = summary.trim();
    if (!repoId || !s) return;
    busy.value = true;
    try {
      await ipc.gitCommit(repoId, s, desc.trim(), opts.all, opts.amend, opts.signoff);
      setSummary("");
      setDesc("");
      await loadChanges(repoId);
    } catch (e) {
      await modal.alert({ title: "Commit failed", message: String(e) });
    } finally {
      busy.value = false;
    }
  };

  const runSync = async (kind: "fetch" | "sync" | "push" | "pull") => {
    const repoId = changesRepoId.value;
    if (!repoId) return;
    busy.value = true;
    try {
      if (kind === "fetch") await ipc.fetchRepo(repoId);
      else if (kind === "push") await doPush();
      else if (kind === "pull") await doPull();
      else {
        await doPull();
        await doPush();
      }
    } catch (e) {
      await modal.alert({ title: "Git action failed", message: String(e) });
    } finally {
      busy.value = false;
    }
  };

  const gitMenu = async (anchor: HTMLElement) => {
    const repoId = changesRepoId.value;
    if (!repoId) return;
    let conflictKind = "none";
    try {
      const info = await ipc.gitConflicts(repoId);
      conflictKind = info?.kind || "none";
    } catch {
      /* treat as none */
    }
    const isRebasing = conflictKind === "rebase";
    const hasStaged = stagedCount > 0;
    const hasUnstaged = unstagedCount > 0;
    const hasChanges = hasStaged || hasUnstaged;
    const hasSummary = summary.trim().length > 0;
    const pushLabel = cs?.hasUpstream ? "Push" : "Publish";
    // Order mirrors vanilla gitMenuItems().reverse(): common sync actions sit at
    // the bottom (nearest the gear button, which opens the menu upward).
    const items: MenuItem[] = [
      { label: "Show Git Output", icon: ICONS.terminal, onClick: showGitOutput },
      { separator: true },
      { label: "Worktrees", icon: ICONS.folder, submenu: worktreesMenuItems(anchor) },
      { label: "Tags", icon: ICONS.tag, submenu: tagsMenuItems(anchor) },
      { label: "Stash", icon: ICONS.archive, submenu: stashMenuItems(anchor) },
      { label: "Remote", icon: ICONS.external, submenu: remotesMenuItems(anchor) },
      {
        label: "Branch",
        icon: ICONS.branch,
        submenu: [
          { label: "Merge…", icon: ICONS.merge, onClick: () => mergeFlow(anchor) },
          { label: "Rebase Branch…", icon: ICONS.swap, onClick: () => rebaseFlow(anchor) },
          { separator: true },
          { label: "Create Branch…", icon: ICONS.plus, onClick: () => newBranchFlow() },
          { label: "Create Branch From…", icon: ICONS.plus, onClick: () => newBranchFlow() },
          { separator: true },
          { label: "Rename Branch…", icon: ICONS.pencil, onClick: () => renameBranchFlow() },
          { label: "Delete Branch…", icon: ICONS.trash, danger: true, onClick: () => deleteBranchFlowGear(anchor) },
          { label: "Delete Remote Branch…", icon: ICONS.trash, danger: true, onClick: () => deleteRemoteBranchFlow(anchor) },
          { separator: true },
          { label: "Publish Branch…", icon: ICONS.up, disabled: cs?.hasUpstream, onClick: () => publishBranchFlow() },
        ],
      },
      {
        label: "Pull, Push",
        icon: ICONS.swap,
        submenu: [
          { label: "Sync", icon: ICONS.swap, onClick: () => runSync("sync") },
          { separator: true },
          { label: "Pull", icon: ICONS.down, onClick: () => runSync("pull") },
          { label: "Pull (Rebase)", icon: ICONS.down, onClick: () => pullRebaseFlow() },
          { label: "Pull from…", icon: ICONS.down, onClick: () => pullFromFlow() },
          { separator: true },
          { label: pushLabel, icon: ICONS.up, onClick: () => runSync("push") },
          { label: "Push to…", icon: ICONS.up, onClick: () => pushToFlow() },
          { separator: true },
          { label: "Fetch", icon: ICONS.sync, onClick: () => runSync("fetch") },
          { label: "Fetch (Prune)", icon: ICONS.sync, onClick: () => runGitAction("Fetch (prune)", () => ipc.gitFetchPrune(repoId)) },
          { label: "Fetch From All Remotes", icon: ICONS.sync, onClick: () => runGitAction("Fetch (all remotes)", () => ipc.gitFetchAll(repoId)) },
        ],
      },
      {
        label: "Changes",
        icon: ICONS.changes,
        submenu: [
          { label: "Stage All Changes", icon: ICONS.plus, disabled: !hasUnstaged, onClick: () => stageFiles((changeSet.value?.unstaged || []).map((f) => f.path)) },
          { label: "Unstage All Changes", icon: ICONS.x, disabled: !hasStaged, onClick: () => unstageFiles((changeSet.value?.staged || []).map((f) => f.path)) },
          { label: "Discard All Changes", icon: ICONS.trash, danger: true, disabled: !hasUnstaged, onClick: () => confirmDiscardMany((changeSet.value?.unstaged || []).map((f) => f.path)) },
        ],
      },
      {
        label: "Commit",
        icon: ICONS.check,
        submenu: [
          { label: "Commit", icon: ICONS.check, disabled: !hasChanges || !hasSummary, onClick: () => commitVariant({ all: !hasStaged, amend: false, signoff: false }) },
          { label: "Commit Staged", icon: ICONS.check, disabled: !hasStaged || !hasSummary, onClick: () => commitVariant({ all: false, amend: false, signoff: false }) },
          { label: "Commit All", icon: ICONS.check, disabled: !hasChanges || !hasSummary, onClick: () => commitVariant({ all: true, amend: false, signoff: false }) },
          { label: "Undo Last Commit", icon: ICONS.trash, onClick: () => undoLastCommitFlow() },
          { label: "Abort Rebase", icon: ICONS.x, danger: true, disabled: !isRebasing, onClick: () => runGitAction("Abort rebase", () => ipc.conflictAbort(repoId)) },
          { separator: true },
          { label: "Commit (Amend)", icon: ICONS.pencil, disabled: !hasSummary, onClick: () => commitVariant({ all: !hasStaged, amend: true, signoff: false }) },
          { label: "Commit Staged (Amend)", icon: ICONS.pencil, disabled: !hasStaged || !hasSummary, onClick: () => commitVariant({ all: false, amend: true, signoff: false }) },
          { label: "Commit All (Amend)", icon: ICONS.pencil, disabled: !hasSummary, onClick: () => commitVariant({ all: true, amend: true, signoff: false }) },
          { separator: true },
          { label: "Commit (Signed Off)", icon: ICONS.check, disabled: !hasChanges || !hasSummary, onClick: () => commitVariant({ all: !hasStaged, amend: false, signoff: true }) },
          { label: "Commit Staged (Signed Off)", icon: ICONS.check, disabled: !hasStaged || !hasSummary, onClick: () => commitVariant({ all: false, amend: false, signoff: true }) },
          { label: "Commit All (Signed Off)", icon: ICONS.check, disabled: !hasChanges || !hasSummary, onClick: () => commitVariant({ all: true, amend: false, signoff: true }) },
        ],
      },
      { separator: true },
      { label: "Clone", icon: ICONS.copy, onClick: () => cloneRepoFlow() },
      { label: "Checkout to…", icon: ICONS.branch, onClick: () => openBranchMenu(anchor) },
      { label: "Create Pull Request…", icon: ICONS.pr, onClick: () => createPullRequestFlow() },
      { label: "Pull", icon: ICONS.down, onClick: () => runSync("pull") },
      { label: pushLabel, icon: ICONS.up, onClick: () => runSync("push") },
      { label: "Sync", icon: ICONS.swap, onClick: () => runSync("sync") },
      { label: "Fetch", icon: ICONS.sync, onClick: () => runSync("fetch") },
    ];
    openMenu(anchor, items);
  };

  const commit = async () => {
    if (!canCommit) return;
    busy.value = true;
    try {
      // If nothing staged, commit all tracked changes (stage everything first).
      if (stagedCount === 0 && unstagedCount > 0) {
        await stageFiles((changeSet.value?.unstaged || []).map((f) => f.path));
      }
      await doCommit(summary.trim(), desc.trim());
      setSummary("");
      setDesc("");
    } catch (e) {
      await modal.alert({ title: "Commit failed", message: String(e) });
    } finally {
      busy.value = false;
    }
  };

  return (
    <div class={styles.commitBox}>
      <div class={styles.branchRow}>
        <button class={styles.commitBranchBtn} type="button" title="Switch branch" onClick={(e) => openBranchMenu(e.currentTarget as HTMLElement)}>
          <Raw html={ICONS.branch} />
          <span>{branch || "—"}</span>
          <Raw html={ICONS.caret} class={styles.caret} />
        </button>
        <button class={`${styles.gitMenuBtn}${gitBusy.value ? ` ${styles.busy}` : ""}`} type="button" title="Git actions" onClick={(e) => gitMenu(e.currentTarget as HTMLElement)}>
          <Raw html={ICONS.gear} />
          {cs && (cs.ahead || cs.behind) ? <span class={styles.syncCount}>{(cs.ahead || 0) + (cs.behind || 0)}</span> : null}
        </button>
      </div>
      <input
        class={styles.commitInput}
        placeholder="Summary (required)"
        value={summary}
        onInput={(e) => setSummary((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) commit();
        }}
      />
      <textarea class={styles.commitTextarea} placeholder="Description" value={desc} onInput={(e) => setDesc((e.target as HTMLTextAreaElement).value)} />
      <button class={`btn btn-primary ${styles.commitBtn}`} disabled={!canCommit} onClick={commit}>
        {stagedCount > 0 ? "Commit" : "Commit all"}
      </button>
    </div>
  );
}

const pullFilter = signal("");
const collapsedPullDetail = signal<Set<string>>(new Set());

function prStateLabel(status: string): string {
  return status === "merged" ? "Merged" : status === "draft" ? "Draft" : "Open";
}

function openPrUrl(url: string | undefined): void {
  if (!url) return;
  if (ipc.hasBackend) ipc.openUrl(url).catch(() => {});
  else window.open(url, "_blank");
}

function PullsPane() {
  const all = repoPulls.value;
  const f = pullFilter.value.toLowerCase();
  const list = f
    ? all.filter(
        (p) =>
          (p.title || "").toLowerCase().includes(f) ||
          String(p.id).includes(f) ||
          (p.author || "").toLowerCase().includes(f) ||
          (p.branch || "").toLowerCase().includes(f),
      )
    : all;
  return (
    <div class={styles.commitPane}>
      <div class={styles.commitFilter}>
        <Raw html={ICONS.search} />
        <input
          type="text"
          placeholder="Filter pull requests…"
          spellcheck={false}
          value={pullFilter.value}
          onInput={(e) => (pullFilter.value = (e.target as HTMLInputElement).value)}
        />
      </div>
      <div
        class={styles.historyList}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          if (!list.length) return;
          let idx = list.findIndex((p) => p.id === selectedPull.value?.id);
          idx = idx < 0 ? 0 : idx + (e.key === "ArrowDown" ? 1 : -1);
          if (idx < 0 || idx >= list.length) return;
          e.preventDefault();
          void selectPull(list[idx].id);
        }}
      >
        {repoPullsLoading.value && all.length === 0 ? (
          <div class={treeStyles.changesEmpty}>Loading pull requests…</div>
        ) : all.length === 0 ? (
          <div class={treeStyles.changesEmpty}>No open pull requests for this repository.</div>
        ) : list.length === 0 ? (
          <div class={treeStyles.changesEmpty}>No pull requests match the filter.</div>
        ) : (
          list.map((p) => (
            <div class={`${styles.historyRow}${selectedPull.value?.id === p.id ? ` ${styles.selected}` : ""}`} key={p.id} onClick={() => selectPull(p.id)}>
              <div class={styles.historyMain}>
                <div class={styles.historySummary} title={p.title}>
                  {p.title}
                </div>
                <div class={styles.historyMeta}>
                  <span class={styles.historyHash}>#{p.id}</span>
                  <span class={styles.historyAuthor} title={p.author}>
                    {p.author}
                  </span>
                  <span class={styles.hmDot}>·</span>
                  <span class={styles.historyWhen}>{p.updated}</span>
                </div>
              </div>
              <div class={styles.historyBadges}>
                <span class={`pr-state ${p.status}`}>{prStateLabel(p.status)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PrDetail() {
  const pr = selectedPull.value;
  const files = pullFiles.value;
  const prId = pr?.id;
  useEffect(() => {
    collapsedPullDetail.value = new Set();
  }, [prId]);
  if (!pr) {
    return (
      <section class={styles.commitDetail}>
        <div class={styles.detailHead} />
        <div class={styles.detailFilebar}>Files</div>
        <div class={treeStyles.fileTree}>
          <div class={treeStyles.changesEmpty}>Select a pull request.</div>
        </div>
      </section>
    );
  }
  const rev = prReviewChip(pr);
  const hasFolders = files.some((ff) => ff.path.includes("/"));
  return (
    <section class={styles.commitDetail}>
      <div class={styles.detailHead}>
        <div class={styles.detailMsg}>{pr.title}</div>
        <div class={styles.detailMeta}>
          <Avatar name={pr.author} class={styles.detailAvatar} />
          <span class={styles.detailAuthor} title={pr.author}>
            {pr.author}
          </span>
          <span class={styles.hmDot}>·</span>
          <span class={styles.historyWhen}>{pr.updated}</span>
          <span class={`pr-state ${pr.status}`}>{prStateLabel(pr.status)}</span>
        </div>
        <div class={styles.prDetailBranch}>
          <code title={pr.branch}>{pr.branch}</code>
          <span class={styles.prArrow}>→</span>
          <code title={pr.base}>{pr.base}</code>
        </div>
        <div class={styles.prDetailStats}>
          <span class={`chip review ${rev.cls}`}>
            <Raw html={rev.icon} />
            {rev.label}
          </span>
          <button class="btn btn-primary btn-sm" type="button" onClick={() => pr.repoId && openReviewer(pr.repoId, pr, { returnTo: "changes" })}>
            Review
          </button>
          <button class="btn btn-ghost btn-sm" type="button" onClick={() => openPrUrl(pr.url)}>
            <Raw html={ICONS.external} />
            View
          </button>
        </div>
      </div>
      <div class={styles.detailFilebar}>
        <span>{files.length} file{files.length === 1 ? "" : "s"} changed</span>
        {hasFolders ? (
          <button class={styles.iconMini} type="button" title="Collapse all folders" onClick={() => (collapsedPullDetail.value = new Set(allDirPaths(files)))}>
            <Raw html={ICONS.collapseAll} />
          </button>
        ) : null}
      </div>
      <div
        class={treeStyles.fileTree}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          if (!files.length) return;
          const order = fileOrder(files, "tree");
          let idx = order.indexOf(pullActiveFile.value || "");
          idx = idx < 0 ? 0 : idx + (e.key === "ArrowDown" ? 1 : -1);
          if (idx < 0 || idx >= order.length) return;
          e.preventDefault();
          void selectPullFile(order[idx]);
        }}
      >
        {files.length === 0 ? (
          <div class={treeStyles.changesEmpty}>This pull request has no file changes.</div>
        ) : (
          <FileTree
            files={files}
            viewMode="tree"
            group={null}
            activeFile={pullActiveFile.value}
            collapsed={collapsedPullDetail.value}
            onToggleCollapse={(key) => {
              const next = new Set(collapsedPullDetail.value);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              collapsedPullDetail.value = next;
            }}
            onSelect={(path) => selectPullFile(path)}
          />
        )}
      </div>
    </section>
  );
}

function HistoryPane() {
  const f = historyFilter.value.toLowerCase();
  const shown = f
    ? commits.value.filter((c) => c.summary.toLowerCase().includes(f) || c.author.toLowerCase().includes(f) || c.id.includes(f))
    : commits.value;
  const isLatest = (sha: string) => commits.value.length > 0 && commits.value[0].hash === sha;

  const ctxMenu = (e: MouseEvent, sha: string) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, [
      {
        label: "Undo commit",
        icon: ICONS.trash,
        disabled: !isLatest(sha),
        onClick: async () => {
          const c = commits.value.find((x) => x.hash === sha);
          const ok = await modal.confirm({
            title: "Undo commit",
            message: `Undo "${c?.summary}"? Its changes will move back to Staged Changes so you can edit or re-commit them.`,
            confirmText: "Undo commit",
          });
          if (!ok) return;
          try {
            await undoCommit(sha);
          } catch (err) {
            await modal.alert({ title: "Undo commit failed", message: String(err) });
          }
        },
      },
    ]);
  };

  return (
    <div class={styles.commitPane}>
      <div class={styles.commitFilter}>
        <Raw html={ICONS.search} />
        <input
          type="text"
          placeholder="Filter commits…"
          spellcheck={false}
          value={historyFilter.value}
          onInput={(e) => (historyFilter.value = (e.target as HTMLInputElement).value)}
        />
      </div>
      <div
        class={styles.historyList}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          if (!shown.length) return;
          let idx = shown.findIndex((c) => c.hash === selectedCommit.value);
          idx = idx < 0 ? 0 : idx + (e.key === "ArrowDown" ? 1 : -1);
          if (idx < 0 || idx >= shown.length) return;
          e.preventDefault();
          selectCommit(shown[idx].hash);
        }}
      >
        {shown.length === 0 ? (
          <div class={treeStyles.changesEmpty}>{commits.value.length ? "No commits match." : "No commits yet."}</div>
        ) : (
          shown.map((c) => (
            <div
              class={`${styles.historyRow}${selectedCommit.value === c.hash ? ` ${styles.selected}` : ""}`}
              key={c.hash}
              onClick={() => selectCommit(c.hash)}
              onContextMenu={(e) => ctxMenu(e, c.hash)}
            >
              <div class={styles.historyMain}>
                <div class={styles.historySummary} title={c.summary}>
                  {c.summary}
                </div>
                <div class={styles.historyMeta}>
                  <span class={styles.historyHash}>{c.id}</span>
                  <span class={styles.historyAuthor} title={c.author}>
                    {c.author}
                  </span>
                  <span class={styles.hmDot}>·</span>
                  <span class={styles.historyWhen}>{c.when}</span>
                </div>
              </div>
              {(c.tags?.length || c.unpushed) ? (
                <div class={styles.historyBadges}>
                  {(c.tags || []).map((t) => (
                    <span class={styles.historyTag} key={t} title={`Tag: ${t}`}>
                      <Raw html={ICONS.tag} />
                      <span>{t}</span>
                    </span>
                  ))}
                  {c.unpushed ? (
                    <span class={styles.historyUnpushed} title="This commit hasn't been pushed yet">
                      <Raw html={ICONS.up} />
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CommitDetail() {
  const c = commits.value.find((x) => x.hash === selectedCommit.value) || null;
  const files = commitFiles.value;
  // The commit-detail tree is always tree view with its own collapse state
  // (mirrors vanilla detailView="tree" + collapsedDetail), reset per commit.
  const sha = selectedCommit.value;
  useEffect(() => {
    collapsedDetail.value = new Set();
  }, [sha]);
  const hasFolders = files.some((f) => f.path.includes("/"));
  return (
    <section class={styles.commitDetail}>
      <div class={styles.detailHead}>
        <div class={styles.detailMsg}>{c?.summary || ""}</div>
        <div class={styles.detailMeta}>
          <Avatar name={c?.author} class={styles.detailAvatar} />
          <span class={styles.detailAuthor} title={c?.author}>
            {c?.author || ""}
          </span>
          <span class={styles.hmDot}>·</span>
          <span class={styles.historyWhen}>{c?.when || ""}</span>
          <span class={styles.historyHash}>{c?.id || ""}</span>
        </div>
      </div>
      <div class={styles.detailFilebar}>
        <span>{files.length} file{files.length === 1 ? "" : "s"} changed</span>
        {hasFolders ? (
          <button
            class={styles.iconMini}
            type="button"
            title="Collapse all folders"
            onClick={() => (collapsedDetail.value = new Set(allDirPaths(files)))}
          >
            <Raw html={ICONS.collapseAll} />
          </button>
        ) : null}
      </div>
      <div
        class={treeStyles.fileTree}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          if (!files.length) return;
          const order = fileOrder(files, "tree");
          let idx = order.indexOf(commitActiveFile.value || "");
          idx = idx < 0 ? 0 : idx + (e.key === "ArrowDown" ? 1 : -1);
          if (idx < 0 || idx >= order.length) return;
          e.preventDefault();
          void selectCommitFile(order[idx]);
        }}
      >
        {!selectedCommit.value ? (
          <div class={treeStyles.changesEmpty}>Select a commit.</div>
        ) : files.length === 0 ? (
          <div class={treeStyles.changesEmpty}>No file changes.</div>
        ) : (
          <FileTree
            files={files}
            viewMode="tree"
            group={null}
            activeFile={commitActiveFile.value}
            collapsed={collapsedDetail.value}
            onToggleCollapse={(key) => {
              const next = new Set(collapsedDetail.value);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              collapsedDetail.value = next;
            }}
            onSelect={(path) => selectCommitFile(path)}
          />
        )}
      </div>
    </section>
  );
}

const collapsedDetail = signal<Set<string>>(new Set());

function DiffPane() {
  const history = changesTab.value === "history";
  const pulls = changesTab.value === "pulls";
  const diff = history ? commitDiff.value : pulls ? pullDiff.value : fileDiff.value;
  const loading = history ? commitDiffLoading.value : pulls ? pullDiffLoading.value : diffLoading.value;
  const active = history ? commitActiveFile.value : pulls ? pullActiveFile.value : selectedFile.value;

  // Ordered file list of the active pane for prev/next navigation. Uses the same
  // sorted/visual order as the rendered file tree (fileOrder) so ↑/↓ steps match.
  const nav = (() => {
    if (history) {
      const order = fileOrder(commitFiles.value, "tree");
      const idx = order.indexOf(commitActiveFile.value || "");
      return {
        idx,
        total: order.length,
        go: (i: number) => order[i] && selectCommitFile(order[i]),
      };
    }
    if (pulls) {
      const order = fileOrder(pullFiles.value, "tree");
      const idx = order.indexOf(pullActiveFile.value || "");
      return {
        idx,
        total: order.length,
        go: (i: number) => order[i] && selectPullFile(order[i]),
      };
    }
    const cs = changeSet.value;
    const files = [
      ...fileOrder(cs?.staged || [], viewMode.value).map((path) => ({ path, staged: true })),
      ...fileOrder(cs?.unstaged || [], viewMode.value).map((path) => ({ path, staged: false })),
    ];
    const sel = selectedFile.value;
    const idx = files.findIndex((f) => f.path === sel?.path && f.staged === sel?.staged);
    return {
      idx,
      total: files.length,
      go: (i: number) => files[i] && selectFile(files[i].path, files[i].staged),
    };
  })();

  return (
    <DiffView
      diff={active ? diff : null}
      loading={loading}
      empty={
        history
          ? selectedCommit.value
            ? "Select a file to view its diff."
            : "Select a commit, then a file to view its diff."
          : pulls
            ? selectedPull.value
              ? "Select a file to view its diff."
              : "Select a pull request, then a file to view its diff."
            : "Select a file to view its diff."
      }
      nav={
        active && diff && nav.total > 1 ? (
          <div class={diffStyles.diffNav}>
            <button class={diffStyles.diffNavButton} type="button" title="Previous file (↑)" disabled={nav.idx <= 0} onClick={() => nav.go(nav.idx - 1)}>
              <Raw html={ICONS.chevronUp} />
            </button>
            <span class={diffStyles.diffPos}>
              {nav.idx + 1} / {nav.total}
            </span>
            <button class={diffStyles.diffNavButton} type="button" title="Next file (↓)" disabled={nav.idx >= nav.total - 1} onClick={() => nav.go(nav.idx + 1)}>
              <Raw html={ICONS.chevronDown} />
            </button>
          </div>
        ) : null
      }
      wholeFile={wholeFile.value}
      onToggleWholeFile={toggleWholeFile}
      viewClass={styles.commitDiffView}
    >
      {active && diff ? <DiffBody diff={diff} /> : null}
    </DiffView>
  );
}

function DiffBody({ diff }: { diff: FileDiff }) {
  const html = useComputed(() => renderDiffHtml(diff));
  if (diff.oldImage || diff.newImage) return <ImageDiff diff={diff} />;
  if (diff.binary) return <div class={diffStyles.diffBinary}>Binary file — no text diff to display.</div>;
  if (!diff.hunks.length) return <div class={diffStyles.diffBinary}>No textual changes to display.</div>;
  return <div class={diffStyles.diffBody} dangerouslySetInnerHTML={{ __html: html.value }} />;
}

function ImageDiff({ diff }: { diff: FileDiff }) {
  const fig = (label: string, src: string) => (
    <figure class={diffStyles.diffImgFig} key={label}>
      <figcaption class={diffStyles.diffImgCap}>{label}</figcaption>
      <div class={diffStyles.diffImgWrap}>
        <img class={diffStyles.diffImg} src={src} alt={diff.path} loading="lazy" />
      </div>
    </figure>
  );
  return (
    <div class={diffStyles.diffImage}>
      {diff.oldImage && diff.newImage
        ? [fig("Before", diff.oldImage), fig("After", diff.newImage)]
        : diff.newImage
          ? fig("Added", diff.newImage)
          : diff.oldImage
            ? fig("Removed", diff.oldImage)
            : null}
    </div>
  );
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] || c);
}

function hl(content: string, path: string): string {
  const H = window.Highlighter;
  if (!content) return "&nbsp;";
  return H ? H.line(content, H.langForPath(path)) : esc(content);
}

function renderDiffHtml(diff: FileDiff): string {
  const out: string[] = [];
  for (const hunk of diff.hunks || []) {
    out.push(`<div class="${diffStyles.diffHunkHead}">${esc(hunk.header)}</div>`);
    out.push(`<div class="${diffStyles.diffCode}">`);
    for (const line of hunk.lines || []) {
      const cls = line.kind === "add" ? diffStyles.add : line.kind === "del" ? diffStyles.del : "";
      const oldNo = line.oldLineno != null ? String(line.oldLineno) : "";
      const newNo = line.newLineno != null ? String(line.newLineno) : "";
      out.push(
        `<div class="${diffStyles.diffLine} ${cls}"><span class="${diffStyles.diffGutter}"><span>${oldNo}</span><span>${newNo}</span></span><span class="${diffStyles.diffText}">${hl(line.content, diff.path)}</span></div>`,
      );
    }
    out.push("</div>");
  }
  return out.join("");
}

// ---------- Git actions (remotes / tags / worktrees / merge / rebase) --------

async function runGitAction(label: string, fn: () => Promise<unknown>): Promise<void> {
  const repoId = changesRepoId.value;
  if (!repoId || gitBusy.value) return;
  gitBusy.value = true;
  try {
    await fn();
    await loadChanges(repoId);
    const info = await ipc.gitConflicts(repoId).catch(() => null);
    if (info && info.kind !== "none" && info.files.length) openConflict(repoId);
  } catch (e) {
    await modal.alert({ title: `${label} failed`, message: String(e) });
  } finally {
    gitBusy.value = false;
  }
}

function branchPickMenu(anchor: HTMLElement, run: (branch: string) => void) {
  const repoId = changesRepoId.value;
  if (!repoId) return;
  ipc
    .listBranches(repoId)
    .then((branches) => {
      const cur = changeSet.value?.branch;
      const items: MenuItem[] = branches
        .filter((b) => b !== cur)
        .map((b) => ({ label: b, icon: ICONS.branch, onClick: () => run(b) }));
      if (!items.length) items.push({ label: "No other branches", disabled: true });
      openMenu(anchor, items);
    })
    .catch((e) => modal.alert({ title: "Couldn't load branches", message: String(e) }));
}

function mergeFlow(anchor: HTMLElement) {
  const repoId = changesRepoId.value;
  if (!repoId) return;
  branchPickMenu(anchor, (b) => runGitAction("Merge", () => ipc.mergeBranch(repoId, b)));
}

function rebaseFlow(anchor: HTMLElement) {
  const repoId = changesRepoId.value;
  if (!repoId) return;
  branchPickMenu(anchor, (b) => runGitAction("Rebase", () => ipc.rebaseBranch(repoId, b)));
}

// ---- pull/push variants ----
async function pullRebaseFlow() {
  const repoId = changesRepoId.value;
  if (!repoId) return;
  await runGitAction("Pull (rebase)", () => ipc.gitPull(repoId, true));
}
async function pullFromFlow() {
  const repoId = changesRepoId.value;
  if (!repoId) return;
  const res = await promptFields({
    title: "Pull from…",
    fields: [
      { label: "Remote", placeholder: "origin", value: "origin" },
      { label: "Branch", placeholder: changeSet.value?.branch || "" },
    ],
    confirmText: "Pull",
    validate: ([r, b]) => (!r || !b ? "Enter a remote and branch." : null),
  });
  if (res) await runGitAction("Pull from", () => ipc.gitPullFrom(repoId, res[0], res[1]));
}
async function pushToFlow() {
  const repoId = changesRepoId.value;
  if (!repoId) return;
  const res = await promptFields({
    title: "Push to…",
    fields: [
      { label: "Remote", placeholder: "origin", value: "origin" },
      { label: "Branch", placeholder: changeSet.value?.branch || "" },
    ],
    confirmText: "Push",
    validate: ([r, b]) => (!r || !b ? "Enter a remote and branch." : null),
  });
  if (res) await runGitAction("Push to", () => ipc.gitPushTo(repoId, res[0], res[1]));
}
async function publishBranchFlow() {
  const repoId = changesRepoId.value;
  if (!repoId) return;
  await runGitAction("Publish branch", () => ipc.gitPush(repoId));
}

// ---- clone / commit undo ----
async function cloneRepoFlow() {
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
  try {
    const repo = await ipc.cloneRepo(url, dir);
    if (repo) upsertRepo(repo);
  } catch (e) {
    await modal.alert({ title: "Clone failed", message: String(e) });
  }
}
async function undoLastCommitFlow() {
  const repoId = changesRepoId.value;
  if (!repoId) return;
  let last: CommitInfoLite | null = null;
  try {
    const log = await ipc.gitLog(repoId, 1);
    last = log[0] || null;
  } catch {
    /* ignore */
  }
  if (!last) {
    await modal.alert({ title: "Nothing to undo", message: "This repository has no commits yet." });
    return;
  }
  const ok = await modal.confirm({
    title: "Undo commit",
    message: `Undo "${last.summary}"? Its changes will move back to Staged Changes so you can edit or re-commit them.`,
    confirmText: "Undo commit",
  });
  if (!ok) return;
  try {
    await undoCommit(last.hash);
  } catch (e) {
    await modal.alert({ title: "Undo commit failed", message: String(e) });
  }
}

interface CommitInfoLite {
  hash: string;
  summary: string;
}

// ---- branch ops (gear) ----
function newBranchFlow() {
  const repoId = changesRepoId.value;
  if (!repoId) return;
  ipc.listBranches(repoId).then((branches) => {
    openNewBranchDialog({
      branches,
      current: changeSet.value?.branch || undefined,
      onCreate: (name, base) => runGitAction("Create branch", () => ipc.createBranch(repoId, name, base)),
    });
  });
}
async function renameBranchFlow() {
  const repoId = changesRepoId.value;
  if (!repoId) return;
  const cur = changeSet.value?.branch || "";
  const branches = await ipc.listBranches(repoId).catch(() => [] as string[]);
  const name = await modal.prompt({
    title: "Rename branch",
    label: `New name for "${cur}"`,
    value: cur,
    confirmText: "Rename",
    validate: (v) => {
      if (!v) return "Branch name is required.";
      if (v === cur) return "Enter a different name.";
      return validateBranchName(v, branches);
    },
  });
  if (name && name !== cur) await runGitAction("Rename branch", () => ipc.renameBranch(repoId, cur, name));
}
function deleteBranchFlowGear(anchor: HTMLElement) {
  const repoId = changesRepoId.value;
  if (!repoId) return;
  branchPickMenu(anchor, async (b) => {
    const ok = await modal.confirm({
      title: "Delete branch",
      message: `Delete the branch "${b}"? This cannot be undone.`,
      confirmText: "Delete",
      danger: true,
    });
    if (ok) await runGitAction("Delete branch", () => ipc.deleteBranch(repoId, b, false));
  });
}
function deleteRemoteBranchFlow(anchor: HTMLElement) {
  const repoId = changesRepoId.value;
  if (!repoId) return;
  branchPickMenu(anchor, async (b) => {
    const ok = await modal.confirm({
      title: "Delete remote branch",
      message: `Delete "${b}" on the remote? This cannot be undone.`,
      confirmText: "Delete",
      danger: true,
    });
    if (ok) await runGitAction("Delete remote branch", () => ipc.deleteRemoteBranch(repoId, b));
  });
}

// ---- create pull request ----
async function createPullRequestFlow() {
  const repoId = changesRepoId.value;
  if (!repoId) return;
  const r = repos.value.find((x) => x.id === repoId);
  if (!r) return;
  if (r.provider !== "github" && r.provider !== "azure") {
    await modal.alert({
      title: "Not supported",
      message: "Pull requests can be created for GitHub and Azure DevOps repositories only.",
    });
    return;
  }
  const head = changeSet.value?.branch || r.branch;
  const branches = await ipc.listBranches(repoId).catch(() => [] as string[]);
  const bases = branches.filter((b) => b !== head);
  const created = await modal.custom<import("@/types/models").PullRequest | null>({
    title: "Create pull request",
    body: (close) => <CreatePRBody repoId={repoId} head={head} bases={bases.length ? bases : ["main", "master"]} close={close} />,
  });
  if (!created) return;
  void openReviewer(repoId, created, { returnTo: "changes" });
}

function CreatePRBody({
  repoId,
  head,
  bases,
  close,
}: {
  repoId: string;
  head: string;
  bases: string[];
  close: (v: import("@/types/models").PullRequest | null) => void;
}) {
  const defaultBase = defaultBranchFrom(bases) || bases[0] || "main";
  const [base, setBase] = useState(defaultBase);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!title.trim()) return setErr("Enter a title.");
    if (!base) return setErr("Choose a branch to merge into.");
    if (base === head) return setErr("The compare and base branches must differ.");
    setErr("");
    setBusy(true);
    try {
      const pr = await ipc.createPullRequest({ repoId, title: title.trim(), body, base, head, draft });
      close(pr);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  };

  return (
    <>
      <div class="form-grid">
        <div class="form-row">
          <label class="form-label">From branch</label>
          <input class="modal-input" value={head} disabled />
        </div>
        <div class="form-row">
          <label class="form-label">Into branch</label>
          <select class="modal-input" value={base} onChange={(e) => setBase((e.target as HTMLSelectElement).value)}>
            {bases.map((b) => (
              <option value={b} key={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div class="form-row">
        <label class="form-label">Title</label>
        <input class="modal-input" placeholder="Add a title" value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
      </div>
      <div class="form-row">
        <label class="form-label">Description</label>
        <textarea class="modal-input" rows={4} placeholder="Describe your changes (optional)" value={body} onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)} />
      </div>
      <label class="form-check">
        <input type="checkbox" checked={draft} onChange={(e) => setDraft((e.target as HTMLInputElement).checked)} /> Create as draft
      </label>
      <div class="form-hint">The compare branch must already be pushed to the remote.</div>
      {err ? <div class="modal-error">{err}</div> : null}
      <div class="modal-foot">
        <button class="btn btn-ghost" type="button" onClick={() => close(null)}>
          Cancel
        </button>
        <button class="btn btn-primary" type="button" disabled={busy} onClick={create}>
          {busy ? "Creating…" : "Create pull request"}
        </button>
      </div>
    </>
  );
}

function remotesMenuItems(anchor: HTMLElement): MenuItem[] {
  const repoId = changesRepoId.value;
  if (!repoId) return [];
  return [
    {
      label: "Add Remote…",
      icon: ICONS.plus,
      onClick: async () => {
        const res = await promptFields({
          title: "Add remote",
          fields: [
            { label: "Name", placeholder: "origin" },
            { label: "URL", placeholder: "https://github.com/owner/repo.git" },
          ],
          confirmText: "Add",
          validate: ([name, url]) => (!name || !url ? "Enter a remote name and URL." : null),
        });
        if (res) void runGitAction("Add remote", () => ipc.gitAddRemote(repoId, res[0], res[1]));
      },
    },
    {
      label: "Remove Remote…",
      icon: ICONS.trash,
      danger: true,
      onClick: async () => {
        let remotes: RemoteInfo[];
        try {
          remotes = await ipc.gitListRemotes(repoId);
        } catch (e) {
          await modal.alert({ title: "Couldn't load remotes", message: String(e) });
          return;
        }
        if (!remotes.length) {
          await modal.alert({ title: "No remotes", message: "This repository has no remotes configured." });
          return;
        }
        openMenu(
          anchor,
          remotes.map((r) => ({
            label: `${r.name} — ${r.url}`,
            onClick: () => runGitAction("Remove remote", () => ipc.gitRemoveRemote(repoId, r.name)),
          })),
        );
      },
    },
  ];
}

function tagsMenuItems(anchor: HTMLElement): MenuItem[] {
  const repoId = changesRepoId.value;
  if (!repoId) return [];
  const pickTag = async (title: string, run: (t: GitTagInfo) => void) => {
    let tags: GitTagInfo[];
    try {
      tags = await ipc.gitListGitTags(repoId);
    } catch (e) {
      await modal.alert({ title: "Couldn't load tags", message: String(e) });
      return;
    }
    if (!tags.length) {
      await modal.alert({ title: "No tags", message: "This repository has no tags." });
      return;
    }
    openMenu(
      anchor,
      tags.map((t) => ({ label: t.message ? `${t.name} — ${t.message}` : t.name, onClick: () => run(t) })),
    );
    void title;
  };
  return [
    {
      label: "Create Tag…",
      icon: ICONS.tag,
      onClick: async () => {
        const res = await promptFields({
          title: "Create tag",
          fields: [
            { label: "Tag name", placeholder: "v1.0.0" },
            { label: "Target (optional, defaults to HEAD)", placeholder: changeSet.value?.branch || "" },
            { label: "Message (optional — annotated tag)", placeholder: "" },
          ],
          confirmText: "Create",
          validate: ([name]) => (!name ? "Enter a tag name." : null),
        });
        if (res) void runGitAction("Create tag", () => ipc.gitCreateTag(repoId, res[0], res[1], res[2]));
      },
    },
    { label: "Delete Tag…", icon: ICONS.trash, danger: true, onClick: () => pickTag("Delete tag", (t) => runGitAction("Delete tag", () => ipc.gitDeleteTag(repoId, t.name))) },
    {
      label: "Delete Remote Tag…",
      icon: ICONS.trash,
      danger: true,
      onClick: () => pickTag("Delete remote tag", (t) => runGitAction("Delete remote tag", () => ipc.gitDeleteRemoteTag(repoId, t.name))),
    },
    { separator: true },
    { label: "Push Tags", icon: ICONS.up, onClick: () => runGitAction("Push tags", () => ipc.gitPushTags(repoId)) },
  ];
}

function stashMenuItems(anchor: HTMLElement): MenuItem[] {
  const cs = changeSet.value;
  const hasChanges = (cs?.staged?.length || 0) + (cs?.unstaged?.length || 0) > 0;
  const hasStaged = (cs?.staged?.length || 0) > 0;
  const stashes = cs?.stashes || [];
  const hasStashes = stashes.length > 0;
  const err = (title: string) => (e: unknown) => modal.alert({ title, message: String(e) });
  const stashLabel = (s: StashEntry) => `${s.message || "(no message)"} — ${s.branch} · ${s.when}`;
  const picker = (run: (s: StashEntry) => void) => {
    if (!stashes.length) {
      void modal.alert({ title: "No stashes", message: "There are no stashes to pick from." });
      return;
    }
    openMenu(
      anchor,
      stashes.map((s) => ({ label: stashLabel(s), icon: ICONS.archive, onClick: () => run(s) })),
    );
  };
  const dropOne = async (s: StashEntry) => {
    const ok = await modal.confirm({
      title: "Delete stash",
      message: `Delete this stash? The saved changes will be permanently lost.\n\n"${s.message}"`,
      confirmText: "Delete stash",
      danger: true,
    });
    if (ok) stashDrop(s.index).catch(err("Drop failed"));
  };
  return [
    { label: "Stash", icon: ICONS.archive, disabled: !hasChanges, onClick: () => stashPush("", false).catch(err("Stash failed")) },
    { label: "Stash (Include Untracked)", icon: ICONS.archive, disabled: !hasChanges, onClick: () => stashPush("", true).catch(err("Stash failed")) },
    { label: "Stash Staged", icon: ICONS.archive, disabled: !hasStaged, onClick: () => stashPushStaged("").catch(err("Stash failed")) },
    { separator: true },
    { label: "Apply Latest Stash", icon: ICONS.copy, disabled: !hasStashes, onClick: () => stashApply(stashes[0].index).catch(err("Apply failed")) },
    { label: "Apply Stash…", icon: ICONS.copy, disabled: !hasStashes, onClick: () => picker((s) => stashApply(s.index).catch(err("Apply failed"))) },
    { separator: true },
    { label: "Pop Latest Stash", icon: ICONS.restore, disabled: !hasStashes, onClick: () => stashPop(stashes[0].index).catch(err("Pop failed")) },
    { label: "Pop Stash…", icon: ICONS.restore, disabled: !hasStashes, onClick: () => picker((s) => stashPop(s.index).catch(err("Pop failed"))) },
    { separator: true },
    { label: "Drop Stash…", icon: ICONS.trash, danger: true, disabled: !hasStashes, onClick: () => picker((s) => void dropOne(s)) },
    {
      label: "Drop All Stashes…",
      icon: ICONS.trash,
      danger: true,
      disabled: !hasStashes,
      onClick: async () => {
        const ok = await modal.confirm({
          title: "Drop all stashes",
          message: `Delete all ${stashes.length} stash${stashes.length === 1 ? "" : "es"}? This cannot be undone.`,
          confirmText: "Drop all",
          danger: true,
        });
        if (ok) stashClear().catch(err("Drop failed"));
      },
    },
    { separator: true },
    { label: "View Stash…", icon: ICONS.eye, disabled: !hasStashes, onClick: () => picker((s) => viewStash(s)) },
  ];
}

async function viewStash(s: StashEntry) {
  let text = "";
  try {
    text = await stashShow(s.index);
  } catch (e) {
    await modal.alert({ title: "Couldn't load stash", message: String(e) });
    return;
  }
  await modal.custom<null>({
    title: `${s.message || "(no message)"} · ${s.branch}`,
    wide: true,
    body: (close) => (
      <>
        <pre class={styles.gitOutputPre}>{text || "(empty diff)"}</pre>
        <div class="modal-foot">
          <button class="btn btn-primary" type="button" onClick={() => close(null)}>
            Close
          </button>
        </div>
      </>
    ),
  });
}

function worktreesMenuItems(anchor: HTMLElement): MenuItem[] {
  const repoId = changesRepoId.value;
  if (!repoId) return [];
  return [
    {
      label: "Add Worktree…",
      icon: ICONS.plus,
      onClick: async () => {
        const dir = await pickDirectory("Choose a folder for the new worktree");
        if (!dir) return;
        const branches = (await ipc.listBranches(repoId).catch(() => [])) as string[];
        const res = await promptFields({
          title: "Add worktree",
          message: `Folder: ${dir}`,
          fields: [{ label: "Branch (existing, or new)", placeholder: changeSet.value?.branch || "" }],
          confirmText: "Add",
          validate: ([b]) => (!b ? "Enter a branch name." : null),
        });
        if (!res) return;
        const br = res[0];
        void runGitAction("Add worktree", () => ipc.gitAddWorktree(repoId, dir, br, !branches.includes(br)));
      },
    },
    {
      label: "Remove Worktree…",
      icon: ICONS.trash,
      danger: true,
      onClick: async () => {
        let list: WorktreeInfo[];
        try {
          list = await ipc.gitListWorktrees(repoId);
        } catch (e) {
          await modal.alert({ title: "Couldn't load worktrees", message: String(e) });
          return;
        }
        const candidates = list.filter((w) => !w.isMain);
        if (!candidates.length) {
          await modal.alert({ title: "No worktrees", message: "There are no linked worktrees to remove." });
          return;
        }
        openMenu(
          anchor,
          candidates.map((w) => ({
            label: w.branch ? `${w.name} (${w.branch})` : w.name,
            onClick: () => runGitAction("Remove worktree", () => ipc.gitRemoveWorktree(repoId, w.path, false)),
          })),
        );
      },
    },
  ];
}

async function showGitOutput() {
  const entries = (await ipc.gitActionLog().catch(() => [])) || [];
  await modal.custom<null>({
    title: "Git Output",
    wide: true,
    body: (close) => (
      <>
        {entries.length === 0 ? (
          <p class="modal-msg">No git actions have run yet this session.</p>
        ) : (
          <pre class={styles.gitOutputPre}>
            {entries.map((e) => `[${e.time}] ${e.repo} — ${e.action} — ${e.ok ? "OK" : "ERROR: " + (e.detail || "")}`).join("\n")}
          </pre>
        )}
        <div class="modal-foot">
          <button class="btn btn-primary" type="button" onClick={() => close(null)}>
            Close
          </button>
        </div>
      </>
    ),
  });
}

interface FieldDef {
  label: string;
  placeholder?: string;
  value?: string;
}

function promptFields(opts: {
  title: string;
  message?: string;
  fields: FieldDef[];
  confirmText?: string;
  validate?: (values: string[]) => string | null;
}): Promise<string[] | null> {
  return modal.custom<string[] | null>({
    title: opts.title,
    body: (close) => <FieldsBody opts={opts} close={close} />,
  });
}

function FieldsBody({
  opts,
  close,
}: {
  opts: { message?: string; fields: FieldDef[]; confirmText?: string; validate?: (v: string[]) => string | null };
  close: (v: string[] | null) => void;
}) {
  const [vals, setVals] = useState<string[]>(opts.fields.map((f) => f.value || ""));
  const [err, setErr] = useState("");
  const submit = () => {
    const trimmed = vals.map((v) => v.trim());
    const msg = opts.validate ? opts.validate(trimmed) : null;
    if (msg) return setErr(msg);
    close(trimmed);
  };
  return (
    <>
      {opts.message ? <p class="modal-msg">{opts.message}</p> : null}
      {opts.fields.map((f, i) => (
        <div class="form-row" key={i}>
          <label class="form-label">{f.label}</label>
          <input
            class="modal-input"
            placeholder={f.placeholder}
            spellcheck={false}
            value={vals[i]}
            onInput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              setVals((prev) => prev.map((x, j) => (j === i ? v : x)));
            }}
          />
        </div>
      ))}
      {err ? <div class="modal-error">{err}</div> : null}
      <div class="modal-foot">
        <button class="btn btn-ghost" type="button" onClick={() => close(null)}>
          Cancel
        </button>
        <button class="btn btn-primary" type="button" onClick={submit}>
          {opts.confirmText || "OK"}
        </button>
      </div>
    </>
  );
}
