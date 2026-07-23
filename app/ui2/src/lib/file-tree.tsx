// Shared file-tree / list renderer — the Preact port of app/ui/js/file-tree.js.
// Used by the Changes page, PR reviewer and conflict list so every file
// explorer looks and behaves the same (collapsible folders, single-child
// compaction, tree/list toggle, Seti icons, status badges, per-row actions).

import { useState } from "preact/hooks";
import type { JSX } from "preact";
import { Raw } from "@/lib/ico";
import type { FileChange, FileStatus } from "@/types/models";

const FOLDER_ICO =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>';
const TREE_CARET =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

const STAT_LETTER: Record<string, string> = {
  new: "A",
  untracked: "U",
  modified: "M",
  deleted: "D",
  renamed: "R",
  conflicted: "C",
  typechange: "T",
};
export const statBadge = (s: string): string => STAT_LETTER[s] || "M";

/** File icon markup via the Seti icon font (falls back to a folder glyph). */
export function fileIconHtml(name: string): string {
  const seti = window.SetiIcons;
  if (seti) {
    const { char, color } = seti.forFile(name);
    return `<span class="tree-ico seti-ico" style="color:${color}">${char}</span>`;
  }
  return `<span class="tree-ico file-ico">${FOLDER_ICO}</span>`;
}

interface TreeNode {
  name: string;
  path: string;
  dirs: Map<string, TreeNode>;
  files: (FileChange & { name: string })[];
}

function buildTree(list: FileChange[]): TreeNode {
  const root: TreeNode = { name: "", path: "", dirs: new Map(), files: [] };
  for (const f of list) {
    const parts = f.path.split("/");
    const fname = parts.pop()!;
    let node = root;
    let prefix = "";
    for (const part of parts) {
      prefix = prefix ? prefix + "/" + part : part;
      let child = node.dirs.get(part);
      if (!child) {
        child = { name: part, path: prefix, dirs: new Map(), files: [] };
        node.dirs.set(part, child);
      }
      node = child;
    }
    node.files.push({ ...f, name: fname });
  }
  return root;
}

function collectFiles(node: TreeNode): FileChange[] {
  let out: FileChange[] = node.files.slice();
  for (const d of node.dirs.values()) out = out.concat(collectFiles(d));
  return out;
}

/**
 * Flattened file order exactly as the tree/list renders it (folders first —
 * sorted — then files sorted). Used by the diff prev/next navigation so its
 * order matches the on-screen list. Mirrors the render walk() below.
 */
export function fileOrder(files: FileChange[], viewMode: "tree" | "list"): string[] {
  if (viewMode === "list") {
    return files
      .slice()
      .sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()))
      .map((f) => f.path);
  }
  const out: string[] = [];
  const walk = (node: TreeNode) => {
    const dirs = [...node.dirs.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    for (const d of dirs) walk(d);
    node.files
      .slice()
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
      .forEach((f) => out.push(f.path));
  };
  walk(buildTree(files));
  return out;
}

export type FileAction = "stage" | "unstage" | "discard";
export type FileGroup = "staged" | "unstaged" | null;

/** All directory paths in a file list — used to collapse-all a tree. */
export function allDirPaths(files: FileChange[]): string[] {
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.path.split("/");
    parts.pop();
    let prefix = "";
    for (const p of parts) {
      prefix = prefix ? prefix + "/" + p : p;
      dirs.add(prefix);
    }
  }
  return [...dirs];
}

export interface FileTreeProps {
  files: FileChange[];
  viewMode: "tree" | "list";
  activeFile?: string | null;
  group?: FileGroup;
  onSelect: (path: string) => void;
  onAction?: (act: FileAction, path: string) => void;
  onFolderAction?: (act: FileAction, path: string) => void;
  fileBadge?: (path: string) => JSX.Element | null;
  /** Optional controlled collapse state (e.g. commit-detail "collapse all"). */
  collapsed?: Set<string>;
  onToggleCollapse?: (key: string) => void;
}

/** Renders staged/unstaged/PR/commit file rows as a collapsible tree or a flat list. */
export function FileTree(props: FileTreeProps) {
  const [collapsedLocal, setCollapsedLocal] = useState<Set<string>>(new Set());
  const controlled = props.collapsed !== undefined;
  const collapsed = controlled ? props.collapsed! : collapsedLocal;
  const group = props.group ?? null;
  const withActions = group !== null;

  const toggle = (key: string) => {
    if (controlled) {
      props.onToggleCollapse?.(key);
      return;
    }
    setCollapsedLocal((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const rowActions = (scope: "file" | "folder", key: string) => {
    if (!withActions) return null;
    const fire = (act: FileAction, e: MouseEvent) => {
      e.stopPropagation();
      if (scope === "folder") props.onFolderAction?.(act, key);
      else props.onAction?.(act, key);
    };
    return (
      <span class="scm-actions">
        {group === "unstaged" ? (
          <>
            <button class="scm-act" data-act="discard" type="button" title="Discard changes" onClick={(e) => fire("discard", e)}>
              <Raw html={DISCARD_ICO} />
            </button>
            <button class="scm-act" type="button" title="Stage changes" onClick={(e) => fire("stage", e)}>
              <Raw html={STAGE_ICO} />
            </button>
          </>
        ) : (
          <button class="scm-act" type="button" title="Unstage changes" onClick={(e) => fire("unstage", e)}>
            <Raw html={UNSTAGE_ICO} />
          </button>
        )}
      </span>
    );
  };

  const fileRow = (f: FileChange & { name: string }, depth: number, showTwisty: boolean) => {
    const active = props.activeFile === f.path;
    return (
      <div
        class={`tree-row tree-file${active ? " selected" : ""}`}
        style={{ "--d": depth } as JSX.CSSProperties}
        title={f.path}
        key={f.path}
        onClick={() => props.onSelect(f.path)}
      >
        {showTwisty ? <span class="tree-twisty" style={{ visibility: "hidden" }} dangerouslySetInnerHTML={{ __html: TREE_CARET }} /> : null}
        <Raw html={fileIconHtml(f.name)} />
        <span class="tree-name">{f.name}</span>
        {rowActions("file", f.path)}
        {props.fileBadge?.(f.path)}
        <span class={`change-stat ${f.status}`} title={f.status}>
          {statBadge(f.status)}
        </span>
      </div>
    );
  };

  const rows: JSX.Element[] = [];

  if (props.viewMode === "list") {
    props.files
      .slice()
      .sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()))
      .forEach((f) => {
        const i = f.path.lastIndexOf("/");
        const dir = i < 0 ? "" : f.path.slice(0, i + 1);
        const name = i < 0 ? f.path : f.path.slice(i + 1);
        const active = props.activeFile === f.path;
        rows.push(
          <div
            class={`tree-row tree-file${active ? " selected" : ""}`}
            style={{ "--d": 0 } as JSX.CSSProperties}
            title={f.path}
            key={f.path}
            onClick={() => props.onSelect(f.path)}
          >
            <Raw html={fileIconHtml(name)} />
            <span class="tree-name">
              <span class="change-dir">{dir}</span>
              {name}
            </span>
            {rowActions("file", f.path)}
            {props.fileBadge?.(f.path)}
            <span class={`change-stat ${f.status}`} title={f.status}>
              {statBadge(f.status)}
            </span>
          </div>,
        );
      });
  } else {
    const walk = (node: TreeNode, depth: number) => {
      const dirs = [...node.dirs.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      for (const dir of dirs) {
        let label = dir.name;
        let eff = dir;
        while (eff.files.length === 0 && eff.dirs.size === 1) {
          const only = [...eff.dirs.values()][0];
          label += "/" + only.name;
          eff = only;
        }
        const isCollapsed = collapsed.has(eff.path);
        const desc = collectFiles(eff);
        rows.push(
          <div class="tree-row tree-folder" style={{ "--d": depth } as JSX.CSSProperties} key={"d:" + eff.path} onClick={() => toggle(eff.path)}>
            <span class={`tree-twisty ${isCollapsed ? "collapsed" : ""}`} dangerouslySetInnerHTML={{ __html: TREE_CARET }} />
            <span class="tree-ico" dangerouslySetInnerHTML={{ __html: FOLDER_ICO }} />
            <span class="tree-name" title={eff.path}>
              {label}
            </span>
            {rowActions("folder", eff.path)}
            <span class="tree-count">{desc.length}</span>
          </div>,
        );
        if (!isCollapsed) walk(eff, depth + 1);
      }
      node.files
        .slice()
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
        .forEach((f) => rows.push(fileRow(f, depth, true)));
    };
    walk(buildTree(props.files), 0);
  }

  if (!rows.length) return <div class="changes-empty">No files.</div>;
  return <>{rows}</>;
}

const STAGE_ICO =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const UNSTAGE_ICO =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const DISCARD_ICO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path d="M3.00098 2.5C3.00098 2.22386 3.22483 2 3.50098 2C3.77712 2 4.00098 2.22386 4.00098 2.5V6.34262L7.17202 3.17157C8.73412 1.60948 11.2668 1.60948 12.8289 3.17157C14.391 4.73367 14.391 7.26633 12.8289 8.82843L7.80375 13.8536C7.60849 14.0488 7.2919 14.0488 7.09664 13.8536C6.90138 13.6583 6.90138 13.3417 7.09664 13.1464L12.1218 8.12132C13.2933 6.94975 13.2933 5.05025 12.1218 3.87868C10.9502 2.70711 9.0507 2.70711 7.87913 3.87868L4.75781 7H8.50098C8.77712 7 9.00098 7.22386 9.00098 7.5C9.00098 7.77614 8.77712 8 8.50098 8H3.60098C3.26961 8 3.00098 7.73137 3.00098 7.4V2.5Z"/></svg>';

export type { FileStatus };
