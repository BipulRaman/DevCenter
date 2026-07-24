// Typed backend event subscriptions (Rust core -> UI). These mirror the
// `onReposUpdated` / `onPullsUpdated` / `onAppStatus` / `onAppLog` /
// listeners in app/ui/js/api.js. Each returns a promise of an unsubscribe
// function (no-op in a plain browser).

import { listen } from "@/platform/tauri";
import type {
  AppLogEvent,
  AppStatusEvent,
  Repo,
} from "@/types/models";

export const events = {
  onReposUpdated: (cb: (repos: Repo[]) => void) =>
    listen<Repo[]>("repos_updated", cb),
  onPullsUpdated: (cb: () => void) =>
    listen<unknown>("pull_requests_updated", () => cb()),
  onAppStatus: (cb: (e: AppStatusEvent) => void) =>
    listen<AppStatusEvent>("app_status_changed", cb),
  onAppLog: (cb: (e: AppLogEvent) => void) =>
    listen<AppLogEvent>("app_log", cb),
};

export type Events = typeof events;
