# DevCenter UI2 — Preact + Bun rewrite plan

Status: **planned, not started**

A new frontend for DevGitCenter built with **Preact + TypeScript**, bundled with
**Vite**, using **Bun** as the package manager / script runner. It lives at
`app/ui2/` in parallel to the existing vanilla frontend at `app/ui/`. The current
`app/ui` remains the behavioral reference and stays runnable/unchanged until UI2
reaches feature parity and is accepted.

> Important: UI2 reuses the **existing Rust backend** in `app/src-tauri` as-is.
> This is a *frontend-only* rewrite — not a new Tauri app. The only backend-side
> change at cutover is switching `frontendDist` / dev URL in `tauri.conf.json`.
> (This is distinct from `appnext/`, which is a separate full-app Vue rewrite.)

---

## 1. Goals

- Replace the global-script vanilla UI (`app/ui/js/*.js` sharing one lexical
  scope) with typed, componentized Preact code.
- Keep the exact same visual design and behavior — port `css/styles.css`,
  self-hosted fonts, and Seti icons verbatim first, refactor later.
- Reuse the existing Rust command surface (`window.__TAURI__`) behind a single
  **typed IPC client** that mirrors today's `app/ui/js/api.js`.
- No behavioral regressions: preserve every WebView2-specific workaround and
  filter-persistence detail (see §9).
- Make future features *local component changes* instead of edits to giant
  shared files.
- Run `app/ui` and `app/ui2` side by side during development.

## 2. Non-goals

- Do not modify or incrementally migrate files inside `app/ui/`.
- Do not change Rust backend logic, command names, or payload shapes.
- Do not redesign the UI/UX in this pass — parity first.
- Do not touch auto-update, signing, or publishing.
- Do not introduce a heavy state library; Preact Signals + a thin store is enough.

---

## 3. Technology decisions

| Concern | Decision |
|---|---|
| UI framework | Preact 10 (`preact`, `preact/hooks`) |
| Reactive state | `@preact/signals` (maps cleanly onto today's `DCStore`/`PrStore` pub-sub) |
| Language | Strict TypeScript |
| Bundler / dev server | Vite + `@preact/preset-vite` |
| Package manager / runner | **Bun** (`bun install`, `bun run`) |
| Routing | Tiny hash-based page switch (5 top-level pages) — no router dep needed; optional `preact-iso` if it grows |
| IPC | Thin typed wrapper over `window.__TAURI__` (`core.invoke`, `event.listen`) |
| Icons | Port existing inline SVGs into a typed `icons/` module; keep Seti icon JSON |
| Styling | Port `app/ui/css/styles.css` + `fonts.css` + `fonts/` unchanged initially |
| Unit tests | Vitest + `@testing-library/preact` |
| Browser mock | A mock `window.__TAURI__` gateway so UI2 runs in a plain browser for design work (mirrors the current `hasBackend` fallback) |

### Why Preact (not React)

- Tiny (~3–4 KB) — fits the "lightweight desktop WebView" ethos.
- **Direct DOM event listeners**, not a synthetic global-delegation layer. This
  matters: the repo's biggest WebView2 gotcha (§9) is that root event delegation
  *silently fails* in WebView2. Preact attaches real listeners on real nodes, so
  the current "re-bind on every render" boilerplate becomes unnecessary and safe.
- `@preact/signals` gives fine-grained reactivity that mirrors the existing
  event-bus/store model with far less code.

### Why Bun

- Fast installs and script running. Vite runs fine under Bun.
- No Node requirement for contributors who already have Bun.
- Note: Tauri tooling itself (`cargo tauri`) is unaffected; Bun only drives the
  JS side. Keep a `bun.lockb` committed.

---

## 4. Target layout (`app/ui2/`)

```text
app/ui2/
  plan.md                 # this file
  package.json
  bun.lockb
  tsconfig.json
  vite.config.ts
  index.html              # <div id="app"> + module entry
  splash.html             # port of app/ui/splash.html (static, no framework)
  public/
    css/                  # ported styles.css, fonts.css, fonts/*.woff2
    icons/                # vs-seti-icon-theme.json
  src/
    main.tsx              # mount <App/>, run splash/reveal handshake
    app.tsx               # shell: sidebar nav + page router + settings popover
    platform/
      tauri.ts            # window.__TAURI__ typed access + browser mock
      ipc.ts              # typed command client (mirrors api.js)
      events.ts           # typed event listeners (repos_updated, app_log, …)
      brand.ts            # productName -> window.BRAND replacement
    state/
      repos.ts            # signals + actions (list/scan/fetch/clone/watch/tags)
      pulls.ts            # PR cache (replaces PrStore) + optimistic vote/publish
      apps.ts             # App Center apps + live status/log signals
      accounts.ts
      identities.ts
      ui.ts               # theme, active page, filter-set persistence
    lib/
      icons.tsx           # typed SVG icon components
      seti-icons.ts       # Seti file-icon lookup (port of seti-icons.js)
      file-tree.tsx       # shared file-explorer (Changes + PR reviewer)
      highlight.ts        # syntax highlight (port of highlight.js)
      logfmt.ts           # log formatting (port of logfmt.js)
      helpers.ts          # escapeHtml, debounce, filter-set load/save, etc.
    types/
      models.ts           # TS mirrors of Rust serde models (Repo, PullRequest, App…)
    pages/
      git-board/          # RepoList, RepoCard, Clone/Add dialogs, filters
      changes/            # commit view, history, file diff, stash, conflict banner
      pull-requests/      # PR list + filters
      pr-reviewer/        # PR diff review, threads, approve/request-changes
      app-center/         # app list, run/stop, live logs, presets
      identities/         # gitconfig identity manager
      accounts/           # provider accounts (GitHub / Azure)
    components/
      Dialog.tsx, Multiselect.tsx, Segmented.tsx, Popover.tsx, Toast.tsx, …
```

---

## 5. IPC contract (reuse existing commands)

`src/platform/ipc.ts` re-exposes today's `window.app` surface, but typed. Groups
and commands taken from `app/ui/js/api.js`:

- **App/OS**: `app_version`, `app_name`, `check_for_updates`, `install_update`,
  `open_path`, `open_url`, `write_text_file`, `open_terminal`,
  `vscode_available`, `open_in_vscode`, `vscode_insiders_available`,
  `open_in_vscode_insiders`, `close_splashscreen`.
- **Git Board**: `list_repos`, `scan_repos`, `git_fetch`, `git_clone`,
  `add_repo`, `list_branches`, `git_checkout`, `git_create_branch`,
  `git_rename_branch`, `git_delete_branch`, `set_repo_watched`, `remove_repo`,
  `set_repo_tags`, `list_tags`.
- **Changes/commit**: `git_changes`, `git_diff`, `git_pr_changes`,
  `git_pr_file_diff`, `git_stage`, `git_unstage`, `git_discard`, stash family
  (`git_stash_*`), `git_commit`, `git_undo_commit`, `git_push`, `git_push_to`,
  `git_pull`, `git_pull_from`, `git_fetch_prune`, `git_fetch_all`,
  `git_merge_branch`, `git_rebase_branch`, `git_delete_remote_branch`,
  conflict family (`git_conflicts`, `git_conflict_file`, `git_resolve_conflict`,
  `git_conflict_abort`, `git_conflict_continue`), `git_log`.
- **Remotes / tags / worktrees**: `git_remote_url`, `git_set_remote_url`,
  `git_list_remotes`, `git_add_remote`, `git_remove_remote`, `git_list_tags`,
  `git_create_tag`, `git_delete_tag`, `git_checkout_tag`,
  `git_delete_remote_tag`, `git_push_tags`, `git_list_worktrees`,
  `git_add_worktree`, `git_remove_worktree`, `git_action_log`.
- **Pull Requests**: `list_pull_requests`, `list_repo_pull_requests`,
  `fetch_pr_threads`, `post_pr_comment`, `resolve_pr_thread`, `submit_pr_review`,
  `pr_my_vote`, `publish_pr`, `create_pull_request`.
- **Accounts / identity**: `list_accounts`, `add_account`, `test_account`,
  `remove_account`, `git_token`, `read_git_identity`, `save_git_identity`.
- **App Center**: `list_apps`, `list_presets`, `create_app`, `update_app`,
  `set_app_tags`, `delete_app`, `reorder_apps`, `start_app`, `stop_app`,
  `restart_app`, `start_all_apps`, `stop_all_apps`, `app_logs`.
- **Events (Rust → UI)**: `repos_updated`, `pull_requests_updated`,
  `app_status_changed`, `app_log`, `update_state`.

TypeScript payload types live in `src/types/models.ts`, hand-mirrored from
`app/src-tauri/src/models.rs` (serde `camelCase`). Optional later: generate them
with `tauri-specta` to avoid drift.

---

## 6. Feature parity map (old file → new home)

| Existing (`app/ui/js`) | UI2 target |
|---|---|
| `store.js` (DCStore, PageLifecycle, PrStore) | `state/*` signals + `ui.ts` page lifecycle |
| `core.js` (nav, showPage, theme) | `app.tsx` + `state/ui.ts` |
| `git-board.js`, `tags.js` | `pages/git-board/` |
| `branches.js` | `pages/git-board/` branch UI + shared branch picker |
| `changes.js` (2.2k lines) | `pages/changes/` (split into subcomponents) |
| `file-tree.js` | `lib/file-tree.tsx` (shared by changes + reviewer) |
| `conflict.js` | `pages/changes/Conflict*.tsx` |
| `pull-requests.js` | `pages/pull-requests/` |
| `pr-reviewer.js` | `pages/pr-reviewer/` |
| `app-center.js` | `pages/app-center/` |
| `git-identity.js` | `pages/identities/` |
| `components.js` | `components/` (Dialog, Multiselect, Toast, …) |
| `backend.js` (hydrate + event wiring) | `platform/events.ts` + `state/*` init |
| `helpers.js` | `lib/helpers.ts` |
| `highlight.js`, `logfmt.js` | `lib/highlight.ts`, `lib/logfmt.ts` |
| `seti-icons.js` | `lib/seti-icons.ts` |
| `theme.js` | `state/ui.ts` (early inline theme in `index.html` to avoid flash) |
| `api.js` | `platform/ipc.ts` + `platform/events.ts` |
| `wiring.js` | component-local handlers (no central wiring file) |

---

## 7. Build & dev workflow

1. `cd app/ui2 && bun install`
2. Dev (browser, mock backend): `bun run dev` → Vite dev server on a **new port**
   (e.g. `5175`, distinct from anything `app/ui` uses).
3. Dev (in Tauri): temporarily point Tauri at the Vite dev server. Options:
   - Add a `beforeDevCommand`/`devUrl` variant, or a second `tauri.conf` (e.g.
     `tauri.ui2.conf.json`) used via `cargo tauri dev -c tauri.ui2.conf.json`,
     so `app/ui` dev stays the default.
4. Production build: `bun run build` → `app/ui2/dist/` (static assets).
5. Cutover: set `build.frontendDist` to `../ui2/dist` (and a matching
   `beforeBuildCommand: "bun run build"` with the ui2 cwd) once parity is
   accepted. Keep `withGlobalTauri: true`.

### CSP note

`tauri.conf.json` currently sets `script-src 'self'`. Vite's **production** build
emits hashed static JS that satisfies this. For **in-Tauri dev** against the Vite
server you'll need a dev-only CSP relaxation (or run design work in a normal
browser with the mock gateway). Do not loosen the production CSP.

`style-src 'unsafe-inline'` is already allowed — fine for Preact inline styles.

---

## 8. Phased delivery

**Phase 0 — Scaffold**
- `bun init` + Vite + `@preact/preset-vite` + TS strict config.
- Port `styles.css`, `fonts.css`, `fonts/`, Seti JSON into `public/`.
- App shell: sidebar nav, page container, theme toggle, settings popover.
- `platform/tauri.ts` + browser mock; `platform/ipc.ts` typed client stub.
- Splash/reveal handshake (`close_splashscreen`) + brand hydration.
- `.gitignore`: `app/ui2/node_modules/`, `app/ui2/dist/`.

**Phase 1 — Git Board** (read-only first)
- `list_repos` + `repos_updated` event → repo list/cards.
- Filters (account + tag) with **localStorage persistence** parity (§9).
- Then actions: add/clone/fetch/watch/tags/branches.

**Phase 2 — App Center**
- App list, presets, create/update, run/stop/restart, reorder.
- Live `app_status_changed` + `app_log` streaming into log views.

**Phase 3 — Pull Requests + reviewer**
- PR list + dual filters (watched-repo + account) with persistence.
- PR cache with optimistic vote/publish (replaces `PrStore`), reconciled by
  `pull_requests_updated` + on-show refetch.
- Reviewer: diff, inline threads, approve/request-changes.

**Phase 4 — Changes (largest)**
- Changes list (tree/flat), diff viewer, stage/unstage/discard, stash family,
  commit box, history, conflict resolution banner + resolver.

**Phase 5 — Identities + Accounts + Settings**
- gitconfig identity manager, provider accounts, update check/install, About.

**Phase 6 — Hardening & cutover**
- Vitest coverage on state/lib; WebView2 smoke test on Windows.
- Switch `frontendDist` to `../ui2/dist`; keep `app/ui` until accepted.

---

## 9. Carry-over invariants (do not regress)

From `/memories/repo/ui-notes.md` — these bit us before:

- **WebView2 + event delegation**: root/delegated listeners silently fail in
  WebView2. Preact's per-node listeners avoid this by design — but do **not**
  reintroduce a manual global-delegation pattern.
- **Startup race**: backend manages `AppState` on the builder before windows
  start (Rust side already fixed). UI2 must still tolerate the first `list_repos`
  returning before the background scan finishes (listen for `repos_updated`).
- **Splash race**: splash window is created before main in `tauri.conf.json`;
  reveal logic retries closing a late splash. UI2's `close_splashscreen` call
  timing should mirror `api.js` (fire after first real paint via 2× rAF).
- **Filter persistence**: filter multiselect selections persist in localStorage
  under the existing keys (`dc.repos.accountFilter`, `dc.repos.tagFilter`,
  `dc.changes.accountFilter`, `dc.pr.repoSelected`, `dc.pr.accountFilter`).
  Reuse the same keys so a user's selections survive the migration. Guard the
  "no accounts/tags/watched repos" reset with `if (list.length)` to avoid wiping
  restored selections during the pre-hydration render.
- **Brand single-source**: brand name comes from `app_name` (productName). Read
  it once and set `document.title` + brand surfaces; default to `DevGitCenter`.
- **Self-hosted fonts / no CDN**: keep fonts local; do not add font/style CDNs
  (CSP `font-src 'self'`).
- **PR review chip**: single source for the review chip (approved-by-me vs
  others), shared by PR list, changes PR detail, and reviewer header.

---

## 10. Open questions

- Generate IPC types via `tauri-specta`, or hand-maintain `types/models.ts`?
- Ship UI2 behind a second `tauri.*.conf.json` for parallel dev, or a build-time
  flag? (Prefer a second conf to keep `app/ui` the default.)
- Keep porting `styles.css` wholesale, or split into per-page CSS modules during
  Phase 0? (Recommend wholesale first, split opportunistically.)
