// Shared diff viewer chrome — the file header (path, ± counts, optional file
// nav, whole-file toggle) plus the loading/empty states. The body itself is
// passed as `children` so each page keeps its own renderer: Changes builds an
// HTML string (fast, innerHTML) and PR Reviewer builds JSX rows with inline
// comment threads. Both import the shared DiffView.module.css so the body
// classes (diffBody/diffLine/diffGutter/…) resolve to the same hashed names.

import type { ComponentChildren } from "preact";
import { Raw, ICONS } from "@/lib/ico";
import type { FileDiff } from "@/types/models";
import s from "./DiffView.module.css";

export { s as diffStyles };

interface DiffViewProps {
  diff: FileDiff | null;
  loading?: boolean;
  /** Content shown in the empty state (no file selected / load error). */
  empty?: ComponentChildren;
  /** Optional header extras, inserted after the path (e.g. Changes' file nav). */
  nav?: ComponentChildren;
  wholeFile: boolean;
  onToggleWholeFile: () => void;
  /** Extra class on the outer wrapper for page-specific layout overrides. */
  viewClass?: string;
  /** The diff body (image / binary message / rendered hunks). */
  children?: ComponentChildren;
}

export function DiffView({ diff, loading, empty, nav, wholeFile, onToggleWholeFile, viewClass, children }: DiffViewProps) {
  const wrap = viewClass ? `${s.diffView} ${viewClass}` : s.diffView;
  if (loading) {
    return (
      <div class={wrap}>
        <div class={s.diffEmpty}>Loading diff…</div>
      </div>
    );
  }
  if (!diff) {
    return (
      <div class={wrap}>
        <div class={s.diffEmpty}>{empty}</div>
      </div>
    );
  }
  return (
    <div class={wrap}>
      <div class={s.diffContent}>
        <div class={s.diffHead}>
          <span class={s.diffPath} title={diff.path}>
            {diff.path}
          </span>
          {nav}
          <span class={s.diffAdds}>+{diff.additions}</span>
          <span class={s.diffDels}>-{diff.deletions}</span>
          <button
            class={`${s.diffExpandBtn}${wholeFile ? ` ${s.active}` : ""}`}
            type="button"
            title={wholeFile ? "Show only changed lines" : "Show the whole file"}
            onClick={onToggleWholeFile}
          >
            <Raw html={wholeFile ? ICONS.foldV : ICONS.unfoldV} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
