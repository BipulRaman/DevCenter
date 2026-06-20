// ============ DevCenter — desktop UI ============

// Bridge to the Rust backend (window.DevCenter, from js/api.js).
// In a plain browser hasBackend === false; data simply stays empty.
const DC = window.DevCenter;

// ---------- Live data (populated by the backend in the desktop app) ----------
let repos = [];
let apps = [];
let pulls = [];

// ---------- Icons ----------
const ICON = {
  branch: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 8.25C21 6.1815 19.3185 4.5 17.25 4.5C15.1815 4.5 13.5 6.1815 13.5 8.25C13.5 10.023 14.739 11.5035 16.395 11.892C16.116 12.819 15.2655 13.5 14.25 13.5H9.75C8.9025 13.5 8.1285 13.7925 7.5 14.268V7.4235C9.21 7.0755 10.5 5.5605 10.5 3.75C10.5 1.6815 8.8185 0 6.75 0C4.6815 0 3 1.6815 3 3.75C3 5.562 4.29 7.0755 6 7.4235V16.575C4.29 16.923 3 18.438 3 20.2485C3 22.317 4.6815 23.9985 6.75 23.9985C8.8185 23.9985 10.5 22.317 10.5 20.2485C10.5 18.4755 9.261 16.995 7.605 16.6065C7.884 15.6795 8.7345 14.9985 9.75 14.9985H14.25C16.0845 14.9985 17.61 13.6725 17.931 11.9295C19.674 11.607 21 10.0845 21 8.25ZM4.5 3.75C4.5 2.5095 5.5095 1.5 6.75 1.5C7.9905 1.5 9 2.5095 9 3.75C9 4.9905 7.9905 6 6.75 6C5.5095 6 4.5 4.9905 4.5 3.75ZM9 20.25C9 21.4905 7.9905 22.5 6.75 22.5C5.5095 22.5 4.5 21.4905 4.5 20.25C4.5 19.0095 5.5095 18 6.75 18C7.9905 18 9 19.0095 9 20.25ZM17.25 10.5C16.0095 10.5 15 9.4905 15 8.25C15 7.0095 16.0095 6 17.25 6C18.4905 6 19.5 7.0095 19.5 8.25C19.5 9.4905 18.4905 10.5 17.25 10.5Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>',
  repo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6a2 2 0 0 1 2-2h14v16H5a2 2 0 0 1-2-2Z"/><path d="M19 16H5a2 2 0 0 0-2 2"/></svg>',
  sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>',
  terminal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>',
  logs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 2.5 2L7 13"/><line x1="12.5" y1="13" x2="16" y2="13"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>',
  pr: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M13 10.05V5.5C13 4.12 11.88 3 10.5 3H8.71L9.85 1.85C10.05 1.66 10.05 1.34 9.85 1.15C9.66 0.95 9.34 0.95 9.15 1.15L7.15 3.15C6.95 3.34 6.95 3.66 7.15 3.85L9.15 5.85C9.34 6.05 9.66 6.05 9.85 5.85C10.05 5.66 10.05 5.34 9.85 5.15L8.71 4H10.5C11.33 4 12 4.67 12 5.5V10.05C10.86 10.28 10 11.29 10 12.5C10 13.88 11.12 15 12.5 15C13.88 15 15 13.88 15 12.5C15 11.29 14.14 10.28 13 10.05ZM12.5 14C11.67 14 11 13.33 11 12.5C11 11.67 11.67 11 12.5 11C13.33 11 14 11.67 14 12.5C14 13.33 13.33 14 12.5 14ZM6 3.5C6 2.12 4.88 1 3.5 1C2.12 1 1 2.12 1 3.5C1 4.71 1.86 5.72 3 5.95V10.051C1.86 10.283 1 11.293 1 12.5C1 13.879 2.122 15 3.5 15C4.878 15 6 13.879 6 12.5C6 11.292 5.14 10.283 4 10.051V5.95C5.14 5.72 6 4.71 6 3.5ZM2 3.5C2 2.67 2.67 2 3.5 2C4.33 2 5 2.67 5 3.5C5 4.33 4.33 5 3.5 5C2.67 5 2 4.33 2 3.5ZM5 12.5C5 13.327 4.327 14 3.5 14C2.673 14 2 13.327 2 12.5C2 11.673 2.673 11 3.5 11C4.327 11 5 11.673 5 12.5Z"/></svg>',
  merge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>',
  comment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
  changes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.2A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.3 13.3 0 0 1-2.2 3M6.6 6.6A13.3 13.3 0 0 0 2 11s3.5 7 10 7a9 9 0 0 0 4-1M3 3l18 18"/></svg>',
  caret: '<svg class="chip-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  dot: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="5"/></svg>',
  github: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0C17 4.7 18 5 18 5c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/></svg>',
  azure: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v14.651l-5.753 4.9-9.303-3.057v3.056l-5.978-7.416 15.057 1.798V5.415z"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.2 8.2a2 2 0 0 0 2.8 0l6.8-6.8a2 2 0 0 0 0-2.8Z"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
  vscode: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.15 2.587 18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
};

// Provider glyph for a repo/account ("github" | "azure" | other).
function providerIcon(p) {
  return p === "github" ? ICON.github : p === "azure" ? ICON.azure : ICON.repo;
}

// ---------- Navigation ----------
const navItems = document.querySelectorAll(".nav-item[data-page]");
const pages = document.querySelectorAll(".page");

function showPage(page) {
  navItems.forEach((n) => n.classList.toggle("active", n.dataset.page === page));
  pages.forEach((p) => p.classList.toggle("active", p.id === `page-${page}`));
  try { localStorage.setItem("dc.page", page); } catch (e) {}
  if (page === "changes" && window.ChangesPage) window.ChangesPage.onShow();
}

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    showPage(item.dataset.page);
  });
});

// Elevate the sticky page header once content scrolls beneath it.
const mainScroll = document.querySelector(".main");
if (mainScroll) {
  mainScroll.addEventListener(
    "scroll",
    () => {
      const stuck = mainScroll.scrollTop > 4;
      document.querySelectorAll(".page-head").forEach((h) => h.classList.toggle("stuck", stuck));
    },
    { passive: true }
  );
}

// ---------- Settings popover + theme toggle ----------
(function () {
  const SUN =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
  const MOON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>';
  const btn = document.getElementById("settingsBtn");
  const menu = document.getElementById("settingsMenu");
  const themeBtn = document.getElementById("themeToggle");
  const updateBtn = document.getElementById("checkUpdateBtn");
  const themeIco = document.getElementById("themeIco");
  const themeLabel = document.getElementById("themeLabel");
  if (!btn || !menu) return;

  function syncThemeUI() {
    const dark = document.documentElement.getAttribute("data-theme") !== "light";
    if (themeIco) themeIco.innerHTML = dark ? SUN : MOON;
    if (themeLabel) themeLabel.textContent = dark ? "Switch to light theme" : "Switch to dark theme";
  }
  function close() {
    menu.hidden = true;
    btn.classList.remove("settings-open");
    btn.setAttribute("aria-expanded", "false");
  }
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    btn.classList.toggle("settings-open", open);
    btn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const root = document.documentElement;
      root.setAttribute("data-theme", root.getAttribute("data-theme") === "light" ? "dark" : "light");
      syncThemeUI();
    });
  }
  if (updateBtn) {
    updateBtn.addEventListener("click", async () => {
      if (!DC || !DC.hasBackend || !DC.checkForUpdates) return;
      try {
        const result = await DC.checkForUpdates();
        if (result && result.status === "up_to_date") {
          await Modal.alert({ title: "Up to date", message: "You're already on the latest version." });
        } else if (result && result.status === "available") {
          const go = await Modal.confirm({
            title: "Update available",
            message: `DevCenter ${result.version || ""} is available. Install it now? DevCenter will restart to finish updating.`,
            confirmText: "Update & restart",
          });
          if (go) await DC.installUpdate();
        }
      } catch (e) {
        await Modal.alert({ title: "Update check failed", message: String(e) });
      }
    });
  }

  const aboutBtn = document.getElementById("aboutBtn");
  if (aboutBtn) aboutBtn.addEventListener("click", () => { close(); openAbout(); });

  async function openAbout() {
    let version = "";
    try { version = DC && DC.appVersion ? await DC.appVersion() : ""; } catch (_) {}
    const showVer = version && version !== "browser";
    const LOGO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>';
    const GLOBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/></svg>';
    const year = new Date().getFullYear();
    await Modal.custom({
      title: "",
      render: (body, foot, closeModal) => {
        const titleEl = document.getElementById("modalTitle");
        titleEl.innerHTML =
          '<span class="about-head"><span class="about-logo">' + LOGO + '</span>' +
          '<span class="about-id"><span class="about-name">DevCenter</span>' +
          '<span class="about-ver"></span>' +
          '</span></span>';
        const verEl = titleEl.querySelector(".about-ver");
        if (showVer) verEl.textContent = "Version " + version;
        else verEl.remove();
        body.innerHTML =
          '<p class="about-desc">A fast desktop companion for your local Git workflow — track repositories, review pull requests across GitHub and Azure DevOps, commit changes, and run your local apps, all in one place.</p>' +
          '<div class="about-meta">' +
            '<div class="about-row"><span class="about-key">Created by</span><a class="about-link" href="#" data-url="https://bipul.in">Bipul Raman</a></div>' +
            '<div class="about-row"><span class="about-key">Website</span><a class="about-link" href="#" data-url="https://github.com/BipulRaman/DevCenter">' + GLOBE + '<span>github.com/BipulRaman/DevCenter</span></a></div>' +
          '</div>';
        foot.classList.add("about-foot");
        foot.innerHTML = '<span class="about-copy">\u00a9 ' + year + ' Bipul Raman</span>';
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-primary";
        btn.textContent = "Close";
        btn.addEventListener("click", () => closeModal(null));
        foot.appendChild(btn);
        body.querySelectorAll(".about-link").forEach((a) => {
          a.addEventListener("click", (e) => {
            e.preventDefault();
            const url = a.dataset.url;
            if (DC && DC.openUrl) DC.openUrl(url); else window.open(url, "_blank");
          });
        });
        setTimeout(() => btn.focus(), 40);
      },
    });
    const f = document.getElementById("modalFoot");
    if (f) f.classList.remove("about-foot");
  }

  syncThemeUI();
})();

// ---------- Git Board render ----------

// Derive the "account" a repo belongs to from its remote: the GitHub owner or
// the Azure DevOps organization. Returns null for repos with no usable remote.
function repoAccount(r) {
  const segs = (r.remote || "").split("/").filter(Boolean);
  if (r.provider === "github") {
    const owner = segs[1] || "";
    return owner ? { key: "github:" + owner.toLowerCase(), label: owner, provider: "github" } : null;
  }
  if (r.provider === "azure") {
    const host = segs[0] || "";
    const org = host.includes(".visualstudio.com") ? host.replace(".visualstudio.com", "") : segs[1] || "";
    return org ? { key: "azure:" + org.toLowerCase(), label: org, provider: "azure" } : null;
  }
  const host = segs[0] || "";
  return host ? { key: "other:" + host.toLowerCase(), label: host, provider: "other" } : null;
}

let repoAccountFilter = new Set(); // selected account keys; empty = all

function renderAccountFilter() {
  const select = document.getElementById("repoAccountSelect");
  const menu = document.getElementById("repoAccountMenu");
  const label = document.getElementById("repoAccountLabel");
  if (!select || !menu) return;
  const map = new Map(); // key -> { label, provider, count }
  repos.forEach((r) => {
    const a = repoAccount(r);
    if (!a) return;
    const e = map.get(a.key) || { label: a.label, provider: a.provider, count: 0 };
    e.count++;
    map.set(a.key, e);
  });
  if (map.size === 0) {
    select.hidden = true;
    repoAccountFilter.clear();
    return;
  }
  select.hidden = false;
  // Drop any selected accounts that no longer exist.
  repoAccountFilter = new Set([...repoAccountFilter].filter((k) => map.has(k)));
  const keys = [...map.keys()].sort((x, y) => map.get(x).label.localeCompare(map.get(y).label));
  const icon = (p) => (p === "github" ? ICON.github : p === "azure" ? ICON.azure : ICON.repo);

  menu.innerHTML =
    `<label class="multiselect-opt all">
       <input type="checkbox" id="repoAccountAll" ${repoAccountFilter.size === 0 ? "checked" : ""} />
       <span>All accounts</span>
     </label>
     <div class="multiselect-sep"></div>` +
    keys
      .map((k) => {
        const e = map.get(k);
        return `<label class="multiselect-opt">
          <input type="checkbox" value="${escapeHtml(k)}" ${repoAccountFilter.has(k) ? "checked" : ""} />
          <span class="multiselect-ico">${icon(e.provider)}</span>
          <span>${escapeHtml(e.label)}</span>
          <span class="multiselect-count">${e.count}</span>
        </label>`;
      })
      .join("");

  if (repoAccountFilter.size === 0) label.textContent = "All accounts";
  else if (repoAccountFilter.size === 1) label.textContent = map.get([...repoAccountFilter][0])?.label || "1 account";
  else label.textContent = `${repoAccountFilter.size} accounts`;

  // Show the provider icon on the button when exactly one account is selected,
  // otherwise the default "accounts" glyph.
  const iconHost = document.getElementById("repoAccountIcon");
  if (iconHost) {
    const DEFAULT_ACCT_ICON =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 10h18"/></svg>';
    if (repoAccountFilter.size === 1) {
      iconHost.innerHTML = icon(map.get([...repoAccountFilter][0])?.provider);
    } else {
      iconHost.innerHTML = DEFAULT_ACCT_ICON;
    }
  }

  const allBox = document.getElementById("repoAccountAll");
  if (allBox) {
    allBox.addEventListener("change", () => {
      repoAccountFilter.clear();
      renderRepos(document.getElementById("repoSearch").value || "");
    });
  }
  menu.querySelectorAll('input[type="checkbox"][value]').forEach((box) => {
    box.addEventListener("change", () => {
      if (box.checked) repoAccountFilter.add(box.value);
      else repoAccountFilter.delete(box.value);
      renderRepos(document.getElementById("repoSearch").value || "");
    });
  });
}

let repoTagFilter = new Set(); // selected tags; empty = all

function renderRepos(filter = "") {
  if (typeof Dropdown !== "undefined") Dropdown.close();
  const f = filter.toLowerCase();
  const list = repos.filter((r) => {
    const tags = r.tags || [];
    const matchText =
      r.name.toLowerCase().includes(f) ||
      r.remote.toLowerCase().includes(f) ||
      tags.some((t) => t.toLowerCase().includes(f));
    const matchTag = repoTagFilter.size === 0 || tags.some((t) => repoTagFilter.has(t));
    const acct = repoAccount(r);
    const matchAcct = repoAccountFilter.size === 0 || (acct && repoAccountFilter.has(acct.key));
    return matchText && matchTag && matchAcct;
  });
  renderAccountFilter();
  renderTagFilter();
  document.getElementById("repoGrid").innerHTML = list
    .map((r) => {
      const i = repos.indexOf(r);
      const dirtyChip =
        r.status === "dirty"
          ? `<span class="chip dirty-chip" title="Uncommitted changes">${ICON.dot}Uncommitted</span>`
          : "";
      const aheadN = r.ahead || 0;
      const behindN = r.behind || 0;
      const syncChip =
        aheadN || behindN
          ? `<span class="chip sync-chip" title="${aheadN} ahead, ${behindN} behind">${
              aheadN ? `<span>${ICON.up}${aheadN}</span>` : ""
            }${behindN ? `<span>${ICON.down}${behindN}</span>` : ""}</span>`
          : "";
      const dotClass = r.status === "dirty" ? "error" : "running";
      const tagChips = (r.tags || [])
        .map((t) => `<span class="chip tag-chip">${ICON.tag}${escapeHtml(t)}</span>`)
        .join("");
      const watchBtn = r.watched
        ? `<button class="btn btn-ghost btn-sm watching" data-watch="${i}" title="Stop watching PRs">${ICON.eye}Watching</button>`
        : `<button class="btn btn-ghost btn-sm" data-watch="${i}" title="Watch this repo's PRs">${ICON.eyeOff}Watch PRs</button>`;
      const branchChip =
        DC && DC.hasBackend
          ? `<button class="chip branch switchable" data-branch="${i}" title="Switch branch">${ICON.branch}${r.branch}${ICON.caret}</button>`
          : `<span class="chip branch">${ICON.branch}${r.branch}</span>`;
      return `
      <div class="repo-row ${dotClass}">
        <div class="repo-icon ${r.provider}">${providerIcon(r.provider)}</div>
        <div class="repo-main">
          <div class="repo-title-row">
            <span class="repo-name repo-open-link" data-open-changes="${i}" title="Open in Changes">${r.name}</span>
            ${branchChip}
            ${syncChip}${dirtyChip}${tagChips}
          </div>
          <div class="repo-sub">
            <span class="repo-path">${r.path}</span>
            <span class="repo-dot">·</span>
            <span>${ICON.sync}Fetched ${r.lastFetch}</span>
          </div>
        </div>
        <div class="repo-actions">
          ${watchBtn}
          <button class="btn btn-icon btn-sm" data-fetch="${i}" title="Fetch">${ICON.sync}</button>
          <button class="btn btn-icon btn-sm" data-menu="${i}" title="More actions">${ICON.more}</button>
        </div>
      </div>`;
    })
    .join("");
  if (!list.length)
    document.getElementById("repoGrid").innerHTML = empty(
      f || repoTagFilter.size || repoAccountFilter.size
        ? "No repositories match your filters."
        : "No repositories yet. Clone or add an existing one to get started."
    );

  // Scope every row-button query to the repo grid so they never bind to App
  // Center kebabs, which also use [data-menu]. A document-wide query here would
  // cross-wire the two pages' menus.
  const grid = document.getElementById("repoGrid");

  // Open the selected repository directly in the Changes page.
  grid.querySelectorAll("[data-open-changes]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const idx = Number(el.dataset.openChanges);
      const r = repos[idx];
      if (!r) return;
      showPage("changes");
      if (window.ChangesPage && typeof window.ChangesPage.openRepoById === "function") {
        window.ChangesPage.openRepoById(r.id);
      }
    });
  });

  grid.querySelectorAll("[data-watch]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.watch);
      repos[idx].watched = !repos[idx].watched;
      if (DC && DC.hasBackend) DC.setWatched(repos[idx].id, repos[idx].watched).catch((e) => console.error("setWatched failed", e));
      renderRepos(document.getElementById("repoSearch").value);
      refreshPrRepoFilter();
      renderPrStats();
      renderPulls(document.getElementById("prSearch").value);
      if (DC && DC.hasBackend) hydratePulls();
    });
  });

  // Kebab menu — Add tag, Open folder, Terminal, Remove.
  const removeRepo = async (r) => {
    const ok = await Modal.confirm({
      title: "Remove repository",
      message: `Remove “${r.name}” from DevCenter? This only removes it from the list — the files on disk are left untouched.`,
      confirmText: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      if (DC && DC.hasBackend) await DC.removeRepo(r.id);
      repos = repos.filter((x) => x.id !== r.id);
      rerenderGit();
      if (DC && DC.hasBackend) hydratePulls();
    } catch (e) {
      console.error("removeRepo failed", e);
      await Modal.alert({ title: "Couldn't remove repository", message: String(e) });
    }
  };

  // Fetch from the remote, then refresh the affected row.
  const fetchRepoAction = async (r) => {
    if (!DC || !DC.hasBackend) return;
    try {
      const updated = await DC.fetchRepo(r.id);
      const at = repos.findIndex((x) => x.id === updated.id);
      if (at >= 0) repos[at] = updated;
      renderRepos(document.getElementById("repoSearch").value);
    } catch (e) {
      console.error("fetchRepo failed", e);
      await Modal.alert({ title: "Fetch failed", message: String(e) });
    }
  };

  // Toggle PR watching for a repo and refresh dependent views.
  const toggleWatch = (r) => {
    const idx = repos.findIndex((x) => x.id === r.id);
    if (idx < 0) return;
    repos[idx].watched = !repos[idx].watched;
    if (DC && DC.hasBackend) DC.setWatched(repos[idx].id, repos[idx].watched).catch((e) => console.error("setWatched failed", e));
    renderRepos(document.getElementById("repoSearch").value);
    refreshPrRepoFilter();
    renderPrStats();
    renderPulls(document.getElementById("prSearch").value);
    if (DC && DC.hasBackend) hydratePulls();
  };

  // Open the repository in the Changes page on a specific tab ("changes" | "history" | "pulls").
  const openInChanges = (r, tab) => {
    showPage("changes");
    const cp = window.ChangesPage;
    if (cp && typeof cp.openRepoTab === "function") cp.openRepoTab(r.id, tab || "changes");
    else if (cp && typeof cp.openRepoById === "function") cp.openRepoById(r.id);
  };

  // The full set of repo actions, shared by the kebab and the right-click menu.
  const repoMenuItems = (r) => {
    const items = [
      { label: "View Changes", icon: ICON.changes, onClick: () => openInChanges(r, "changes") },
      { label: "View Commits", icon: ICON.clock, onClick: () => openInChanges(r, "history") },
      { label: "View Pull Requests", icon: ICON.pr, onClick: () => openInChanges(r, "pulls") },
    ];
    items.push({ separator: true });
    if (DC && DC.hasBackend) items.push({ label: "Fetch", icon: ICON.sync, onClick: () => fetchRepoAction(r) });
    items.push({ label: r.watched ? "Stop watching PRs" : "Watch PRs", icon: r.watched ? ICON.eye : ICON.eyeOff, onClick: () => toggleWatch(r) });
    items.push({ separator: true });
    items.push({ label: "Edit tags", icon: ICON.tag, onClick: () => openTagEditor(r) });
    if (DC && DC.hasBackend) {
      items.push(
        { label: "Open folder", icon: ICON.folder, onClick: () => DC.openPath(r.path).catch((e) => console.error("openPath failed", e)) },
        { label: "Open terminal", icon: ICON.terminal, onClick: () => DC.openTerminal(r.path).catch((e) => console.error("openTerminal failed", e)) }
      );
      if (hasVscode) items.push({ label: "Open in VS Code", icon: ICON.vscode, onClick: () => DC.openInVscode(r.path).catch((e) => console.error("openInVscode failed", e)) });
    }
    items.push({ separator: true });
    items.push({ label: "Remove from list", icon: ICON.trash, danger: true, onClick: () => removeRepo(r) });
    return items;
  };
  grid.querySelectorAll("[data-menu]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (Dropdown.isOpenFor(btn)) { Dropdown.close(); return; }
      const r = repos[Number(btn.dataset.menu)];
      Dropdown.menu(btn, repoMenuItems(r));
    });
  });

  // Right-click anywhere on a repo card opens the same full actions menu.
  grid.querySelectorAll(".repo-row").forEach((row, k) => {
    row.addEventListener("contextmenu", (e) => {
      const r = list[k];
      if (!r) return;
      e.preventDefault();
      e.stopPropagation();
      Dropdown.context(e.clientX, e.clientY, repoMenuItems(r));
    });
  });

  // Fetch (desktop only) — pulls from the remote, then refreshes the row
  grid.querySelectorAll("[data-fetch]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!DC || !DC.hasBackend) return;
      const r = repos[Number(btn.dataset.fetch)];
      btn.disabled = true;
      btn.innerHTML = `<span class="spin">${ICON.sync}</span>`;
      try {
        const updated = await DC.fetchRepo(r.id);
        const at = repos.findIndex((x) => x.id === updated.id);
        if (at >= 0) repos[at] = updated;
        renderRepos(document.getElementById("repoSearch").value);
      } catch (e) {
        console.error("fetchRepo failed", e);
        await Modal.alert({ title: "Fetch failed", message: String(e) });
        btn.disabled = false;
        btn.innerHTML = ICON.sync;
      }
    });
  });

  // Switch branch (desktop only) — click the branch chip to open an anchored dropdown
  grid.querySelectorAll("[data-branch]").forEach((chip) => {
    chip.addEventListener("click", async () => {
      if (!DC || !DC.hasBackend || chip.classList.contains("loading")) return;
      if (Dropdown.isOpenFor(chip)) { Dropdown.close(); return; }
      const r = repos[Number(chip.dataset.branch)];
      let branches;
      chip.classList.add("loading");
      try {
        branches = await DC.listBranches(r.id);
      } catch (e) {
        console.error("listBranches failed", e);
        await Modal.alert({ title: "Couldn't load branches", message: String(e) });
        chip.classList.remove("loading");
        return;
      }
      chip.classList.remove("loading");
      Dropdown.open(chip, {
        header: "Switch branch",
        headerAction: {
          label: "New branch",
          icon: ICON.plus,
          title: "Create a new branch",
          onClick: () =>
            openNewBranchDialog({
              branches,
              current: r.branch,
              onCreate: async (name, base) => {
                try {
                  const updated = await DC.createBranch(r.id, name, base);
                  const at = repos.findIndex((x) => x.id === updated.id);
                  if (at >= 0) repos[at] = updated;
                  renderRepos(document.getElementById("repoSearch").value);
                } catch (e) {
                  console.error("createBranch failed", e);
                  await Modal.alert({ title: "Couldn't create branch", message: String(e) });
                }
              },
            }),
        },
        options: branches,
        current: r.branch,
        search: true,
        searchPlaceholder: "Filter branches…",
        optionKind: "branch",
        optionIcon: () => ICON.branch,
        emptyText: "No local branches.",
        onContext: (opt, isCur, ev) =>
          openBranchContextMenu(ev, {
            repoId: r.id,
            branch: opt,
            isCurrent: isCur,
            branches,
            onChanged: (updated) => {
              if (updated) {
                const at = repos.findIndex((x) => x.id === updated.id);
                if (at >= 0) repos[at] = updated;
              }
              Dropdown.close();
              renderRepos(document.getElementById("repoSearch").value);
            },
          }),
        onSelect: async (target) => {
          try {
            const updated = await performBranchSwitch({
              repoId: r.id,
              current: r.branch,
              target,
              dirty: r.status === "dirty",
            });
            if (!updated) return; // cancelled
            const at = repos.findIndex((x) => x.id === updated.id);
            if (at >= 0) repos[at] = updated;
            renderRepos(document.getElementById("repoSearch").value);
          } catch (e) {
            console.error("checkout failed", e);
            await Modal.alert({ title: "Switch failed", message: String(e) });
          }
        },
      });
    });
  });
}

// ---------- App Center render ----------
let appPresets = [];

const SERVE_LABELS = { command: "Command", static: "Static", script: "Script", apimock: "API Mock" };

function appRunLine(a) {
  if (a.serveMode === "command") return (a.commands || []).map((s) => s.trim()).filter(Boolean).slice(-1)[0] || "—";
  if (a.serveMode === "static") return a.staticDir || "./";
  if (a.serveMode === "script") return a.scriptFile || "—";
  if (a.serveMode === "apimock") return a.specFile || "—";
  return "";
}

// App summary panels were removed; kept as a no-op so callers stay harmless.
function renderAppStats() {}

let appStatusFilter = "all"; // "all" | "running" | "stopped"

function renderApps(filter = "") {
  // Re-rendering replaces the rows; close any open kebab menu first so it can't
  // be orphaned (its anchor button is about to be removed from the DOM).
  if (typeof Dropdown !== "undefined") Dropdown.close();
  const f = filter.toLowerCase();
  const list = apps.filter((a) => {
    const status = a.status || "stopped";
    const matchText =
      a.name.toLowerCase().includes(f) || (a.appType || "").toLowerCase().includes(f) || (a.serveMode || "").includes(f);
    const matchStatus =
      appStatusFilter === "all" ||
      (appStatusFilter === "running" && (status === "running" || status === "building")) ||
      (appStatusFilter === "stopped" && status !== "running" && status !== "building");
    return matchText && matchStatus;
  });
  document.getElementById("appList").innerHTML = list
    .map((a) => {
      const status = a.status || "stopped";
      const running = status === "running";
      const building = status === "building";
      const statusLabel = { running: "Running", building: "Building", error: "Error" }[status] || "Stopped";
      const portBadge = a.port
        ? running
          ? `<span class="port-badge link" data-openurl="http://localhost:${a.port}">Port <b>${a.port}</b></span>`
          : `<span class="port-badge">Port <b>${a.port}</b></span>`
        : "";
      const meta = [];
      if (running && a.uptime) meta.push(escapeHtml(a.uptime));
      const control = building
        ? `<button class="btn btn-ghost btn-sm" data-stop="${a.id}"><span class="spin">${ICON.sync}</span>Building…</button>`
        : running
        ? `<button class="btn btn-ghost btn-sm" data-stop="${a.id}">${ICON.stop}Stop</button>
           <button class="btn btn-icon btn-sm" data-restart="${a.id}" title="Restart">${ICON.sync}</button>`
        : `<button class="btn btn-start btn-sm" data-start="${a.id}">${ICON.play}Start</button>`;
      return `
      <div class="app-row ${status}" data-row="${a.id}">
        <span class="app-drag" title="Drag to reorder">${ICON.grip}</span>
        <span class="app-status-dot ${status}"></span>
        <div class="app-main">
          <div class="app-title-row">
            <span class="app-name">${escapeHtml(a.name)}</span>
            <span class="app-state ${status}">${statusLabel}</span>
          </div>
          <div class="app-sub">
            ${a.appType ? `<span class="app-type-label">${escapeHtml(a.appType)}</span>` : ""}
            ${portBadge}
            <span class="app-path" title="${escapeHtml(a.projectDir)}">${escapeHtml(a.projectDir)}</span>
            ${meta.length ? `<span class="app-dot">·</span><span>${meta.join(" · ")}</span>` : ""}
          </div>
        </div>
        <div class="app-controls">
          ${control}
          <button class="btn btn-icon btn-sm" data-logs="${a.id}" title="Logs">${ICON.logs}</button>
          <button class="btn btn-icon btn-sm" data-menu="${a.id}" title="More actions">${ICON.more}</button>
        </div>
      </div>`;
    })
    .join("");
  if (!list.length)
    document.getElementById("appList").innerHTML = empty(
      f || appStatusFilter !== "all"
        ? "No applications match your filters."
        : "No applications yet. Click “New application” to add one."
    );

  setupAppListEvents();
}

function appById(id) {
  return apps.find((a) => String(a.id) === String(id));
}

// App Center row interactions. Listeners are attached DIRECTLY to each button
// on every render — renderApps() rewrites #appList's innerHTML, so the buttons
// are fresh elements each time and get fresh listeners. This mirrors the Git
// Board rows. (A single delegated listener on the container was tried before,
// but delegated clicks on dynamically-inserted rows can silently fail to fire
// in WebView2, leaving the kebab/controls unresponsive.)
function setupAppListEvents() {
  const listEl = document.getElementById("appList");
  if (!listEl) return;

  listEl.querySelectorAll("[data-start]").forEach((btn) =>
    btn.addEventListener("click", () => appAction("start", btn.dataset.start, btn)));
  listEl.querySelectorAll("[data-stop]").forEach((btn) =>
    btn.addEventListener("click", () => appAction("stop", btn.dataset.stop, btn)));
  listEl.querySelectorAll("[data-restart]").forEach((btn) =>
    btn.addEventListener("click", () => appAction("restart", btn.dataset.restart, btn)));
  listEl.querySelectorAll("[data-logs]").forEach((btn) =>
    btn.addEventListener("click", () => openAppLogs(appById(btn.dataset.logs))));

  listEl.querySelectorAll("[data-openurl]").forEach((el) =>
    el.addEventListener("click", () => {
      if (DC && DC.hasBackend) DC.openUrl(el.dataset.openurl).catch((err) => console.error(err));
      else window.open(el.dataset.openurl, "_blank");
    }));

  listEl.querySelectorAll("[data-menu]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (Dropdown.isOpenFor(btn)) { Dropdown.close(); return; }
      const a = appById(btn.dataset.menu);
      if (!a) return;
      const items = [{ label: "Edit", icon: ICON.pencil, onClick: () => openAppForm(a) }];
      if (DC && DC.hasBackend) {
        items.push(
          { label: "Open folder", icon: ICON.folder, onClick: () => DC.openPath(a.projectDir).catch((err) => console.error(err)) },
          { label: "Open terminal", icon: ICON.terminal, onClick: () => DC.openTerminal(a.projectDir).catch((err) => console.error(err)) }
        );
      }
      items.push({ label: "Delete", icon: ICON.trash, danger: true, onClick: () => deleteApp(a) });
      Dropdown.menu(btn, items);
    }));

  // Pointer-based reorder via the grip handle (no HTML5 `draggable`, which is
  // unreliable in WebView2 and can swallow sibling button clicks).
  listEl.querySelectorAll(".app-drag").forEach((handle) =>
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const row = handle.closest(".app-row");
      if (!row) return;
      const startY = e.clientY;
      let moved = false;

      const onMove = (ev) => {
        if (!moved && Math.abs(ev.clientY - startY) < 4) return;
        moved = true;
        row.classList.add("dragging");
        const others = [...listEl.querySelectorAll(".app-row:not(.dragging)")];
        const before = others.find((r) => {
          const rect = r.getBoundingClientRect();
          return ev.clientY < rect.top + rect.height / 2;
        });
        if (before) listEl.insertBefore(row, before);
        else listEl.appendChild(row);
      };
      const onUp = async () => {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onUp, true);
        row.classList.remove("dragging");
        if (moved) {
          const ids = [...listEl.querySelectorAll(".app-row")].map((r) => Number(r.dataset.row));
          apps.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
          if (DC && DC.hasBackend) {
            try { await DC.reorderApps(ids); } catch (err) { console.error("reorderApps failed", err); }
          }
        }
      };
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onUp, true);
    }));
}

async function appAction(kind, id, btn) {
  if (!DC || !DC.hasBackend) return;
  if (btn) btn.disabled = true;
  try {
    if (kind === "start") await DC.startApp(Number(id));
    else if (kind === "stop") await DC.stopApp(Number(id));
    else if (kind === "restart") await DC.restartApp(Number(id));
  } catch (e) {
    console.error(`${kind}App failed`, e);
    await Modal.alert({ title: "Action failed", message: String(e) });
    if (btn) btn.disabled = false;
  }
}

async function deleteApp(a) {
  if (!a) return;
  const ok = await Modal.confirm({
    title: "Delete application",
    message: `Remove “${a.name}”? It will be stopped if running. This cannot be undone.`,
    confirmText: "Delete",
    danger: true,
  });
  if (!ok) return;
  try {
    if (DC && DC.hasBackend) await DC.deleteApp(Number(a.id));
    apps = apps.filter((x) => x.id !== a.id);
    renderAppStats();
    renderApps(document.getElementById("appSearch").value || "");
  } catch (e) {
    await Modal.alert({ title: "Couldn't delete", message: String(e) });
  }
}

// ---------- App Center: New/Edit form ----------
const SERVE_MODES = [
  { value: "command", label: "Command" },
  { value: "static", label: "Static Folder" },
  { value: "script", label: "Script File" },
  { value: "apimock", label: "API Mock" },
];

async function pickFolder(title) {
  try {
    return await window.__TAURI__.dialog.open({ directory: true, multiple: false, title });
  } catch (e) {
    console.error("folder picker failed", e);
    return null;
  }
}
async function pickFile(title, filters) {
  try {
    return await window.__TAURI__.dialog.open({ directory: false, multiple: false, title, filters });
  } catch (e) {
    console.error("file picker failed", e);
    return null;
  }
}

function openAppForm(existing) {
  const a = existing
    ? JSON.parse(JSON.stringify(existing))
    : { id: 0, name: "", appType: "", serveMode: "command", projectDir: "", commands: [], staticDir: "", scriptFile: "", specFile: "", env: [], port: null, autostart: false };
  Modal.custom({
    title: existing ? `Edit · ${existing.name}` : "New application",
    wide: true,
    render: (body, foot, close, mkBtn) => {
      const presetOpts = ['<option value="">Custom</option>']
        .concat(appPresets.map((p) => `<option value="${p.value}" ${a.appType === p.value ? "selected" : ""}>${escapeHtml(p.label)}</option>`))
        .join("");
      const modeOpts = SERVE_MODES.map((m) => `<option value="${m.value}" ${a.serveMode === m.value ? "selected" : ""}>${m.label}</option>`).join("");
      body.innerHTML = `
        <div class="form-grid">
          <div class="form-row"><label class="form-label">Name</label>
            <input class="modal-input" id="afName" value="${escapeHtml(a.name)}" placeholder="My App" /></div>
          <div class="form-row"><label class="form-label">Type (preset)</label>
            <select class="modal-input" id="afType">${presetOpts}</select></div>
        </div>
        <div class="form-row"><label class="form-label">Project directory</label>
          <div class="input-row"><input class="modal-input" id="afDir" value="${escapeHtml(a.projectDir)}" placeholder="C:\\path\\to\\project" spellcheck="false" />
            <button class="btn btn-ghost btn-sm" id="afDirBrowse">${ICON.folder}Browse</button></div></div>
        <div class="form-grid">
          <div class="form-row"><label class="form-label">Serve mode</label>
            <select class="modal-input" id="afMode">${modeOpts}</select></div>
          <div class="form-row"><label class="form-label">Port</label>
            <input class="modal-input" id="afPort" type="number" min="1" max="65535" value="${a.port ?? ""}" placeholder="3000" /></div>
        </div>
        <div class="form-row" id="afCmdRow"><label class="form-label" id="afCmdLabel">Build &amp; run commands</label>
          <textarea class="modal-input" id="afCmds" rows="4" spellcheck="false" placeholder="npm install&#10;npm run dev">${escapeHtml((a.commands || []).join("\n"))}</textarea>
          <div class="form-hint" id="afCmdHint"></div></div>
        <div class="form-row" id="afStaticRow"><label class="form-label">Static folder (relative to project)</label>
          <input class="modal-input" id="afStatic" value="${escapeHtml(a.staticDir || "")}" placeholder="./dist" spellcheck="false" /></div>
        <div class="form-row" id="afScriptRow"><label class="form-label">Script file</label>
          <div class="input-row"><input class="modal-input" id="afScript" value="${escapeHtml(a.scriptFile || "")}" placeholder="run.ps1 / start.sh" spellcheck="false" />
            <button class="btn btn-ghost btn-sm" id="afScriptBrowse">${ICON.folder}Browse</button></div></div>
        <div class="form-row" id="afSpecRow"><label class="form-label">OpenAPI / Swagger JSON</label>
          <div class="input-row"><input class="modal-input" id="afSpec" value="${escapeHtml(a.specFile || "")}" placeholder="openapi.json" spellcheck="false" />
            <button class="btn btn-ghost btn-sm" id="afSpecBrowse">${ICON.folder}Browse</button></div></div>
        <div class="form-row"><label class="form-label">Environment variables (KEY=VALUE per line)</label>
          <textarea class="modal-input" id="afEnv" rows="2" spellcheck="false" placeholder="NODE_ENV=development">${escapeHtml((a.env || []).map(([k, v]) => `${k}=${v}`).join("\n"))}</textarea></div>
        <label class="form-check"><input type="checkbox" id="afAuto" ${a.autostart ? "checked" : ""} /> <span>Start automatically when DevCenter launches</span></label>
        <div class="modal-error" id="afErr"></div>`;

      const $ = (id) => body.querySelector(id);
      const applyMode = () => {
        const mode = $("#afMode").value;
        $("#afCmdRow").style.display = mode === "apimock" || mode === "script" ? "none" : "";
        $("#afStaticRow").style.display = mode === "static" ? "" : "none";
        $("#afScriptRow").style.display = mode === "script" ? "" : "none";
        $("#afSpecRow").style.display = mode === "apimock" ? "" : "none";
        $("#afCmdLabel").textContent = mode === "command" ? "Build & run commands" : "Build commands";
        $("#afCmdHint").textContent = mode === "command" ? "Run in order; the last line is the long-running run command." : "Optional build steps, run in order before serving.";
      };
      applyMode();
      $("#afMode").addEventListener("change", applyMode);

      // Preset fills defaults.
      $("#afType").addEventListener("change", () => {
        const p = appPresets.find((x) => x.value === $("#afType").value);
        if (!p) return;
        $("#afMode").value = p.serveMode;
        $("#afPort").value = p.port || "";
        $("#afCmds").value = p.commands || "";
        $("#afEnv").value = p.env || "";
        $("#afStatic").value = p.staticDir || "";
        if (!$("#afName").value.trim()) $("#afName").value = p.label;
        applyMode();
      });

      $("#afDirBrowse").addEventListener("click", async () => {
        const d = await pickFolder("Choose project folder");
        if (d) $("#afDir").value = d;
      });
      $("#afScriptBrowse").addEventListener("click", async () => {
        const d = await pickFile("Choose script file", [{ name: "Scripts", extensions: ["ps1", "bat", "cmd", "sh", "bash"] }]);
        if (d) $("#afScript").value = d;
      });
      $("#afSpecBrowse").addEventListener("click", async () => {
        const d = await pickFile("Choose OpenAPI/Swagger JSON", [{ name: "JSON", extensions: ["json"] }]);
        if (d) $("#afSpec").value = d;
      });

      const cancel = mkBtn("btn-ghost", "Cancel");
      cancel.addEventListener("click", () => close(null));
      const save = mkBtn("btn-primary", existing ? "Save" : "Create");
      save.addEventListener("click", async () => {
        const mode = $("#afMode").value;
        const def = {
          id: a.id || 0,
          name: $("#afName").value.trim(),
          appType: $("#afType").value,
          serveMode: mode,
          projectDir: $("#afDir").value.trim(),
          commands: $("#afCmds").value.split("\n").map((s) => s.trim()).filter(Boolean),
          staticDir: $("#afStatic").value.trim() || null,
          scriptFile: $("#afScript").value.trim() || null,
          specFile: $("#afSpec").value.trim() || null,
          env: $("#afEnv").value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.indexOf("="); return i < 0 ? [l, ""] : [l.slice(0, i).trim(), l.slice(i + 1)]; }),
          port: $("#afPort").value ? Number($("#afPort").value) : null,
          autostart: $("#afAuto").checked,
          order: a.order || 0,
        };
        const err = $("#afErr");
        if (!def.name) return (err.textContent = "Enter a name.");
        if (!def.projectDir && mode !== "apimock") return (err.textContent = "Choose a project directory.");
        if (mode === "command" && !def.commands.length) return (err.textContent = "Add at least a run command.");
        if (mode === "script" && !def.scriptFile) return (err.textContent = "Choose a script file.");
        if (mode === "apimock" && !def.specFile) return (err.textContent = "Choose an OpenAPI/Swagger file.");
        err.textContent = "";
        save.disabled = true;
        save.textContent = "Saving…";
        try {
          let saved;
          if (DC && DC.hasBackend) saved = existing ? await DC.updateApp(def) : await DC.createApp(def);
          else saved = { ...def, id: def.id || Date.now(), status: "stopped", uptime: "" };
          const at = apps.findIndex((x) => x.id === saved.id);
          if (at >= 0) apps[at] = saved;
          else apps.push(saved);
          close(true);
          renderAppStats();
          renderApps(document.getElementById("appSearch").value || "");
        } catch (e) {
          err.textContent = String(e);
          save.disabled = false;
          save.textContent = existing ? "Save" : "Create";
        }
      });
      foot.append(cancel, save);
    },
  });
}

// ---------- App Center: live log viewer ----------
let appLogUnsub = null;

function openAppLogs(a) {
  if (!a) return;
  Modal.custom({
    title: `Logs · ${a.name}`,
    wide: true,
    render: (body, foot, close, mkBtn) => {
      body.innerHTML = `
        <div class="log-toolbar">
          <div class="search log-search"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input id="logFilter" placeholder="Filter…" /></div>
          <label class="form-check inline"><input type="checkbox" id="logFollow" checked /> <span>Follow</span></label>
        </div>
        <pre class="log-view" id="logView"></pre>`;
      const view = body.querySelector("#logView");
      const filterEl = body.querySelector("#logFilter");
      const followEl = body.querySelector("#logFollow");
      let lines = [];

      const lineHtml = (l) => {
        const cls = l.level === "error" ? "log-err" : l.stream === "system" ? "log-sys" : "log-out";
        return `<span class="log-line ${cls}"><span class="log-ts">${l.ts}</span>${escapeHtml(l.line)}</span>`;
      };
      const draw = () => {
        const q = filterEl.value.toLowerCase();
        const shown = q ? lines.filter((l) => l.line.toLowerCase().includes(q)) : lines;
        view.innerHTML = shown.map(lineHtml).join("\n");
        if (followEl.checked) view.scrollTop = view.scrollHeight;
      };
      filterEl.addEventListener("input", draw);

      // Initial snapshot.
      if (DC && DC.hasBackend) {
        DC.appLogs(Number(a.id)).then((snap) => { lines = snap || []; draw(); }).catch((e) => console.error(e));
        // Live tail.
        DC.onAppLog((l) => {
          if (String(l.id) !== String(a.id)) return;
          lines.push(l);
          if (lines.length > 2000) lines.shift();
          draw();
        }).then((un) => { appLogUnsub = un; });
      } else {
        view.textContent = "Logs stream in the desktop app.";
      }

      const clear = mkBtn("btn-ghost", "Clear");
      clear.addEventListener("click", () => { lines = []; draw(); });
      const done = mkBtn("btn-primary", "Close");
      const stop = () => { if (appLogUnsub) { appLogUnsub(); appLogUnsub = null; } close(true); };
      done.addEventListener("click", stop);
      foot.append(clear, done);
    },
  });
}

// ---------- Helpers ----------
function stat(label, value, color) {
  return `<div class="stat" style="--stat-color:${color}">
    <div class="stat-label"><span class="stat-dot" style="background:${color}"></span>${label}</div>
    <div class="stat-value">${value}</div>
  </div>`;
}
function empty(msg, icon) {
  return `<div class="empty-state"><div class="empty-ico">${icon || ICON.folder}</div><p>${msg}</p></div>`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- New branch: validation + dialog ----------
// Validate a branch name against the (subset of) git ref-name rules that matter
// for a UI: no spaces, no special tokens, no `..`/`//`, no leading/trailing
// `/`/`.`, no `.lock` suffix, and not a duplicate of an existing branch.
function validateBranchName(name, existing) {
  if (!name) return "Branch name is required.";
  if (/\s/.test(name)) return "Branch name cannot contain spaces.";
  if (/[~^:?*[\\]/.test(name)) return "Branch name cannot contain ~ ^ : ? * [ or \\.";
  if (/[\x00-\x1f\x7f]/.test(name)) return "Branch name cannot contain control characters.";
  if (name.includes("..")) return "Branch name cannot contain '..'.";
  if (name.includes("//")) return "Branch name cannot contain '//'.";
  if (name.startsWith("/") || name.endsWith("/")) return "Branch name cannot start or end with '/'.";
  if (name.startsWith(".") || name.endsWith(".")) return "Branch name cannot start or end with '.'.";
  if (name.endsWith(".lock")) return "Branch name cannot end with '.lock'.";
  if (name.includes("@{") || name === "@") return "Branch name cannot contain '@{' or be '@'.";
  if (existing && existing.includes(name)) return "A branch with this name already exists.";
  return null;
}

// Open the "Create a branch" dialog. `branches` is the list of base candidates,
// `current` is preselected as the base. `onCreate(name, base)` runs on confirm.
function openNewBranchDialog({ branches, current, onCreate }) {
  const bases = branches && branches.length ? branches.slice() : [];
  const base0 = current && bases.includes(current) ? current : bases[0] || "";
  Modal.custom({
    title: "Create a branch",
    render: (body, foot, close, mkBtn) => {
      body.innerHTML = `
        <div class="form-row">
          <label class="form-label" for="nbName">New branch name</label>
          <input class="modal-input" id="nbName" type="text" placeholder="feature/my-change" spellcheck="false" autocomplete="off" />
        </div>
        <div class="form-row">
          <label class="form-label" for="nbBase">Base branch</label>
          <select class="modal-input" id="nbBase"></select>
          <div class="form-hint">The new branch will start from the tip of this branch.</div>
        </div>
        <div class="modal-error" id="nbErr"></div>`;
      const nameEl = body.querySelector("#nbName");
      const baseEl = body.querySelector("#nbBase");
      const errEl = body.querySelector("#nbErr");
      if (!bases.length) {
        const o = document.createElement("option");
        o.value = "";
        o.textContent = "(current branch)";
        baseEl.appendChild(o);
        baseEl.disabled = true;
      } else {
        bases.forEach((b) => {
          const o = document.createElement("option");
          o.value = b;
          o.textContent = b;
          if (b === base0) o.selected = true;
          baseEl.appendChild(o);
        });
      }

      const submit = () => {
        const name = nameEl.value.trim();
        const base = baseEl.value;
        const msg = validateBranchName(name, bases);
        if (msg) {
          errEl.textContent = msg;
          nameEl.focus();
          return;
        }
        close({ name, base });
      };
      nameEl.addEventListener("input", () => (errEl.textContent = ""));
      nameEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });
      const cancel = mkBtn("btn-ghost", "Cancel");
      cancel.addEventListener("click", () => close(null));
      const create = mkBtn("btn-primary", "Create branch");
      create.addEventListener("click", submit);
      foot.append(cancel, create);
      setTimeout(() => nameEl.focus(), 40);
    },
  }).then((res) => {
    if (res) onCreate(res.name, res.base);
  });
}

// Copy text to the clipboard, with a textarea fallback for non-secure contexts.
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}

// Rename dialog for a branch. `existing` is the full branch list (for dup check).
function openRenameBranchDialog({ branch, existing, onRename }) {
  Modal.prompt({
    title: "Rename branch",
    label: `New name for “${branch}”`,
    value: branch,
    confirmText: "Rename",
    validate: (v) => {
      if (!v) return "Branch name is required.";
      if (v === branch) return "Enter a different name.";
      return validateBranchName(v, existing);
    },
  }).then((v) => {
    if (v && v !== branch) onRename(v);
  });
}

// Confirm + delete a branch, offering a force-delete fallback when git reports
// the branch is not fully merged.
async function deleteBranchFlow({ repoId, branch, onChanged }) {
  const ok = await Modal.confirm({
    title: "Delete branch",
    message: `Are you sure you want to delete the branch “${branch}”? This cannot be undone.`,
    confirmText: "Delete",
    danger: true,
  });
  if (!ok) return;
  try {
    const updated = await DC.deleteBranch(repoId, branch, false);
    if (onChanged) onChanged(updated);
  } catch (e) {
    const msg = String(e);
    if (/not fully merged/i.test(msg)) {
      const force = await Modal.confirm({
        title: "Branch not fully merged",
        message: `“${branch}” has commits that aren't merged anywhere else. Delete it anyway? Those commits may be lost.`,
        confirmText: "Delete anyway",
        danger: true,
      });
      if (!force) return;
      try {
        const updated = await DC.deleteBranch(repoId, branch, true);
        if (onChanged) onChanged(updated);
      } catch (e2) {
        console.error("deleteBranch (force) failed", e2);
        await Modal.alert({ title: "Delete failed", message: String(e2) });
      }
    } else {
      console.error("deleteBranch failed", e);
      await Modal.alert({ title: "Delete failed", message: msg });
    }
  }
}

// Right-click menu for a branch row: Rename / Copy name / Delete. `isCurrent`
// disables Delete (you can't delete the checked-out branch). `onChanged(repo)`
// runs after a successful rename/delete to refresh the surrounding view.
function openBranchContextMenu(e, { repoId, branch, isCurrent, branches, onChanged }) {
  if (!DC || !DC.hasBackend) return;
  const existing = branches || [];
  Dropdown.context(e.clientX, e.clientY, [
    {
      label: "Rename…",
      icon: ICON.pencil,
      onClick: () =>
        openRenameBranchDialog({
          branch,
          existing,
          onRename: async (newName) => {
            try {
              const updated = await DC.renameBranch(repoId, branch, newName);
              if (onChanged) onChanged(updated);
            } catch (err) {
              console.error("renameBranch failed", err);
              await Modal.alert({ title: "Rename failed", message: String(err) });
            }
          },
        }),
    },
    {
      label: "Copy branch name",
      icon: ICON.copy,
      onClick: () => copyToClipboard(branch),
    },
    { separator: true },
    {
      label: "Delete…",
      icon: ICON.trash,
      danger: true,
      disabled: !!isCurrent,
      onClick: () => deleteBranchFlow({ repoId, branch, onChanged }),
    },
  ]);
}

// GitHub Desktop-style prompt shown when switching branches with uncommitted
// changes. Resolves to "leave" (stash the work on the current branch), "bring"
// (carry it to the target), or null if cancelled.
function openSwitchBranchDialog({ current, target }) {
  return Modal.custom({
    title: "Switch branch",
    render: (body, foot, close, mkBtn) => {
      body.innerHTML = `
        <p class="modal-msg">You have changes on this branch. What would you like to do with them?</p>
        <div class="switch-opts">
          <label class="switch-opt">
            <input type="radio" name="switchChoice" value="leave" checked />
            <span class="switch-opt-body">
              <span class="switch-opt-title">Leave my changes on ${escapeHtml(current)}</span>
              <span class="switch-opt-desc">Your in-progress work will be stashed on this branch for you to return to later</span>
            </span>
          </label>
          <label class="switch-opt">
            <input type="radio" name="switchChoice" value="bring" />
            <span class="switch-opt-body">
              <span class="switch-opt-title">Bring my changes to ${escapeHtml(target)}</span>
              <span class="switch-opt-desc">Your in-progress work will follow you to the new branch</span>
            </span>
          </label>
        </div>`;
      const opts = [...body.querySelectorAll(".switch-opt")];
      const sync = () => opts.forEach((o) => o.classList.toggle("active", o.querySelector("input").checked));
      opts.forEach((o) => o.querySelector("input").addEventListener("change", sync));
      sync();
      const cancel = mkBtn("btn-ghost", "Cancel");
      cancel.addEventListener("click", () => close(null));
      const ok = mkBtn("btn-primary", "Switch branch");
      ok.addEventListener("click", () => {
        const sel = body.querySelector('input[name="switchChoice"]:checked');
        close(sel ? sel.value : null);
      });
      foot.append(cancel, ok);
      setTimeout(() => ok.focus(), 40);
    },
  });
}

// Switch `repoId` to `target`. When the working tree is dirty, first ask the
// user what to do with the changes (leave/stash vs bring/carry). Returns the
// refreshed Repo, or null if the user cancelled.
async function performBranchSwitch({ repoId, current, target, dirty }) {
  let stash = false;
  if (dirty) {
    const choice = await openSwitchBranchDialog({ current, target });
    if (!choice) return null; // cancelled
    stash = choice === "leave";
  }
  return DC.checkoutBranch(repoId, target, stash);
}

// ---------- Repo tags: filter bar + editor ----------
function renderTagFilter() {
  const select = document.getElementById("repoTagSelect");
  const menu = document.getElementById("repoTagMenu");
  const label = document.getElementById("repoTagLabel");
  if (!select || !menu) return;
  // Aggregate tags across all repos with counts.
  const counts = new Map();
  repos.forEach((r) => (r.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  if (!counts.size) {
    select.hidden = true;
    repoTagFilter.clear();
    return;
  }
  select.hidden = false;
  const tags = [...counts.keys()].sort((a, b) => a.localeCompare(b));
  // Drop any selected tags that no longer exist.
  repoTagFilter = new Set([...repoTagFilter].filter((t) => counts.has(t)));

  menu.innerHTML =
    `<label class="multiselect-opt all">
       <input type="checkbox" id="repoTagAll" ${repoTagFilter.size === 0 ? "checked" : ""} />
       <span>All tags</span>
     </label>
     <div class="multiselect-sep"></div>` +
    tags
      .map(
        (t) => `<label class="multiselect-opt">
          <input type="checkbox" value="${escapeHtml(t)}" ${repoTagFilter.has(t) ? "checked" : ""} />
          <span>${escapeHtml(t)}</span>
          <span class="multiselect-count">${counts.get(t)}</span>
        </label>`
      )
      .join("");

  // Button label reflects the selection.
  if (repoTagFilter.size === 0) label.textContent = "All tags";
  else if (repoTagFilter.size === 1) label.textContent = [...repoTagFilter][0];
  else label.textContent = `${repoTagFilter.size} tags`;

  const allBox = document.getElementById("repoTagAll");
  if (allBox) {
    allBox.addEventListener("change", () => {
      repoTagFilter.clear();
      renderRepos(document.getElementById("repoSearch").value || "");
    });
  }
  menu.querySelectorAll('input[type="checkbox"][value]').forEach((box) => {
    box.addEventListener("change", () => {
      if (box.checked) repoTagFilter.add(box.value);
      else repoTagFilter.delete(box.value);
      renderRepos(document.getElementById("repoSearch").value || "");
    });
  });
}

function openTagEditor(repo) {
  let tags = [...(repo.tags || [])];
  const suggestions = [...new Set(repos.flatMap((r) => r.tags || []))].sort();
  Modal.custom({
    title: `Tags · ${repo.name}`,
    render: (body, foot, close, mkBtn) => {
      body.innerHTML = `
        <div class="tag-edit-list" id="tagList"></div>
        <input class="modal-input" id="tagInput" placeholder="Add a tag and press Enter" spellcheck="false" autocomplete="off" maxlength="24" />
        <div class="tag-suggest" id="tagSuggest"></div>
        <div class="modal-error" id="tagErr"></div>`;
      const listEl = body.querySelector("#tagList");
      const input = body.querySelector("#tagInput");
      const suggestEl = body.querySelector("#tagSuggest");

      const drawList = () => {
        listEl.innerHTML = tags.length
          ? tags.map((t, i) => `<span class="tag-edit">${escapeHtml(t)}<button data-rm="${i}" title="Remove">${ICON.x}</button></span>`).join("")
          : `<span style="color:var(--text-faint);font-size:12.5px">No tags yet.</span>`;
        listEl.querySelectorAll("[data-rm]").forEach((b) =>
          b.addEventListener("click", () => {
            tags.splice(Number(b.dataset.rm), 1);
            drawList();
            drawSuggest();
          })
        );
      };
      const addTag = (raw) => {
        const t = raw.trim();
        if (!t) return;
        if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t);
        input.value = "";
        drawList();
        drawSuggest();
      };
      const drawSuggest = () => {
        const avail = suggestions.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()));
        suggestEl.innerHTML = avail.length
          ? `<span class="tag-suggest-label">Existing tags</span>` + avail.map((s) => `<button data-add="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("")
          : "";
        suggestEl.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => addTag(b.dataset.add)));
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          addTag(input.value);
        } else if (e.key === "Backspace" && !input.value && tags.length) {
          tags.pop();
          drawList();
          drawSuggest();
        }
      });
      drawList();
      drawSuggest();
      setTimeout(() => input.focus(), 40);

      const cancel = mkBtn("btn-ghost", "Cancel");
      cancel.addEventListener("click", () => close(null));
      const save = mkBtn("btn-primary", "Save");
      save.addEventListener("click", async () => {
        if (input.value.trim()) addTag(input.value);
        save.disabled = true;
        save.textContent = "Saving…";
        try {
          if (DC && DC.hasBackend) {
            const updated = await DC.setRepoTags(repo.id, tags);
            const at = repos.findIndex((x) => x.id === updated.id);
            if (at >= 0) repos[at] = updated;
          } else {
            repo.tags = tags;
          }
          close(true);
          renderRepos(document.getElementById("repoSearch").value || "");
        } catch (e) {
          console.error("setRepoTags failed", e);
          body.querySelector("#tagErr").textContent = String(e);
          save.disabled = false;
          save.textContent = "Save";
        }
      });
      foot.append(cancel, save);
    },
  });
}

// ---------- Pull Requests render ----------
let prCurrentFilter = "all";
let prRepoSelected = new Set(); // empty = all watched repos

function watchedRepoNames() {
  return repos.filter((r) => r.watched).map((r) => r.name);
}

function watchedPulls() {
  const names = watchedRepoNames();
  return pulls.filter((p) => names.includes(p.repo));
}

// PR summary panels were removed; kept as a no-op so callers stay harmless.
function renderPrStats() {}

function refreshPrRepoFilter() {
  const menu = document.getElementById("prRepoMenu");
  const label = document.getElementById("prRepoLabel");
  if (!menu) return;
  const names = watchedRepoNames();
  // drop any selected repos that are no longer watched
  prRepoSelected = new Set([...prRepoSelected].filter((n) => names.includes(n)));

  // Map each watched repo name to its provider for icons.
  const providerOf = (name) => {
    const r = repos.find((x) => x.name === name);
    return r ? r.provider : "other";
  };
  const icon = (p) => (p === "github" ? ICON.github : p === "azure" ? ICON.azure : ICON.repo);

  if (!names.length) {
    menu.innerHTML = `<div class="multiselect-empty">No watched repos</div>`;
  } else {
    menu.innerHTML =
      `<label class="multiselect-opt all">
         <input type="checkbox" id="prRepoAll" ${prRepoSelected.size === 0 ? "checked" : ""} />
         <span>All watched repos</span>
       </label>
       <div class="multiselect-sep"></div>` +
      names
        .map(
          (n) => `<label class="multiselect-opt">
            <input type="checkbox" value="${escapeHtml(n)}" ${prRepoSelected.has(n) ? "checked" : ""} />
            <span class="multiselect-ico">${icon(providerOf(n))}</span>
            <span>${escapeHtml(n)}</span>
          </label>`
        )
        .join("");
  }

  // label text
  if (prRepoSelected.size === 0) label.textContent = "All watched repos";
  else if (prRepoSelected.size === 1) label.textContent = [...prRepoSelected][0];
  else label.textContent = `${prRepoSelected.size} repos`;

  // button icon: provider glyph when exactly one repo is selected
  const iconHost = document.getElementById("prRepoIcon");
  if (iconHost) {
    const DEFAULT_REPO_ICON =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6a2 2 0 0 1 2-2h14v16H5a2 2 0 0 1-2-2Z"/><path d="M19 16H5a2 2 0 0 0-2 2"/></svg>';
    iconHost.innerHTML = prRepoSelected.size === 1 ? icon(providerOf([...prRepoSelected][0])) : DEFAULT_REPO_ICON;
  }

  // wire option checkboxes
  const allBox = document.getElementById("prRepoAll");
  if (allBox) {
    allBox.addEventListener("change", () => {
      prRepoSelected.clear();
      refreshPrRepoFilter();
      renderPulls(document.getElementById("prSearch").value);
    });
  }
  menu.querySelectorAll('input[type="checkbox"][value]').forEach((box) => {
    box.addEventListener("change", () => {
      if (box.checked) prRepoSelected.add(box.value);
      else prRepoSelected.delete(box.value);
      refreshPrRepoFilter();
      renderPulls(document.getElementById("prSearch").value);
    });
  });
}

function renderPulls(filter = "") {
  const f = filter.toLowerCase();
  const watchedNames = watchedRepoNames();
  if (!watchedNames.length) {
    document.getElementById("prList").innerHTML = empty(
      "No repositories are being watched. Enable \u201cWatch PRs\u201d on a repo in Git Board to see its pull requests here."
    );
    return;
  }
  const list = pulls.filter((p) => {
    const isWatched = watchedNames.includes(p.repo);
    const matchRepo = prRepoSelected.size === 0 || prRepoSelected.has(p.repo);
    const matchText = p.title.toLowerCase().includes(f) || p.repo.toLowerCase().includes(f) || p.author.toLowerCase().includes(f);
    const matchStatus = prCurrentFilter === "all" || p.status === prCurrentFilter;
    return isWatched && matchRepo && matchText && matchStatus;
  });
  const reviewMap = {
    approved: { cls: "ok", icon: ICON.check, label: "Approved" },
    changes: { cls: "danger", icon: ICON.changes, label: "Changes requested" },
    pending: { cls: "muted", icon: ICON.clock, label: "Review pending" },
  };
  document.getElementById("prList").innerHTML = list
    .map((p) => {
      const rev = reviewMap[p.reviews];
      const statusTag =
        p.status === "merged"
          ? `<span class="pr-state merged">${ICON.merge}Merged</span>`
          : p.status === "draft"
          ? `<span class="pr-state draft">${ICON.pr}Draft</span>`
          : `<span class="pr-state open">${ICON.pr}Open</span>`;
      return `
      <div class="pr-row ${p.status}">
        <div class="pr-icon ${p.status}">${p.status === "merged" ? ICON.merge : ICON.pr}</div>
        <div class="pr-main">
          <div class="pr-title-row">
            <span class="pr-name">${p.title}</span>
            ${statusTag}
          </div>
          <div class="pr-sub">
            <span>${p.repo} #${p.id}</span>
            <span class="repo-dot">·</span>
            <span><code>${p.branch}</code> → <code>${p.base}</code></span>
            <span class="repo-dot">·</span>
            <span>by ${p.author}</span>
            <span class="repo-dot">·</span>
            <span>${p.updated}</span>
          </div>
        </div>
        <div class="pr-meta">
          <span class="chip review ${rev.cls}">${rev.icon}${rev.label}</span>
          <span class="chip">${ICON.comment}${p.comments}</span>
          <span class="pr-diff"><span class="add">+${p.additions}</span> <span class="del">−${p.deletions}</span></span>
        </div>
        <div class="pr-actions">
          <button class="btn btn-ghost btn-sm" data-pr-url="${p.url}">${ICON.external}View</button>
        </div>
      </div>`;
    })
    .join("");
  if (!list.length) document.getElementById("prList").innerHTML = empty("No pull requests match your filters.");

  document.querySelectorAll("#prList [data-pr-url]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const url = btn.dataset.prUrl;
      if (!url) return;
      if (DC && DC.hasBackend) DC.openUrl(url).catch((e) => console.error("openUrl failed", e));
      else window.open(url, "_blank");
    });
  });
}

// ---------- Wire up search ----------
document.getElementById("repoSearch").addEventListener("input", (e) => renderRepos(e.target.value));
document.getElementById("appSearch").addEventListener("input", (e) => renderApps(e.target.value));

// App Center status filter (All / Running / Stopped)
document.querySelectorAll("#appFilter .seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    appStatusFilter = btn.dataset.appfilter;
    document.querySelectorAll("#appFilter .seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
    renderApps(document.getElementById("appSearch").value || "");
  });
});

const prSearch = document.getElementById("prSearch");
prSearch.addEventListener("input", (e) => renderPulls(e.target.value));
document.querySelectorAll("#prFilter .seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    prCurrentFilter = btn.dataset.filter;
    document.querySelectorAll("#prFilter .seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
    renderPulls(prSearch.value);
  });
});

// repo multiselect dropdown open/close
const prRepoSelect = document.getElementById("prRepoSelect");
const prRepoBtn = document.getElementById("prRepoBtn");
prRepoBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const open = prRepoSelect.classList.toggle("open");
  prRepoBtn.setAttribute("aria-expanded", open ? "true" : "false");
});
document.addEventListener("click", (e) => {
  if (!prRepoSelect.contains(e.target)) {
    prRepoSelect.classList.remove("open");
    prRepoBtn.setAttribute("aria-expanded", "false");
  }
});

// Git Board tag multiselect dropdown open/close
const repoTagSelect = document.getElementById("repoTagSelect");
const repoTagBtn = document.getElementById("repoTagBtn");
if (repoTagBtn) {
  repoTagBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = repoTagSelect.classList.toggle("open");
    repoTagBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener("click", (e) => {
    if (!repoTagSelect.contains(e.target)) {
      repoTagSelect.classList.remove("open");
      repoTagBtn.setAttribute("aria-expanded", "false");
    }
  });
}

// Git Board account multiselect dropdown open/close
const repoAccountSelect = document.getElementById("repoAccountSelect");
const repoAccountBtn = document.getElementById("repoAccountBtn");
if (repoAccountBtn) {
  repoAccountBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = repoAccountSelect.classList.toggle("open");
    repoAccountBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener("click", (e) => {
    if (!repoAccountSelect.contains(e.target)) {
      repoAccountSelect.classList.remove("open");
      repoAccountBtn.setAttribute("aria-expanded", "false");
    }
  });
}

// ---------- Modal dialog (replaces native prompt/alert) ----------
const Modal = (() => {
  const overlay = document.getElementById("modalOverlay");
  const modalEl = overlay.querySelector(".modal");
  const titleEl = document.getElementById("modalTitle");
  const bodyEl = document.getElementById("modalBody");
  const footEl = document.getElementById("modalFoot");
  const closeBtn = document.getElementById("modalClose");
  let settle = null;

  function close(result) {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    document.removeEventListener("keydown", onKey);
    const cb = settle;
    settle = null;
    if (cb) cb(result);
  }
  function onKey(e) {
    if (e.key === "Escape") close(null);
  }
  closeBtn.addEventListener("click", () => close(null));
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) close(null);
  });

  function open(title, resolve, render, opts = {}) {
    titleEl.textContent = title;
    bodyEl.innerHTML = "";
    footEl.innerHTML = "";
    modalEl.classList.toggle("modal-wide", !!opts.wide);
    settle = resolve;
    render(bodyEl, footEl, close);
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    document.addEventListener("keydown", onKey);
  }

  function mkBtn(cls, text) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn " + cls;
    b.textContent = text;
    return b;
  }

  return {
    // Resolves to the entered string, or null if cancelled.
    prompt({ title, label, placeholder = "", value = "", confirmText = "OK", validate }) {
      return new Promise((resolve) => {
        open(title, resolve, (body, foot, close) => {
          if (label) {
            const l = document.createElement("label");
            l.className = "modal-label";
            l.setAttribute("for", "modalInput");
            l.textContent = label;
            body.appendChild(l);
          }
          const input = document.createElement("input");
          input.className = "modal-input";
          input.id = "modalInput";
          input.type = "text";
          input.placeholder = placeholder;
          input.value = value;
          const err = document.createElement("div");
          err.className = "modal-error";
          body.append(input, err);

          const submit = () => {
            const v = input.value.trim();
            const msg = validate ? validate(v) : v ? null : "This field is required.";
            if (msg) {
              err.textContent = msg;
              input.focus();
              return;
            }
            close(v);
          };
          const cancel = mkBtn("btn-ghost", "Cancel");
          cancel.addEventListener("click", () => close(null));
          const ok = mkBtn("btn-primary", confirmText);
          ok.addEventListener("click", submit);
          input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") submit();
          });
          foot.append(cancel, ok);
          setTimeout(() => input.focus(), 40);
        });
      });
    },
    // Resolves to true when dismissed.
    alert({ title, message, confirmText = "OK" }) {
      return new Promise((resolve) => {
        open(title, resolve, (body, foot, close) => {
          const p = document.createElement("p");
          p.className = "modal-msg";
          p.textContent = message;
          body.appendChild(p);
          const ok = mkBtn("btn-primary", confirmText);
          ok.addEventListener("click", () => close(true));
          foot.appendChild(ok);
          setTimeout(() => ok.focus(), 40);
        });
      });
    },
    // Resolves to true if confirmed, false otherwise.
    confirm({ title, message, confirmText = "Confirm", danger = false }) {
      return new Promise((resolve) => {
        open(title, resolve, (body, foot, close) => {
          const p = document.createElement("p");
          p.className = "modal-msg";
          p.textContent = message;
          body.appendChild(p);
          const cancel = mkBtn("btn-ghost", "Cancel");
          cancel.addEventListener("click", () => close(false));
          const ok = mkBtn(danger ? "btn-danger" : "btn-primary", confirmText);
          ok.addEventListener("click", () => close(true));
          foot.append(cancel, ok);
          setTimeout(() => ok.focus(), 40);
        });
      });
    },
    // Generic modal: `render(body, foot, close, mkBtn)` builds the content and
    // calls `close(value)` to resolve. Resolves to whatever value is passed.
    custom({ title, render, wide }) {
      return new Promise((resolve) => {
        open(title, resolve, (body, foot, close) => render(body, foot, close, mkBtn), { wide });
      });
    },
  };
})();

// ---------- Floating dropdown (anchored menu, e.g. branch picker) ----------
// Appended to <body> with fixed positioning so it is never clipped by the
// repo row's `overflow: hidden`. Closes on outside click, Esc, or scroll/resize.
const Dropdown = (() => {
  let active = null; // { menu, anchor, onDoc, onKey, onMove }

  function close() {
    if (!active) return;
    const { menu, anchor, onDoc, onKey, onMove } = active;
    menu.remove();
    document.removeEventListener("mousedown", onDoc, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", onMove, true);
    window.removeEventListener("scroll", onMove, true);
    anchor.classList.remove("dropdown-open");
    active = null;
  }

  function isOpenFor(anchor) {
    return !!active && active.anchor === anchor;
  }

  function open(anchor, { header, headerAction, options, current, emptyText, onSelect, onContext, search, searchPlaceholder, minWidth, optionKind, optionIcon }) {
    close();
    const showSearch = search !== undefined ? search : options.length > 7;
    const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

    const menu = document.createElement("div");
    menu.className = "dropdown-menu";
    if (minWidth) menu.style.minWidth = minWidth + "px";

    if (header) {
      const h = document.createElement("div");
      h.className = "dropdown-head";
      const ht = document.createElement("span");
      ht.className = "dropdown-head-title";
      ht.textContent = header;
      h.appendChild(ht);
      if (headerAction) {
        const ab = document.createElement("button");
        ab.type = "button";
        ab.className = "dropdown-head-action";
        ab.title = headerAction.title || headerAction.label;
        ab.innerHTML = (headerAction.icon || "") + `<span>${esc(headerAction.label)}</span>`;
        ab.addEventListener("click", (e) => {
          e.stopPropagation();
          close();
          headerAction.onClick();
        });
        h.appendChild(ab);
      }
      menu.appendChild(h);
    }

    let input = null;
    if (showSearch) {
      const box = document.createElement("div");
      box.className = "dropdown-search";
      box.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;
      input = document.createElement("input");
      input.type = "text";
      input.placeholder = searchPlaceholder || "Filter…";
      input.spellcheck = false;
      box.appendChild(input);
      menu.appendChild(box);
    }

    const list = document.createElement("div");
    list.className = "dropdown-list";
    menu.appendChild(list);
    document.body.appendChild(menu);

    const position = () => {
      const r = anchor.getBoundingClientRect();
      const mw = menu.offsetWidth;
      const mh = menu.offsetHeight;
      let left = r.left;
      let top = r.bottom + 6;
      if (left + mw > window.innerWidth - 8) left = window.innerWidth - 8 - mw;
      if (left < 8) left = 8;
      if (top + mh > window.innerHeight - 8 && r.top - 6 - mh > 8) top = r.top - 6 - mh;
      menu.style.left = Math.round(left) + "px";
      menu.style.top = Math.round(top) + "px";
    };

    const classifyOption = (opt) => {
      if (optionKind !== "branch") return null;
      if (opt === "main" || opt === "master") return { label: "base", tone: "base" };
      if (opt.startsWith("users/")) return { label: "user", tone: "user" };
      if (opt.startsWith("dependabot/")) return { label: "bot", tone: "bot" };
      if (opt.startsWith("feature/") || opt.startsWith("feat/")) return { label: "feature", tone: "feature" };
      if (opt.startsWith("release/")) return { label: "release", tone: "release" };
      if (opt.startsWith("hotfix/")) return { label: "hotfix", tone: "hotfix" };
      return { label: "branch", tone: "branch" };
    };

    // Render the (filtered) option rows. Keeps the current branch visible with a
    // check; highlights the matched substring; shows an empty state otherwise.
    const renderList = (filter) => {
      const f = (filter || "").trim().toLowerCase();
      const matches = options.filter((o) => o.toLowerCase().includes(f));
      list.innerHTML = "";
      if (!matches.length) {
        const empty = document.createElement("div");
        empty.className = "dropdown-empty";
        empty.textContent = f ? "No matching branches." : emptyText || "Nothing to show.";
        list.appendChild(empty);
        position();
        return;
      }
      matches.forEach((opt) => {
        const isCur = opt === current;
        const row = document.createElement("button");
        row.type = "button";
        row.className = "dropdown-opt" + (isCur ? " current" : "");
        row.title = opt;
        const check = document.createElement("span");
        check.className = "opt-check";
        check.innerHTML = ICON.check;
        const name = document.createElement("span");
        name.className = "opt-name";
        if (f) {
          const i = opt.toLowerCase().indexOf(f);
          name.innerHTML = esc(opt.slice(0, i)) + "<mark>" + esc(opt.slice(i, i + f.length)) + "</mark>" + esc(opt.slice(i + f.length));
        } else {
          name.textContent = opt;
        }
        const meta = classifyOption(opt);
        const parts = [check];
        const iconHtml = optionIcon ? optionIcon(opt) : "";
        if (iconHtml) {
          const ico = document.createElement("span");
          ico.className = "opt-ico";
          ico.innerHTML = iconHtml;
          parts.push(ico);
        }
        parts.push(name);
        if (meta) {
          const badge = document.createElement("span");
          badge.className = "opt-badge " + meta.tone;
          badge.textContent = meta.label;
          parts.push(badge);
        }
        row.append(...parts);
        if (isCur) {
          // When a context menu is available, keep the current row clickable so it
          // can be right-clicked (disabled buttons swallow contextmenu events); mark
          // it non-selectable via aria-disabled instead of the disabled attribute.
          if (onContext) {
            row.setAttribute("aria-disabled", "true");
            row.addEventListener("click", () => close());
          } else {
            row.disabled = true;
          }
        } else {
          row.addEventListener("click", () => { close(); onSelect(opt); });
        }
        if (onContext) {
          row.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            onContext(opt, isCur, e);
          });
        }
        list.appendChild(row);
      });
      position();
    };

    // Keyboard navigation over the currently-visible, selectable rows.
    const moveActive = (dir) => {
      const rows = [...list.querySelectorAll('.dropdown-opt:not(:disabled):not([aria-disabled="true"])')];
      if (!rows.length) return;
      let idx = rows.findIndex((r) => r.classList.contains("active"));
      idx = idx < 0 ? (dir > 0 ? 0 : rows.length - 1) : (idx + dir + rows.length) % rows.length;
      rows.forEach((r) => r.classList.remove("active"));
      rows[idx].classList.add("active");
      rows[idx].scrollIntoView({ block: "nearest" });
    };

    renderList("");

    if (input) {
      input.addEventListener("input", () => renderList(input.value));
      input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); moveActive(1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); moveActive(-1); }
        else if (e.key === "Enter") {
          e.preventDefault();
          const active = list.querySelector('.dropdown-opt.active:not(:disabled):not([aria-disabled="true"])') ||
            list.querySelector('.dropdown-opt:not(:disabled):not([aria-disabled="true"])');
          if (active) active.click();
        }
      });
    }

    position();

    const onDoc = (e) => {
      if (menu.contains(e.target) || anchor.contains(e.target) || e.target === anchor) return;
      close();
    };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    const onMove = () => position();

    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onMove, true);
    window.addEventListener("scroll", onMove, true);
    anchor.classList.add("dropdown-open");
    active = { menu, anchor, onDoc, onKey, onMove };
    if (input) setTimeout(() => input.focus(), 30);
  }

  // Action menu (icon + label rows that run a callback). `items` is an array of
  // { label, icon, onClick, danger }. Reuses the same positioning + dismissal.
  function menu(anchor, items) {
    close();
    const el = document.createElement("div");
    el.className = "dropdown-menu menu";
    items.forEach((it) => {
      if (it.separator) {
        const sep = document.createElement("div");
        sep.className = "menu-sep";
        el.appendChild(sep);
        return;
      }
      const row = document.createElement("button");
      row.type = "button";
      row.className = "menu-item" + (it.danger ? " danger" : "");
      row.innerHTML = `<span class="menu-ico">${it.icon || ""}</span><span>${it.label}</span>`;
      row.addEventListener("click", () => {
        close();
        it.onClick();
      });
      el.appendChild(row);
    });
    document.body.appendChild(el);

    const position = () => {
      const r = anchor.getBoundingClientRect();
      const mw = el.offsetWidth;
      const mh = el.offsetHeight;
      let left = r.right - mw; // right-align to the kebab button
      let top = r.bottom + 6;
      if (left < 8) left = 8;
      if (left + mw > window.innerWidth - 8) left = window.innerWidth - 8 - mw;
      if (top + mh > window.innerHeight - 8 && r.top - 6 - mh > 8) top = r.top - 6 - mh;
      // Always keep the menu fully inside the viewport (never off-screen).
      if (top + mh > window.innerHeight - 8) top = window.innerHeight - 8 - mh;
      if (top < 8) top = 8;
      el.style.left = Math.round(left) + "px";
      el.style.top = Math.round(top) + "px";
    };
    position();

    const onDoc = (e) => {
      if (el.contains(e.target) || anchor.contains(e.target) || e.target === anchor) return;
      close();
    };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    const onMove = () => position();
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onMove, true);
    window.addEventListener("scroll", onMove, true);
    anchor.classList.add("dropdown-open");
    active = { menu: el, anchor, onDoc, onKey, onMove };
  }

  // Cursor-anchored context menu (e.g. right-click a branch). Lives in its own
  // singleton so it can float ABOVE an open picker without closing it. `items`
  // is an array of { label, icon, onClick, danger, disabled } or { separator }.
  let ctx = null;
  function closeContext() {
    if (!ctx) return;
    ctx.el.remove();
    document.removeEventListener("mousedown", ctx.onDoc, true);
    document.removeEventListener("contextmenu", ctx.onDoc, true);
    document.removeEventListener("keydown", ctx.onKey, true);
    window.removeEventListener("scroll", ctx.onScroll, true);
    window.removeEventListener("resize", ctx.onScroll, true);
    ctx = null;
  }
  function context(x, y, items) {
    closeContext();
    const el = document.createElement("div");
    el.className = "dropdown-menu menu context-menu";
    items.forEach((it) => {
      if (it.separator) {
        const sep = document.createElement("div");
        sep.className = "menu-sep";
        el.appendChild(sep);
        return;
      }
      const row = document.createElement("button");
      row.type = "button";
      row.className = "menu-item" + (it.danger ? " danger" : "");
      if (it.disabled) row.disabled = true;
      row.innerHTML = `<span class="menu-ico">${it.icon || ""}</span><span>${it.label}</span>`;
      if (!it.disabled) row.addEventListener("click", () => { closeContext(); it.onClick(); });
      el.appendChild(row);
    });
    document.body.appendChild(el);

    const mw = el.offsetWidth;
    const mh = el.offsetHeight;
    let left = x;
    let top = y;
    if (left + mw > window.innerWidth - 8) left = window.innerWidth - 8 - mw;
    if (left < 8) left = 8;
    if (top + mh > window.innerHeight - 8) top = window.innerHeight - 8 - mh;
    if (top < 8) top = 8;
    el.style.left = Math.round(left) + "px";
    el.style.top = Math.round(top) + "px";

    const onDoc = (e) => { if (!el.contains(e.target)) closeContext(); };
    const onKey = (e) => { if (e.key === "Escape") closeContext(); };
    const onScroll = () => closeContext();
    ctx = { el, onDoc, onKey, onScroll };
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("contextmenu", onDoc, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll, true);
  }

  return { open, close, isOpenFor, menu, context, closeContext };
})();

// Replace the WebView's default right-click menu (Save as, Print, Inspect…) with
// a single useful action: Reload. App-specific context menus (branch, stash, …)
// call preventDefault first, so they're left untouched here. Text fields keep
// their native Cut/Copy/Paste menu.
document.addEventListener("contextmenu", (e) => {
  if (e.defaultPrevented) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  e.preventDefault();
  Dropdown.context(e.clientX, e.clientY, [
    { label: "Reload", icon: ICON.sync, onClick: () => location.reload() },
  ]);
});

// ---------- Initial render ----------
renderAppStats();
renderApps();
refreshPrRepoFilter();
renderPrStats();

// Whether VS Code is installed (drives the optional "Open in VS Code" menu item).
let hasVscode = false;

if (DC && DC.hasBackend) {
  // Repositories and pull requests load from the backend (see hydration below).
  // Show loading placeholders so no stale or sample data is ever shown.
  document.getElementById("repoGrid").innerHTML = empty("Loading repositories…");
  document.getElementById("prList").innerHTML = empty("Loading pull requests…");
  DC.vscodeAvailable().then((v) => { hasVscode = !!v; }).catch(() => {});
} else {
  renderRepos();
  renderPulls();
}

// ---------- Backend hydration (Tauri desktop) ----------
function rerenderGit() {
  renderRepos(document.getElementById("repoSearch").value || "");
  refreshPrRepoFilter();
  renderPrStats();
  renderPulls(document.getElementById("prSearch").value || "");
}

async function hydrateFromBackend() {
  try {
    const data = await DC.listRepos();
    if (Array.isArray(data)) {
      repos = data;
      rerenderGit();
      // If the Changes page was restored across a reload, it now has repos to pick from.
      if (window.ChangesPage && document.querySelector(".nav-item.active")?.dataset.page === "changes") {
        window.ChangesPage.onShow();
      }
    }
  } catch (e) {
    console.error("listRepos failed", e);
  }
}

// ---------- Pull Requests (backend) ----------
async function hydratePulls() {
  if (!DC || !DC.hasBackend) return;
  if (!watchedRepoNames().length) {
    renderPrStats();
    renderPulls(document.getElementById("prSearch").value || "");
    return;
  }
  const prList = document.getElementById("prList");
  if (prList) prList.innerHTML = empty("Loading pull requests…");
  try {
    const data = await DC.listPullRequests(null);
    if (Array.isArray(data)) {
      pulls = data;
      renderPrStats();
      renderPulls(document.getElementById("prSearch").value || "");
    }
  } catch (e) {
    console.error("listPullRequests failed", e);
    if (prList) prList.innerHTML = empty(String(e));
  }
}

// ---------- Accounts (backend) ----------
let accounts = [];

function providerMeta(p) {
  return p === "azure"
    ? { icon: ICON.azure, cls: "azure", name: "Azure DevOps" }
    : { icon: ICON.github, cls: "github", name: "GitHub" };
}

function renderAccounts() {
  const host = document.getElementById("accountList");
  if (!host) return;
  if (!DC || !DC.hasBackend) {
    host.innerHTML = `<div class="account-empty">${ICON.key}<div>Account management is available in the desktop app.</div></div>`;
    return;
  }
  if (!accounts.length) {
    host.innerHTML = `<div class="account-empty">${ICON.key}<div><strong>No accounts connected</strong><br>Add a GitHub or Azure DevOps account to load pull requests for your watched repositories.</div></div>`;
    return;
  }
  host.innerHTML = accounts
    .map((a, i) => {
      const m = providerMeta(a.provider);
      const stateCls = a.status === "connected" ? "connected" : a.status === "error" ? "error" : "unverified";
      const stateLabel = a.status === "connected" ? "Connected" : a.status === "error" ? "Error" : "Unverified";
      const who = a.username ? `<code>${a.username}</code>` : "Token";
      const org = a.organization ? ` · ${a.organization}` : "";
      return `
      <div class="account-row">
        <div class="account-icon ${m.cls}">${m.icon}</div>
        <div class="account-main">
          <div class="account-title-row">
            <span class="account-name">${a.label}</span>
            <span class="account-state ${stateCls}">${stateLabel}</span>
          </div>
          <div class="account-sub">${m.name}${org} · ${who}</div>
        </div>
        <div class="account-actions">
          <button class="btn btn-ghost btn-sm" data-test="${i}">${ICON.sync}Test</button>
          <button class="btn btn-icon btn-sm" data-remove="${i}" title="Remove account">${ICON.trash}</button>
        </div>
      </div>`;
    })
    .join("");

  host.querySelectorAll("[data-test]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const a = accounts[Number(btn.dataset.test)];
      btn.disabled = true;
      btn.innerHTML = `<span class="spin">${ICON.sync}</span>Testing…`;
      try {
        const updated = await DC.testAccount(a.id);
        const i = accounts.findIndex((x) => x.id === updated.id);
        if (i >= 0) accounts[i] = updated;
        renderAccounts();
        hydratePulls();
      } catch (e) {
        const i = accounts.findIndex((x) => x.id === a.id);
        if (i >= 0) accounts[i].status = "error";
        renderAccounts();
        await Modal.alert({ title: "Connection failed", message: String(e) });
      }
    });
  });

  host.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const a = accounts[Number(btn.dataset.remove)];
      const ok = await Modal.confirm({
        title: "Remove account",
        message: `Remove “${a.label}”? Its stored token will be deleted from this machine.`,
        confirmText: "Remove",
        danger: true,
      });
      if (!ok) return;
      try {
        await DC.removeAccount(a.id);
        accounts = accounts.filter((x) => x.id !== a.id);
        renderAccounts();
        hydratePulls();
      } catch (e) {
        await Modal.alert({ title: "Couldn't remove account", message: String(e) });
      }
    });
  });
}

async function hydrateAccounts() {
  if (!DC || !DC.hasBackend) return;
  try {
    const data = await DC.listAccounts();
    if (Array.isArray(data)) {
      accounts = data;
      renderAccounts();
    }
  } catch (e) {
    console.error("listAccounts failed", e);
  }
}

// ---------- App Center (backend) ----------
async function hydrateApps() {
  if (!DC || !DC.hasBackend) return;
  try {
    const [list, presets] = await Promise.all([DC.listApps(), DC.listPresets()]);
    if (Array.isArray(presets)) appPresets = presets;
    if (Array.isArray(list)) {
      apps = list;
      renderAppStats();
      renderApps(document.getElementById("appSearch").value || "");
    }
  } catch (e) {
    console.error("listApps failed", e);
  }
}

function openAddAccount() {
  let provider = "github";
  // Normalize an ADO org input (bare slug, dev.azure.com URL, or
  // {org}.visualstudio.com URL) down to just the org slug — for the browser link.
  const normalizeOrg = (s) => {
    s = (s || "").trim().replace(/^https?:\/\//, "");
    const vs = s.indexOf(".visualstudio.com");
    if (vs >= 0) return s.slice(0, vs);
    if (s.startsWith("dev.azure.com/")) return s.slice("dev.azure.com/".length).split("/")[0];
    return s.split("/")[0].trim();
  };
  return Modal.custom({
    title: "Add account",
    render: (body, foot, close, mkBtn) => {
      body.innerHTML = `
        <div class="form-row">
          <label class="form-label">Provider</label>
          <div class="form-choice" id="acProvider">
            <button type="button" class="form-opt active" data-p="github">${ICON.github}GitHub</button>
            <button type="button" class="form-opt" data-p="azure">${ICON.azure}Azure DevOps</button>
          </div>
        </div>
        <div class="form-row" id="acUserRow">
          <label class="form-label">Username (optional)</label>
          <input class="modal-input" id="acUser" placeholder="auto-detected if left blank" spellcheck="false" autocomplete="off" />
        </div>
        <div class="form-row" id="acOrgRow" style="display:none">
          <label class="form-label">Organization</label>
          <input class="modal-input" id="acOrg" placeholder="e.g. contoso — or paste your Azure DevOps URL" spellcheck="false" autocomplete="off" />
        </div>
        <div class="form-row">
          <label class="form-label">Authentication</label>
          <button type="button" class="btn btn-primary" id="acAuthBtn" style="width:100%;justify-content:center">${ICON.external}Sign in with Git in browser</button>
          <div class="form-hint" id="acHint"></div>
        </div>
        <div class="form-row">
          <label class="form-label">Or paste a token</label>
          <input class="modal-input" id="acToken" type="password" placeholder="Personal access token" spellcheck="false" autocomplete="off" />
          <button type="button" class="btn btn-ghost btn-sm" id="acTokenLink" style="margin-top:8px">${ICON.key}Create a token…</button>
        </div>
        <div class="modal-error" id="acErr"></div>`;

      const userRow = body.querySelector("#acUserRow");
      const orgRow = body.querySelector("#acOrgRow");
      const hint = body.querySelector("#acHint");
      const err = body.querySelector("#acErr");
      // Auth mode: "git" (Credential Manager, token not stored) or "token" (PAT).
      let mode = "token";
      let gitHost = null;
      const setHint = () => {
        hint.textContent =
          provider === "azure"
            ? "Reuses Git Credential Manager — the same Microsoft sign-in you saw when cloning. Or paste a token below."
            : "Reuses Git Credential Manager — the same GitHub sign-in you saw when cloning. Or paste a token below.";
      };
      const resetGit = () => {
        mode = "token";
        gitHost = null;
        const ab = body.querySelector("#acAuthBtn");
        if (ab) ab.innerHTML = `${ICON.external}Sign in with Git in browser`;
      };
      const applyProvider = () => {
        userRow.style.display = provider === "github" ? "" : "none";
        orgRow.style.display = provider === "azure" ? "" : "none";
        resetGit();
        setHint();
      };
      applyProvider();

      body.querySelectorAll("#acProvider .form-opt").forEach((o) =>
        o.addEventListener("click", () => {
          provider = o.dataset.p;
          body.querySelectorAll("#acProvider .form-opt").forEach((x) => x.classList.toggle("active", x === o));
          applyProvider();
        })
      );

      // Typing a PAT switches back to token mode.
      body.querySelector("#acToken").addEventListener("input", () => {
        if (body.querySelector("#acToken").value) resetGit();
      });

      // Sign in via Git Credential Manager (same flow Git uses for clone/fetch).
      // On success we mark the account as git-auth; the token is NOT pulled into
      // the form (the backend re-resolves it via GCM and never stores it).
      body.querySelector("#acAuthBtn").addEventListener("click", async () => {
        err.textContent = "";
        let host;
        if (provider === "azure") {
          const raw = body.querySelector("#acOrg").value.trim();
          const org = normalizeOrg(raw);
          if (!org) {
            err.textContent = "Enter your Azure DevOps organization first.";
            return;
          }
          host = /visualstudio\.com/i.test(raw) ? `${org}.visualstudio.com` : "dev.azure.com";
        } else {
          host = "github.com";
        }
        if (!DC || !DC.hasBackend) {
          err.textContent = "Browser sign-in is only available in the desktop app.";
          return;
        }
        const ab = body.querySelector("#acAuthBtn");
        const orig = `${ICON.external}Sign in with Git in browser`;
        ab.disabled = true;
        ab.innerHTML = `<span class="spin">${ICON.sync}</span>Waiting for sign-in…`;
        try {
          const cred = await DC.gitToken(host);
          if (provider === "github" && cred.username && /^[a-zA-Z0-9-]+$/.test(cred.username)) {
            const u = body.querySelector("#acUser");
            if (!u.value.trim()) u.value = cred.username;
          }
          body.querySelector("#acToken").value = "";
          mode = "git";
          gitHost = host;
          ab.disabled = false;
          ab.innerHTML = `${ICON.check}Signed in — click “Add account”`;
        } catch (e) {
          err.textContent = String(e);
          ab.disabled = false;
          ab.innerHTML = orig;
        }
      });

      // Open the provider's token-creation page (PAT alternative).
      body.querySelector("#acTokenLink").addEventListener("click", () => {
        let url;
        if (provider === "azure") {
          const org = normalizeOrg(body.querySelector("#acOrg").value);
          if (!org) {
            err.textContent = "Enter your Azure DevOps organization first.";
            return;
          }
          url = `https://dev.azure.com/${encodeURIComponent(org)}/_usersSettings/tokens`;
        } else {
          url = "https://github.com/settings/tokens/new?description=DevCenter&scopes=repo";
        }
        err.textContent = "";
        if (DC && DC.hasBackend) DC.openUrl(url).catch((e) => console.error("openUrl failed", e));
        else window.open(url, "_blank");
      });

      const cancel = mkBtn("btn-ghost", "Cancel");
      cancel.addEventListener("click", () => close(null));
      const save = mkBtn("btn-primary", "Add account");
      save.addEventListener("click", async () => {
        const username = body.querySelector("#acUser").value.trim();
        const organization = body.querySelector("#acOrg").value.trim();
        const token = body.querySelector("#acToken").value;
        if (provider === "azure" && !organization) {
          err.textContent = "Enter your Azure DevOps organization.";
          return;
        }
        if (mode !== "git" && !token) {
          err.textContent = "Sign in with Git, or paste a token.";
          return;
        }
        err.textContent = "";
        save.disabled = true;
        save.textContent = "Connecting…";
        try {
          const account = await DC.addAccount({
            provider,
            username: provider === "github" ? username : null,
            organization: provider === "azure" ? organization : null,
            authKind: mode,
            host: mode === "git" ? gitHost : null,
            token: mode === "git" ? null : token,
            label: null,
          });
          close(account);
        } catch (e) {
          err.textContent = String(e);
          save.disabled = false;
          save.textContent = "Add account";
        }
      });
      foot.append(cancel, save);
    },
  });
}

if (DC && DC.hasBackend) {
  hydrateFromBackend().then(hydratePulls);
  hydrateAccounts();
  hydrateApps();
  DC.onReposUpdated((data) => {
    if (Array.isArray(data)) {
      repos = data;
      rerenderGit();
    }
  });

  // Live app status updates → patch the matching app and re-render.
  DC.onAppStatus((s) => {
    const at = apps.findIndex((a) => String(a.id) === String(s.id));
    if (at >= 0) {
      apps[at] = { ...apps[at], status: s.status, pid: s.pid, uptime: s.uptime };
      renderAppStats();
      renderApps(document.getElementById("appSearch").value || "");
    }
  });

  // Startup update check found an update → ask the user before installing,
  // because installing restarts the app. We never auto-install/restart. Prompt
  // only once per session.
  let updatePrompted = false;
  DC.onUpdateState(async (s) => {
    if (!s || s.status !== "available" || updatePrompted) return;
    updatePrompted = true;
    const go = await Modal.confirm({
      title: "Update available",
      message: `DevCenter ${s.version || ""} is available. Install it now? DevCenter will restart to finish updating.`,
      confirmText: "Update & restart",
    });
    if (go) {
      try { await DC.installUpdate(); }
      catch (e) { await Modal.alert({ title: "Update failed", message: String(e) }); }
    }
  });

  // New application.
  const newAppBtn = document.getElementById("newAppBtn");
  if (newAppBtn) newAppBtn.addEventListener("click", () => openAppForm(null));

  // Add account — open the connect form, then refresh accounts + PRs.
  const addAccountBtn = document.getElementById("addAccountBtn");
  if (addAccountBtn) {
    addAccountBtn.addEventListener("click", async () => {
      const account = await openAddAccount();
      if (!account) return;
      const i = accounts.findIndex((a) => a.id === account.id);
      if (i >= 0) accounts[i] = account;
      else accounts.push(account);
      renderAccounts();
      hydratePulls();
    });
  }

  // Clone repository — ask for a URL, pick a destination folder, clone, then refresh.
  const cloneBtn = document.getElementById("cloneBtn");
  if (cloneBtn) {
    cloneBtn.addEventListener("click", async () => {
      const url = await Modal.prompt({
        title: "Clone repository",
        label: "Repository URL",
        placeholder: "https://github.com/owner/repo.git",
        confirmText: "Choose folder…",
        validate: (v) => (v ? null : "Enter a repository URL."),
      });
      if (!url) return;
      let dir;
      try {
        dir = await window.__TAURI__.dialog.open({ directory: true, multiple: false, title: "Choose a folder to clone into" });
      } catch (e) {
        console.error("folder picker failed", e);
        return;
      }
      if (!dir) return;
      cloneBtn.disabled = true;
      try {
        const repo = await DC.cloneRepo(url, dir);
        if (repo && !repos.some((r) => r.id === repo.id)) repos.push(repo);
        rerenderGit();
      } catch (e) {
        console.error("cloneRepo failed", e);
        await Modal.alert({ title: "Clone failed", message: String(e) });
      } finally {
        cloneBtn.disabled = false;
      }
    });
  }

  // Add existing repository — pick an already-cloned folder and register it.
  const addRepoBtn = document.getElementById("addRepoBtn");
  if (addRepoBtn) {
    addRepoBtn.addEventListener("click", async () => {
      let dir;
      try {
        dir = await window.__TAURI__.dialog.open({ directory: true, multiple: false, title: "Select a repository folder (or a folder containing repositories)" });
      } catch (e) {
        console.error("folder picker failed", e);
        return;
      }
      if (!dir) return;
      const originalLabel = addRepoBtn.innerHTML;
      addRepoBtn.disabled = true;
      addRepoBtn.innerHTML = `<span class="spin">${ICON.sync}</span>Scanning…`;
      try {
        // First try the picked folder as a single repository.
        let repo = null;
        try { repo = await DC.addRepo(dir); } catch (_) { repo = null; }
        if (repo) {
          const exists = repos.some((r) => r.id === repo.id);
          if (!exists) repos.push(repo);
          rerenderGit();
          if (exists) await Modal.alert({ title: "Already added", message: `“${repo.name}” is already in your list.` });
        } else {
          // Not a repo itself — scan it for repositories nested inside and add them all.
          const before = new Set(repos.map((r) => r.id));
          const all = await DC.scanRepos([dir]);
          if (Array.isArray(all)) repos = all;
          rerenderGit();
          const added = repos.filter((r) => !before.has(r.id)).length;
          if (added > 0) {
            await Modal.alert({ title: "Repositories added", message: `Added ${added} ${added === 1 ? "repository" : "repositories"} from that folder.` });
          } else {
            await Modal.alert({ title: "No repositories found", message: "That folder isn’t a Git repository and doesn’t contain any." });
          }
        }
      } catch (e) {
        console.error("addRepo failed", e);
        await Modal.alert({ title: "Couldn't add repository", message: String(e) });
      } finally {
        addRepoBtn.disabled = false;
        addRepoBtn.innerHTML = originalLabel;
      }
    });
  }
}

// ============ CHANGES / COMMIT PAGE (GitHub Desktop / VS Code–style) ============
// Efficient handling of many files: collapsible file TREE (with single-child
// folder compaction, VS Code style) or flat LIST; tri-state folder checkboxes;
// keyboard navigation; and a 3-pane History view (commits | commit files | diff)
// so multi-file commits are fully navigable.
const ChangesPage = (() => {
  let repoId = null;        // selected repo path (== id)
  let branch = "main";
  let tab = "changes";      // "changes" | "history" | "pulls"
  let changesView = "list"; // left panel (Changes): "tree" | "list" — default flat list
  let detailView = "tree";  // middle panel (History detail): "tree" | "list" — default tree

  // Changes tab state — git staging model (like VS Code's Source Control view).
  let staged = [];          // index changes [{path, oldPath, status}]
  let unstaged = [];        // working-tree changes [{path, oldPath, status}]
  let stashes = [];         // saved stashes [{index, message, branch, when}]
  let collapsedChanges = new Set(); // collapsed folders in the "Changes" group
  let collapsedStaged = new Set();  // collapsed folders in the "Staged Changes" group
  let collapsedGroups = new Set();  // collapsed top-level groups: "staged" / "unstaged"

  // History tab state.
  let history = [];
  let activeSha = null;     // selected commit hash (null = working tree)
  let commitFiles = [];     // files in the selected commit
  let collapsedDetail = new Set();

  // Pull Requests tab state.
  let repoPulls = [];       // PRs for the selected repo [{id, title, branch, base, status, ...}]
  let pullsLoaded = false;  // whether the PR list has been fetched for the current repo
  let activePull = null;    // currently selected PR (drives the detail + diff panes)

  // Diff/navigation state.
  let activeFile = null;
  let activeGroup = null;   // "staged" | "unstaged" | null (history/commit)
  let navOrder = [];        // visible {path, group} in render order (prev/next + keys)
  let busy = false;

  const $ = (id) => document.getElementById(id);
  const esc = escapeHtml;

  const CARET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  const CHEV_UP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
  const CHEV_DOWN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  const FOLDER_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>';
  // Source-control row/group action icons (stage +, unstage −, discard ↩).
  const ACT_STAGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  const ACT_UNSTAGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  const ACT_DISCARD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path d="M3.00098 2.5C3.00098 2.22386 3.22483 2 3.50098 2C3.77712 2 4.00098 2.22386 4.00098 2.5V6.34262L7.17202 3.17157C8.73412 1.60948 11.2668 1.60948 12.8289 3.17157C14.391 4.73367 14.391 7.26633 12.8289 8.82843L7.80375 13.8536C7.60849 14.0488 7.2919 14.0488 7.09664 13.8536C6.90138 13.6583 6.90138 13.3417 7.09664 13.1464L12.1218 8.12132C13.2933 6.94975 13.2933 5.05025 12.1218 3.87868C10.9502 2.70711 9.0507 2.70711 7.87913 3.87868L4.75781 7H8.50098C8.77712 7 9.00098 7.22386 9.00098 7.5C9.00098 7.77614 8.77712 8 8.50098 8H3.60098C3.26961 8 3.00098 7.73137 3.00098 7.4V2.5Z"/></svg>';
  // Restore-from-stash: an up-arrow lifting out of a tray.
  const ACT_RESTORE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/><polyline points="8 8 12 4 16 8"/><line x1="12" y1="4" x2="12" y2="15"/></svg>';
  // Pull-request review state → chip styling.
  const REVIEW_MAP = {
    approved: { cls: "ok", icon: ICON.check, label: "Approved" },
    changes: { cls: "danger", icon: ICON.changes, label: "Changes requested" },
    pending: { cls: "muted", icon: ICON.clock, label: "Review pending" },
  };
  const prStateLabel = (s) => (s === "merged" ? "Merged" : s === "draft" ? "Draft" : "Open");
  function openPrUrl(url) {
    if (!url) return;
    if (DC && DC.hasBackend) DC.openUrl(url).catch((e) => console.error("openUrl failed", e));
    else window.open(url, "_blank");
  }

  const statBadge = (s) =>
    ({ new: "A", untracked: "U", modified: "M", deleted: "D", renamed: "R", conflicted: "C", typechange: "T" }[s] || "M");

  // ---- tree helpers ----
  function buildTree(list) {
    const root = { name: "", path: "", dirs: new Map(), files: [] };
    for (const f of list) {
      const parts = f.path.split("/");
      const fname = parts.pop();
      let node = root, prefix = "";
      for (const part of parts) {
        prefix = prefix ? prefix + "/" + part : part;
        let child = node.dirs.get(part);
        if (!child) { child = { name: part, path: prefix, dirs: new Map(), files: [] }; node.dirs.set(part, child); }
        node = child;
      }
      node.files.push({ ...f, name: fname });
    }
    return root;
  }
  function collectFiles(node) {
    let out = node.files.slice();
    for (const d of node.dirs.values()) out = out.concat(collectFiles(d));
    return out;
  }
  function allDirPaths(list) {
    const s = new Set();
    for (const f of list) {
      const parts = f.path.split("/"); parts.pop();
      let p = "";
      for (const part of parts) { p = p ? p + "/" + part : part; s.add(p); }
    }
    return s;
  }

  /**
   * Render a file tree/list into `container`.
   * opts: { files, collapsed, viewMode, rerender, group, onAction, onFolderAction }
   *   group: "staged" | "unstaged" | null (null = history commit, no actions)
   * Returns the ordered list of visible { path, group } entries (for keyboard nav).
   */
  function renderFileTree(container, opts) {
    const order = [];
    const rows = [];
    const group = opts.group || null;
    const withActions = group !== null;

    // Hover action buttons for a file/folder row, scoped to the group.
    const actionsHtml = (scope, key) => {
      if (!withActions) return "";
      const attr = scope === "folder" ? "data-act-folder" : "data-act-file";
      const btn = (act, title, icon) =>
        `<button class="scm-act" type="button" data-act="${act}" ${attr}="${esc(key)}" title="${title}">${icon}</button>`;
      let inner = "";
      if (group === "unstaged") inner = btn("discard", "Discard changes", ACT_DISCARD) + btn("stage", "Stage changes", ACT_STAGE);
      else if (group === "staged") inner = btn("unstage", "Unstage changes", ACT_UNSTAGE);
      return `<span class="scm-actions">${inner}</span>`;
    };

    const fileRow = (f, depth) => {
      const on = activeFile === f.path && activeGroup === group;
      order.push({ path: f.path, group });
      return `<div class="tree-row tree-file${on ? " selected" : ""}" data-file="${esc(f.path)}" data-group="${group || ""}" style="--d:${depth}" title="${esc(f.path)}">
        <span class="tree-twisty" style="visibility:hidden">${CARET}</span>
        <span class="tree-name">${esc(f.name)}</span>
        ${actionsHtml("file", f.path)}
        <span class="change-stat ${f.status}" title="${f.status}">${statBadge(f.status)}</span>
      </div>`;
    };

    const walk = (node, depth) => {
      const dirs = [...node.dirs.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      for (const dir of dirs) {
        // Compact single-child folder chains (a/b/c) like VS Code.
        let label = dir.name, eff = dir;
        while (eff.files.length === 0 && eff.dirs.size === 1) {
          const only = [...eff.dirs.values()][0];
          label += "/" + only.name; eff = only;
        }
        const isCollapsed = opts.collapsed.has(eff.path);
        const desc = collectFiles(eff);
        rows.push(`<div class="tree-row tree-folder" data-folder-row="${esc(eff.path)}" style="--d:${depth}">
          <span class="tree-twisty ${isCollapsed ? "collapsed" : ""}" data-twisty="${esc(eff.path)}">${CARET}</span>
          <span class="tree-ico">${FOLDER_ICO}</span>
          <span class="tree-name" title="${esc(eff.path)}">${esc(label)}</span>
          ${actionsHtml("folder", eff.path)}
          <span class="tree-count">${desc.length}</span>
        </div>`);
        if (!isCollapsed) walk(eff, depth + 1);
      }
      const fs = node.files.slice().sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      for (const f of fs) rows.push(fileRow(f, depth));
    };

    if (opts.viewMode === "list") {
      opts.files.slice()
        .sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()))
        .forEach((f) => {
          const i = f.path.lastIndexOf("/");
          const dir = i < 0 ? "" : f.path.slice(0, i + 1);
          const name = i < 0 ? f.path : f.path.slice(i + 1);
          const on = activeFile === f.path && activeGroup === group;
          order.push({ path: f.path, group });
          rows.push(`<div class="tree-row tree-file${on ? " selected" : ""}" data-file="${esc(f.path)}" data-group="${group || ""}" title="${esc(f.path)}" style="--d:0">
            <span class="tree-name"><span class="change-dir">${esc(dir)}</span>${esc(name)}</span>
            ${actionsHtml("file", f.path)}
            <span class="change-stat ${f.status}" title="${f.status}">${statBadge(f.status)}</span>
          </div>`);
        });
    } else {
      walk(buildTree(opts.files), 0);
    }

    container.innerHTML = rows.join("") || `<div class="changes-empty">No files.</div>`;

    // Listeners (direct, re-attached each render — reliable in WebView2).
    container.querySelectorAll("[data-twisty], .tree-folder").forEach((el) => {
      const key = el.dataset.twisty || el.dataset.folderRow;
      if (!key) return;
      el.addEventListener("click", (e) => {
        if (e.target.closest(".scm-act")) return;
        e.stopPropagation();
        if (opts.collapsed.has(key)) opts.collapsed.delete(key); else opts.collapsed.add(key);
        opts.rerender();
      });
    });
    if (withActions) {
      container.querySelectorAll(".scm-act").forEach((b) =>
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          const act = b.dataset.act;
          if (b.dataset.actFile != null) opts.onAction(act, b.dataset.actFile);
          else if (b.dataset.actFolder != null) opts.onFolderAction(act, b.dataset.actFolder);
        }));
    }
    container.querySelectorAll(".tree-file").forEach((row) =>
      row.addEventListener("click", (e) => {
        if (e.target.closest(".scm-act")) return;
        selectFile(row.dataset.file, row.dataset.group || null);
      }));

    return order;
  }

  // ---- repo picker ----
  function openRepoPicker() {
    if (!repos.length) {
      Modal.alert({ title: "No repositories", message: "Add or clone a repository on the Git Board first." });
      return;
    }
    const labels = [];
    const map = new Map();
    repos.forEach((r) => {
      let label = r.name, n = 2;
      while (map.has(label)) label = `${r.name} (${n++})`;
      map.set(label, r); labels.push(label);
    });
    Dropdown.open($("chgRepoBtn"), {
      header: "Select repository",
      options: labels,
      current: [...map.entries()].find(([, r]) => r.id === repoId)?.[0],
      search: labels.length > 7,
      searchPlaceholder: "Filter repositories…",
      emptyText: "No repositories.",
      minWidth: Math.max(320, $("chgRepoBtn").offsetWidth),
      optionIcon: (label) => {
        const r = map.get(label);
        return r ? providerIcon(r.provider) : "";
      },
      onSelect: (label) => { const r = map.get(label); if (r) selectRepo(r); },
    });
  }

  function selectRepo(r) {
    repoId = r.id;
    branch = r.branch || "main";
    try { localStorage.setItem("dc.changes.repoId", r.id); } catch (e) {}
    const repoLabel = $("chgRepoLabel");
    repoLabel.textContent = r.name;
    repoLabel.title = r.name;
    const repoIco = $("chgRepoIcon");
    if (repoIco) repoIco.innerHTML = providerIcon(r.provider);
    $("chgBranchLabel").textContent = branch;
    activeSha = null; activeFile = null; activeGroup = null; navOrder = [];
    staged = []; unstaged = []; history = []; commitFiles = [];
    repoPulls = []; pullsLoaded = false;
    showDiffEmpty("Select a file to view its diff.");
    if (tab === "history") loadHistory();
    else if (tab === "pulls") loadRepoPulls();
    else loadChanges();
  }

  async function openBranchPicker() {
    if (!repoId || !DC || !DC.hasBackend || busy) return;
    const btn = $("chgBranchBtn");
    const r = repos.find((x) => x.id === repoId);
    if (!btn || !r) return;

    if (Dropdown.isOpenFor(btn)) { Dropdown.close(); return; }

    let branches;
    btn.disabled = true;
    try {
      branches = await DC.listBranches(repoId);
    } catch (e) {
      console.error("listBranches failed", e);
      await Modal.alert({ title: "Couldn't load branches", message: String(e) });
      return;
    } finally {
      btn.disabled = false;
    }

    Dropdown.open(btn, {
      header: "Switch branch",
      headerAction: {
        label: "New branch",
        icon: ICON.plus,
        title: "Create a new branch",
        onClick: () =>
          openNewBranchDialog({
            branches,
            current: branch,
            onCreate: async (name, base) => {
              try {
                const updated = await DC.createBranch(repoId, name, base);
                const at = repos.findIndex((x) => x.id === updated.id);
                if (at >= 0) repos[at] = updated;
                branch = updated.branch || name;
                $("chgBranchLabel").textContent = branch;
                if (tab === "history") loadHistory(); else loadChanges();
              } catch (e) {
                console.error("createBranch failed", e);
                await Modal.alert({ title: "Couldn't create branch", message: String(e) });
              }
            },
          }),
      },
      options: branches,
      current: branch,
      search: true,
      searchPlaceholder: "Filter branches…",
      optionKind: "branch",
      optionIcon: () => ICON.branch,
      emptyText: "No local branches.",
      minWidth: Math.max(300, btn.offsetWidth),
      onContext: (opt, isCur, ev) =>
        openBranchContextMenu(ev, {
          repoId,
          branch: opt,
          isCurrent: isCur,
          branches,
          onChanged: (updated) => {
            if (updated) {
              const at = repos.findIndex((x) => x.id === updated.id);
              if (at >= 0) repos[at] = updated;
              branch = updated.branch || branch;
              $("chgBranchLabel").textContent = branch;
            }
            Dropdown.close();
            if (tab === "history") loadHistory(); else loadChanges();
          },
        }),
      onSelect: async (target) => {
        try {
          const rd = repos.find((x) => x.id === repoId);
          const dirty = (rd && rd.status === "dirty") || staged.length > 0 || unstaged.length > 0;
          const updated = await performBranchSwitch({ repoId, current: branch, target, dirty });
          if (!updated) return; // cancelled
          const at = repos.findIndex((x) => x.id === updated.id);
          if (at >= 0) repos[at] = updated;
          branch = updated.branch || target;
          $("chgBranchLabel").textContent = branch;
          if (tab === "history") loadHistory(); else loadChanges();
        } catch (e) {
          console.error("checkout failed", e);
          await Modal.alert({ title: "Switch failed", message: String(e) });
        }
      },
    });
  }

  function openRepoById(id) {
    const r = repos.find((x) => x.id === id);
    if (!r) return false;
    selectRepo(r);
    return true;
  }

  // Open a repo and jump straight to a specific tab ("changes" | "history" | "pulls").
  function openRepoTab(id, tabName) {
    if (!openRepoById(id)) return false;
    switchTab(tabName || "changes");
    return true;
  }

  // ---- changes tab ----
  async function loadChanges() {
    if (!repoId) return;
    $("changesList").innerHTML = `<div class="changes-empty">Loading…</div>`;
    try {
      const cs = await DC.gitChanges(repoId, null);
      branch = cs.branch || branch;
      $("chgBranchLabel").textContent = branch;
      collapsedChanges = new Set();
      collapsedStaged = new Set();
      activeFile = null; activeGroup = null;
      setChangeSet(cs);
    } catch (e) {
      console.error("gitChanges failed", e);
      $("changesList").innerHTML = `<div class="changes-empty">${esc(String(e))}</div>`;
    }
  }

  // Re-fetch the working tree WITHOUT the "Loading…" flash or dropping the open
  // diff. Used by the focus auto-refresh so commits made outside DevCenter (e.g.
  // from VS Code) update the Push/Pull counts and file list in place.
  async function refreshChangesSilently() {
    if (!repoId) return;
    try {
      const cs = await DC.gitChanges(repoId, null);
      branch = cs.branch || branch;
      $("chgBranchLabel").textContent = branch;
      setChangeSet(cs);
      // If the file whose diff is open was committed/removed externally, clear it.
      if (activeFile && !staged.concat(unstaged).some((f) => f.path === activeFile)) {
        activeFile = null; activeGroup = null;
        showDiffEmpty("Select a file to view its diff.");
      }
    } catch (e) {
      console.error("gitChanges (focus refresh) failed", e);
    }
  }

  // Apply a fresh ChangeSet to the Changes tab (used by load/stage/commit/sync).
  function setChangeSet(cs) {
    staged = cs.staged || [];
    unstaged = cs.unstaged || [];
    stashes = cs.stashes || [];
    renderSync(cs);
    renderChanges();
    updateConflictBanner();
  }

  // Show a banner linking to the conflict resolver while the repo has conflicts.
  function updateConflictBanner() {
    const banner = $("conflictBanner");
    if (!banner) return;
    const set = new Set();
    [...staged, ...unstaged].forEach((f) => { if (f.status === "conflicted") set.add(f.path); });
    const n = set.size;
    banner.hidden = n === 0;
    if (n) $("conflictBannerText").textContent = `${n} merge conflict${n === 1 ? "" : "s"} — resolve before committing`;
  }

  function renderChanges() {
    const filter = ($("changeFilter").value || "").toLowerCase();
    const fStaged = filter ? staged.filter((f) => f.path.toLowerCase().includes(filter)) : staged;
    const fUnstaged = filter ? unstaged.filter((f) => f.path.toLowerCase().includes(filter)) : unstaged;
    const total = staged.length + unstaged.length;

    $("changeCount").textContent =
      total === 0 ? "No changes" : `${total} change${total === 1 ? "" : "s"}`;

    const list = $("changesList");
    if (total === 0 && !stashes.length) {
      list.innerHTML = `<div class="changes-empty">No uncommitted changes.</div>`;
      navOrder = []; updateCommitBtn(); return;
    }

    list.innerHTML = "";
    navOrder = [];

    const makeGroup = (groupKey, fileList, title, bulkActions) => {
      if (!fileList.length) return;
      const isCollapsed = collapsedGroups.has(groupKey);
      const section = document.createElement("div");
      section.className = "scm-group" + (isCollapsed ? " collapsed" : "");
      section.dataset.group = groupKey;
      const head = document.createElement("div");
      head.className = "scm-group-head";
      head.innerHTML =
        `<span class="tree-twisty${isCollapsed ? " collapsed" : ""}">${CARET}</span>` +
        `<span class="scm-group-title">${title}</span>` +
        `<span class="scm-group-actions">${bulkActions}</span>` +
        `<span class="scm-group-count">${fileList.length}</span>`;
      section.appendChild(head);
      list.appendChild(section);
      // Click the header (but not its action buttons) to expand/collapse the group.
      head.addEventListener("click", (e) => {
        if (e.target.closest(".scm-act")) return;
        if (collapsedGroups.has(groupKey)) collapsedGroups.delete(groupKey);
        else collapsedGroups.add(groupKey);
        renderChanges();
      });
      head.querySelectorAll(".scm-act").forEach((b) =>
        b.addEventListener("click", (e) => { e.stopPropagation(); bulkAction(b.dataset.act, groupKey); }));
      if (isCollapsed) return; // body (and its files) hidden while collapsed
      const body = document.createElement("div");
      body.className = "scm-group-body";
      section.appendChild(body);
      const ord = renderFileTree(body, {
        files: fileList,
        collapsed: groupKey === "staged" ? collapsedStaged : collapsedChanges,
        viewMode: changesView,
        group: groupKey,
        rerender: renderChanges,
        onAction: (act, path) => fileAction(act, path, groupKey),
        onFolderAction: (act, dirPath) => folderAction(act, dirPath, groupKey),
      });
      navOrder = navOrder.concat(ord);
    };

    const stageGroupActions =
      `<button class="scm-act" type="button" data-act="discard" title="Discard all changes">${ACT_DISCARD}</button>` +
      `<button class="scm-act" type="button" data-act="stage" title="Stage all changes">${ACT_STAGE}</button>`;
    const unstageGroupActions =
      `<button class="scm-act" type="button" data-act="unstage" title="Unstage all changes">${ACT_UNSTAGE}</button>`;

    makeGroup("staged", fStaged, "Staged Changes", unstageGroupActions);
    makeGroup("unstaged", fUnstaged, "Changes", stageGroupActions);
    renderStashGroup(list);

    // Nothing rendered (the filter hid every file and there are no stashes).
    if (!list.children.length) {
      list.innerHTML = `<div class="changes-empty">No files match the filter.</div>`;
    }

    updateCommitBtn();
  }

  // Render the collapsible "Stashes" group at the bottom of the changes list.
  function renderStashGroup(list) {
    if (!stashes.length) return;
    const groupKey = "stashes";
    const isCollapsed = collapsedGroups.has(groupKey);
    const section = document.createElement("div");
    section.className = "scm-group scm-stashes" + (isCollapsed ? " collapsed" : "");
    section.dataset.group = groupKey;
    const head = document.createElement("div");
    head.className = "scm-group-head";
    head.innerHTML =
      `<span class="tree-twisty${isCollapsed ? " collapsed" : ""}">${CARET}</span>` +
      `<span class="scm-group-title">Stashes</span>` +
      `<span class="scm-group-count">${stashes.length}</span>`;
    section.appendChild(head);
    list.appendChild(section);
    head.addEventListener("click", () => {
      if (collapsedGroups.has(groupKey)) collapsedGroups.delete(groupKey);
      else collapsedGroups.add(groupKey);
      renderChanges();
    });
    if (isCollapsed) return;
    const body = document.createElement("div");
    body.className = "scm-group-body";
    section.appendChild(body);
    stashes.forEach((st) => {
      const row = document.createElement("div");
      row.className = "stash-row";
      row.title = st.message;
      row.innerHTML =
        `<span class="stash-ico">${ICON.archive}</span>` +
        `<span class="stash-main">` +
          `<span class="stash-msg">${esc(st.message)}</span>` +
          `<span class="stash-meta">${st.branch ? esc(st.branch) + " · " : ""}${esc(st.when)}</span>` +
        `</span>` +
        `<span class="scm-actions">` +
          `<button class="scm-act" type="button" data-act="restore" title="Restore — apply &amp; remove">${ACT_RESTORE}</button>` +
          `<button class="scm-act" type="button" data-act="drop" title="Delete stash">${ICON.trash}</button>` +
        `</span>`;
      body.appendChild(row);
      row.querySelector('[data-act="restore"]').addEventListener("click", (e) => { e.stopPropagation(); stashRestore(st); });
      row.querySelector('[data-act="drop"]').addEventListener("click", (e) => { e.stopPropagation(); stashDrop(st); });
      row.addEventListener("contextmenu", (e) => { e.preventDefault(); openStashContextMenu(e, st); });
    });
  }

  // ---- stash actions ----
  function openStashDialog() {
    if (!repoId || (staged.length === 0 && unstaged.length === 0) || busy) return;
    Modal.custom({
      title: "Stash changes",
      render: (body, foot, close, mkBtn) => {
        body.innerHTML = `
          <p class="modal-msg">Saves your uncommitted changes to a stash and resets the working tree to a clean state. Restore them anytime from the Stashes list.</p>
          <div class="form-row">
            <label class="form-label" for="stashMsg">Message (optional)</label>
            <input class="modal-input" id="stashMsg" type="text" placeholder="Work in progress on ${esc(branch)}" spellcheck="false" autocomplete="off" />
          </div>
          <label class="form-check"><input type="checkbox" id="stashUntracked" checked /> <span>Include untracked files</span></label>`;
        const msgEl = body.querySelector("#stashMsg");
        const untrackedEl = body.querySelector("#stashUntracked");
        const submit = () => close({ message: msgEl.value.trim(), includeUntracked: untrackedEl.checked });
        msgEl.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
        const cancel = mkBtn("btn-ghost", "Cancel");
        cancel.addEventListener("click", () => close(null));
        const ok = mkBtn("btn-primary", "Stash changes");
        ok.addEventListener("click", submit);
        foot.append(cancel, ok);
        setTimeout(() => msgEl.focus(), 40);
      },
    }).then((res) => {
      if (res) runStaging(() => DC.gitStashPush(repoId, res.message, res.includeUntracked));
    });
  }

  function stashRestore(st) {
    runStaging(() => DC.gitStashPop(repoId, st.index));
  }

  function stashApply(st) {
    runStaging(() => DC.gitStashApply(repoId, st.index));
  }

  async function stashDrop(st) {
    const ok = await Modal.confirm({
      title: "Delete stash",
      message: `Delete this stash? The saved changes will be permanently lost.\n\n“${st.message}”`,
      confirmText: "Delete stash",
      danger: true,
    });
    if (ok) runStaging(() => DC.gitStashDrop(repoId, st.index));
  }

  function openStashContextMenu(e, st) {
    if (!DC || !DC.hasBackend) return;
    Dropdown.context(e.clientX, e.clientY, [
      { label: "Restore (apply & remove)", icon: ACT_RESTORE, onClick: () => stashRestore(st) },
      { label: "Apply (keep stash)", icon: ICON.copy, onClick: () => stashApply(st) },
      { separator: true },
      { label: "Delete stash", icon: ICON.trash, danger: true, onClick: () => stashDrop(st) },
    ]);
  }

  // ---- staging actions ----
  function setOf(groupKey) {
    return groupKey === "staged" ? staged : unstaged;
  }

  // Run a staging operation (returns a fresh ChangeSet), then re-render and keep
  // the open diff in sync.
  async function runStaging(fn) {
    if (busy || !repoId) return;
    busy = true; updateCommitBtn();
    try {
      const cs = await fn();
      staged = cs.staged || [];
      unstaged = cs.unstaged || [];
      stashes = cs.stashes || [];
      renderSync(cs);
      // If the open file no longer exists in its group, clear the diff; else
      // refresh it (its staged/unstaged content may have shifted).
      const stillThere = activeGroup && setOf(activeGroup).some((f) => f.path === activeFile);
      renderChanges();
      if (activeFile && activeGroup) {
        if (stillThere) selectFile(activeFile, activeGroup);
        else { activeFile = null; activeGroup = null; showDiffEmpty("Select a file to view its diff."); }
      }
    } catch (e) {
      console.error("staging op failed", e);
      await Modal.alert({ title: "Action failed", message: String(e) });
    } finally {
      busy = false; updateCommitBtn();
    }
  }

  function fileAction(act, path, groupKey) {
    if (act === "stage") runStaging(() => DC.gitStage(repoId, [path]));
    else if (act === "unstage") runStaging(() => DC.gitUnstage(repoId, [path]));
    else if (act === "discard") confirmDiscard([path], `Are you sure you want to discard changes in “${path}”? This cannot be undone.`);
  }

  function folderAction(act, dirPath, groupKey) {
    const paths = descFilesForPath(setOf(groupKey), dirPath);
    if (!paths.length) return;
    if (act === "stage") runStaging(() => DC.gitStage(repoId, paths));
    else if (act === "unstage") runStaging(() => DC.gitUnstage(repoId, paths));
    else if (act === "discard") confirmDiscard(paths, `Discard changes in ${paths.length} file${paths.length === 1 ? "" : "s"} under “${dirPath}”? This cannot be undone.`);
  }

  function bulkAction(act, groupKey) {
    if (act === "stage") runStaging(() => DC.gitStage(repoId, []));
    else if (act === "unstage") runStaging(() => DC.gitUnstage(repoId, []));
    else if (act === "discard") confirmDiscard([], `Are you sure you want to discard ALL ${unstaged.length} change${unstaged.length === 1 ? "" : "s"}? This cannot be undone.`);
  }

  async function confirmDiscard(paths, message) {
    const ok = await Modal.confirm({ title: "Discard changes", message, confirmText: "Discard changes", danger: true });
    if (ok) runStaging(() => DC.gitDiscard(repoId, paths));
  }

  function descFilesForPath(list, dirPath) {
    const pref = dirPath + "/";
    return list.filter((f) => f.path === dirPath || f.path.startsWith(pref)).map((f) => f.path);
  }

  // ---- sync bar (pull / push / fetch) ----
  function renderSync(cs) {
    const ahead = cs.ahead || 0;
    const behind = cs.behind || 0;
    const hasUpstream = !!cs.hasUpstream;
    const pushBtn = $("pushBtn"), pullBtn = $("pullBtn");
    const pushCount = $("pushCount"), pullCount = $("pullCount");

    pushCount.hidden = ahead === 0;
    pushCount.textContent = ahead;
    pullCount.hidden = behind === 0;
    pullCount.textContent = behind;

    // Push is enabled when there are local commits to publish (or no upstream
    // yet → first publish). Pull is enabled when the remote is ahead.
    const canPush = !busy && (ahead > 0 || !hasUpstream);
    const canPull = !busy && hasUpstream && behind > 0;
    pushBtn.disabled = !canPush;
    pullBtn.disabled = !canPull;
    pushBtn.classList.toggle("primed", ahead > 0 || !hasUpstream);
    pullBtn.classList.toggle("primed", behind > 0);
    pushBtn.querySelector("span").textContent = hasUpstream ? "Push" : "Publish";
    // Fetch is always available — it never depends on local ahead/behind state.
    $("fetchSyncBtn").disabled = false;
  }

  async function doSync(kind) {
    if (busy || !repoId) return;
    const btn = kind === "push" ? $("pushBtn") : kind === "pull" ? $("pullBtn") : $("fetchSyncBtn");
    // Swap the directional arrow for the circular spinner while the operation
    // runs so the in-progress state is unmistakable (Fetch already uses this
    // icon). `.sync-btn.busy svg` rotates it. Restored in `finally`.
    const iconEl = btn.querySelector("svg");
    const prevIcon = iconEl ? iconEl.outerHTML : null;
    busy = true; btn.classList.add("busy");
    if (iconEl) iconEl.outerHTML = ICON.sync;
    // Disable Push/Pull while an op runs (Fetch stays available — the early
    // `if (busy) return` guard already prevents overlapping operations).
    [$("pushBtn"), $("pullBtn")].forEach((b) => (b.disabled = true));
    try {
      let cs;
      if (kind === "push") cs = await DC.gitPush(repoId);
      else if (kind === "pull") cs = await DC.gitPull(repoId);
      else { await DC.fetchRepo(repoId); cs = await DC.gitChanges(repoId, null); }
      branch = cs.branch || branch;
      $("chgBranchLabel").textContent = branch;
      busy = false;
      setChangeSet(cs);
    } catch (e) {
      console.error(kind + " failed", e);
      await Modal.alert({ title: `${kind[0].toUpperCase() + kind.slice(1)} failed`, message: String(e) });
    } finally {
      busy = false; btn.classList.remove("busy");
      const cur = btn.querySelector("svg");
      if (cur && prevIcon) cur.outerHTML = prevIcon;
      updateCommitBtn();
    }
  }

  function updateCommitBtn() {
    const summary = ($("commitSummary").value || "").trim();
    const has = staged.length > 0 || unstaged.length > 0;
    $("commitBtn").disabled = busy || !summary || !has;
    if (!busy) $("commitBtn").textContent = staged.length > 0 ? "Commit" : "Commit all";
    const stashBtn = $("changeStashBtn");
    if (stashBtn) stashBtn.disabled = busy || !has;
  }

  async function doCommit() {
    if (busy) return;
    const summary = ($("commitSummary").value || "").trim();
    const desc = $("commitDesc").value || "";
    if (!summary || (staged.length === 0 && unstaged.length === 0)) return;
    // Commit the staged index; if nothing is staged, commit everything.
    const all = staged.length === 0;
    busy = true; updateCommitBtn();
    const btn = $("commitBtn");
    const prev = btn.innerHTML;
    btn.innerHTML = `<span class="spin">${ICON.sync}</span>Committing…`;
    try {
      const cs = await DC.gitCommit(repoId, summary, desc, all);
      $("commitSummary").value = ""; $("commitDesc").value = "";
      branch = cs.branch || branch;
      $("chgBranchLabel").textContent = branch;
      activeFile = null; activeGroup = null;
      showDiffEmpty("Commit created. Select a file to view its diff.");
      staged = cs.staged || [];
      unstaged = cs.unstaged || [];
      renderSync(cs);
      renderChanges();
    } catch (e) {
      console.error("gitCommit failed", e);
      await Modal.alert({ title: "Commit failed", message: String(e) });
    } finally {
      // Restore the original commit button content after the spinner state.
      busy = false; btn.innerHTML = prev;
      const branchLbl = $("chgBranchLabel");
      if (branchLbl) branchLbl.textContent = branch;
      updateCommitBtn();
    }
  }

  // ---- history tab ----
  async function loadHistory() {
    if (!repoId) return;
    $("historyList").innerHTML = `<div class="changes-empty">Loading…</div>`;
    try {
      history = await DC.gitLog(repoId, 200);
      renderHistory();
      // Auto-select the newest commit so the detail + diff panes aren't left
      // empty (fills the space and matches GitHub Desktop behaviour).
      if (history.length && !activeSha) selectCommit(history[0].hash);
    } catch (e) {
      console.error("gitLog failed", e);
      $("historyList").innerHTML = `<div class="changes-empty">${esc(String(e))}</div>`;
    }
  }

  function renderHistory() {
    const filter = ($("historyFilter").value || "").toLowerCase();
    const shown = filter
      ? history.filter((c) => c.summary.toLowerCase().includes(filter) || c.author.toLowerCase().includes(filter) || c.id.includes(filter))
      : history;
    if (!shown.length) {
      $("historyList").innerHTML = `<div class="changes-empty">${history.length ? "No commits match." : "No commits yet."}</div>`;
      return;
    }
    $("historyList").innerHTML = shown
      .map((c) => {
        const tags = (c.tags || [])
          .map((t) => `<span class="history-tag" title="Tag: ${esc(t)}">${ICON.tag}<span>${esc(t)}</span></span>`)
          .join("");
        const unpushed = c.unpushed
          ? `<span class="history-unpushed" title="This commit hasn't been pushed yet">${ICON.up}</span>`
          : "";
        const badges = tags || unpushed ? `<div class="history-badges">${tags}${unpushed}</div>` : "";
        return `<div class="history-row${c.hash === activeSha ? " selected" : ""}" data-sha="${c.hash}">
        <div class="history-main">
          <div class="history-summary" title="${esc(c.summary)}">${esc(c.summary)}</div>
          <div class="history-meta"><span class="history-hash">${c.id}</span><span class="history-author" title="${esc(c.author)}">${esc(c.author)}</span><span class="hm-dot">·</span><span class="history-when">${esc(c.when)}</span></div>
        </div>${badges}
      </div>`;
      })
      .join("");
    $("historyList").querySelectorAll(".history-row").forEach((row) =>
      row.addEventListener("click", () => selectCommit(row.dataset.sha)));
  }

  async function selectCommit(sha) {
    activeSha = sha; activeFile = null; navOrder = [];
    $("historyList").querySelectorAll(".history-row").forEach((r) =>
      r.classList.toggle("selected", r.dataset.sha === sha));
    const c = history.find((x) => x.hash === sha);
    $("detailHead").innerHTML = `<div class="detail-msg">${esc(c ? c.summary : "")}</div>
      <div class="detail-meta"><span class="avatar">${esc((c && c.author ? c.author : "?").slice(0, 2).toUpperCase())}</span><span class="detail-author" title="${esc(c ? c.author : "")}">${esc(c ? c.author : "")}</span><span class="hm-dot">·</span><span class="history-when">${esc(c ? c.when : "")}</span><span class="history-hash">${esc(c ? c.id : sha.slice(0, 7))}</span></div>`;
    $("detailFiles").innerHTML = `<div class="changes-empty">Loading…</div>`;
    showDiffEmpty("Loading commit…");
    collapsedDetail = new Set();
    try {
      const cs = await DC.gitChanges(repoId, sha);
      commitFiles = cs.files || [];
      renderDetail();
      if (commitFiles.length) selectFile(commitFiles[0].path, null);
      else showDiffEmpty("This commit has no file changes.");
    } catch (e) {
      console.error("commit changes failed", e);
      $("detailFiles").innerHTML = `<div class="changes-empty">${esc(String(e))}</div>`;
      showDiffEmpty(String(e));
    }
  }

  function renderDetail() {
    $("detailFileCount").textContent =
      `${commitFiles.length} file${commitFiles.length === 1 ? "" : "s"} changed`;
    $("detailCollapseBtn").hidden = detailView !== "tree" || !commitFiles.some((f) => f.path.includes("/"));
    if (!commitFiles.length) {
      $("detailFiles").innerHTML = `<div class="changes-empty">No file changes.</div>`;
      navOrder = []; return;
    }
    navOrder = renderFileTree($("detailFiles"), {
      files: commitFiles, collapsed: collapsedDetail, viewMode: detailView, group: null, rerender: renderDetail,
    });
  }

  // ---- diff pane ----
  function showDiffEmpty(msg) {
    $("diffEmpty").textContent = msg;
    $("diffEmpty").hidden = false;
    $("diffContent").hidden = true;
  }

  function diffHeadHtml(path, addsStr, delsStr) {
    const idx = navOrder.findIndex((e) => e.path === activeFile && e.group === activeGroup);
    const nav = navOrder.length > 1
      ? `<div class="diff-nav">
          <button class="icon-mini" id="diffPrev" title="Previous file (↑)" ${idx <= 0 ? "disabled" : ""}>${CHEV_UP}</button>
          <span class="diff-pos">${idx + 1} / ${navOrder.length}</span>
          <button class="icon-mini" id="diffNext" title="Next file (↓)" ${idx >= navOrder.length - 1 ? "disabled" : ""}>${CHEV_DOWN}</button>
        </div>` : "";
    return `<span class="diff-path" title="${esc(path)}">${esc(path)}</span>${nav}<span class="diff-adds">${addsStr}</span><span class="diff-dels">${delsStr}</span>`;
  }

  function wireDiffNav() {
    const prev = $("diffPrev"), next = $("diffNext");
    if (prev) prev.addEventListener("click", () => step(-1));
    if (next) next.addEventListener("click", () => step(1));
  }

  function step(dir) {
    if (!navOrder.length) return;
    const idx = navOrder.findIndex((e) => e.path === activeFile && e.group === activeGroup);
    const ni = idx < 0 ? 0 : idx + dir;
    if (ni < 0 || ni >= navOrder.length) return;
    const e = navOrder[ni];
    selectFile(e.path, e.group);
  }

  async function selectFile(path, group) {
    group = group || null;
    activeFile = path; activeGroup = group;
    // Highlight the row + scroll into view in whichever list is active.
    const listId = (tab === "history" || tab === "pulls") ? "detailFiles" : "changesList";
    const list = $(listId);
    list.querySelectorAll(".tree-file").forEach((r) => {
      const on = r.dataset.file === path && (r.dataset.group || "") === (group || "");
      r.classList.toggle("selected", on);
      if (on) r.scrollIntoView({ block: "nearest" });
    });
    $("diffEmpty").hidden = true;
    $("diffContent").hidden = false;
    $("diffHead").innerHTML = diffHeadHtml(path, "…", "");
    wireDiffNav();
    $("diffBody").innerHTML = `<div class="diff-binary">Loading diff…</div>`;
    try {
      const d = (tab === "pulls" && activePull)
        ? await DC.prFileDiff(repoId, activePull.base, activePull.branch, path)
        : await DC.gitDiff(repoId, path, activeSha, group === "staged");
      if (activeFile !== path || activeGroup !== group) return; // a newer selection won
      renderDiff(d);
    } catch (e) {
      console.error("gitDiff failed", e);
      $("diffBody").innerHTML = `<div class="diff-binary">${esc(String(e))}</div>`;
    }
  }

  function renderDiff(d) {
    $("diffHead").innerHTML = diffHeadHtml(d.path, `+${d.additions}`, `−${d.deletions}`);
    wireDiffNav();
    if (d.binary) { $("diffBody").innerHTML = `<div class="diff-binary">Binary file — no text diff to display.</div>`; return; }
    if (!d.hunks.length) { $("diffBody").innerHTML = `<div class="diff-binary">No textual changes to display.</div>`; return; }
    const lang = (window.Highlighter && Highlighter.langForPath(d.path)) || "";
    const hl = (s) => (window.Highlighter ? Highlighter.line(s, lang) : esc(s));
    const rows = [];
    d.hunks.forEach((h) => {
      rows.push(`<div class="diff-hunk-head">${esc(h.header)}</div>`);
      h.lines.forEach((l) => {
        const cls = l.kind === "add" ? "add" : l.kind === "del" ? "del" : "";
        const oldN = l.oldLineno != null ? l.oldLineno : "";
        const newN = l.newLineno != null ? l.newLineno : "";
        const body = l.content ? hl(l.content) : "&nbsp;";
        rows.push(`<div class="diff-line ${cls}"><span class="diff-gutter"><span>${oldN}</span><span>${newN}</span></span><span class="diff-text">${body}</span></div>`);
      });
    });
    // Wrap rows in a max-content container so each row stretches to the widest
    // line — keeps the add/del row tints spanning the full width when the diff
    // is scrolled horizontally.
    $("diffBody").innerHTML = `<div class="diff-code">${rows.join("")}</div>`;
  }

  // ---- tabs / view mode ----
  function switchTab(next) {
    tab = next;
    $("cpane-changes").hidden = next !== "changes";
    $("cpane-history").hidden = next !== "history";
    $("cpane-pulls").hidden = next !== "pulls";
    $("commitDetail").hidden = next !== "history" && next !== "pulls";
    $("commitLayout").classList.toggle("mode-history", next === "history");
    $("commitLayout").classList.toggle("mode-pulls", next === "pulls");
    document.querySelectorAll(".commit-tab").forEach((t) => t.classList.toggle("active", t.dataset.ctab === next));
    activeFile = null; navOrder = [];
    if (next === "history") {
      activeSha = null; activePull = null;
      $("detailHead").innerHTML = "";
      $("detailFiles").innerHTML = `<div class="detail-empty">Select a commit to see its files.</div>`;
      $("detailFileCount").textContent = "Files";
      showDiffEmpty("Select a commit, then a file to view its diff.");
      loadHistory();
    } else if (next === "pulls") {
      activeSha = null; activePull = null;
      $("detailHead").innerHTML = "";
      $("detailFiles").innerHTML = `<div class="detail-empty">Select a pull request to see its files.</div>`;
      $("detailFileCount").textContent = "Files";
      showDiffEmpty("Select a pull request, then a file to view its diff.");
      if (pullsLoaded) renderRepoPulls($("pullFilter").value || "");
      else loadRepoPulls();
    } else {
      activeSha = null; activePull = null;
      showDiffEmpty("Select a file to view its diff.");
      if (repoId && !staged.length && !unstaged.length) loadChanges(); else renderChanges();
    }
  }

  // ---- pull requests tab ----
  async function loadRepoPulls() {
    if (!repoId) return;
    pullsLoaded = false; activePull = null;
    $("repoPrList").innerHTML = `<div class="changes-empty">Loading pull requests…</div>`;
    try {
      const data = await DC.listRepoPullRequests(repoId);
      repoPulls = Array.isArray(data) ? data : [];
      pullsLoaded = true;
      renderRepoPulls($("pullFilter").value || "");
      // Auto-open the newest PR so the detail + diff panes aren't left empty.
      if (repoPulls.length && !activePull) selectPull(repoPulls[0].id);
    } catch (e) {
      console.error("listRepoPullRequests failed", e);
      repoPulls = []; pullsLoaded = true;
      $("repoPrList").innerHTML = `<div class="changes-empty">${esc(String(e))}</div>`;
    }
  }

  function renderRepoPulls(filter = "") {
    const host = $("repoPrList");
    if (!host) return;
    if (!repoPulls.length) {
      host.innerHTML = `<div class="changes-empty">No open pull requests for this repository.</div>`;
      return;
    }
    const f = filter.toLowerCase();
    const list = repoPulls.filter((p) =>
      (p.title || "").toLowerCase().includes(f) ||
      String(p.id).includes(f) ||
      (p.author || "").toLowerCase().includes(f) ||
      (p.branch || "").toLowerCase().includes(f));
    if (!list.length) {
      host.innerHTML = `<div class="changes-empty">No pull requests match the filter.</div>`;
      return;
    }
    // Compact rows that mirror the commit list; clicking opens the PR in the
    // detail + diff panes.
    host.innerHTML = list
      .map((p) => {
        const sel = activePull && String(activePull.id) === String(p.id) ? " selected" : "";
        return `<div class="history-row${sel}" data-pr-id="${esc(String(p.id))}">
        <div class="history-main">
          <div class="history-summary" title="${esc(p.title)}">${esc(p.title)}</div>
          <div class="history-meta"><span class="history-hash">#${esc(String(p.id))}</span><span class="history-author" title="${esc(p.author)}">${esc(p.author)}</span><span class="hm-dot">·</span><span class="history-when">${esc(p.updated)}</span></div>
        </div>
        <div class="history-badges"><span class="pr-state ${esc(p.status)}">${prStateLabel(p.status)}</span></div>
      </div>`;
      })
      .join("");
    host.querySelectorAll(".history-row").forEach((row) =>
      row.addEventListener("click", () => selectPull(row.dataset.prId)));
  }

  async function selectPull(id) {
    const pr = repoPulls.find((p) => String(p.id) === String(id));
    if (!pr) return;
    activePull = pr; activeSha = null; activeFile = null; navOrder = [];
    $("repoPrList").querySelectorAll(".history-row").forEach((r) =>
      r.classList.toggle("selected", r.dataset.prId === String(id)));
    const initials = (pr.author || "?").slice(0, 2).toUpperCase();
    const rev = REVIEW_MAP[pr.reviews] || REVIEW_MAP.pending;
    $("detailHead").innerHTML = `<div class="detail-msg">${esc(pr.title)}</div>
      <div class="detail-meta"><span class="avatar">${esc(initials)}</span><span class="detail-author" title="${esc(pr.author)}">${esc(pr.author)}</span><span class="hm-dot">·</span><span class="history-when">${esc(pr.updated)}</span><span class="pr-state ${esc(pr.status)}">${prStateLabel(pr.status)}</span></div>
      <div class="pr-detail-branch"><code title="${esc(pr.branch)}">${esc(pr.branch)}</code><span class="pr-arrow">→</span><code title="${esc(pr.base)}">${esc(pr.base)}</code></div>
      <div class="pr-detail-stats"><span class="chip review ${rev.cls}">${rev.icon}${rev.label}</span><span class="chip">${ICON.comment}${pr.comments}</span><span class="pr-diff"><span class="add">+${pr.additions}</span> <span class="del">−${pr.deletions}</span></span><button class="btn btn-ghost btn-sm" id="prViewBtn">${ICON.external}View</button></div>`;
    const vb = $("prViewBtn");
    if (vb) vb.addEventListener("click", () => openPrUrl(pr.url));
    $("detailFiles").innerHTML = `<div class="changes-empty">Loading…</div>`;
    showDiffEmpty("Loading pull request…");
    collapsedDetail = new Set();
    try {
      const cs = await DC.prChanges(repoId, pr.base, pr.branch);
      if (activePull !== pr) return; // a newer selection won
      commitFiles = cs.files || [];
      renderDetail();
      if (commitFiles.length) selectFile(commitFiles[0].path, null);
      else showDiffEmpty("This pull request has no file changes.");
    } catch (e) {
      console.error("prChanges failed", e);
      if (activePull !== pr) return;
      commitFiles = []; navOrder = [];
      $("detailFileCount").textContent = "Files";
      $("detailFiles").innerHTML = `<div class="changes-empty">${esc(String(e))}</div>`;
      showDiffEmpty(String(e));
    }
  }

  // The view toggle lives in the Changes panel and controls ONLY the left
  // (Changes) file list. The History detail (middle) panel stays in tree view.
  function setView(mode) {
    if (changesView === mode) return;
    changesView = mode;
    document.querySelectorAll("#chgViewToggle .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === mode));
    renderChanges();
  }

  function collapseAll(set, list, rerender) {
    const dirs = allDirPaths(list);
    const allCollapsed = [...dirs].every((d) => set.has(d));
    set.clear();
    if (!allCollapsed) dirs.forEach((d) => set.add(d));
    rerender();
  }

  // Arrow-key navigation between files when a tree has focus.
  function onTreeKey(e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (!navOrder.length) return;
    e.preventDefault();
    step(e.key === "ArrowDown" ? 1 : -1);
  }

  function onShow() {
    if (!DC || !DC.hasBackend) return;
    const branchBtn = $("chgBranchBtn");
    if (branchBtn) branchBtn.disabled = !repos.length;
    if (!repoId) {
      // Restore the last-used repo across app restarts; fall back to the first.
      let saved = null;
      try { saved = localStorage.getItem("dc.changes.repoId"); } catch (e) {}
      const target = (saved && repos.find((r) => r.id === saved)) || repos[0];
      if (target) selectRepo(target);
      return;
    }
    // A repo is already selected — refresh the active tab so changes made since
    // the last visit (or on another tab) are always shown.
    if (tab === "history") loadHistory();
    else if (tab === "pulls") loadRepoPulls();
    else loadChanges();
  }

  // Drag-to-resize the commit/diff columns; widths persist in localStorage.
  // Double-click a divider to reset that column to its default width.
  function initResizers() {
    const layout = $("commitLayout");
    if (!layout) return;
    const LIMITS = { side: [240, 560], detail: [200, 520] };
    ["--w-side", "--w-detail"].forEach((v) => {
      try { const s = localStorage.getItem("dc.commit" + v); if (s) layout.style.setProperty(v, s); } catch (e) {}
    });
    layout.querySelectorAll(".pane-resizer").forEach((rz) => {
      const which = rz.dataset.resize;
      const varName = which === "side" ? "--w-side" : "--w-detail";
      rz.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const [min, max] = LIMITS[which];
        const startX = e.clientX;
        const startW = parseFloat(getComputedStyle(layout).getPropertyValue(varName)) || (which === "side" ? 320 : 264);
        rz.setPointerCapture(e.pointerId);
        rz.classList.add("dragging");
        document.body.classList.add("col-resizing");
        const move = (ev) => {
          const w = Math.max(min, Math.min(Math.round(startW + (ev.clientX - startX)), max));
          layout.style.setProperty(varName, w + "px");
        };
        const up = () => {
          rz.classList.remove("dragging");
          document.body.classList.remove("col-resizing");
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          try { localStorage.setItem("dc.commit" + varName, layout.style.getPropertyValue(varName)); } catch (e) {}
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      });
      rz.addEventListener("dblclick", () => {
        layout.style.removeProperty(varName);
        try { localStorage.removeItem("dc.commit" + varName); } catch (e) {}
      });
    });
  }

  function init() {
    const repoBtn = $("chgRepoBtn");
    if (!repoBtn) return;
    repoBtn.addEventListener("click", openRepoPicker);
    $("chgRefreshBtn").addEventListener("click", () => (tab === "history" ? loadHistory() : tab === "pulls" ? loadRepoPulls() : loadChanges()));
    document.querySelectorAll(".commit-tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.ctab)));
    document.querySelectorAll("#chgViewToggle .seg-btn").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
    $("changeFilter").addEventListener("input", renderChanges);
    $("historyFilter").addEventListener("input", renderHistory);
    $("pullFilter").addEventListener("input", () => renderRepoPulls($("pullFilter").value || ""));
    $("changeStashBtn").addEventListener("click", openStashDialog);
    // Per-tab refresh buttons inside each filter box (spin while reloading).
    const wireRefresh = (id, fn) => $(id).addEventListener("click", async () => {
      const b = $(id);
      if (!repoId || b.classList.contains("busy")) return;
      b.classList.add("busy");
      try { await fn(); } finally { b.classList.remove("busy"); }
    });
    wireRefresh("changeRefreshBtn", loadChanges);
    wireRefresh("historyRefreshBtn", loadHistory);
    wireRefresh("pullRefreshBtn", loadRepoPulls);
    $("detailCollapseBtn").addEventListener("click", () => collapseAll(collapsedDetail, commitFiles, renderDetail));
    $("commitSummary").addEventListener("input", updateCommitBtn);
    $("commitBtn").addEventListener("click", doCommit);
    $("chgBranchBtn").addEventListener("click", openBranchPicker);
    $("pushBtn").addEventListener("click", () => doSync("push"));
    $("pullBtn").addEventListener("click", () => doSync("pull"));
    $("fetchSyncBtn").addEventListener("click", () => doSync("fetch"));
    $("conflictBanner").addEventListener("click", () => {
      if (window.ConflictResolver && repoId) window.ConflictResolver.open(repoId);
    });
    $("changesList").addEventListener("keydown", onTreeKey);
    $("detailFiles").addEventListener("keydown", onTreeKey);
    initResizers();

    // Auto-refresh when the app window regains focus so commits/changes made
    // outside DevCenter (VS Code, terminal, …) update the Push/Pull counts and
    // file lists without a manual Refresh. Debounced because focus +
    // visibilitychange can both fire when restoring the window.
    let lastFocusRefresh = 0;
    const refreshOnFocus = () => {
      if (!DC || !DC.hasBackend || !repoId) return;
      if (document.querySelector(".nav-item.active")?.dataset.page !== "changes") return;
      const now = Date.now();
      if (now - lastFocusRefresh < 400) return;
      lastFocusRefresh = now;
      if (tab === "history") loadHistory();
      else if (tab === "pulls") loadRepoPulls();
      else refreshChangesSilently();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshOnFocus();
    });
  }

  init();
  return { onShow, openRepoById, openRepoTab };
})();
window.ChangesPage = ChangesPage;

// ---------- Merge-conflict resolver (separate full screen) ----------
const ConflictResolver = (() => {
  const $ = (id) => document.getElementById(id);
  const WARN =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  let repoId = null;
  let info = { kind: "none", ours: "", theirs: "", files: [] };
  let activeFile = null;
  let segments = null; // parsed segments of the active file's merged content

  async function open(id) {
    repoId = id;
    activeFile = null; segments = null;
    document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === "page-conflicts"));
    $("conflictMain").innerHTML = `<div class="conflict-empty">Loading…</div>`;
    await refresh();
    if (info.files.length) selectFile(info.files[0]);
  }

  async function refresh() {
    try { info = await DC.gitConflicts(repoId); }
    catch (e) { console.error("gitConflicts failed", e); info = { kind: "none", ours: "", theirs: "", files: [] }; }
    renderContext();
    renderFileList();
    updateDone();
  }

  function renderContext() {
    const repo = repos.find((r) => r.id === repoId);
    const name = repo ? repo.name : "";
    const verb = { rebase: "Rebasing", "cherry-pick": "Cherry-picking", revert: "Reverting" }[info.kind] || "Merging";
    const el = $("conflictContext");
    if (!info.files.length) el.textContent = name ? `No conflicts in ${name}.` : "No conflicts.";
    else el.innerHTML = `${escapeHtml(name)} · ${verb} <b>${escapeHtml(info.theirs)}</b> into <b>${escapeHtml(info.ours)}</b> · ${info.files.length} file${info.files.length === 1 ? "" : "s"} left`;
  }

  function renderFileList() {
    const list = $("conflictFiles");
    if (!info.files.length) { list.innerHTML = `<div class="conflict-empty" style="padding:24px">All conflicts resolved.</div>`; return; }
    list.innerHTML = "";
    info.files.forEach((f) => {
      const slash = f.lastIndexOf("/");
      const name = slash >= 0 ? f.slice(slash + 1) : f;
      const dir = slash >= 0 ? f.slice(0, slash + 1) : "";
      const row = document.createElement("div");
      row.className = "cfl-row" + (f === activeFile ? " active" : "");
      row.innerHTML = `<span class="cfl-ico">${WARN}</span><span class="cfl-name" title="${escapeHtml(f)}">${dir ? `<span class="cfl-dir">${escapeHtml(dir)}</span>` : ""}${escapeHtml(name)}</span><span class="cfl-badge">C</span>`;
      row.addEventListener("click", () => selectFile(f));
      list.appendChild(row);
    });
  }

  function updateDone() {
    const done = $("conflictDoneBtn");
    if (done) done.disabled = !(info.kind !== "none" && info.files.length === 0);
    const ab = $("conflictAbortBtn");
    if (ab) ab.disabled = info.kind === "none";
  }

  async function selectFile(f) {
    activeFile = f;
    renderFileList();
    $("conflictMain").innerHTML = `<div class="conflict-empty">Loading…</div>`;
    let cf;
    try { cf = await DC.gitConflictFile(repoId, f); }
    catch (e) { $("conflictMain").innerHTML = `<div class="conflict-empty">${escapeHtml(String(e))}</div>`; return; }
    if (cf.binary) { renderBinary(); return; }
    segments = parseConflicts(cf.merged);
    renderFile();
  }

  // Split the marked working-tree content into context + conflict segments.
  function parseConflicts(text) {
    const lines = text.split("\n");
    const segs = []; let ctx = []; let i = 0;
    const flush = () => { if (ctx.length) { segs.push({ type: "context", lines: ctx }); ctx = []; } };
    while (i < lines.length) {
      if (lines[i].startsWith("<<<<<<<")) {
        flush();
        const ours = [], theirs = []; i++;
        while (i < lines.length && !lines[i].startsWith("|||||||") && !lines[i].startsWith("=======")) ours.push(lines[i++]);
        if (i < lines.length && lines[i].startsWith("|||||||")) { i++; while (i < lines.length && !lines[i].startsWith("=======")) i++; }
        if (i < lines.length && lines[i].startsWith("=======")) i++;
        while (i < lines.length && !lines[i].startsWith(">>>>>>>")) theirs.push(lines[i++]);
        if (i < lines.length && lines[i].startsWith(">>>>>>>")) i++;
        segs.push({ type: "conflict", ours, theirs, choice: null });
      } else { ctx.push(lines[i++]); }
    }
    flush();
    return segs;
  }

  function lang() { return (window.Highlighter && window.Highlighter.langForPath(activeFile)) || ""; }
  function hl(line) { return window.Highlighter && window.Highlighter.line ? window.Highlighter.line(line, lang()) : escapeHtml(line); }
  function codeLines(arr) { return arr.map((l) => `<div class="cv-line">${l === "" ? "&nbsp;" : hl(l)}</div>`).join(""); }

  function renderFile() {
    const conflicts = segments.filter((s) => s.type === "conflict");
    const remaining = conflicts.filter((s) => !s.choice).length;
    const bar =
      `<div class="cv-bar">` +
        `<span class="cv-path" title="${escapeHtml(activeFile)}">${escapeHtml(activeFile)}</span>` +
        `<span class="cv-count">${conflicts.length - remaining}/${conflicts.length} resolved</span>` +
        `<div class="cv-actions">` +
          `<button class="btn btn-ghost btn-sm" data-act="ours">Take current</button>` +
          `<button class="btn btn-ghost btn-sm" data-act="theirs">Take incoming</button>` +
          `<button class="btn btn-ghost btn-sm" data-act="vscode" title="Open in VS Code">VS Code</button>` +
          `<button class="btn btn-primary btn-sm" data-act="save" ${remaining ? "disabled" : ""}>Mark resolved</button>` +
        `</div>` +
      `</div>`;
    let body = "";
    segments.forEach((s, idx) => { body += s.type === "context" ? `<div>${codeLines(s.lines)}</div>` : renderBlock(s, idx); });
    const main = $("conflictMain");
    main.innerHTML = bar + `<div class="cv-code">${body}</div>`;
    main.querySelector(".cv-actions").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]"); if (!btn) return;
      const act = btn.dataset.act;
      if (act === "ours" || act === "theirs") resolveSide(act);
      else if (act === "vscode") DC.openInVscode(repoId + "/" + activeFile).catch(() => DC.openInVscode(repoId).catch(() => {}));
      else if (act === "save") saveResolution();
    });
    main.querySelector(".cv-code").addEventListener("click", onBlockClick);
  }

  function renderBlock(s, idx) {
    if (s.choice) {
      const chosen = s.choice === "ours" ? s.ours : s.choice === "theirs" ? s.theirs : s.ours.concat(s.theirs);
      const label = s.choice === "ours" ? "Current change" : s.choice === "theirs" ? "Incoming change" : "Both changes";
      return `<div class="cv-block" data-idx="${idx}">` +
        `<div class="cv-side-label resolved"><span>✓ ${label}</span><span class="cv-side-actions"><span class="cv-undo" data-undo="${idx}">Undo</span></span></div>` +
        `<div class="cv-side-lines">${codeLines(chosen)}</div></div>`;
    }
    return `<div class="cv-block" data-idx="${idx}">` +
      `<div class="cv-side-label ours"><span>Current change · ${escapeHtml(info.ours)}</span><span class="cv-side-actions">` +
        `<button class="cv-mini ours" data-pick="ours" data-idx="${idx}">Accept current</button>` +
        `<button class="cv-mini" data-pick="both" data-idx="${idx}">Accept both</button></span></div>` +
      `<div class="cv-side-lines ours">${codeLines(s.ours)}</div>` +
      `<div class="cv-sep"></div>` +
      `<div class="cv-side-label theirs"><span>Incoming change · ${escapeHtml(info.theirs)}</span><span class="cv-side-actions">` +
        `<button class="cv-mini theirs" data-pick="theirs" data-idx="${idx}">Accept incoming</button></span></div>` +
      `<div class="cv-side-lines theirs">${codeLines(s.theirs)}</div></div>`;
  }

  function onBlockClick(e) {
    const pick = e.target.closest("[data-pick]");
    if (pick) { segments[+pick.dataset.idx].choice = pick.dataset.pick; updateBlock(+pick.dataset.idx); return; }
    const undo = e.target.closest("[data-undo]");
    if (undo) { segments[+undo.dataset.undo].choice = null; updateBlock(+undo.dataset.undo); }
  }

  // Re-render only the affected conflict block (keeps scroll position) and
  // refresh the resolved counter + "Mark resolved" button.
  function updateBlock(idx) {
    const main = $("conflictMain");
    const el = main.querySelector(`.cv-block[data-idx="${idx}"]`);
    if (el) el.outerHTML = renderBlock(segments[idx], idx);
    const conflicts = segments.filter((s) => s.type === "conflict");
    const remaining = conflicts.filter((s) => !s.choice).length;
    const countEl = main.querySelector(".cv-count");
    if (countEl) countEl.textContent = `${conflicts.length - remaining}/${conflicts.length} resolved`;
    const save = main.querySelector('[data-act="save"]');
    if (save) save.disabled = remaining > 0;
  }

  function buildContent() {
    const out = [];
    segments.forEach((s) => {
      if (s.type === "context") out.push(...s.lines);
      else if (s.choice === "ours") out.push(...s.ours);
      else if (s.choice === "theirs") out.push(...s.theirs);
      else if (s.choice === "both") out.push(...s.ours, ...s.theirs);
    });
    return out.join("\n");
  }

  function renderBinary() {
    $("conflictMain").innerHTML =
      `<div class="cv-bar"><span class="cv-path">${escapeHtml(activeFile)}</span><div class="cv-actions">` +
        `<button class="btn btn-ghost btn-sm" id="cvBinOurs">Keep current</button>` +
        `<button class="btn btn-ghost btn-sm" id="cvBinTheirs">Take incoming</button></div></div>` +
      `<div class="cv-binary">Binary file — choose which version to keep.</div>`;
    $("cvBinOurs").addEventListener("click", () => resolveSide("ours"));
    $("cvBinTheirs").addEventListener("click", () => resolveSide("theirs"));
  }

  async function resolveSide(side) {
    try { info = await DC.resolveConflict(repoId, activeFile, side, null); afterResolve(); }
    catch (e) { Modal.alert({ title: "Couldn't resolve", message: String(e) }); }
  }
  async function saveResolution() {
    try { info = await DC.resolveConflict(repoId, activeFile, null, buildContent()); afterResolve(); }
    catch (e) { Modal.alert({ title: "Couldn't save resolution", message: String(e) }); }
  }
  function afterResolve() {
    activeFile = info.files[0] || null;
    renderContext(); renderFileList(); updateDone();
    if (activeFile) selectFile(activeFile);
    else $("conflictMain").innerHTML = `<div class="conflict-empty">All conflicts resolved. Click <b>Complete</b> to finish.</div>`;
  }

  async function complete() {
    try { await DC.conflictContinue(repoId); finishBack(); }
    catch (e) { Modal.alert({ title: "Couldn't complete", message: String(e) }); }
  }
  async function abort() {
    const kind = info.kind === "none" ? "merge" : info.kind;
    const ok = await Modal.confirm({ title: `Abort ${kind}?`, message: "This discards the in-progress operation and restores your branch to its previous state.", confirmText: "Abort", danger: true });
    if (!ok) return;
    try { await DC.conflictAbort(repoId); finishBack(); }
    catch (e) { Modal.alert({ title: "Couldn't abort", message: String(e) }); }
  }
  function finishBack() {
    const id = repoId;
    showPage("changes");
    if (window.ChangesPage && window.ChangesPage.openRepoById) window.ChangesPage.openRepoById(id);
  }

  $("conflictBackBtn") && $("conflictBackBtn").addEventListener("click", () => showPage("changes"));
  $("conflictAbortBtn") && $("conflictAbortBtn").addEventListener("click", abort);
  $("conflictDoneBtn") && $("conflictDoneBtn").addEventListener("click", complete);

  return { open };
})();
window.ConflictResolver = ConflictResolver;

// Restore the last-viewed page across reloads (right-click → Reload keeps you here).
try {
  const savedPage = localStorage.getItem("dc.page");
  if (savedPage && [...navItems].some((n) => n.dataset.page === savedPage)) {
    showPage(savedPage);
  }
} catch (e) {}
