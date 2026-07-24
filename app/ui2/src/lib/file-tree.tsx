// Shared file-tree / list renderer — the Preact port of app/ui/js/file-tree.js.
// Used by the Changes page, PR reviewer and conflict list so every file
// explorer looks and behaves the same (collapsible folders, single-child
// compaction, tree/list toggle, Seti icons, status badges, per-row actions).

import { useState } from "preact/hooks";
import type { JSX } from "preact";
import { Raw, ICONS } from "@/lib/ico";
import type { FileChange, FileStatus } from "@/types/models";
import styles from "./file-tree.module.css";

/** Shared file-tree styles — re-exported so consumer pages (Changes, PR reviewer)
 *  use the same hashed class names as the tree rows (was global CSS). */
export { default as treeStyles } from "./file-tree.module.css";

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
    return `<span class="${styles.treeIco} ${styles.setiIco}" style="color:${color}">${char}</span>`;
  }
  return `<span class="${styles.treeIco}">${ICONS.folder}</span>`;
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

export interface FileTreeActionClasses {
  actions: string;
  action: string;
}

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
  actionClasses?: FileTreeActionClasses;
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
    const actionsClass = props.actionClasses?.actions;
    const actionClass = props.actionClasses?.action;
    const fire = (act: FileAction, e: MouseEvent) => {
      e.stopPropagation();
      if (scope === "folder") props.onFolderAction?.(act, key);
      else props.onAction?.(act, key);
    };
    return (
      <span class={actionsClass ? `${styles.rowActions} ${actionsClass}` : styles.rowActions}>
        {group === "unstaged" ? (
          <>
            <button class={actionClass} data-act="discard" type="button" title="Discard changes" onClick={(e) => fire("discard", e)}>
              <Raw html={ICONS.discard} />
            </button>
            <button class={actionClass} type="button" title="Stage changes" onClick={(e) => fire("stage", e)}>
              <Raw html={ICONS.plus} />
            </button>
          </>
        ) : (
          <button class={actionClass} type="button" title="Unstage changes" onClick={(e) => fire("unstage", e)}>
            <Raw html={ICONS.minus} />
          </button>
        )}
      </span>
    );
  };

  const fileRow = (f: FileChange & { name: string }, depth: number, showTwisty: boolean) => {
    const active = props.activeFile === f.path;
    return (
      <div
        class={`${styles.treeRow} ${styles.treeFile}${active ? ` ${styles.selected}` : ""}`}
        style={{ "--d": depth } as JSX.CSSProperties}
        title={f.path}
        key={f.path}
        onClick={() => props.onSelect(f.path)}
      >
        {showTwisty ? <span class={`${styles.treeTwisty} ${styles.hiddenTwisty}`} dangerouslySetInnerHTML={{ __html: ICONS.chevronDown }} /> : null}
        <Raw html={fileIconHtml(f.name)} />
        <span class={styles.treeName}>{f.name}</span>
        {rowActions("file", f.path)}
        {props.fileBadge?.(f.path)}
        <span class={`${styles.changeStat} ${styles[f.status] ?? ""}`} title={f.status}>
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
            class={`${styles.treeRow} ${styles.treeFile}${active ? ` ${styles.selected}` : ""}`}
            title={f.path}
            key={f.path}
            onClick={() => props.onSelect(f.path)}
          >
            <Raw html={fileIconHtml(name)} />
            <span class={styles.treeName}>
              <span class={styles.changeDir}>{dir}</span>
              {name}
            </span>
            {rowActions("file", f.path)}
            {props.fileBadge?.(f.path)}
            <span class={`${styles.changeStat} ${styles[f.status] ?? ""}`} title={f.status}>
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
          <div class={`${styles.treeRow} ${styles.treeFolder}`} style={{ "--d": depth } as JSX.CSSProperties} key={"d:" + eff.path} onClick={() => toggle(eff.path)}>
            <span class={`${styles.treeTwisty} ${isCollapsed ? styles.collapsed : ""}`} dangerouslySetInnerHTML={{ __html: ICONS.chevronDown }} />
            <span class={styles.treeIco} dangerouslySetInnerHTML={{ __html: ICONS.folder }} />
            <span class={styles.treeName} title={eff.path}>
              {label}
            </span>
            {rowActions("folder", eff.path)}
            <span class={styles.treeCount}>{desc.length}</span>
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

  if (!rows.length) return <div class={styles.changesEmpty}>No files.</div>;
  return <>{rows}</>;
}

export type { FileStatus };
