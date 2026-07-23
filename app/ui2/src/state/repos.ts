// Git Board data — repos signal + load/refresh wiring + small derived helpers.
// Ported from the repo parts of app/ui/js/core.js, backend.js and git-board.js.

import { signal } from "@preact/signals";
import { ipc } from "@/platform/ipc";
import { events } from "@/platform/events";
import type { Repo } from "@/types/models";

/** The live repo list. Reassigned wholesale so signal subscribers re-render. */
export const repos = signal<Repo[]>([]);
/** True once the first backend hydration has completed. */
export const reposLoaded = signal(false);

/** Editor availability, resolved once at startup (drives kebab menu entries). */
export const hasVscode = signal(false);
export const hasVscodeInsiders = signal(false);

let started = false;

/** Load repos from the backend and subscribe to live `repos_updated` events. */
export async function initRepos(): Promise<void> {
  if (started) return;
  started = true;

  events.onReposUpdated((list) => {
    if (Array.isArray(list)) {
      repos.value = list;
      reposLoaded.value = true;
    }
  });

  ipc.vscodeAvailable().then((v) => (hasVscode.value = !!v)).catch(() => {});
  ipc
    .vscodeInsidersAvailable()
    .then((v) => (hasVscodeInsiders.value = !!v))
    .catch(() => {});

  await refreshRepos();
}

export async function refreshRepos(): Promise<void> {
  try {
    const list = await ipc.listRepos();
    if (Array.isArray(list)) repos.value = list;
  } catch (e) {
    console.error("listRepos failed", e);
  } finally {
    reposLoaded.value = true;
  }
}

/** Replace a single repo in the list by id (immutably). */
export function upsertRepo(updated: Repo): void {
  const at = repos.value.findIndex((r) => r.id === updated.id);
  if (at >= 0) {
    const next = repos.value.slice();
    next[at] = updated;
    repos.value = next;
  } else {
    repos.value = [...repos.value, updated];
  }
}

export function removeRepoLocal(id: string): void {
  repos.value = repos.value.filter((r) => r.id !== id);
}

export interface RepoAccount {
  key: string;
  label: string;
  provider: "github" | "azure" | "other";
}

/** Derive the "account" (GitHub owner / Azure org / host) a repo belongs to. */
export function repoAccount(r: Repo): RepoAccount | null {
  const segs = (r.remote || "").split("/").filter(Boolean);
  if (r.provider === "github") {
    const owner = segs[1] || "";
    return owner
      ? { key: "github:" + owner.toLowerCase(), label: owner, provider: "github" }
      : null;
  }
  if (r.provider === "azure") {
    const host = segs[0] || "";
    const org = host.includes(".visualstudio.com")
      ? host.replace(".visualstudio.com", "")
      : segs[1] || "";
    return org ? { key: "azure:" + org.toLowerCase(), label: org, provider: "azure" } : null;
  }
  const host = segs[0] || "";
  return host ? { key: "other:" + host.toLowerCase(), label: host, provider: "other" } : null;
}

/** Turn a cleaned remote (`host/path`) into a browsable web URL. */
export function repoWebUrl(remote: string): string | null {
  const s = (remote || "").trim();
  if (!s) return null;
  const az = s.match(/^ssh\.dev\.azure\.com\/v3\/([^/]+)\/([^/]+)\/([^/]+)\/?$/i);
  if (az) return `https://dev.azure.com/${az[1]}/${az[2]}/_git/${az[3]}`;
  return "https://" + s.replace(/^\/+/, "");
}

/** Pick a sensible default branch from a list (main/master first). */
export function defaultBranchFrom(branches: string[]): string | null {
  if (!branches.length) return null;
  return (
    branches.find((b) => b === "main") ||
    branches.find((b) => b === "master") ||
    branches[0]
  );
}
