// ---------- Wire up search ----------
document.getElementById("repoSearch").addEventListener("input", debounce((e) => renderRepos(e.target.value)));
document.getElementById("appSearch").addEventListener("input", debounce((e) => renderApps(e.target.value)));

// App Center status filter (All / Running / Stopped)
on(document, "#appFilter .seg-btn", "click", (btn) => {
  appStatusFilter = btn.dataset.appfilter;
  document.querySelectorAll("#appFilter .seg-btn").forEach((b) => {
    const active = b === btn;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
  });
  renderApps(document.getElementById("appSearch").value || "");
});

const prSearch = document.getElementById("prSearch");
prSearch.addEventListener("input", debounce((e) => renderPulls(e.target.value)));
on(document, "#prFilter .seg-btn", "click", (btn) => {
  prCurrentFilter = btn.dataset.filter;
  document.querySelectorAll("#prFilter .seg-btn").forEach((b) => {
    const active = b === btn;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
  });
  renderPulls(prSearch.value);
});

function wireMultiselect(selectId, buttonId) {
  const select = document.getElementById(selectId);
  const button = document.getElementById(buttonId);
  if (!select || !button) return;

  const setOpen = (open, moveFocus = false) => {
    select.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
    if (moveFocus) {
      const target = open ? select.querySelector('input[type="checkbox"]') : button;
      if (target) target.focus();
    }
  };
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(!select.classList.contains("open"));
  });
  button.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown") return;
    e.preventDefault();
    setOpen(true, true);
  });
  select.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false, true);
    }
  });
  document.addEventListener("click", (e) => {
    if (!select.contains(e.target)) setOpen(false);
  });
}

wireMultiselect("prRepoSelect", "prRepoBtn");
wireMultiselect("prAccountSelect", "prAccountBtn");
wireMultiselect("repoTagSelect", "repoTagBtn");
wireMultiselect("repoAccountSelect", "repoAccountBtn");
wireMultiselect("chgAccountSelect", "chgAccountBtn");

document.querySelectorAll(".seg").forEach((group) => {
  group.addEventListener("keydown", (e) => {
    const buttons = [...group.querySelectorAll(".seg-btn:not(:disabled)")];
    const index = buttons.indexOf(document.activeElement);
    if (index < 0 || buttons.length < 2) return;
    let next = index;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + buttons.length) % buttons.length;
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % buttons.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = buttons.length - 1;
    else return;
    e.preventDefault();
    buttons[next].focus();
    buttons[next].click();
  });
});
