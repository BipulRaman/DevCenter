// Brand resolution — the brand name lives in ONE place: `productName` in
// tauri.conf.json, surfaced via the `app_name` command. Every UI string reads
// `window.BRAND` (kept in sync here). Mirrors applyBrand() in app/ui/js/api.js.

import { ipc } from "@/platform/ipc";

export const BRAND_FALLBACK = "DevGitCenter";

if (typeof window !== "undefined" && !window.BRAND) {
  window.BRAND = BRAND_FALLBACK;
}

/** Resolve the brand from the backend and propagate it to title + globals. */
export async function applyBrand(): Promise<string> {
  let name = BRAND_FALLBACK;
  try {
    name = (await ipc.appName()) || BRAND_FALLBACK;
  } catch {
    /* browser / no backend */
  }
  window.BRAND = name;
  document.title = name;
  document
    .querySelectorAll<HTMLElement>(".brand-name")
    .forEach((el) => (el.textContent = name));
  return name;
}
