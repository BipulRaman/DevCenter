// Left navigation rail: brand, primary/footer nav items, and the settings
// popover (theme toggle, update check, About dialog). Self-contained shell
// component used by Layout.

import { useRef, useState } from "preact/hooks";
import { activePage, showPage, theme, toggleTheme } from "@/state/ui";
import type { PageId } from "@/state/ui";
import { ipc } from "@/platform/ipc";
import { modal } from "@/components/modal";
import { Raw, ICONS } from "@/lib/ico";
import { useOutsideClick } from "@/lib/floating";
import styles from "./Navigation.module.css";

interface NavDef {
  page: PageId;
  label: string;
  icon: string;
}

const MAIN_NAV: NavDef[] = [
  { page: "git-board", label: "Git Board", icon: ICONS.gitBoard },
  { page: "changes", label: "Changes", icon: ICONS.gitChanges },
  { page: "pull-requests", label: "Pull Requests", icon: ICONS.pr },
  { page: "app-center", label: "App Center", icon: ICONS.appCenter },
];

const FOOTER_NAV: NavDef[] = [
  { page: "git-identities", label: "Identities", icon: ICONS.identity },
  { page: "accounts", label: "Accounts", icon: ICONS.account },
];

function NavItem({ def }: { def: NavDef }) {
  const active = activePage.value === def.page;
  return (
    <button
      class={`${styles.navItem}${active ? ` ${styles.active}` : ""}`}
      onClick={() => showPage(def.page)}
      type="button"
    >
      <Raw html={def.icon} />
      <span>{def.label}</span>
    </button>
  );
}

function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useOutsideClick(wrapRef, () => setOpen(false), open);

  const dark = theme.value === "dark";

  return (
    <div class={styles.railPopWrap} ref={wrapRef}>
      <button
        class={styles.navItem}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Raw html={ICONS.settings} />
        <span>Settings</span>
      </button>
      <div class={styles.settingsPop} role="menu" hidden={!open}>
        <div class={styles.settingsPopTitle}>Settings</div>
        <button
          class={styles.settingsOpt}
          type="button"
          onClick={() => {
            setOpen(false);
            void checkForUpdates();
          }}
        >
          <span class={styles.settingsOptIco}>
            <Raw html={ICONS.sync} />
          </span>
          <span>Check for updates</span>
        </button>
        <button class={styles.settingsOpt} type="button" onClick={() => toggleTheme()}>
          <span class={styles.settingsOptIco}>
            {dark ? <Raw html={ICONS.sun} /> : <Raw html={ICONS.moon} />}
          </span>
          <span>{dark ? "Light theme" : "Dark theme"}</span>
        </button>
        <button
          class={styles.settingsOpt}
          type="button"
          onClick={() => {
            setOpen(false);
            void showAbout();
          }}
        >
          <span class={styles.settingsOptIco}>
            <Raw html={ICONS.info} />
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
      <span class={styles.aboutHead}>
        <span class={styles.aboutLogo}>
          <Raw html={ICONS.brand} />
        </span>
        <span class={styles.aboutId}>
          <span class={styles.aboutName}>{window.BRAND}</span>
          {showVer ? <span class={styles.aboutVer}>Version {version}</span> : null}
        </span>
      </span>
    ),
    body: (close) => (
      <>
        <p class={styles.aboutDesc}>
          A fast desktop companion for your local Git workflow — track repositories, review pull requests across GitHub
          and Azure DevOps, commit changes, and run your local apps, all in one place.
        </p>
        <div class={styles.aboutMeta}>
          <div class={styles.aboutRow}>
            <span class={styles.aboutKey}>Created by</span>
            <a class={styles.aboutLink} href="#" onClick={(e) => { e.preventDefault(); openLink("https://bipul.in"); }}>
              Bipul Raman
            </a>
          </div>
          <div class={styles.aboutRow}>
            <span class={styles.aboutKey}>Website</span>
            <a class={styles.aboutLink} href="#" onClick={(e) => { e.preventDefault(); openLink("https://github.com/BipulRaman/DevCenter"); }}>
              github.com/BipulRaman/DevCenter
            </a>
          </div>
        </div>
        <div class={`modal-foot ${styles.aboutFoot}`}>
          <span class={styles.aboutCopy}>© {year} Bipul Raman</span>
          <button class="btn btn-primary" type="button" onClick={() => close(null)}>
            Close
          </button>
        </div>
      </>
    ),
  });
}

export function Navigation() {
  return (
    <aside class={styles.sidebar}>
      <div class={styles.brand}>
        <div class={styles.brandLogo}>
          <Raw html={ICONS.brand} />
        </div>
        <div class={styles.brandText}>
          <span class={styles.brandName}>{window.BRAND}</span>
          <span class={styles.brandSub}>Desktop</span>
        </div>
      </div>

      <nav class={styles.nav}>
        <span class={styles.navSection}>Workspace</span>
        {MAIN_NAV.map((def) => (
          <NavItem key={def.page} def={def} />
        ))}
      </nav>

      <div class={styles.sidebarFooter}>
        {FOOTER_NAV.map((def) => (
          <NavItem key={def.page} def={def} />
        ))}
        <SettingsMenu />
      </div>
    </aside>
  );
}
