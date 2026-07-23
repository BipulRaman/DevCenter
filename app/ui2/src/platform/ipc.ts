// Typed IPC client — the UI2 equivalent of app/ui/js/api.js `window.app`.
// Every method maps 1:1 to a Rust command registered in
// app/src-tauri/src/commands/*. Command names and argument keys MUST match the
// backend exactly (they are unchanged by this rewrite).
//
// Convention:
//  - "read" methods that should degrade to null/empty in a plain browser use
//    `hasBackend ? invoke(...) : Promise.resolve(fallback)`.
//  - action methods invoke unconditionally (they only run inside the app).

import { hasBackend, invoke } from "@/platform/tauri";
import type {
  Account,
  AppLogEvent,
  AppPreset,
  ChangeSet,
  CommitInfo,
  ConflictFile,
  ConflictInfo,
  FileDiff,
  GitIdentity,
  GitLogEntry,
  GitTagInfo,
  ManagedApp,
  PrThread,
  PullRequest,
  RemoteInfo,
  Repo,
  WorktreeInfo,
} from "@/types/models";

export const ipc = {
  hasBackend,

  // --- Splash / shell ------------------------------------------------------
  closeSplash: () =>
    hasBackend ? invoke<void>("close_splashscreen") : Promise.resolve(),

  // --- App / OS helpers ----------------------------------------------------
  appVersion: () =>
    hasBackend ? invoke<string>("app_version") : Promise.resolve("browser"),
  appName: () =>
    hasBackend ? invoke<string>("app_name") : Promise.resolve("DevGitCenter"),
  checkForUpdates: () =>
    hasBackend
      ? invoke<{ status: string }>("check_for_updates")
      : Promise.resolve({ status: "browser" }),
  installUpdate: () => invoke<void>("install_update"),
  openPath: (path: string) => invoke<void>("open_path", { path }),
  openUrl: (url: string) => invoke<void>("open_url", { url }),
  writeTextFile: (path: string, contents: string) =>
    invoke<void>("write_text_file", { path, contents }),
  openTerminal: (path: string) => invoke<void>("open_terminal", { path }),
  vscodeAvailable: () =>
    hasBackend ? invoke<boolean>("vscode_available") : Promise.resolve(false),
  openInVscode: (path: string) => invoke<void>("open_in_vscode", { path }),
  vscodeInsidersAvailable: () =>
    hasBackend
      ? invoke<boolean>("vscode_insiders_available")
      : Promise.resolve(false),
  openInVscodeInsiders: (path: string) =>
    invoke<void>("open_in_vscode_insiders", { path }),

  // --- Git Board -----------------------------------------------------------
  listRepos: () =>
    hasBackend ? invoke<Repo[]>("list_repos") : Promise.resolve(null),
  scanRepos: (roots: string[]) => invoke<Repo[]>("scan_repos", { roots }),
  fetchRepo: (id: string) => invoke<Repo>("git_fetch", { id }),
  cloneRepo: (url: string, dir: string) =>
    invoke<Repo>("git_clone", { url, dir }),
  addRepo: (path: string) => invoke<Repo>("add_repo", { path }),
  listBranches: (id: string) => invoke<string[]>("list_branches", { id }),
  checkoutBranch: (id: string, branch: string, stash?: boolean) =>
    invoke<Repo>("git_checkout", { id, branch, stash: !!stash }),
  createBranch: (id: string, name: string, base?: string) =>
    invoke<Repo>("git_create_branch", { id, name, base }),
  renameBranch: (id: string, name: string, newName: string) =>
    invoke<Repo>("git_rename_branch", { id, name, newName }),
  deleteBranch: (id: string, name: string, force?: boolean) =>
    invoke<Repo>("git_delete_branch", { id, name, force: !!force }),
  setWatched: (id: string, watched: boolean) =>
    invoke<void>("set_repo_watched", { id, watched }),
  removeRepo: (id: string) => invoke<void>("remove_repo", { id }),
  setRepoTags: (id: string, tags: string[]) =>
    invoke<void>("set_repo_tags", { id, tags }),
  listTags: () =>
    hasBackend ? invoke<string[]>("list_tags") : Promise.resolve(null),

  // --- Changes / commit ----------------------------------------------------
  gitChanges: (id: string, sha?: string | null) =>
    invoke<ChangeSet>("git_changes", { id, sha: sha || null }),
  gitDiff: (
    id: string,
    path: string,
    sha?: string | null,
    staged?: boolean,
    context?: number | null,
  ) =>
    invoke<FileDiff>("git_diff", {
      id,
      path,
      sha: sha || null,
      staged: !!staged,
      context: context ?? null,
    }),
  prChanges: (id: string, base: string, head: string) =>
    invoke<ChangeSet>("git_pr_changes", { id, base, head }),
  prFileDiff: (
    id: string,
    base: string,
    head: string,
    path: string,
    context?: number | null,
  ) =>
    invoke<FileDiff>("git_pr_file_diff", {
      id,
      base,
      head,
      path,
      context: context ?? null,
    }),
  gitStage: (id: string, files: string[]) =>
    invoke<void>("git_stage", { id, files: files || [] }),
  gitUnstage: (id: string, files: string[]) =>
    invoke<void>("git_unstage", { id, files: files || [] }),
  gitDiscard: (id: string, files: string[]) =>
    invoke<void>("git_discard", { id, files: files || [] }),
  gitStashPush: (id: string, message?: string, includeUntracked?: boolean) =>
    invoke<void>("git_stash_push", {
      id,
      message: message || "",
      includeUntracked: includeUntracked !== false,
    }),
  gitStashApply: (id: string, index: number) =>
    invoke<void>("git_stash_apply", { id, index }),
  gitStashPop: (id: string, index: number) =>
    invoke<void>("git_stash_pop", { id, index }),
  gitStashDrop: (id: string, index: number) =>
    invoke<void>("git_stash_drop", { id, index }),
  gitStashPushStaged: (id: string, message?: string) =>
    invoke<void>("git_stash_push_staged", { id, message: message || "" }),
  gitStashClear: (id: string) => invoke<void>("git_stash_clear", { id }),
  gitStashShow: (id: string, index: number) =>
    invoke<string>("git_stash_show", { id, index }),
  gitCommit: (
    id: string,
    summary: string,
    description: string,
    all?: boolean,
    amend?: boolean,
    signoff?: boolean,
  ) =>
    invoke<void>("git_commit", {
      id,
      summary,
      description,
      all: !!all,
      amend: !!amend,
      signoff: !!signoff,
    }),
  undoCommit: (id: string, sha: string) =>
    invoke<ChangeSet>("git_undo_commit", { id, sha }),
  gitPush: (id: string) => invoke<ChangeSet>("git_push", { id }),
  gitPushTo: (id: string, remote: string, branch: string) =>
    invoke<ChangeSet>("git_push_to", { id, remote, branch }),
  gitPull: (id: string, rebase?: boolean) =>
    invoke<ChangeSet>("git_pull", { id, rebase: !!rebase }),
  gitPullFrom: (id: string, remote: string, branch: string) =>
    invoke<ChangeSet>("git_pull_from", { id, remote, branch }),
  gitFetchPrune: (id: string) => invoke<ChangeSet>("git_fetch_prune", { id }),
  gitFetchAll: (id: string) => invoke<ChangeSet>("git_fetch_all", { id }),
  mergeBranch: (id: string, branch: string) =>
    invoke<ChangeSet>("git_merge_branch", { id, branch }),
  rebaseBranch: (id: string, onto: string) =>
    invoke<ChangeSet>("git_rebase_branch", { id, onto }),
  deleteRemoteBranch: (id: string, branch: string) =>
    invoke<ChangeSet>("git_delete_remote_branch", { id, branch }),

  // --- Merge-conflict resolution ------------------------------------------
  gitConflicts: (id: string) => invoke<ConflictInfo>("git_conflicts", { id }),
  gitConflictFile: (id: string, path: string) =>
    invoke<ConflictFile>("git_conflict_file", { id, path }),
  resolveConflict: (
    id: string,
    path: string,
    side?: string | null,
    content?: string | null,
  ) =>
    invoke<void>("git_resolve_conflict", {
      id,
      path,
      side: side || null,
      content: content ?? null,
    }),
  conflictAbort: (id: string) => invoke<void>("git_conflict_abort", { id }),
  conflictContinue: (id: string) =>
    invoke<void>("git_conflict_continue", { id }),
  gitLog: (id: string, limit?: number | null) =>
    invoke<CommitInfo[]>("git_log", { id, limit: limit ?? null }),

  // --- Remotes -------------------------------------------------------------
  gitRemoteUrl: (id: string) => invoke<string>("git_remote_url", { id }),
  gitSetRemoteUrl: (id: string, url: string) =>
    invoke<void>("git_set_remote_url", { id, url }),
  gitListRemotes: (id: string) => invoke<RemoteInfo[]>("git_list_remotes", { id }),
  gitAddRemote: (id: string, name: string, url: string) =>
    invoke<void>("git_add_remote", { id, name, url }),
  gitRemoveRemote: (id: string, name: string) =>
    invoke<void>("git_remove_remote", { id, name }),

  // --- Tags ----------------------------------------------------------------
  gitListGitTags: (id: string) => invoke<GitTagInfo[]>("git_list_tags", { id }),
  gitCreateTag: (id: string, name: string, target?: string, message?: string) =>
    invoke<void>("git_create_tag", {
      id,
      name,
      target: target || "",
      message: message || "",
    }),
  gitDeleteTag: (id: string, name: string) =>
    invoke<void>("git_delete_tag", { id, name }),
  gitCheckoutTag: (id: string, name: string) =>
    invoke<void>("git_checkout_tag", { id, name }),
  gitDeleteRemoteTag: (id: string, name: string) =>
    invoke<void>("git_delete_remote_tag", { id, name }),
  gitPushTags: (id: string) => invoke<void>("git_push_tags", { id }),

  // --- Worktrees -----------------------------------------------------------
  gitListWorktrees: (id: string) =>
    invoke<WorktreeInfo[]>("git_list_worktrees", { id }),
  gitAddWorktree: (
    id: string,
    targetPath: string,
    branch: string,
    createBranch?: boolean,
  ) =>
    invoke<void>("git_add_worktree", {
      id,
      targetPath,
      branch,
      createBranch: !!createBranch,
    }),
  gitRemoveWorktree: (id: string, targetPath: string, force?: boolean) =>
    invoke<void>("git_remove_worktree", { id, targetPath, force: !!force }),

  // --- Show Git Output -----------------------------------------------------
  gitActionLog: () =>
    hasBackend ? invoke<GitLogEntry[]>("git_action_log") : Promise.resolve([]),

  // --- Pull Requests -------------------------------------------------------
  listPullRequests: (repoIds: string[]) =>
    hasBackend
      ? invoke<PullRequest[]>("list_pull_requests", { repoIds })
      : Promise.resolve(null),
  listRepoPullRequests: (repoId: string) =>
    hasBackend
      ? invoke<PullRequest[]>("list_repo_pull_requests", { repoId })
      : Promise.resolve(null),
  fetchPrThreads: (repoId: string, prId: number) =>
    invoke<PrThread[]>("fetch_pr_threads", { repoId, prId }),
  postPrComment: (
    repoId: string,
    prId: number,
    body: string,
    threadId?: string | null,
    path?: string | null,
    line?: number | null,
  ) =>
    invoke<PrThread[]>("post_pr_comment", {
      repoId,
      prId,
      body,
      threadId: threadId || null,
      path: path || null,
      line: line ?? null,
    }),
  resolvePrThread: (
    repoId: string,
    prId: number,
    threadId: string,
    resolved: boolean,
  ) =>
    invoke<PrThread[]>("resolve_pr_thread", {
      repoId,
      prId,
      threadId,
      resolved: !!resolved,
    }),
  submitPrReview: (
    repoId: string,
    prId: number,
    reviewType: string,
    body?: string,
  ) =>
    invoke<PrThread[]>("submit_pr_review", {
      repoId,
      prId,
      reviewType,
      body: body || "",
    }),
  prMyVote: (repoId: string, prId: number) =>
    hasBackend
      ? invoke<number>("pr_my_vote", { repoId, prId })
      : Promise.resolve(0),
  publishPr: (repoId: string, prId: number) =>
    invoke<void>("publish_pr", { repoId, prId }),
  createPullRequest: (opts: Record<string, unknown>) =>
    invoke<PullRequest>("create_pull_request", opts),

  // --- Accounts ------------------------------------------------------------
  listAccounts: () =>
    hasBackend ? invoke<Account[]>("list_accounts") : Promise.resolve(null),
  addAccount: (opts: Record<string, unknown>) =>
    invoke<Account>("add_account", opts),
  testAccount: (id: string) => invoke<Account>("test_account", { id }),
  removeAccount: (id: string) => invoke<void>("remove_account", { id }),
  gitToken: (host: string) =>
    invoke<{ username?: string; token?: string }>("git_token", { host }),

  // --- Git Identities ------------------------------------------------------
  readGitIdentity: () =>
    hasBackend ? invoke<GitIdentity>("read_git_identity") : Promise.resolve(null),
  saveGitIdentity: (config: GitIdentity) =>
    invoke<GitIdentity>("save_git_identity", { config }),

  // --- App Center ----------------------------------------------------------
  listApps: () =>
    hasBackend ? invoke<ManagedApp[]>("list_apps") : Promise.resolve(null),
  listPresets: () =>
    hasBackend ? invoke<AppPreset[]>("list_presets") : Promise.resolve(null),
  createApp: (app: Record<string, unknown>) =>
    invoke<ManagedApp>("create_app", { app }),
  updateApp: (app: Record<string, unknown>) =>
    invoke<ManagedApp>("update_app", { app }),
  setAppTags: (id: number, tags: string[]) =>
    invoke<void>("set_app_tags", { id, tags }),
  deleteApp: (id: number) => invoke<void>("delete_app", { id }),
  reorderApps: (ids: number[]) => invoke<void>("reorder_apps", { ids }),
  startApp: (id: number) => invoke<void>("start_app", { id }),
  stopApp: (id: number) => invoke<void>("stop_app", { id }),
  restartApp: (id: number) => invoke<void>("restart_app", { id }),
  startAll: () => invoke<void>("start_all_apps"),
  stopAll: () => invoke<void>("stop_all_apps"),
  appLogs: (id: number) => invoke<AppLogEvent[]>("app_logs", { id }),
};

export type Ipc = typeof ipc;
