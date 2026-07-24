// Shared floating-panel primitives for portaled dropdowns (the context menu in
// components/menu.tsx and the branch picker in components/BranchPicker.tsx).
// Centralises the viewport-clamp positioning and the standard dismissal wiring
// (outside click, Esc, scroll, resize) so each consumer keeps only its own
// content. The panel *chrome* is shared in lib/floating.module.css (`.panel`,
// composed by each consumer's `.dropdownMenu`).

import type { JSX, RefObject } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

export interface Point {
  left: number;
  top: number;
}

/** Given the panel's measured size, return its desired top-left corner. */
export type ComputePosition = (menuWidth: number, menuHeight: number) => Point;

const MARGIN = 8;

/** Clamp a proposed top-left so the box stays fully inside the viewport. */
export function clampToViewport(left: number, top: number, w: number, h: number, margin = MARGIN): Point {
  if (left + w > window.innerWidth - margin) left = window.innerWidth - margin - w;
  if (left < margin) left = margin;
  if (top + h > window.innerHeight - margin) top = window.innerHeight - margin - h;
  if (top < margin) top = margin;
  return { left: Math.round(left), top: Math.round(top) };
}

/** Measure the panel and place it via `compute`, kept invisible until the first
 *  measurement lands. Returns the ref to attach and the inline positioning
 *  style (position: fixed + left/top + visibility). */
export function useFloatingPosition(compute: ComputePosition, deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Point | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos(compute(el.offsetWidth, el.offsetHeight));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  const style: JSX.CSSProperties = {
    position: "fixed",
    left: pos ? pos.left : -9999,
    top: pos ? pos.top : -9999,
    visibility: pos ? "visible" : "hidden",
  };
  return { ref, style };
}

export interface DismissOptions {
  /** True when the event target is inside the floating surface (won't dismiss). */
  isInside: (target: EventTarget | null) => boolean;
  /** Also dismiss on an outside right-click (contextmenu). Default false. */
  contextMenu?: boolean;
  /** When true a scroll inside the surface is ignored; otherwise any scroll
   *  dismisses. Default false. */
  scrollIgnoresInside?: boolean;
}

/** Attach the standard dismissal listeners (outside click, Esc, scroll, resize)
 *  for a floating surface. `onDismiss` runs when the surface should close. */
export function useDismiss(onDismiss: () => void, opts: DismissOptions) {
  const { isInside, contextMenu = false, scrollIgnoresInside = false } = opts;
  useLayoutEffect(() => {
    const onDown = (e: Event) => {
      if (!isInside(e.target)) onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    const onScroll = (e: Event) => {
      if (scrollIgnoresInside && isInside(e.target)) return;
      onDismiss();
    };
    document.addEventListener("mousedown", onDown, true);
    if (contextMenu) document.addEventListener("contextmenu", onDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onDismiss, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      if (contextMenu) document.removeEventListener("contextmenu", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onDismiss, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Dismiss an inline (CSS-anchored) popover on an outside mousedown. Lighter
 *  than `useDismiss` — no Esc/scroll/resize — for menus that live in normal flow
 *  (Multiselect, the settings popover). Only listens while `active`. */
export function useOutsideClick<T extends HTMLElement>(ref: RefObject<T>, onOutside: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
