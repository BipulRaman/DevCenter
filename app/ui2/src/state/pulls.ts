// Pull Requests data — the shared PR cache (PrStore equivalent) plus hydration
// wiring. Ported from app/ui/js/store.js (PrStore) and backend.js (hydratePulls).

import { signal } from "@preact/signals";
import { ipc } from "@/platform/ipc";
import { events } from "@/platform/events";
import { repos } from "@/state/repos";
import type { PullRequest } from "@/types/models";

export const pulls = signal<PullRequest[]>([]);
export const pullsLoading = signal(false);

let started = false;
let loadGen = 0;

export function watchedRepoNames(): string[] {
  return repos.value.filter((r) => r.watched).map((r) => r.name);
}

export async function initPulls(): Promise<void> {
  if (started) return;
  started = true;
  events.onPullsUpdated(() => void hydratePulls());
  await hydratePulls();
}

export async function hydratePulls(): Promise<void> {
  if (!ipc.hasBackend) return;
  const gen = ++loadGen;
  if (!watchedRepoNames().length) {
    pulls.value = [];
    return;
  }
  pullsLoading.value = true;
  try {
    const data = await ipc.listPullRequests(null as unknown as string[]);
    if (gen !== loadGen) return;
    if (Array.isArray(data)) pulls.value = data;
  } catch (e) {
    if (gen !== loadGen) return;
    console.error("listPullRequests failed", e);
  } finally {
    if (gen === loadGen) pullsLoading.value = false;
  }
}

/** Patch a single PR in the cache (optimistic updates from the reviewer). */
export function patchPull(repoId: string, id: number, partial: Partial<PullRequest>): void {
  const at = pulls.value.findIndex((p) => p.repoId === repoId && p.id === id);
  if (at < 0) return;
  const next = pulls.value.slice();
  next[at] = { ...next[at], ...partial };
  pulls.value = next;
}

export function findPull(repoId: string, id: number): PullRequest | undefined {
  return pulls.value.find((p) => p.repoId === repoId && p.id === id);
}
