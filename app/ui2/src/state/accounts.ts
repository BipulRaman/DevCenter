// Accounts data — GitHub / Azure DevOps accounts used to load pull requests.
// Ported from the account parts of app/ui/js/backend.js.

import { signal } from "@preact/signals";
import { ipc } from "@/platform/ipc";
import type { Account } from "@/types/models";

export const accounts = signal<Account[]>([]);
export const accountsLoaded = signal(false);

let started = false;

export async function initAccounts(): Promise<void> {
  if (started) return;
  started = true;
  await refreshAccounts();
}

export async function refreshAccounts(): Promise<void> {
  if (!ipc.hasBackend) {
    accountsLoaded.value = true;
    return;
  }
  try {
    const data = await ipc.listAccounts();
    if (Array.isArray(data)) accounts.value = data;
  } catch (e) {
    console.error("listAccounts failed", e);
  } finally {
    accountsLoaded.value = true;
  }
}

export function upsertAccount(a: Account): void {
  const at = accounts.value.findIndex((x) => x.id === a.id);
  if (at >= 0) {
    const next = accounts.value.slice();
    next[at] = a;
    accounts.value = next;
  } else {
    accounts.value = [...accounts.value, a];
  }
}

export function removeAccountLocal(id: string): void {
  accounts.value = accounts.value.filter((a) => a.id !== id);
}
