// Custom hover tooltip — the Preact-app port of the Tooltip singleton in
// app/ui/js/components.js. Replaces the OS `title` tooltip with a styled
// floating card app-wide via event delegation, so existing `title="…"`
// attributes need no changes. Styles live in tooltip.module.css.
// Call `initTooltip()` once on startup.

import styles from "./tooltip.module.css";

let el: HTMLDivElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | undefined;
let current: HTMLElement | null = null;
let started = false;

function ensureEl(): HTMLDivElement {
  if (!el) {
    el = document.createElement("div");
    el.className = styles.appTooltip;
    el.setAttribute("role", "tooltip");
    document.body.appendChild(el);
  }
  return el;
}

function position(target: HTMLElement): void {
  const tip = ensureEl();
  const r = target.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  let left = r.left + r.width / 2 - tw / 2;
  let top = r.top - th - 9;
  let placement = "top";
  if (top < 8) {
    top = r.bottom + 9;
    placement = "bottom";
  }
  if (left < 8) left = 8;
  if (left + tw > window.innerWidth - 8) left = window.innerWidth - 8 - tw;
  tip.style.left = Math.round(left) + "px";
  tip.style.top = Math.round(top) + "px";
  tip.dataset.placement = placement;
  const arrowX = Math.max(10, Math.min(tw - 10, r.left + r.width / 2 - left));
  tip.style.setProperty("--tip-arrow-x", `${arrowX}px`);
}

function show(target: HTMLElement, text: string): void {
  const tip = ensureEl();
  tip.textContent = text;
  current = target;
  position(target);
  void tip.offsetWidth; // force layout so the transition runs
  tip.classList.add(styles.visible);
}

function hide(): void {
  clearTimeout(showTimer);
  current = null;
  if (el) el.classList.remove(styles.visible);
}

function restore(t: HTMLElement): void {
  if (t.dataset.tip !== undefined) {
    t.setAttribute("title", t.dataset.tip);
    delete t.dataset.tip;
  }
}

export function initTooltip(): void {
  if (started) return;
  started = true;

  document.addEventListener(
    "mouseover",
    (e) => {
      const t = (e.target as HTMLElement).closest?.("[title]") as HTMLElement | null;
      if (!t || t === current) return;
      const text = t.getAttribute("title");
      if (!text) return;
      t.dataset.tip = text;
      t.removeAttribute("title");
      clearTimeout(showTimer);
      showTimer = setTimeout(() => show(t, text), 350);
    },
    true,
  );

  document.addEventListener(
    "mouseout",
    (e) => {
      const t = (e.target as HTMLElement).closest?.("[data-tip]") as HTMLElement | null;
      if (!t) return;
      const to = e.relatedTarget as Node | null;
      if (to && t.contains(to)) return;
      restore(t);
      hide();
    },
    true,
  );

  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide, true);
  document.addEventListener("mousedown", hide, true);
}
