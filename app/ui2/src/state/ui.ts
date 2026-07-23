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

export const activePage = signal<PageId>("git-board");

export function showPage(page: PageId): void {
  activePage.value = page;
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
