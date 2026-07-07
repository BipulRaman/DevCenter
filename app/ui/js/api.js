// ============ DevCenter — IPC layer (UI <-> Rust core) ============
// Exposes a single global `window.DevCenter`.
// Inside the Tauri desktop app, calls are routed to the Rust core via `invoke`.
// In a plain browser (no backend), data methods resolve to `null` so the UI
// can fall back to its in-page seed data — keeping the UI runnable for design work.

(function () {
  const T = window.__TAURI__;
  const hasBackend = !!(T && T.core);

  const invoke = (cmd, args) => T.core.invoke(cmd, args);
  const listen = (evt, cb) => T.event.listen(evt, (e) => cb(e.payload));

  window.DevCenter = {
    hasBackend,

    // --- App / OS helpers (implemented in Phase 0) ---
    appVersion: () => (hasBackend ? invoke("app_version") : Promise.resolve("browser")),
    checkForUpdates: () => (hasBackend ? invoke("check_for_updates") : Promise.resolve({ status: "browser" })),
    installUpdate: () => (hasBackend ? invoke("install_update") : Promise.resolve()),
    openPath: (path) => (hasBackend ? invoke("open_path", { path }) : Promise.resolve()),
    openUrl: (url) => (hasBackend ? invoke("open_url", { url }) : Promise.resolve()),
    writeTextFile: (path, contents) => (hasBackend ? invoke("write_text_file", { path, contents }) : Promise.resolve()),
    openTerminal: (path) => (hasBackend ? invoke("open_terminal", { path }) : Promise.resolve()),
    vscodeAvailable: () => (hasBackend ? invoke("vscode_available") : Promise.resolve(false)),
    openInVscode: (path) => (hasBackend ? invoke("open_in_vscode", { path }) : Promise.resolve()),

    // --- Git Board (Phase 1) ---
    listRepos: () => (hasBackend ? invoke("list_repos") : Promise.resolve(null)),
    scanRepos: (roots) => invoke("scan_repos", { roots }),
    fetchRepo: (id) => invoke("git_fetch", { id }),
    cloneRepo: (url, dir) => invoke("git_clone", { url, dir }),
    addRepo: (path) => invoke("add_repo", { path }),
    listBranches: (id) => invoke("list_branches", { id }),
    checkoutBranch: (id, branch, stash) => invoke("git_checkout", { id, branch, stash: !!stash }),
    createBranch: (id, name, base) => invoke("git_create_branch", { id, name, base }),
    renameBranch: (id, name, newName) => invoke("git_rename_branch", { id, name, newName }),
    deleteBranch: (id, name, force) => invoke("git_delete_branch", { id, name, force: !!force }),
    setWatched: (id, watched) => invoke("set_repo_watched", { id, watched }),
    removeRepo: (id) => invoke("remove_repo", { id }),
    setRepoTags: (id, tags) => invoke("set_repo_tags", { id, tags }),
    listTags: () => (hasBackend ? invoke("list_tags") : Promise.resolve(null)),

    // --- Changes / commit (GitHub Desktop–style) ---
    gitChanges: (id, sha) => invoke("git_changes", { id, sha: sha || null }),
    gitDiff: (id, path, sha, staged) =>
      invoke("git_diff", { id, path, sha: sha || null, staged: !!staged }),
    prChanges: (id, base, head) => invoke("git_pr_changes", { id, base, head }),
    prFileDiff: (id, base, head, path) => invoke("git_pr_file_diff", { id, base, head, path }),
    gitStage: (id, files) => invoke("git_stage", { id, files: files || [] }),
    gitUnstage: (id, files) => invoke("git_unstage", { id, files: files || [] }),
    gitDiscard: (id, files) => invoke("git_discard", { id, files: files || [] }),
    gitStashPush: (id, message, includeUntracked) =>
      invoke("git_stash_push", { id, message: message || "", includeUntracked: includeUntracked !== false }),
    gitStashApply: (id, index) => invoke("git_stash_apply", { id, index }),
    gitStashPop: (id, index) => invoke("git_stash_pop", { id, index }),
    gitStashDrop: (id, index) => invoke("git_stash_drop", { id, index }),
    gitStashPushStaged: (id, message) => invoke("git_stash_push_staged", { id, message: message || "" }),
    gitStashClear: (id) => invoke("git_stash_clear", { id }),
    gitStashShow: (id, index) => invoke("git_stash_show", { id, index }),
    gitCommit: (id, summary, description, all, amend, signoff) =>
      invoke("git_commit", { id, summary, description, all: !!all, amend: !!amend, signoff: !!signoff }),
    undoCommit: (id, sha) => invoke("git_undo_commit", { id, sha }),
    gitPush: (id) => invoke("git_push", { id }),
    gitPushTo: (id, remote, branch) => invoke("git_push_to", { id, remote, branch }),
    gitPull: (id, rebase) => invoke("git_pull", { id, rebase: !!rebase }),
    gitPullFrom: (id, remote, branch) => invoke("git_pull_from", { id, remote, branch }),
    gitFetchPrune: (id) => invoke("git_fetch_prune", { id }),
    gitFetchAll: (id) => invoke("git_fetch_all", { id }),
    mergeBranch: (id, branch) => invoke("git_merge_branch", { id, branch }),
    rebaseBranch: (id, onto) => invoke("git_rebase_branch", { id, onto }),
    deleteRemoteBranch: (id, branch) => invoke("git_delete_remote_branch", { id, branch }),
    // --- Merge-conflict resolution ---
    gitConflicts: (id) => invoke("git_conflicts", { id }),
    gitConflictFile: (id, path) => invoke("git_conflict_file", { id, path }),
    resolveConflict: (id, path, side, content) =>
      invoke("git_resolve_conflict", { id, path, side: side || null, content: content ?? null }),
    conflictAbort: (id) => invoke("git_conflict_abort", { id }),
    conflictContinue: (id) => invoke("git_conflict_continue", { id }),
    gitLog: (id, limit) => invoke("git_log", { id, limit: limit ?? null }),

    // --- Remotes ---
    gitRemoteUrl: (id) => invoke("git_remote_url", { id }),
    gitSetRemoteUrl: (id, url) => invoke("git_set_remote_url", { id, url }),
    gitListRemotes: (id) => invoke("git_list_remotes", { id }),
    gitAddRemote: (id, name, url) => invoke("git_add_remote", { id, name, url }),
    gitRemoveRemote: (id, name) => invoke("git_remove_remote", { id, name }),

    // --- Tags ---
    gitListGitTags: (id) => invoke("git_list_tags", { id }),
    gitCreateTag: (id, name, target, message) =>
      invoke("git_create_tag", { id, name, target: target || "", message: message || "" }),
    gitDeleteTag: (id, name) => invoke("git_delete_tag", { id, name }),
    gitCheckoutTag: (id, name) => invoke("git_checkout_tag", { id, name }),
    gitDeleteRemoteTag: (id, name) => invoke("git_delete_remote_tag", { id, name }),
    gitPushTags: (id) => invoke("git_push_tags", { id }),

    // --- Worktrees ---
    gitListWorktrees: (id) => invoke("git_list_worktrees", { id }),
    gitAddWorktree: (id, targetPath, branch, createBranch) =>
      invoke("git_add_worktree", { id, targetPath, branch, createBranch: !!createBranch }),
    gitRemoveWorktree: (id, targetPath, force) =>
      invoke("git_remove_worktree", { id, targetPath, force: !!force }),

    // --- Show Git Output ---
    gitActionLog: () => (hasBackend ? invoke("git_action_log") : Promise.resolve([])),

    // --- Pull Requests (Phase 3) ---
    listPullRequests: (repoIds) =>
      hasBackend ? invoke("list_pull_requests", { repoIds }) : Promise.resolve(null),
    listRepoPullRequests: (repoId) =>
      hasBackend ? invoke("list_repo_pull_requests", { repoId }) : Promise.resolve(null),

    // --- Accounts (Phase 3) ---
    listAccounts: () => (hasBackend ? invoke("list_accounts") : Promise.resolve(null)),
    addAccount: (opts) => invoke("add_account", opts),
    testAccount: (id) => invoke("test_account", { id }),
    removeAccount: (id) => invoke("remove_account", { id }),
    gitToken: (host) => invoke("git_token", { host }),

    // --- App Center (Phase 2) ---
    listApps: () => (hasBackend ? invoke("list_apps") : Promise.resolve(null)),
    listPresets: () => (hasBackend ? invoke("list_presets") : Promise.resolve(null)),
    createApp: (app) => invoke("create_app", { app }),
    updateApp: (app) => invoke("update_app", { app }),
    deleteApp: (id) => invoke("delete_app", { id }),
    reorderApps: (ids) => invoke("reorder_apps", { ids }),
    startApp: (id) => invoke("start_app", { id }),
    stopApp: (id) => invoke("stop_app", { id }),
    restartApp: (id) => invoke("restart_app", { id }),
    startAll: () => invoke("start_all_apps"),
    stopAll: () => invoke("stop_all_apps"),
    appLogs: (id) => invoke("app_logs", { id }),

    // --- Live updates (Rust core -> UI). No-ops in a plain browser. ---
    onReposUpdated: (cb) => (hasBackend ? listen("repos_updated", cb) : Promise.resolve(() => {})),
    onPullsUpdated: (cb) =>
      hasBackend ? listen("pull_requests_updated", cb) : Promise.resolve(() => {}),
    onAppStatus: (cb) => (hasBackend ? listen("app_status_changed", cb) : Promise.resolve(() => {})),
    onAppLog: (cb) => (hasBackend ? listen("app_log", cb) : Promise.resolve(() => {})),
    onUpdateState: (cb) => (hasBackend ? listen("update_state", cb) : Promise.resolve(() => {})),
  };
})();
