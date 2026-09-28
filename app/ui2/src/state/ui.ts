// Cross-route UI state as Preact signals — the UI2 equivalent of the theme +
// navigation parts of app/ui/js/core.js and store.js. Backend-data stores
// (repos, pulls, apps) live in their own files under src/state.

import { signal } from "@preact/signals";

export type PageId =
  | "git-board"
  | "changes"
  | "pull-requests"
  | "app-center"
  | "git-identities"
  | "accounts";

const PAGES: readonly PageId[] = [
  "git-board",
  "changes",
  "pull-requests",
  "app-center",
  "git-identities",
  "accounts",
];

const PAGE_KEY = "dc.ui.page";

function initialPage(): PageId {
  try {
    const saved = localStorage.getItem(PAGE_KEY) as PageId | null;
    if (saved && PAGES.includes(saved)) return saved;
  } catch {
    /* storage disabled */
  }
  return "git-board";
}

export const activePage = signal<PageId>(initialPage());

// --- Page lifecycle -----------------------------------------------------------
// Pages stay mounted, so their data would otherwise go stale while the user is
// elsewhere (or edits files in VS Code / a terminal). Pages register a refresh
// hook that runs whenever they're navigated to ("show") and when the window
// regains focus while they're active ("focus"). Mirrors PageLifecycle in
// app/ui/js/store.js plus the vanilla Changes focus refresh.

export type PageShowReason = "show" | "focus";
type PageShowHook = (reason: PageShowReason) => void;

const showHooks = new Map<PageId, PageShowHook[]>();

/** Register a refresh hook for a page. Returns an unregister function. */
export function onPageShow(page: PageId, fn: PageShowHook): () => void {
  const list = showHooks.get(page) || [];
  list.push(fn);
  showHooks.set(page, list);
  return () => {
    const cur = showHooks.get(page);
    if (cur) showHooks.set(page, cur.filter((f) => f !== fn));
  };
}

export function firePageShow(page: PageId, reason: PageShowReason): void {
  for (const fn of showHooks.get(page) || []) {
    try {
      fn(reason);
    } catch (e) {
      console.error(`onPageShow("${page}") failed`, e);
    }
  }
}

/**
 * Navigate to a page. Fires its show hooks (even when it's already active, so
 * re-clicking a nav item refreshes it) unless `refresh` is false — used by
 * callers that load the page's data themselves right after navigating.
 */
export function showPage(page: PageId, refresh = true): void {
  activePage.value = page;
  try {
    localStorage.setItem(PAGE_KEY, page);
  } catch {
    /* storage disabled */
  }
  if (refresh) firePageShow(page, "show");
}

// --- Theme ------------------------------------------------------------------
// The initial theme is applied pre-paint by the inline script in index.html to
// avoid a flash; this signal mirrors it for reactive UI (toggle label/icon).

export type Theme = "light" | "dark";

function initialTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "dark" ? "dark" : "light";
}

export const theme = signal<Theme>(initialTheme());

export function toggleTheme(): void {
  const next: Theme = theme.value === "dark" ? "light" : "dark";
  theme.value = next;
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("dc.theme", next);
  } catch {
    /* storage disabled */
  }
}
