import { useEffect } from "preact/hooks";
import { activePage } from "@/state/ui";
import type { PageId } from "@/state/ui";
import { ipc } from "@/platform/ipc";
import { initRepos } from "@/state/repos";
import { initApps } from "@/state/apps";
import { initAccounts } from "@/state/accounts";
import { initPulls } from "@/state/pulls";
import { GitBoard, fetchAllRepos } from "@/pages/git-board/GitBoard";
import { AppCenter } from "@/pages/app-center/AppCenter";
import { PullRequests } from "@/pages/pull-requests/PullRequests";
import { Accounts } from "@/pages/accounts/Accounts";
import { Identities, initIdentity } from "@/pages/identities/Identities";
import { Changes } from "@/pages/changes/Changes";
import { startChangesAutoSelect } from "@/state/changes";
import { PrReviewer } from "@/pages/pr-reviewer/PrReviewer";
import { reviewerOpen } from "@/state/reviewer";
import { ConflictResolver } from "@/pages/conflict/ConflictResolver";
import { conflictOpen } from "@/state/conflict";
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

export function App() {
  useEffect(() => {
    void initRepos().then(() => initPulls());
    void initApps();
    void initAccounts();
    void initIdentity();
    startChangesAutoSelect();
    initTooltip();
    void checkForUpdates();

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
    return () => document.removeEventListener("contextmenu", onCtx);
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
