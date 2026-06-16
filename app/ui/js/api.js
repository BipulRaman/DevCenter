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
    openPath: (path) => (hasBackend ? invoke("open_path", { path }) : Promise.resolve()),
    openUrl: (url) => (hasBackend ? invoke("open_url", { url }) : Promise.resolve()),
    openTerminal: (path) => (hasBackend ? invoke("open_terminal", { path }) : Promise.resolve()),

    // --- Git Board (Phase 1) ---
    listRepos: () => (hasBackend ? invoke("list_repos") : Promise.resolve(null)),
    scanRepos: (roots) => invoke("scan_repos", { roots }),
    fetchRepo: (id) => invoke("git_fetch", { id }),
    cloneRepo: (url, dir) => invoke("git_clone", { url, dir }),
    addRepo: (path) => invoke("add_repo", { path }),
    listBranches: (id) => invoke("list_branches", { id }),
    checkoutBranch: (id, branch) => invoke("git_checkout", { id, branch }),
    setWatched: (id, watched) => invoke("set_repo_watched", { id, watched }),
    removeRepo: (id) => invoke("remove_repo", { id }),
    setRepoTags: (id, tags) => invoke("set_repo_tags", { id, tags }),
    listTags: () => (hasBackend ? invoke("list_tags") : Promise.resolve(null)),

    // --- Changes / commit (GitHub Desktop–style) ---
    gitChanges: (id, sha) => invoke("git_changes", { id, sha: sha || null }),
    gitDiff: (id, path, sha) => invoke("git_diff", { id, path, sha: sha || null }),
    gitCommit: (id, summary, description, files) =>
      invoke("git_commit", { id, summary, description, files }),
    gitPush: (id) => invoke("git_push", { id }),
    gitPull: (id) => invoke("git_pull", { id }),
    gitLog: (id, limit) => invoke("git_log", { id, limit: limit ?? null }),

    // --- Pull Requests (Phase 3) ---
    listPullRequests: (repoIds) =>
      hasBackend ? invoke("list_pull_requests", { repoIds }) : Promise.resolve(null),

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
