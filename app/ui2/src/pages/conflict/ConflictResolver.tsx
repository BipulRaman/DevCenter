// Merge-conflict resolver — full-screen overlay. Ported from
// app/ui/js/conflict.js. Shown when conflictOpen; lists conflicted files and
// lets the user pick current/incoming/both per hunk, then Complete or Abort.

import { useEffect, useState } from "preact/hooks";
import { ipc } from "@/platform/ipc";
import { repos } from "@/state/repos";
import {
  conflictOpen,
  conflictRepoId,
  conflictInfo,
  conflictActiveFile,
  resolveConflictFile,
  completeConflict,
  abortConflict,
  closeConflict,
  parseConflicts,
  buildContent,
  type ConflictSegment,
} from "@/state/conflict";
import { escapeHtml } from "@/lib/helpers";
import { modal } from "@/components/modal";
import { ICONS, Raw } from "@/lib/ico";
import styles from "./ConflictResolver.module.css";

export function ConflictResolver() {
  if (!conflictOpen.value) return null;
  const info = conflictInfo.value;
  const repoId = conflictRepoId.value;
  const repo = repos.value.find((r) => r.id === repoId);
  const name = repo ? repo.name : "";
  const verb =
    ({ rebase: "Rebasing", "cherry-pick": "Cherry-picking", revert: "Reverting" } as Record<string, string>)[info.kind] || "Merging";

  const doneDisabled = !(info.kind !== "none" && info.files.length === 0);

  const onAbort = async () => {
    const kind = info.kind === "none" ? "merge" : info.kind;
    const ok = await modal.confirm({
      title: `Abort ${kind}?`,
      message: "This discards the in-progress operation and restores your branch to its previous state.",
      confirmText: "Abort",
      danger: true,
    });
    if (!ok) return;
    try {
      await abortConflict();
    } catch (e) {
      await modal.alert({ title: "Couldn't abort", message: String(e) });
    }
  };

  const onComplete = async () => {
    try {
      await completeConflict();
    } catch (e) {
      await modal.alert({ title: "Couldn't complete", message: String(e) });
    }
  };

  return (
    <section class="page active" id="page-conflicts">
      <header class="page-head">
        <div class={styles.conflictHeadMain}>
          <button class="btn btn-icon btn-sm" type="button" title="Back to Changes" onClick={closeConflict}>
            <Raw html={ICONS.arrowLeft} />
          </button>
          <div>
            <h1>Resolve conflicts</h1>
            <p class="page-desc">
              {info.files.length === 0 ? (
                name ? `No conflicts in ${name}.` : "No conflicts."
              ) : (
                <>
                  {name} · {verb} <b>{info.theirs}</b> into <b>{info.ours}</b> · {info.files.length} file
                  {info.files.length === 1 ? "" : "s"} left
                </>
              )}
            </p>
          </div>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost btn-sm" type="button" disabled={info.kind === "none"} onClick={onAbort}>
            Abort
          </button>
          <button class="btn btn-primary btn-sm" type="button" disabled={doneDisabled} onClick={onComplete}>
            Complete
          </button>
        </div>
      </header>
      <div class={styles.conflictLayout}>
        <aside class={styles.conflictFiles}>
          {info.files.length === 0 ? (
            <div class={styles.conflictEmpty}>
              All conflicts resolved.
            </div>
          ) : (
            info.files.map((f) => {
              const slash = f.lastIndexOf("/");
              const fname = slash >= 0 ? f.slice(slash + 1) : f;
              const dir = slash >= 0 ? f.slice(0, slash + 1) : "";
              return (
                <div
                  class={`${styles.fileRow}${f === conflictActiveFile.value ? ` ${styles.active}` : ""}`}
                  key={f}
                  onClick={() => (conflictActiveFile.value = f)}
                >
                  <span class={styles.fileIcon} dangerouslySetInnerHTML={{ __html: ICONS.warn }} />
                  <span class={styles.fileName} title={f}>
                    {dir ? <span class={styles.fileDir}>{dir}</span> : null}
                    {fname}
                  </span>
                  <span class={styles.fileBadge}>C</span>
                </div>
              );
            })
          )}
        </aside>
        <section class={styles.conflictMain}>
          {conflictActiveFile.value ? (
            <ConflictFile key={conflictActiveFile.value} path={conflictActiveFile.value} />
          ) : (
            <div class={styles.conflictEmpty}>
              All conflicts resolved. Click <b>Complete</b> to finish.
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function ConflictFile({ path }: { path: string }) {
  const [segments, setSegments] = useState<ConflictSegment[] | null>(null);
  const [binary, setBinary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = conflictInfo.value;

  useEffect(() => {
    let alive = true;
    setSegments(null);
    setBinary(false);
    setError(null);
    const repoId = conflictRepoId.value;
    if (!repoId) return;
    ipc
      .gitConflictFile(repoId, path)
      .then((cf) => {
        if (!alive) return;
        if (cf.binary) setBinary(true);
        else setSegments(parseConflicts(cf.merged));
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [path]);

  const pick = (idx: number, choice: "ours" | "theirs" | "both" | null) => {
    setSegments((prev) => {
      if (!prev) return prev;
      const next = prev.slice();
      const s = next[idx];
      if (s.type === "conflict") next[idx] = { ...s, choice };
      return next;
    });
  };

  const resolveSide = async (side: "ours" | "theirs") => {
    try {
      await resolveConflictFile(path, side, null);
    } catch (e) {
      await modal.alert({ title: "Couldn't resolve", message: String(e) });
    }
  };

  const save = async () => {
    if (!segments) return;
    try {
      await resolveConflictFile(path, null, buildContent(segments));
    } catch (e) {
      await modal.alert({ title: "Couldn't save resolution", message: String(e) });
    }
  };

  if (error) return <div class={styles.conflictEmpty}>{error}</div>;
  if (binary) {
    return (
      <>
        <div class={styles.bar}>
          <span class={styles.path}>{path}</span>
          <div class={styles.actions}>
            <button class="btn btn-ghost btn-sm" type="button" onClick={() => resolveSide("ours")}>
              Keep current
            </button>
            <button class="btn btn-ghost btn-sm" type="button" onClick={() => resolveSide("theirs")}>
              Take incoming
            </button>
          </div>
        </div>
        <div class={styles.binary}>Binary file — choose which version to keep.</div>
      </>
    );
  }
  if (!segments) return <div class={styles.conflictEmpty}>Loading…</div>;

  const conflicts = segments.filter((s) => s.type === "conflict") as Extract<ConflictSegment, { type: "conflict" }>[];
  const remaining = conflicts.filter((s) => !s.choice).length;

  return (
    <>
      <div class={styles.bar}>
        <span class={styles.path} title={path}>
          {path}
        </span>
        <span class={styles.count}>
          {conflicts.length - remaining}/{conflicts.length} resolved
        </span>
        <div class={styles.actions}>
          <button class="btn btn-ghost btn-sm" type="button" onClick={() => resolveSide("ours")}>
            Take current
          </button>
          <button class="btn btn-ghost btn-sm" type="button" onClick={() => resolveSide("theirs")}>
            Take incoming
          </button>
          <button
            class="btn btn-ghost btn-sm"
            type="button"
            title="Open in VS Code"
            onClick={() => ipc.openInVscode(`${conflictRepoId.value}/${path}`).catch(() => ipc.openInVscode(conflictRepoId.value!).catch(() => {}))}
          >
            VS Code
          </button>
          <button class="btn btn-primary btn-sm" type="button" disabled={remaining > 0} onClick={save}>
            Mark resolved
          </button>
        </div>
      </div>
      <div class={styles.code}>
        {segments.map((s, idx) =>
          s.type === "context" ? (
            <div key={idx}>
              <CodeLines lines={s.lines} path={path} />
            </div>
          ) : (
            <ConflictBlock key={idx} seg={s} idx={idx} ours={info.ours} theirs={info.theirs} path={path} onPick={pick} />
          ),
        )}
      </div>
    </>
  );
}

function hlConflict(line: string, path: string): string {
  const H = window.Highlighter;
  return H && H.line ? H.line(line, H.langForPath(path)) : escapeHtml(line);
}

function CodeLines({ lines, path }: { lines: string[]; path: string }) {
  const html = lines.map((l) => `<div class="${styles.line}">${l === "" ? "&nbsp;" : hlConflict(l, path)}</div>`).join("");
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function ConflictBlock({
  seg,
  idx,
  ours,
  theirs,
  path,
  onPick,
}: {
  seg: Extract<ConflictSegment, { type: "conflict" }>;
  idx: number;
  ours: string;
  theirs: string;
  path: string;
  onPick: (idx: number, choice: "ours" | "theirs" | "both" | null) => void;
}) {
  if (seg.choice) {
    const chosen = seg.choice === "ours" ? seg.ours : seg.choice === "theirs" ? seg.theirs : seg.ours.concat(seg.theirs);
    const label = seg.choice === "ours" ? "Current change" : seg.choice === "theirs" ? "Incoming change" : "Both changes";
    return (
      <div class={styles.block}>
        <div class={`${styles.sideLabel} ${styles.resolved}`}>
          <span>✓ {label}</span>
          <span class={styles.sideActions}>
            <span class={styles.undo} onClick={() => onPick(idx, null)}>
              Undo
            </span>
          </span>
        </div>
        <div class={styles.sideLines}>
          <CodeLines lines={chosen} path={path} />
        </div>
      </div>
    );
  }
  return (
    <div class={styles.block}>
      <div class={`${styles.sideLabel} ${styles.ours}`}>
        <span>Current change · {ours}</span>
        <span class={styles.sideActions}>
          <button class={`${styles.mini} ${styles.ours}`} type="button" onClick={() => onPick(idx, "ours")}>
            Accept current
          </button>
          <button class={styles.mini} type="button" onClick={() => onPick(idx, "both")}>
            Accept both
          </button>
        </span>
      </div>
      <div class={`${styles.sideLines} ${styles.ours}`}>
        <CodeLines lines={seg.ours} path={path} />
      </div>
      <div class={styles.separator} />
      <div class={`${styles.sideLabel} ${styles.theirs}`}>
        <span>Incoming change · {theirs}</span>
        <span class={styles.sideActions}>
          <button class={`${styles.mini} ${styles.theirs}`} type="button" onClick={() => onPick(idx, "theirs")}>
            Accept incoming
          </button>
        </span>
      </div>
      <div class={`${styles.sideLines} ${styles.theirs}`}>
        <CodeLines lines={seg.theirs} path={path} />
      </div>
    </div>
  );
}
