import { useEffect } from "preact/hooks";
import { activePage, firePageShow, onPageShow } from "@/state/ui";
import type { PageId } from "@/state/ui";
import { ipc } from "@/platform/ipc";
import { initRepos, refreshRepos } from "@/state/repos";
import { initApps, refreshApps } from "@/state/apps";
import { initAccounts } from "@/state/accounts";
import { hydratePulls, initPulls } from "@/state/pulls";
import { GitBoard, fetchAllRepos } from "@/pages/git-board/GitBoard";
import { AppCenter } from "@/pages/app-center/AppCenter";
import { PullRequests } from "@/pages/pull-requests/PullRequests";
import { Accounts } from "@/pages/accounts/Accounts";
import { Identities, initIdentity, refreshIdentity } from "@/pages/identities/Identities";
import { Changes } from "@/pages/changes/Changes";
import { refreshActiveChangesTab, startChangesAutoSelect } from "@/state/changes";
import { PrReviewer } from "@/pages/pr-reviewer/PrReviewer";
import { reviewerOpen } from "@/state/reviewer";
import { ConflictResolver } from "@/pages/conflict/ConflictResolver";
import { conflictActiveFile, conflictInfo, conflictOpen, refreshConflict } from "@/state/conflict";
import { openContextMenu } from "@/components/menu";
import { ICONS } from "@/lib/ico";
import { initTooltip } from "@/lib/tooltip";
import { checkForUpdates } from "@/lib/updater";
import { Layout } from "@/components/Layout";
import type { ComponentChildren } from "preact";

/** Bare page section for pages that render their own <header class="page-head">. */
function PageShell({ id, children }: { id: PageId; children?: ComponentChildren }) {
  const active = activePage.value === id && !reviewerOpen.value && !conflictOpen.value;
  return (
    <section class={`page${active ? " active" : ""}`} id={`page-${id}`}>
      {children}
    </section>
  );
}

/**
 * Keep every page's data fresh: pages stay mounted, so without this they'd
 * keep showing whatever was loaded first (e.g. uncommitted edits made in VS
 * Code wouldn't appear on the Changes page after switching back to it).
 *  - "show":  navigating to a page re-fetches its data.
 *  - "focus": regaining window focus re-fetches the active page's *local*
 *    state (git/working tree, config files); network-backed PR lists are left
 *    to explicit navigation/refresh to avoid hammering provider APIs.
 * Returns a cleanup function.
 */
function registerPageRefresh(): () => void {
  if (!ipc.hasBackend) return () => {};
  const offs = [
    onPageShow("git-board", () => void refreshRepos()),
    onPageShow("changes", (reason) => void refreshActiveChangesTab(reason === "show")),
    onPageShow("pull-requests", (reason) => {
      if (reason === "show") void hydratePulls();
    }),
    onPageShow("app-center", (reason) => {
      if (reason === "show") void refreshApps();
    }),
    onPageShow("git-identities", () => void refreshIdentity()),
  ];

  // focus + visibilitychange can both fire when the window is restored.
  let lastFocus = 0;
  const onFocus = () => {
    const now = Date.now();
    if (now - lastFocus < 1000) return;
    lastFocus = now;
    if (reviewerOpen.value) return;
    if (conflictOpen.value) {
      // Files may have been resolved (and `git add`-ed) in VS Code meanwhile.
      void refreshConflict().then(() => {
        const files = conflictInfo.value.files;
        if (conflictActiveFile.value && !files.includes(conflictActiveFile.value)) {
          conflictActiveFile.value = files[0] || null;
        }
      });
      return;
    }
    firePageShow(activePage.value, "focus");
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") onFocus();
  };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    offs.forEach((off) => off());
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

export function App() {
  useEffect(() => {
    void initRepos().then(() => initPulls());
    void initApps();
    void initAccounts();
    void initIdentity();
    startChangesAutoSelect();
    initTooltip();
    void checkForUpdates();
    const unhook = registerPageRefresh();

    // Replace the WebView's default right-click menu with a single useful action
    // (Reload), plus Fetch All on the Git Board. App-specific menus call
    // preventDefault first, so they're left untouched. Text fields keep native.
    const onCtx = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      const items = [{ label: "Reload", icon: ICONS.sync, onClick: () => location.reload() }];
      if (activePage.value === "git-board" && ipc.hasBackend) {
        items.push({ label: "Fetch All", icon: ICONS.sync, onClick: () => void fetchAllRepos() });
      }
      openContextMenu(e.clientX, e.clientY, items);
    };
    document.addEventListener("contextmenu", onCtx);
    return () => {
      document.removeEventListener("contextmenu", onCtx);
      unhook();
    };
  }, []);

  return (
    <Layout>
      <PageShell id="git-board">
        <GitBoard />
      </PageShell>
      <PageShell id="changes">
        <Changes />
      </PageShell>
      <PageShell id="pull-requests">
        <PullRequests />
      </PageShell>
      <PageShell id="app-center">
        <AppCenter />
      </PageShell>
      <PageShell id="git-identities">
        <Identities />
      </PageShell>
      <PageShell id="accounts">
        <Accounts />
      </PageShell>
      <PrReviewer />
      <ConflictResolver />
    </Layout>
  );
}
