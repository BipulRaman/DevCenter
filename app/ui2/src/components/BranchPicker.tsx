// Searchable branch picker — the Preact port of the branch Dropdown +
// branch dialogs in app/ui/js/branches.js + git-board.js openBranchPicker.
// A signal-driven floating panel (like components/menu.tsx) with search,
// branch-type badges, a "New branch" header action, a per-branch context
// menu, and the GitHub-Desktop dirty-switch prompt.

import { signal } from "@preact/signals";
import { useLayoutEffect, useRef, useState, useEffect } from "preact/hooks";
import { ipc } from "@/platform/ipc";
import { Raw, ICONS } from "@/lib/ico";
import { modal } from "@/components/modal";
import { openContextMenu } from "@/components/menu";
import type { Repo } from "@/types/models";

// ---- branch name validation + helpers --------------------------------------

export function validateBranchName(name: string, existing: string[]): string | null {
  if (!name) return "Branch name is required.";
  if (/\s/.test(name)) return "Branch name cannot contain spaces.";
  if (/[~^:?*[\\]/.test(name)) return "Branch name cannot contain ~ ^ : ? * [ or \\.";
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(name)) return "Branch name cannot contain control characters.";
  if (name.includes("..")) return "Branch name cannot contain '..'.";
  if (name.includes("//")) return "Branch name cannot contain '//'.";
  if (name.startsWith("/") || name.endsWith("/")) return "Branch name cannot start or end with '/'.";
  if (name.startsWith(".") || name.endsWith(".")) return "Branch name cannot start or end with '.'.";
  if (name.endsWith(".lock")) return "Branch name cannot end with '.lock'.";
  if (name.includes("@{") || name === "@") return "Branch name cannot contain '@{' or be '@'.";
  if (existing && existing.includes(name)) return "A branch with this name already exists.";
  return null;
}

interface BranchClass {
  label: string;
  tone: string;
}
function classifyBranch(opt: string): BranchClass {
  if (opt === "main" || opt === "master") return { label: "base", tone: "base" };
  if (opt.startsWith("users/")) return { label: "user", tone: "user" };
  if (opt.startsWith("dependabot/")) return { label: "bot", tone: "bot" };
  if (opt.startsWith("feature/") || opt.startsWith("feat/")) return { label: "feature", tone: "feature" };
  if (opt.startsWith("release/")) return { label: "release", tone: "release" };
  if (opt.startsWith("hotfix/")) return { label: "hotfix", tone: "hotfix" };
  return { label: "branch", tone: "branch" };
}

export function defaultBranchFrom(branches: string[]): string | null {
  if (!branches || !branches.length) return null;
  if (branches.includes("main")) return "main";
  if (branches.includes("master")) return "master";
  return branches[0];
}

// ---- dialogs (new / rename / delete / dirty-switch) ------------------------

export function openNewBranchDialog(opts: {
  branches: string[];
  current?: string;
  onCreate: (name: string, base: string) => void;
}): void {
  const bases = opts.branches?.length ? opts.branches.slice() : [];
  const base0 = opts.current && bases.includes(opts.current) ? opts.current : bases[0] || "";
  void modal
    .custom<{ name: string; base: string } | null>({
      title: "Create a branch",
      body: (close) => <NewBranchBody bases={bases} base0={base0} close={close} />,
    })
    .then((res) => {
      if (res) opts.onCreate(res.name, res.base);
    });
}

function NewBranchBody({
  bases,
  base0,
  close,
}: {
  bases: string[];
  base0: string;
  close: (v: { name: string; base: string } | null) => void;
}) {
  const [name, setName] = useState("");
  const [base, setBase] = useState(base0);
  const [err, setErr] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => nameRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, []);
  const submit = () => {
    const n = name.trim();
    const msg = validateBranchName(n, bases);
    if (msg) return setErr(msg);
    close({ name: n, base });
  };
  return (
    <>
      <div class="form-row">
        <label class="form-label">New branch name</label>
        <input
          ref={nameRef}
          class="modal-input"
          placeholder="feature/my-change"
          spellcheck={false}
          value={name}
          onInput={(e) => {
            setName((e.target as HTMLInputElement).value);
            setErr("");
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      <div class="form-row">
        <label class="form-label">Base branch</label>
        {bases.length ? (
          <select class="modal-input" value={base} onChange={(e) => setBase((e.target as HTMLSelectElement).value)}>
            {bases.map((b) => (
              <option value={b} key={b}>
                {b}
              </option>
            ))}
          </select>
        ) : (
          <select class="modal-input" disabled>
            <option>(current branch)</option>
          </select>
        )}
        <div class="form-hint">The new branch will start from the tip of this branch.</div>
      </div>
      {err ? <div class="modal-error">{err}</div> : null}
      <div class="modal-foot">
        <button class="btn btn-ghost" type="button" onClick={() => close(null)}>
          Cancel
        </button>
        <button class="btn btn-primary" type="button" onClick={submit}>
          Create branch
        </button>
      </div>
    </>
  );
}

function openSwitchBranchDialog(current: string, target: string): Promise<"leave" | "bring" | null> {
  return modal.custom<"leave" | "bring" | null>({
    title: "Switch branch",
    body: (close) => <SwitchBranchBody current={current} target={target} close={close} />,
  });
}

function SwitchBranchBody({
  current,
  target,
  close,
}: {
  current: string;
  target: string;
  close: (v: "leave" | "bring" | null) => void;
}) {
  const [choice, setChoice] = useState<"leave" | "bring">("leave");
  return (
    <>
      <p class="modal-msg">You have changes on this branch. What would you like to do with them?</p>
      <div class="switch-opts">
        <label class={`switch-opt${choice === "leave" ? " active" : ""}`}>
          <input type="radio" name="switchChoice" checked={choice === "leave"} onChange={() => setChoice("leave")} />
          <span class="switch-opt-body">
            <span class="switch-opt-title">Leave my changes on {current}</span>
            <span class="switch-opt-desc">Your in-progress work will be stashed on this branch for you to return to later</span>
          </span>
        </label>
        <label class={`switch-opt${choice === "bring" ? " active" : ""}`}>
          <input type="radio" name="switchChoice" checked={choice === "bring"} onChange={() => setChoice("bring")} />
          <span class="switch-opt-body">
            <span class="switch-opt-title">Bring my changes to {target}</span>
            <span class="switch-opt-desc">Your in-progress work will follow you to the new branch</span>
          </span>
        </label>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" type="button" onClick={() => close(null)}>
          Cancel
        </button>
        <button class="btn btn-primary" type="button" onClick={() => close(choice)}>
          Switch branch
        </button>
      </div>
    </>
  );
}

/** Switch a repo to `target`, prompting for dirty-tree handling. Returns Repo or null. */
export async function performBranchSwitch(opts: {
  repoId: string;
  current: string;
  target: string;
  dirty: boolean;
}): Promise<Repo | null> {
  let stash = false;
  if (opts.dirty) {
    const choice = await openSwitchBranchDialog(opts.current, opts.target);
    if (!choice) return null;
    stash = choice === "leave";
  }
  return ipc.checkoutBranch(opts.repoId, opts.target, stash);
}

function openRenameBranchDialog(branch: string, existing: string[], onRename: (name: string) => void): void {
  void modal
    .prompt({
      title: "Rename branch",
      label: `New name for "${branch}"`,
      value: branch,
      confirmText: "Rename",
      validate: (v) => {
        if (!v) return "Branch name is required.";
        if (v === branch) return "Enter a different name.";
        return validateBranchName(v, existing);
      },
    })
    .then((v) => {
      if (v && v !== branch) onRename(v);
    });
}

async function deleteBranchFlow(repoId: string, branch: string, onChanged: (r: Repo) => void): Promise<void> {
  const ok = await modal.confirm({
    title: "Delete branch",
    message: `Are you sure you want to delete the branch "${branch}"? This cannot be undone.`,
    confirmText: "Delete",
    danger: true,
  });
  if (!ok) return;
  try {
    onChanged(await ipc.deleteBranch(repoId, branch, false));
  } catch (e) {
    if (/not fully merged/i.test(String(e))) {
      const force = await modal.confirm({
        title: "Branch not fully merged",
        message: `"${branch}" has commits that aren't merged anywhere else. Delete it anyway? Those commits may be lost.`,
        confirmText: "Delete anyway",
        danger: true,
      });
      if (!force) return;
      try {
        onChanged(await ipc.deleteBranch(repoId, branch, true));
      } catch (e2) {
        await modal.alert({ title: "Delete failed", message: String(e2) });
      }
    } else {
      await modal.alert({ title: "Delete failed", message: String(e) });
    }
  }
}

// ---- the floating picker ----------------------------------------------------

export interface BranchPickerOpts {
  repoId: string;
  branches: string[];
  current: string;
  dirty: boolean;
  onSwitched: (repo: Repo) => void;
  onCreated?: (repo: Repo) => void;
}

interface PickerState extends BranchPickerOpts {
  anchor: DOMRect;
}

const pickerState = signal<PickerState | null>(null);

export function openBranchPicker(anchor: HTMLElement, opts: BranchPickerOpts): void {
  pickerState.value = { ...opts, anchor: anchor.getBoundingClientRect() };
}
export function closeBranchPicker(): void {
  pickerState.value = null;
}

export function BranchPickerHost() {
  const st = pickerState.value;
  if (!st) return null;
  return <BranchPanel state={st} />;
}

function BranchPanel({ state }: { state: PickerState }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [filter, setFilter] = useState("");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = state.anchor;
    const mw = el.offsetWidth;
    const mh = el.offsetHeight;
    let left = r.left;
    let top = r.bottom + 6;
    if (left + mw > window.innerWidth - 8) left = window.innerWidth - 8 - mw;
    if (left < 8) left = 8;
    if (top + mh > window.innerHeight - 8 && r.top - 6 - mh > 8) top = r.top - 6 - mh;
    setPos({ left: Math.round(left), top: Math.round(top) });
  }, [state]);

  useLayoutEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeBranchPicker();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeBranchPicker();
    const onScroll = () => closeBranchPicker();
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll, true);
    };
  }, []);

  const f = filter.trim().toLowerCase();
  const matches = state.branches.filter((b) => b.toLowerCase().includes(f));

  const doSwitch = async (target: string) => {
    if (target === state.current) return;
    closeBranchPicker();
    try {
      const updated = await performBranchSwitch({
        repoId: state.repoId,
        current: state.current,
        target,
        dirty: state.dirty,
      });
      if (updated) state.onSwitched(updated);
    } catch (e) {
      await modal.alert({ title: "Switch failed", message: String(e) });
    }
  };

  const newBranch = () => {
    closeBranchPicker();
    openNewBranchDialog({
      branches: state.branches,
      current: state.current,
      onCreate: async (name, base) => {
        try {
          const updated = await ipc.createBranch(state.repoId, name, base);
          (state.onCreated || state.onSwitched)(updated);
        } catch (e) {
          await modal.alert({ title: "Couldn't create branch", message: String(e) });
        }
      },
    });
  };

  const contextMenu = (e: MouseEvent, branch: string, isCurrent: boolean) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, [
      {
        label: "Rename…",
        icon: ICONS.pencil,
        onClick: () =>
          openRenameBranchDialog(branch, state.branches, async (newName) => {
            try {
              state.onSwitched(await ipc.renameBranch(state.repoId, branch, newName));
            } catch (err) {
              await modal.alert({ title: "Rename failed", message: String(err) });
            }
          }),
      },
      { label: "Copy branch name", icon: ICONS.copy, onClick: () => navigator.clipboard?.writeText(branch).catch(() => {}) },
      { separator: true },
      {
        label: "Delete…",
        icon: ICONS.trash,
        danger: true,
        disabled: isCurrent,
        onClick: () => deleteBranchFlow(state.repoId, branch, state.onSwitched),
      },
    ]);
  };

  return (
    <div
      ref={ref}
      class="dropdown-menu"
      style={{
        position: "fixed",
        left: pos ? pos.left : -9999,
        top: pos ? pos.top : -9999,
        visibility: pos ? "visible" : "hidden",
        minWidth: "260px",
      }}
    >
      <div class="dropdown-head">
        <span class="dropdown-head-title">Switch branch</span>
        <button class="dropdown-head-action" type="button" title="Create a new branch" onClick={newBranch}>
          <Raw html={ICONS.plus} />
          <span>New branch</span>
        </button>
      </div>
      <div class="dropdown-search">
        <Raw html={SEARCH_SVG} />
        <input
          autofocus
          type="text"
          placeholder="Filter branches…"
          spellcheck={false}
          value={filter}
          onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
        />
      </div>
      <div class="dropdown-list" role="listbox">
        {matches.length === 0 ? (
          <div class="dropdown-empty">{f ? "No matching branches." : "No local branches."}</div>
        ) : (
          matches.map((b) => {
            const isCur = b === state.current;
            const meta = classifyBranch(b);
            return (
              <button
                key={b}
                type="button"
                class={`dropdown-opt${isCur ? " current" : ""}`}
                title={b}
                role="option"
                aria-selected={isCur}
                onClick={() => (isCur ? closeBranchPicker() : doSwitch(b))}
                onContextMenu={(e) => contextMenu(e, b, isCur)}
              >
                <span class="opt-check">
                  <Raw html={ICONS.check} />
                </span>
                <span class="opt-name" dangerouslySetInnerHTML={{ __html: highlight(b, f) }} />
                <span class={`opt-badge ${meta.tone}`}>{meta.label}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] || c);
}
function highlight(text: string, f: string): string {
  if (!f) return esc(text);
  const i = text.toLowerCase().indexOf(f);
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + f.length)) + "</mark>" + esc(text.slice(i + f.length));
}

const SEARCH_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
