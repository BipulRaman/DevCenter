import { useEffect, useRef, useState } from "preact/hooks";
import { activePage, showPage, theme, toggleTheme } from "@/state/ui";
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
import { ModalHost, modal } from "@/components/modal";
import { MenuHost, openContextMenu } from "@/components/menu";
import { BranchPickerHost } from "@/components/BranchPicker";
import { ICONS } from "@/lib/ico";
import { initTooltip } from "@/lib/tooltip";
import {
  AccountIcon,
  AppCenterIcon,
  BrandIcon,
  ChangesIcon,
  GitBoardIcon,
  IdentityIcon,
  InfoIcon,
  MoonIcon,
  PullRequestIcon,
  RefreshIcon,
  SettingsIcon,
  SunIcon,
} from "@/lib/icons";
import type { ComponentChildren, JSX } from "preact";

interface NavDef {
  page: PageId;
  label: string;
  Icon: (p: { size?: number }) => JSX.Element;
}

const MAIN_NAV: NavDef[] = [
  { page: "git-board", label: "Git Board", Icon: GitBoardIcon },
  { page: "changes", label: "Changes", Icon: ChangesIcon },
  { page: "pull-requests", label: "Pull Requests", Icon: PullRequestIcon },
  { page: "app-center", label: "App Center", Icon: AppCenterIcon },
];

const FOOTER_NAV: NavDef[] = [
  { page: "git-identities", label: "Identities", Icon: IdentityIcon },
  { page: "accounts", label: "Accounts", Icon: AccountIcon },
];

function NavItem({ def }: { def: NavDef }) {
  const active = activePage.value === def.page;
  return (
    <button
      class={`nav-item${active ? " active" : ""}`}
      onClick={() => showPage(def.page)}
      type="button"
    >
      <def.Icon size={18} />
      <span>{def.label}</span>
    </button>
  );
}

function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const dark = theme.value === "dark";

  return (
    <div class="rail-pop-wrap" ref={wrapRef}>
      <button
        class="nav-item"
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <SettingsIcon size={18} />
        <span>Settings</span>
      </button>
      <div class="settings-pop" role="menu" hidden={!open}>
        <div class="settings-pop-title">Settings</div>
        <button
          class="settings-opt"
          type="button"
          onClick={() => {
            setOpen(false);
            void checkForUpdates();
          }}
        >
          <span class="settings-opt-ico">
            <RefreshIcon size={16} />
          </span>
          <span>Check for updates</span>
        </button>
        <button class="settings-opt" type="button" onClick={() => toggleTheme()}>
          <span class="settings-opt-ico">
            {dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
          </span>
          <span>{dark ? "Light theme" : "Dark theme"}</span>
        </button>
        <button
          class="settings-opt"
          type="button"
          onClick={() => {
            setOpen(false);
            void showAbout();
          }}
        >
          <span class="settings-opt-ico">
            <InfoIcon size={16} />
          </span>
          <span>About</span>
        </button>
      </div>
    </div>
  );
}

async function checkForUpdates() {
  if (!ipc.hasBackend) return;
  try {
    const result = await ipc.checkForUpdates();
    const status = (result as { status?: string; version?: string })?.status;
    if (status === "up_to_date") {
      await modal.alert({ title: "Up to date", message: "You're already on the latest version." });
    } else if (status === "not_configured") {
      await modal.alert({
        title: "Updates unavailable",
        message: "In-app updates aren't available for this build. Download the latest release from GitHub.",
      });
    } else if (status === "available") {
      const version = (result as { version?: string })?.version || "";
      const go = await modal.confirm({
        title: "Update available",
        message: `${window.BRAND} ${version} is available. Install it now? ${window.BRAND} will restart to finish updating.`,
        confirmText: "Update & restart",
      });
      if (go) await ipc.installUpdate();
    }
  } catch (e) {
    await modal.alert({ title: "Update check failed", message: String(e) });
  }
}

async function showAbout() {
  const version = await ipc.appVersion().catch(() => "browser");
  const showVer = version && version !== "browser";
  const year = new Date().getFullYear();
  const openLink = (url: string) => {
    if (ipc.hasBackend) ipc.openUrl(url).catch(() => {});
    else window.open(url, "_blank");
  };
  await modal.custom<null>({
    title: (
      <span class="about-head">
        <span class="about-logo">
          <BrandIcon size={24} />
        </span>
        <span class="about-id">
          <span class="about-name">{window.BRAND}</span>
          {showVer ? <span class="about-ver">Version {version}</span> : null}
        </span>
      </span>
    ),
    body: (close) => (
      <>
        <p class="about-desc">
          A fast desktop companion for your local Git workflow — track repositories, review pull requests across GitHub
          and Azure DevOps, commit changes, and run your local apps, all in one place.
        </p>
        <div class="about-meta">
          <div class="about-row">
            <span class="about-key">Created by</span>
            <a class="about-link" href="#" onClick={(e) => { e.preventDefault(); openLink("https://bipul.in"); }}>
              Bipul Raman
            </a>
          </div>
          <div class="about-row">
            <span class="about-key">Website</span>
            <a class="about-link" href="#" onClick={(e) => { e.preventDefault(); openLink("https://github.com/BipulRaman/DevCenter"); }}>
              github.com/BipulRaman/DevCenter
            </a>
          </div>
        </div>
        <div class="modal-foot about-foot">
          <span class="about-copy">© {year} Bipul Raman</span>
          <button class="btn btn-primary" type="button" onClick={() => close(null)}>
            Close
          </button>
        </div>
      </>
    ),
  });
}

function Sidebar() {
  return (
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-logo">
          <BrandIcon size={22} />
        </div>
        <div class="brand-text">
          <span class="brand-name">{window.BRAND}</span>
          <span class="brand-sub">Desktop</span>
        </div>
      </div>

      <nav class="nav">
        <span class="nav-section">Workspace</span>
        {MAIN_NAV.map((def) => (
          <NavItem key={def.page} def={def} />
        ))}
      </nav>

      <div class="sidebar-footer">
        {FOOTER_NAV.map((def) => (
          <NavItem key={def.page} def={def} />
        ))}
        <SettingsMenu />
      </div>
    </aside>
  );
}

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
    <div class="app">
      <Sidebar />
      <main class="main">
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
      </main>
      <ModalHost />
      <MenuHost />
      <BranchPickerHost />
    </div>
  );
}
