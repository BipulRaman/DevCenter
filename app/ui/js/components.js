// ---------- Modal dialog (replaces native prompt/alert) ----------
const Modal = (() => {
  const overlay = document.getElementById("modalOverlay");
  const modalEl = overlay.querySelector(".modal");
  const titleEl = document.getElementById("modalTitle");
  const bodyEl = document.getElementById("modalBody");
  const footEl = document.getElementById("modalFoot");
  const closeBtn = document.getElementById("modalClose");
  const appEl = document.querySelector(".app");
  const queue = [];
  let settle = null;
  let restoreFocus = null;

  function focusableElements() {
    return [...modalEl.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.hidden && el.getClientRects().length > 0);
  }

  function drainQueue() {
    if (!settle && queue.length) show(queue.shift());
  }

  function close(result) {
    if (!settle) return;
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    document.removeEventListener("keydown", onKey);
    if (appEl) appEl.inert = false;
    const cb = settle;
    settle = null;
    const target = restoreFocus;
    restoreFocus = null;
    cb(result);
    if (target && target.isConnected) target.focus();
    if (queue.length) queueMicrotask(drainQueue);
  }
  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      close(null);
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = focusableElements();
    if (!focusable.length) {
      e.preventDefault();
      modalEl.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || !modalEl.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !modalEl.contains(document.activeElement))) {
      e.preventDefault();
      first.focus();
    }
  }
  closeBtn.addEventListener("click", () => close(null));
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) close(null);
  });

  function show({ title, resolve, render, opts }) {
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleEl.textContent = title;
    bodyEl.innerHTML = "";
    footEl.innerHTML = "";
    footEl.hidden = false; // reset — a previous modal (e.g. Git Output) may have hidden it
    modalEl.classList.toggle("modal-wide", !!opts.wide);
    settle = resolve;
    render(bodyEl, footEl, close);
    if (appEl) appEl.inert = true;
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => {
      if (!settle || modalEl.contains(document.activeElement)) return;
      const preferred = bodyEl.querySelector('input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)');
      (preferred || footEl.querySelector("button:not(:disabled)") || closeBtn).focus();
    });
  }

  function open(title, resolve, render, opts = {}) {
    const request = { title, resolve, render, opts };
    if (settle) queue.push(request);
    else show(request);
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
    anchor.setAttribute("aria-expanded", "false");
    active = null;
    if (anchor.isConnected) anchor.focus();
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
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", header || anchor.textContent.trim() || "Options");
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
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", String(isCur));
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
    const moveActive = (dir, focusRow = false) => {
      const rows = [...list.querySelectorAll('.dropdown-opt:not(:disabled):not([aria-disabled="true"])')];
      if (!rows.length) return;
      let idx = rows.findIndex((r) => r.classList.contains("active"));
      idx = idx < 0 ? (dir > 0 ? 0 : rows.length - 1) : (idx + dir + rows.length) % rows.length;
      rows.forEach((r) => r.classList.remove("active"));
      rows[idx].classList.add("active");
      rows[idx].scrollIntoView({ block: "nearest" });
      if (focusRow) rows[idx].focus();
    };

    const focusBoundary = (last) => {
      const rows = [...list.querySelectorAll('.dropdown-opt:not(:disabled):not([aria-disabled="true"])')];
      if (!rows.length) return;
      rows.forEach((r) => r.classList.remove("active"));
      const row = rows[last ? rows.length - 1 : 0];
      row.classList.add("active");
      row.scrollIntoView({ block: "nearest" });
      row.focus();
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
    const onKey = (e) => {
      if (e.key === "Escape") close();
      else if (!input && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        moveActive(e.key === "ArrowDown" ? 1 : -1, true);
      } else if (!input && (e.key === "Home" || e.key === "End")) {
        e.preventDefault();
        focusBoundary(e.key === "End");
      }
    };
    const onMove = () => position();

    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onMove, true);
    window.addEventListener("scroll", onMove, true);
    anchor.classList.add("dropdown-open");
    anchor.setAttribute("aria-haspopup", "listbox");
    anchor.setAttribute("aria-expanded", "true");
    active = { menu, anchor, onDoc, onKey, onMove };
    if (input) setTimeout(() => input.focus(), 30);
    else setTimeout(() => focusBoundary(false), 30);
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
    anchor.setAttribute("aria-expanded", "true");
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

  // Nested flyout menu (e.g. the Git actions "gear" menu): a top-level menu
  // anchored to a button, where some rows open a submenu flyout on hover/click
  // instead of running an action. `items` is an array of
  // { label, icon, onClick, disabled, danger, submenu: items } or { separator }.
  // Submenus can nest arbitrarily deep; each level is its own floating panel so
  // deeper levels stay open while a shallower one is still visible.
  let flyoutAnchor = null;
  let flyoutLevels = []; // [{ el }] outermost first
  let flyoutOnDoc = null, flyoutOnKey = null, flyoutOnScroll = null;

  function closeFlyoutFrom(depth) {
    while (flyoutLevels.length > depth) flyoutLevels.pop().el.remove();
  }
  function closeFlyout() {
    if (!flyoutAnchor && !flyoutLevels.length) return;
    closeFlyoutFrom(0);
    document.removeEventListener("mousedown", flyoutOnDoc, true);
    document.removeEventListener("keydown", flyoutOnKey, true);
    window.removeEventListener("scroll", flyoutOnScroll, true);
    window.removeEventListener("resize", flyoutOnScroll, true);
    if (flyoutAnchor) flyoutAnchor.classList.remove("dropdown-open");
    if (flyoutAnchor) flyoutAnchor.setAttribute("aria-expanded", "false");
    flyoutAnchor = null;
  }

  function buildFlyoutLevel(items, depth) {
    const el = document.createElement("div");
    el.className = "dropdown-menu menu context-menu flyout-level";
    items.forEach((it) => {
      if (it.separator) {
        const sep = document.createElement("div");
        sep.className = "menu-sep";
        el.appendChild(sep);
        return;
      }
      const row = document.createElement("button");
      row.type = "button";
      row.className = "menu-item" + (it.danger ? " danger" : "") + (it.submenu ? " has-submenu" : "");
      if (it.disabled) row.disabled = true;
      row.innerHTML =
        `<span class="menu-ico">${it.icon || ""}</span><span class="menu-label">${it.label}</span>` +
        (it.submenu ? `<span class="menu-arrow">${ICON.chevronRight}</span>` : "");
      if (!it.disabled) {
        if (it.submenu) {
          let timer = null;
          row.addEventListener("mouseenter", () => {
            closeFlyoutFrom(depth + 1);
            clearTimeout(timer);
            timer = setTimeout(() => openFlyoutSubmenu(row, it.submenu, depth), 80);
          });
          row.addEventListener("mouseleave", () => clearTimeout(timer));
          row.addEventListener("click", () => openFlyoutSubmenu(row, it.submenu, depth));
        } else {
          row.addEventListener("mouseenter", () => closeFlyoutFrom(depth + 1));
          row.addEventListener("click", () => {
            closeFlyout();
            it.onClick();
          });
        }
      }
      el.appendChild(row);
    });
    document.body.appendChild(el);
    return el;
  }

  function openFlyoutSubmenu(anchorRow, items, parentDepth) {
    closeFlyoutFrom(parentDepth + 1);
    const r = anchorRow.getBoundingClientRect();
    const el = buildFlyoutLevel(items, parentDepth + 1);
    const mw = el.offsetWidth, mh = el.offsetHeight;
    let left = r.right - 3;
    if (left + mw > window.innerWidth - 8) left = Math.max(8, r.left - mw + 3);
    let top = r.top - 6;
    if (top + mh > window.innerHeight - 8) top = window.innerHeight - 8 - mh;
    if (top < 8) top = 8;
    el.style.left = Math.round(left) + "px";
    el.style.top = Math.round(top) + "px";
    flyoutLevels.push({ el });
  }

  function flyout(anchor, items) {
    closeFlyout();
    close();
    closeContext();
    flyoutAnchor = anchor;
    const r = anchor.getBoundingClientRect();
    const el = buildFlyoutLevel(items, 0);
    const mw = el.offsetWidth, mh = el.offsetHeight;
    let left = r.right - mw;
    let top = r.bottom + 6;
    if (left < 8) left = 8;
    if (left + mw > window.innerWidth - 8) left = window.innerWidth - 8 - mw;
    if (top + mh > window.innerHeight - 8 && r.top - 6 - mh > 8) top = r.top - 6 - mh;
    if (top + mh > window.innerHeight - 8) top = window.innerHeight - 8 - mh;
    if (top < 8) top = 8;
    el.style.left = Math.round(left) + "px";
    el.style.top = Math.round(top) + "px";
    flyoutLevels = [{ el }];
    anchor.classList.add("dropdown-open");
    anchor.setAttribute("aria-expanded", "true");

    flyoutOnDoc = (e) => {
      if (flyoutLevels.some((l) => l.el.contains(e.target))) return;
      if (anchor.contains(e.target) || e.target === anchor) return;
      closeFlyout();
    };
    flyoutOnKey = (e) => { if (e.key === "Escape") closeFlyout(); };
    flyoutOnScroll = () => closeFlyout();
    document.addEventListener("mousedown", flyoutOnDoc, true);
    document.addEventListener("keydown", flyoutOnKey, true);
    window.addEventListener("scroll", flyoutOnScroll, true);
    window.addEventListener("resize", flyoutOnScroll, true);
  }

  return { open, close, isOpenFor, menu, context, closeContext, flyout, closeFlyout };
})();

// ---------- Enhanced tooltips ----------
// Replaces the plain native browser tooltip (from `title="…"`) with a small
// styled floating card, app-wide, via event delegation — no need to touch any
// of the many existing `title` attributes. The native `title` is temporarily
// removed while hovering (restored on mouseout) so the OS tooltip never shows
// alongside the custom one.
const Tooltip = (() => {
  let el = null;
  let showTimer = null;
  let hideTimer = null;
  let current = null;

  function ensureEl() {
    if (!el) {
      el = document.createElement("div");
      el.className = "app-tooltip";
      el.setAttribute("role", "tooltip");
      document.body.appendChild(el);
    }
    return el;
  }

  function position(target) {
    const tip = ensureEl();
    const r = target.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = r.left + r.width / 2 - tw / 2;
    let top = r.top - th - 9;
    let placement = "top";
    if (top < 8) {
      top = r.bottom + 9;
      placement = "bottom";
    }
    if (left < 8) left = 8;
    if (left + tw > window.innerWidth - 8) left = window.innerWidth - 8 - tw;
    tip.style.left = Math.round(left) + "px";
    tip.style.top = Math.round(top) + "px";
    tip.dataset.placement = placement;
    const arrowX = Math.max(10, Math.min(tw - 10, r.left + r.width / 2 - left));
    tip.style.setProperty("--tip-arrow-x", `${arrowX}px`);
  }

  function show(target, text) {
    clearTimeout(hideTimer);
    const tip = ensureEl();
    tip.textContent = text;
    current = target;
    position(target);
    // Force layout before adding the visible class so the transition runs.
    void tip.offsetWidth;
    tip.classList.add("visible");
  }

  function hide() {
    clearTimeout(showTimer);
    current = null;
    if (el) el.classList.remove("visible");
  }

  function restore(t) {
    if (t.dataset.tip !== undefined) {
      t.setAttribute("title", t.dataset.tip);
      delete t.dataset.tip;
    }
  }

  document.addEventListener(
    "mouseover",
    (e) => {
      const t = e.target.closest("[title]");
      if (!t || t === current) return;
      const text = t.getAttribute("title");
      if (!text) return;
      t.dataset.tip = text;
      t.removeAttribute("title");
      clearTimeout(showTimer);
      showTimer = setTimeout(() => show(t, text), 350);
    },
    true
  );

  document.addEventListener(
    "mouseout",
    (e) => {
      const t = e.target.closest("[data-tip]");
      if (!t) return;
      const to = e.relatedTarget;
      if (to && t.contains(to)) return;
      restore(t);
      hide();
    },
    true
  );

  // Any of these should dismiss an open tooltip immediately (stale position/text).
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide, true);
  document.addEventListener("mousedown", hide, true);

  return { hide };
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
  const items = [{ label: "Reload", icon: ICON.sync, onClick: () => location.reload() }];
  // On the Git Board (repo) page, offer “Fetch All” below Reload.
  const active = document.querySelector(".page.active");
  const onRepoPage = active && active.id === "page-git-board";
  if (onRepoPage && DC && DC.hasBackend && typeof fetchAllRepos === "function") {
    items.push({ label: "Fetch All", icon: ICON.sync, onClick: () => fetchAllRepos() });
  }
  Dropdown.context(e.clientX, e.clientY, items);
});
