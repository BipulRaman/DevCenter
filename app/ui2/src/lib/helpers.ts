// Small utilities ported from app/ui/js/helpers.js — trimmed to what the shell
// needs in Phase 0. Grows as pages are ported.

/** Escape a string for safe insertion as HTML text. */
export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Trailing-edge debounce (default 150ms — matches the vanilla UI search inputs). */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait = 150,
): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// --- Filter-set persistence -------------------------------------------------
// Reuses the SAME localStorage keys as app/ui (see plan.md §9) so a user's
// selections survive the migration. Values are JSON arrays of strings.

export function loadFilterSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export function saveFilterSet(key: string, set: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* storage disabled */
  }
}

// --- PR review chip ---------------------------------------------------------
// Single source for the PR review chip (class + label + raw-svg icon), used by
// the Pull Requests list, the Changes PR detail, and the reviewer header.

import { ICONS } from "@/lib/ico";
import type { PullRequest } from "@/types/models";

export function prReviewChip(pr: Pick<PullRequest, "reviews" | "approvals" | "approvedByMe">): {
  cls: string;
  label: string;
  icon: string;
} {
  const state = pr && pr.reviews;
  if (state === "changes") return { cls: "danger", label: "Changes requested", icon: ICONS.changes };
  if (state === "approved") {
    const n = (pr && pr.approvals) || 0;
    if (pr && pr.approvedByMe) return { cls: "ok", label: n ? `Approved (${n})` : "Approved", icon: ICONS.check };
    return { cls: "ok-light", label: n ? `Others Approved (${n})` : "Others Approved", icon: ICONS.check };
  }
  return { cls: "muted", label: "Review pending", icon: ICONS.clock };
}

// --- Minimal markdown for PR comment bodies --------------------------------
// A tiny, safe renderer: escape first, then apply inline (code/bold/italic/link)
// and block (paragraph/list/code-fence) formatting. Trimmed port of mdLite in
// app/ui/js/helpers.js — enough for comment display.

function mdInline(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`)
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a || b}</strong>`)
    .replace(/\*([^*]+)\*|_([^_]+)_/g, (_, a, b) => `<em>${a || b}</em>`);
}

export function mdLite(raw: string, codeBlockClass = "prr-md-pre"): string {
  if (!raw) return "";
  const blocks: string[] = [];
  const s = escapeHtml(String(raw))
    .replace(/\r\n/g, "\n")
    .replace(/```[a-zA-Z0-9]*\n([\s\S]*?)```/g, (_, code) => {
      blocks.push(`<pre class="${codeBlockClass}"><code>${code.replace(/\n$/, "")}</code></pre>`);
      return `\u0000${blocks.length - 1}\u0000`;
    });
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: string; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.join("<br>")}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.tag}>`);
      list = null;
    }
  };
  for (const line of s.split("\n")) {
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      flushPara();
      flushList();
      out.push(`<h4>${mdInline(m[2])}</h4>`);
      continue;
    }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara();
      if (!list || list.tag !== "ul") {
        flushList();
        list = { tag: "ul", items: [] };
      }
      list.items.push(mdInline(m[1]));
      continue;
    }
    if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      flushPara();
      if (!list || list.tag !== "ol") {
        flushList();
        list = { tag: "ol", items: [] };
      }
      list.items.push(mdInline(m[1]));
      continue;
    }
    flushList();
    para.push(mdInline(line));
  }
  flushPara();
  flushList();
  return out.join("").replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[Number(i)]);
}
