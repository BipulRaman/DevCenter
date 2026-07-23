// Merge-conflict resolver state — full-screen overlay page opened from the
// Changes conflict banner. Ported from app/ui/js/conflict.js.

import { signal } from "@preact/signals";
import { ipc } from "@/platform/ipc";
import { openRepoById } from "@/state/changes";
import type { ConflictInfo } from "@/types/models";

export const conflictOpen = signal(false);
export const conflictRepoId = signal<string | null>(null);
export const conflictInfo = signal<ConflictInfo>({ kind: "none", ours: "", theirs: "", files: [] });
export const conflictActiveFile = signal<string | null>(null);

export async function openConflict(repoId: string): Promise<void> {
  conflictRepoId.value = repoId;
  conflictActiveFile.value = null;
  conflictOpen.value = true;
  await refreshConflict();
  if (conflictInfo.value.files.length) conflictActiveFile.value = conflictInfo.value.files[0];
}

export async function refreshConflict(): Promise<void> {
  const repoId = conflictRepoId.value;
  if (!repoId) return;
  try {
    conflictInfo.value = await ipc.gitConflicts(repoId);
  } catch (e) {
    console.error("gitConflicts failed", e);
    conflictInfo.value = { kind: "none", ours: "", theirs: "", files: [] };
  }
}

/** Resolve a whole file by taking one side (or via edited content). Updates info. */
export async function resolveConflictFile(path: string, side: string | null, content: string | null): Promise<void> {
  const repoId = conflictRepoId.value;
  if (!repoId) return;
  await ipc.resolveConflict(repoId, path, side, content);
  await refreshConflict();
  // Advance to the next unresolved file.
  conflictActiveFile.value = conflictInfo.value.files[0] || null;
}

export async function completeConflict(): Promise<void> {
  const repoId = conflictRepoId.value;
  if (!repoId) return;
  await ipc.conflictContinue(repoId);
  finishBack(repoId);
}

export async function abortConflict(): Promise<void> {
  const repoId = conflictRepoId.value;
  if (!repoId) return;
  await ipc.conflictAbort(repoId);
  finishBack(repoId);
}

export function closeConflict(): void {
  conflictOpen.value = false;
}

function finishBack(repoId: string): void {
  conflictOpen.value = false;
  openRepoById(repoId);
}

// --- Conflict marker parsing ------------------------------------------------

export type ConflictSegment =
  | { type: "context"; lines: string[] }
  | { type: "conflict"; ours: string[]; theirs: string[]; choice: "ours" | "theirs" | "both" | null };

export function parseConflicts(text: string): ConflictSegment[] {
  const lines = text.split("\n");
  const segs: ConflictSegment[] = [];
  let ctx: string[] = [];
  let i = 0;
  const flush = () => {
    if (ctx.length) {
      segs.push({ type: "context", lines: ctx });
      ctx = [];
    }
  };
  while (i < lines.length) {
    if (lines[i].startsWith("<<<<<<<")) {
      flush();
      const ours: string[] = [];
      const theirs: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("|||||||") && !lines[i].startsWith("=======")) ours.push(lines[i++]);
      if (i < lines.length && lines[i].startsWith("|||||||")) {
        i++;
        while (i < lines.length && !lines[i].startsWith("=======")) i++;
      }
      if (i < lines.length && lines[i].startsWith("=======")) i++;
      while (i < lines.length && !lines[i].startsWith(">>>>>>>")) theirs.push(lines[i++]);
      if (i < lines.length && lines[i].startsWith(">>>>>>>")) i++;
      segs.push({ type: "conflict", ours, theirs, choice: null });
    } else {
      ctx.push(lines[i++]);
    }
  }
  flush();
  return segs;
}

export function buildContent(segments: ConflictSegment[]): string {
  const out: string[] = [];
  for (const s of segments) {
    if (s.type === "context") out.push(...s.lines);
    else if (s.choice === "ours") out.push(...s.ours);
    else if (s.choice === "theirs") out.push(...s.theirs);
    else if (s.choice === "both") out.push(...s.ours, ...s.theirs);
  }
  return out.join("\n");
}
