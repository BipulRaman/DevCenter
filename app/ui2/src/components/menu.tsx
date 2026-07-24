// Floating menu host — the Preact equivalent of the `Dropdown.menu` /
// `Dropdown.context` action menus in app/ui/js/components.js. A single
// <MenuHost/> lives at the app root; any code calls `openMenu` / `openContextMenu`
// to show a floating, viewport-clamped menu that closes on outside click, Esc,
// scroll or resize.

import { signal } from "@preact/signals";
import { useState } from "preact/hooks";
import { Raw, ICONS } from "@/lib/ico";
import { useDismiss, useFloatingPosition, clampToViewport } from "@/lib/floating";
import styles from "./menu.module.css";

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

type PositionFn = (mw: number, mh: number) => { left: number; top: number };

export function MenuHost() {
  const st = menuState.value;
  if (!st) return null;
  return <MenuRoot state={st} />;
}

function MenuRoot({ state }: { state: MenuState }) {
  useDismiss(closeMenu, {
    isInside: (t) => !!(t as HTMLElement | null)?.closest?.(`.${styles.menu}`),
    contextMenu: true,
    scrollIgnoresInside: true,
  });

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
    return clampToViewport(left, top, mw, mh);
  };

  return <FlyoutLevel items={state.items} position={rootPosition} />;
}

function FlyoutLevel({ items, position }: { items: MenuItem[]; position: PositionFn }) {
  const [open, setOpen] = useState<{ idx: number; rect: DOMRect } | null>(null);
  const { ref, style } = useFloatingPosition(position, [items]);

  const subPosition =
    (rect: DOMRect): PositionFn =>
    (mw, mh) => {
      let left = rect.right - 3;
      if (left + mw > window.innerWidth - 8) left = Math.max(8, rect.left - mw + 3);
      return clampToViewport(left, rect.top - 6, mw, mh);
    };

  return (
    <>
      <div ref={ref} class={`${styles.dropdownMenu} ${styles.menu} ${styles.flyout}`} style={style}>
        {items.map((it, i) =>
          it.separator ? (
            <div class={styles.separator} key={i} />
          ) : (
            <button
              key={i}
              type="button"
              class={`${styles.item}${it.danger ? ` ${styles.danger}` : ""}${it.submenu ? ` ${styles.hasSubmenu}` : ""}`}
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
              <span class={styles.icon}>{it.icon ? <Raw html={it.icon} /> : null}</span>
              <span class={styles.label}>{it.label}</span>
              {it.submenu ? <span class={styles.arrow} dangerouslySetInnerHTML={{ __html: ICONS.chevronRight }} /> : null}
            </button>
          ),
        )}
      </div>
      {open && items[open.idx]?.submenu ? <FlyoutLevel items={items[open.idx].submenu!} position={subPosition(open.rect)} /> : null}
    </>
  );
}
