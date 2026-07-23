// Reusable multiselect filter dropdown — the Preact equivalent of the
// account/tag filter menus in app/ui/js/git-board.js and tags.js. Reuses the
// exact CSS classes (.multiselect / .multiselect-btn / .multiselect-menu / …).

import { useEffect, useRef, useState } from "preact/hooks";
import { Raw } from "@/lib/ico";

export interface MultiOption {
  value: string;
  label: string;
  count?: number;
  /** Raw SVG string shown before the label. */
  icon?: string;
}

export function Multiselect({
  options,
  selected,
  onChange,
  allLabel,
  buttonIcon,
  singleLabel,
  countNoun = "selected",
  ariaLabel,
}: {
  options: MultiOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  allLabel: string;
  /** Raw SVG for the button glyph; when one option is picked its icon is shown. */
  buttonIcon?: string;
  /** Map a single selected value -> button label (defaults to option label). */
  singleLabel?: (value: string) => string;
  countNoun?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (value: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(value);
    else next.delete(value);
    onChange(next);
  };

  const clearAll = () => onChange(new Set());

  let label = allLabel;
  if (selected.size === 1) {
    const only = [...selected][0];
    label = singleLabel ? singleLabel(only) : options.find((o) => o.value === only)?.label || `1 ${countNoun}`;
  } else if (selected.size > 1) {
    label = `${selected.size} ${countNoun}`;
  }

  const singleIcon =
    selected.size === 1 ? options.find((o) => o.value === [...selected][0])?.icon : undefined;

  return (
    <div class={`multiselect${open ? " open" : ""}`} ref={wrapRef}>
      <button
        class="multiselect-btn"
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {buttonIcon ? <span class="ms-ico">{<Raw html={singleIcon || buttonIcon} />}</span> : null}
        <span>{label}</span>
        <svg
          class="caret"
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div class="multiselect-menu" role="group" aria-label={ariaLabel} hidden={!open}>
        <label class="multiselect-opt all">
          <input type="checkbox" checked={selected.size === 0} onChange={clearAll} />
          <span>{allLabel}</span>
        </label>
        <div class="multiselect-sep" />
        {options.map((o) => (
          <label class="multiselect-opt" key={o.value}>
            <input
              type="checkbox"
              value={o.value}
              checked={selected.has(o.value)}
              onChange={(e) => toggle(o.value, (e.target as HTMLInputElement).checked)}
            />
            {o.icon ? <span class="multiselect-ico">{<Raw html={o.icon} />}</span> : null}
            <span>{o.label}</span>
            {o.count != null ? <span class="multiselect-count">{o.count}</span> : null}
          </label>
        ))}
      </div>
    </div>
  );
}
