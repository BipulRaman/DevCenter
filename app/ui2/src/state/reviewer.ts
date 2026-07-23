// PR Reviewer state — full-screen review overlay opened from the Pull Requests
// list. Ported from app/ui/js/pr-reviewer.js. Holds the PR being reviewed, its
// base...head file diff, inline + general comment threads, and the signed-in
// user's vote.

import { signal } from "@preact/signals";
import { ipc } from "@/platform/ipc";
import { repos } from "@/state/repos";
import { patchPull } from "@/state/pulls";
import type { FileChange, FileDiff, PrThread, PullRequest } from "@/types/models";

export type ReviewerTab = "files" | "conversation";

export const reviewerOpen = signal(false);
export const reviewerPr = signal<PullRequest | null>(null);
export const reviewerRepoId = signal<string | null>(null);
export const reviewerProvider = signal<"github" | "azure" | "other">("github");
export const myVote = signal(0);
export const reviewerFiles = signal<FileChange[]>([]);
export const reviewerLoadError = signal<string | null>(null);
export const reviewerThreads = signal<PrThread[]>([]);
export const reviewerActiveFile = signal<string | null>(null);
export const reviewerTab = signal<ReviewerTab>("files");
export const reviewerWholeFile = signal(false);
export const reviewerDiff = signal<FileDiff | null>(null);
export const reviewerDiffLoading = signal(false);
export const reviewerBusy = signal(false);
let returnPage = "pull-requests";
let gen = 0;

export function threadsFor(path: string): PrThread[] {
  return reviewerThreads.value.filter((t) => t.path === path);
}
export function generalThreads(): PrThread[] {
  return reviewerThreads.value.filter((t) => t.path == null);
}

export async function openReviewer(repoId: string, pr: PullRequest, opts?: { returnTo?: string }): Promise<void> {
  const g = ++gen;
  reviewerRepoId.value = repoId;
  reviewerPr.value = pr;
  returnPage = opts?.returnTo || "pull-requests";
  reviewerProvider.value = repos.value.find((r) => r.id === repoId)?.provider || "github";
  myVote.value = 0;
  reviewerFiles.value = [];
  reviewerLoadError.value = null;
  reviewerThreads.value = [];
  reviewerActiveFile.value = null;
  reviewerTab.value = "files";
  reviewerWholeFile.value = false;
  reviewerDiff.value = null;
  reviewerBusy.value = false;
  reviewerOpen.value = true;

  ipc
    .prMyVote(repoId, pr.id)
    .then((v) => {
      if (g === gen) myVote.value = v || 0;
    })
    .catch(() => {});

  await Promise.all([loadFiles(g, repoId, pr), loadThreads(g, repoId, pr)]);
  if (g !== gen) return;
  if (reviewerFiles.value.length) void selectFile(reviewerFiles.value[0].path);
}

export function closeReviewer(): string {
  reviewerOpen.value = false;
  return returnPage;
}

async function loadFiles(g: number, repoId: string, pr: PullRequest): Promise<void> {
  reviewerLoadError.value = null;
  try {
    const cs = await ipc.prChanges(repoId, pr.base, pr.branch);
    if (g !== gen) return;
    reviewerFiles.value = cs.files || [];
  } catch (e) {
    if (g !== gen) return;
    const msg = String((e as Error)?.message || e || "");
    if (/not found locally|Fetch the repository/i.test(msg)) {
      try {
        await ipc.fetchRepo(repoId);
        if (g !== gen) return;
        const cs = await ipc.prChanges(repoId, pr.base, pr.branch);
        if (g !== gen) return;
        reviewerFiles.value = cs.files || [];
        return;
      } catch (e2) {
        if (g !== gen) return;
        reviewerFiles.value = [];
        reviewerLoadError.value = String((e2 as Error)?.message || e2 || "") || "Couldn't load this pull request's changes.";
        return;
      }
    }
    reviewerFiles.value = [];
    reviewerLoadError.value = msg || "Couldn't load this pull request's changes.";
  }
}

async function loadThreads(g: number, repoId: string, pr: PullRequest): Promise<void> {
  try {
    const data = await ipc.fetchPrThreads(repoId, pr.id);
    if (g !== gen) return;
    reviewerThreads.value = data;
  } catch (e) {
    if (g !== gen) return;
    console.error("fetchPrThreads failed", e);
    reviewerThreads.value = [];
  }
}

export async function selectFile(path: string): Promise<void> {
  const repoId = reviewerRepoId.value;
  const pr = reviewerPr.value;
  if (!repoId || !pr) return;
  reviewerActiveFile.value = path;
  reviewerTab.value = "files";
  reviewerDiffLoading.value = true;
  const g = gen;
  try {
    const d = await ipc.prFileDiff(repoId, pr.base, pr.branch, path, reviewerWholeFile.value ? 100000 : null);
    if (g !== gen || reviewerActiveFile.value !== path) return;
    reviewerDiff.value = d;
  } catch (e) {
    if (g !== gen || reviewerActiveFile.value !== path) return;
    reviewerDiff.value = null;
    reviewerLoadError.value = String(e);
  } finally {
    if (g === gen) reviewerDiffLoading.value = false;
  }
}

export function toggleWholeFile(): void {
  reviewerWholeFile.value = !reviewerWholeFile.value;
  if (reviewerActiveFile.value) void selectFile(reviewerActiveFile.value);
}

export async function postComment(opts: { body: string; threadId?: string; path?: string; line?: number }): Promise<void> {
  const repoId = reviewerRepoId.value;
  const pr = reviewerPr.value;
  if (!repoId || !pr || reviewerBusy.value) return;
  const g = gen;
  reviewerBusy.value = true;
  try {
    const data = await ipc.postPrComment(repoId, pr.id, opts.body, opts.threadId || null, opts.path || null, opts.line ?? null);
    if (g !== gen) return;
    reviewerThreads.value = data;
  } catch (e) {
    console.error("postPrComment failed", e);
    throw e;
  } finally {
    if (g === gen) reviewerBusy.value = false;
  }
}

export async function resolveThread(threadId: string, resolved: boolean): Promise<void> {
  const repoId = reviewerRepoId.value;
  const pr = reviewerPr.value;
  if (!repoId || !pr || reviewerBusy.value) return;
  const g = gen;
  reviewerBusy.value = true;
  try {
    const data = await ipc.resolvePrThread(repoId, pr.id, threadId, resolved);
    if (g !== gen) return;
    reviewerThreads.value = data;
  } catch (e) {
    console.error("resolvePrThread failed", e);
    throw e;
  } finally {
    if (g === gen) reviewerBusy.value = false;
  }
}

export async function publishDraft(): Promise<void> {
  const repoId = reviewerRepoId.value;
  const pr = reviewerPr.value;
  if (!repoId || !pr || reviewerBusy.value) return;
  const g = gen;
  reviewerBusy.value = true;
  try {
    await ipc.publishPr(repoId, pr.id);
    if (g !== gen) return;
    reviewerPr.value = { ...pr, status: "open" };
    patchPull(repoId, pr.id, { status: "open" });
  } finally {
    if (g === gen) reviewerBusy.value = false;
  }
}

export async function submitReview(type: string, body: string): Promise<void> {
  const repoId = reviewerRepoId.value;
  const pr = reviewerPr.value;
  if (!repoId || !pr || reviewerBusy.value) return;
  const g = gen;
  reviewerBusy.value = true;
  try {
    const data = await ipc.submitPrReview(repoId, pr.id, type, body);
    if (g !== gen) return;
    reviewerThreads.value = data;
    try {
      const v = await ipc.prMyVote(repoId, pr.id);
      if (g === gen) {
        myVote.value = v || 0;
        patchPull(repoId, pr.id, { reviews: v >= 5 ? "approved" : v <= -5 ? "changes" : "pending", approvedByMe: v >= 5 });
      }
    } catch {
      /* ignore */
    }
  } finally {
    if (g === gen) reviewerBusy.value = false;
  }
}
