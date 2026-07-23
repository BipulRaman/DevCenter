// Typed access to the Tauri global (`window.__TAURI__`, enabled by
// `withGlobalTauri: true` in tauri.conf.json). In a plain browser (design work,
// Vitest) there is no backend, so `hasBackend` is false and callers fall back to
// mock/seed data — mirroring the behavior of app/ui/js/api.js.

export interface TauriCore {
  invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

export interface TauriEvent {
  listen<T = unknown>(
    event: string,
    handler: (event: { payload: T }) => void,
  ): Promise<() => void>;
}

export interface TauriDialogOpenOptions {
  directory?: boolean;
  multiple?: boolean;
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}

export interface TauriDialog {
  open(options?: TauriDialogOpenOptions): Promise<string | string[] | null>;
  save(options?: {
    title?: string;
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<string | null>;
}

export interface TauriGlobal {
  core?: TauriCore;
  event?: TauriEvent;
  dialog?: TauriDialog;
}

const T: TauriGlobal | undefined =
  typeof window !== "undefined" ? window.__TAURI__ : undefined;

/** True when running inside the Tauri desktop shell with a live Rust backend. */
export const hasBackend: boolean = !!(T && T.core);

/**
 * Invoke a Rust command. Throws if called without a backend — callers that must
 * degrade gracefully in the browser should guard with `hasBackend` or use the
 * optional helpers in ipc.ts that return `null` instead.
 */
export function invoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!T?.core) {
    return Promise.reject(
      new Error(`Tauri backend unavailable; cannot invoke "${cmd}"`),
    );
  }
  return T.core.invoke<T>(cmd, args);
}

/** Subscribe to a backend event. No-op unsubscribe in the browser. */
export function listen<T = unknown>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  if (!T?.event) return Promise.resolve(() => {});
  return T.event.listen<T>(event, (e) => handler(e.payload));
}

/**
 * Open the native folder picker (Tauri dialog plugin). Returns the chosen
 * absolute path, or null if cancelled / unavailable.
 */
export async function pickDirectory(title?: string): Promise<string | null> {
  if (!T?.dialog) return null;
  const res = await T.dialog.open({ directory: true, multiple: false, title });
  return typeof res === "string" ? res : null;
}

/** Open the native file picker. Returns the chosen path, or null. */
export async function pickFile(
  title?: string,
  filters?: { name: string; extensions: string[] }[],
): Promise<string | null> {
  if (!T?.dialog) return null;
  const res = await T.dialog.open({ directory: false, multiple: false, title, filters });
  return typeof res === "string" ? res : null;
}

/** Open the native save dialog. Returns the chosen path, or null. */
export async function saveFileDialog(
  title?: string,
  defaultPath?: string,
  filters?: { name: string; extensions: string[] }[],
): Promise<string | null> {
  if (!T?.dialog?.save) return null;
  return T.dialog.save({ title, defaultPath, filters });
}
