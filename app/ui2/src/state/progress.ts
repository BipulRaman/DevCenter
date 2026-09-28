// Global "work in progress" indicator — drives the thin loader under the page
// top bar. Every backend call is counted (see platform/tauri.ts `invoke`), so
// any page gets it for free. To avoid flicker, the bar only appears once work
// has been pending for SHOW_DELAY_MS (quick reads never flash it) and, once
// shown, stays up for at least MIN_VISIBLE_MS.

import { effect, signal } from "@preact/signals";

const SHOW_DELAY_MS = 200;
const MIN_VISIBLE_MS = 400;

/** Commands that run in the background and shouldn't read as user-visible work. */
const IGNORED = new Set(["close_splashscreen", "check_for_updates", "app_logs"]);

let pending = 0;
let showTimer: ReturnType<typeof setTimeout> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let shownAt = 0;

/** True while the loader should be visible. */
export const busy = signal(false);

function update(): void {
  if (pending > 0) {
    clearTimeout(hideTimer);
    hideTimer = undefined;
    if (!busy.value && !showTimer) {
      showTimer = setTimeout(() => {
        showTimer = undefined;
        if (pending > 0) {
          busy.value = true;
          shownAt = Date.now();
        }
      }, SHOW_DELAY_MS);
    }
    return;
  }
  clearTimeout(showTimer);
  showTimer = undefined;
  if (!busy.value || hideTimer) return;
  const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt));
  hideTimer = setTimeout(() => {
    hideTimer = undefined;
    if (pending === 0) busy.value = false;
  }, wait);
}

/** Track a promise as in-progress work for the global loader. */
export function trackProgress<T>(p: Promise<T>, cmd?: string): Promise<T> {
  if (cmd && IGNORED.has(cmd)) return p;
  pending++;
  update();
  const done = () => {
    pending = Math.max(0, pending - 1);
    update();
  };
  p.then(done, done);
  return p;
}

// Reflect onto the document so plain CSS can render the bar under whichever
// top bar is visible (pages, PR reviewer, conflict resolver).
if (typeof document !== "undefined") {
  effect(() => {
    const root = document.documentElement;
    if (busy.value) root.setAttribute("data-busy", "");
    else root.removeAttribute("data-busy");
  });
}
