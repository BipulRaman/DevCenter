// Draggable pane divider — the Preact port of initResizers/initPrrResizer in
// app/ui/js/changes.js + pr-reviewer.js. Sits as an absolutely-positioned child
// of a grid layout (.commit-layout / .prr-layout) and adjusts a CSS width
// variable on its parent, persisted to localStorage. Double-click resets.

import { useLayoutEffect, useRef } from "preact/hooks";
import styles from "./PaneResizer.module.css";

export function PaneResizer({
  resize,
  varName,
  storageKey,
  min,
  max,
  def,
  extraClass,
  ariaLabel,
}: {
  resize: string;
  varName: string;
  storageKey: string;
  min: number;
  max: number;
  def: number;
  extraClass?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Restore the saved width onto the parent layout on mount.
  useLayoutEffect(() => {
    const layout = ref.current?.parentElement;
    if (!layout) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) layout.style.setProperty(varName, saved);
    } catch {
      /* ignore */
    }
  }, []);

  const onDown = (e: PointerEvent) => {
    e.preventDefault();
    const rz = e.currentTarget as HTMLElement;
    const layout = rz.parentElement as HTMLElement;
    const startX = e.clientX;
    const startW = parseFloat(getComputedStyle(layout).getPropertyValue(varName)) || def;
    rz.setPointerCapture(e.pointerId);
    rz.classList.add(styles.dragging);
    document.body.classList.add(styles.colResizing);
    const move = (ev: PointerEvent) => {
      const w = Math.max(min, Math.min(Math.round(startW + (ev.clientX - startX)), max));
      layout.style.setProperty(varName, w + "px");
      rz.setAttribute("aria-valuenow", String(w));
    };
    const up = () => {
      rz.classList.remove(styles.dragging);
      document.body.classList.remove(styles.colResizing);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      try {
        localStorage.setItem(storageKey, getComputedStyle(layout).getPropertyValue(varName).trim());
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onDblClick = () => {
    const layout = ref.current?.parentElement;
    if (!layout) return;
    layout.style.removeProperty(varName);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const layout = ref.current?.parentElement;
    if (!layout) return;
    let w = parseFloat(getComputedStyle(layout).getPropertyValue(varName)) || def;
    const step = e.shiftKey ? 32 : 8;
    if (e.key === "ArrowLeft") w -= step;
    else if (e.key === "ArrowRight") w += step;
    else if (e.key === "Home") w = min;
    else if (e.key === "End") w = max;
    else return;
    e.preventDefault();
    w = Math.max(min, Math.min(Math.round(w), max));
    layout.style.setProperty(varName, w + "px");
    (e.currentTarget as HTMLElement).setAttribute("aria-valuenow", String(w));
    try {
      localStorage.setItem(storageKey, w + "px");
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      ref={ref}
      class={`${styles.resizer}${extraClass ? " " + extraClass : ""}`}
      data-resize={resize}
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onDown}
      onDblClick={onDblClick}
      onKeyDown={onKeyDown}
    />
  );
}
