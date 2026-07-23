// Floating menu host — the Preact equivalent of the `Dropdown.menu` /
// `Dropdown.context` action menus in app/ui/js/components.js. A single
// <MenuHost/> lives at the app root; any code calls `openMenu` / `openContextMenu`
// to show a floating, viewport-clamped menu that closes on outside click, Esc,
// scroll or resize.

import { signal } from "@preact/signals";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { Raw } from "@/lib/ico";

export interface MenuItem {
  label?: string;
  /** Raw SVG string (from ICONS) shown before the label. */
  icon?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  /** Nested items — shown as a flyout panel opening to the side. */
  submenu?: MenuItem[];
}

interface MenuState {
  items: MenuItem[];
  /** Anchor rect (menu opens below, right-aligned) or a cursor point. */
  anchor?: DOMRect;
  point?: { x: number; y: number };
}

const menuState = signal<MenuState | null>(null);

export function openMenu(anchor: HTMLElement, items: MenuItem[]): void {
  menuState.value = { items, anchor: anchor.getBoundingClientRect() };
}

export function openContextMenu(x: number, y: number, items: MenuItem[]): void {
  menuState.value = { items, point: { x, y } };
}

export function closeMenu(): void {
  menuState.value = null;
}

const RIGHT_CHEV =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

type PositionFn = (mw: number, mh: number) => { left: number; top: number };

export function MenuHost() {
  const st = menuState.value;
  if (!st) return null;
  return <MenuRoot state={st} />;
}

function MenuRoot({ state }: { state: MenuState }) {
  useLayoutEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(".dropdown-menu")) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    const onScroll = (e: Event) => {
      // Don't close when the scroll happens inside the menu itself (a tall
      // submenu may scroll); only page/other scrolls dismiss it.
      const t = e.target as HTMLElement | null;
      if (t && typeof t.closest === "function" && t.closest(".dropdown-menu")) return;
      closeMenu();
    };
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("contextmenu", onDoc, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", closeMenu, true);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("contextmenu", onDoc, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", closeMenu, true);
    };
  }, []);

  const rootPosition: PositionFn = (mw, mh) => {
    let left: number;
    let top: number;
    if (state.anchor) {
      const r = state.anchor;
      left = r.right - mw; // right-align to the anchor
      top = r.bottom + 6;
      if (top + mh > window.innerHeight - 8 && r.top - 6 - mh > 8) top = r.top - 6 - mh;
    } else {
      left = state.point!.x;
      top = state.point!.y;
    }
    if (left + mw > window.innerWidth - 8) left = window.innerWidth - 8 - mw;
    if (left < 8) left = 8;
    if (top + mh > window.innerHeight - 8) top = window.innerHeight - 8 - mh;
    if (top < 8) top = 8;
    return { left: Math.round(left), top: Math.round(top) };
  };

  return <FlyoutLevel items={state.items} position={rootPosition} />;
}

function FlyoutLevel({ items, position }: { items: MenuItem[]; position: PositionFn }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [open, setOpen] = useState<{ idx: number; rect: DOMRect } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos(position(el.offsetWidth, el.offsetHeight));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const subPosition =
    (rect: DOMRect): PositionFn =>
    (mw, mh) => {
      let left = rect.right - 3;
      if (left + mw > window.innerWidth - 8) left = Math.max(8, rect.left - mw + 3);
      let top = rect.top - 6;
      if (top + mh > window.innerHeight - 8) top = window.innerHeight - 8 - mh;
      if (top < 8) top = 8;
      return { left: Math.round(left), top: Math.round(top) };
    };

  return (
    <>
      <div
        ref={ref}
        class="dropdown-menu menu flyout-level"
        style={{
          position: "fixed",
          left: pos ? pos.left : -9999,
          top: pos ? pos.top : -9999,
          visibility: pos ? "visible" : "hidden",
        }}
      >
        {items.map((it, i) =>
          it.separator ? (
            <div class="menu-sep" key={i} />
          ) : (
            <button
              key={i}
              type="button"
              class={`menu-item${it.danger ? " danger" : ""}${it.submenu ? " has-submenu" : ""}`}
              disabled={it.disabled}
              onMouseEnter={(e) => {
                if (it.submenu && !it.disabled) setOpen({ idx: i, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() });
                else setOpen(null);
              }}
              onClick={(e) => {
                if (it.submenu) {
                  if (!it.disabled) setOpen({ idx: i, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() });
                  return;
                }
                closeMenu();
                it.onClick?.();
              }}
            >
              <span class="menu-ico">{it.icon ? <Raw html={it.icon} /> : null}</span>
              <span class="menu-label">{it.label}</span>
              {it.submenu ? <span class="menu-arrow" dangerouslySetInnerHTML={{ __html: RIGHT_CHEV }} /> : null}
            </button>
          ),
        )}
      </div>
      {open && items[open.idx]?.submenu ? <FlyoutLevel items={items[open.idx].submenu!} position={subPosition(open.rect)} /> : null}
    </>
  );
}

/** Convenience wrapper for a `title`-like child cluster (unused placeholder). */
export type MenuChildren = ComponentChildren;
