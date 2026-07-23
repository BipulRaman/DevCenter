// App Center data — apps + presets signals, load/refresh, and live status/log
// wiring. Ported from the app parts of app/ui/js/backend.js and app-center.js.

import { signal } from "@preact/signals";
import { ipc } from "@/platform/ipc";
import { events } from "@/platform/events";
import type { AppPreset, ManagedApp } from "@/types/models";

export const apps = signal<ManagedApp[]>([]);
export const appPresets = signal<AppPreset[]>([]);
export const appsLoaded = signal(false);

let started = false;

export async function initApps(): Promise<void> {
  if (started) return;
  started = true;

  events.onAppStatus((s) => {
    const at = apps.value.findIndex((a) => String(a.id) === String(s.id));
    if (at >= 0) {
      const next = apps.value.slice();
      next[at] = { ...next[at], status: s.status, pid: s.pid, uptime: s.uptime };
      apps.value = next;
    }
  });

  await refreshApps();
}

export async function refreshApps(): Promise<void> {
  if (!ipc.hasBackend) {
    appsLoaded.value = true;
    return;
  }
  try {
    const [list, presets] = await Promise.all([ipc.listApps(), ipc.listPresets()]);
    if (Array.isArray(presets)) appPresets.value = presets;
    if (Array.isArray(list)) apps.value = list;
  } catch (e) {
    console.error("listApps failed", e);
  } finally {
    appsLoaded.value = true;
  }
}

export function upsertApp(app: ManagedApp): void {
  const at = apps.value.findIndex((a) => a.id === app.id);
  if (at >= 0) {
    const next = apps.value.slice();
    next[at] = app;
    apps.value = next;
  } else {
    apps.value = [...apps.value, app];
  }
}

export function removeAppLocal(id: number): void {
  apps.value = apps.value.filter((a) => a.id !== id);
}

/** Set the app list to an explicit order and persist it. */
export async function reorderApps(ordered: ManagedApp[]): Promise<void> {
  apps.value = ordered;
  if (ipc.hasBackend) {
    try {
      await ipc.reorderApps(ordered.map((a) => a.id));
    } catch (e) {
      console.error("reorderApps failed", e);
    }
  }
}
