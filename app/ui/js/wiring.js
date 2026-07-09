// ---------- Wire up search ----------
document.getElementById("repoSearch").addEventListener("input", debounce((e) => renderRepos(e.target.value)));
document.getElementById("appSearch").addEventListener("input", debounce((e) => renderApps(e.target.value)));

// App Center status filter (All / Running / Stopped)
on(document, "#appFilter .seg-btn", "click", (btn) => {
  appStatusFilter = btn.dataset.appfilter;
  document.querySelectorAll("#appFilter .seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
  renderApps(document.getElementById("appSearch").value || "");
});

const prSearch = document.getElementById("prSearch");
prSearch.addEventListener("input", debounce((e) => renderPulls(e.target.value)));
on(document, "#prFilter .seg-btn", "click", (btn) => {
  prCurrentFilter = btn.dataset.filter;
  document.querySelectorAll("#prFilter .seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
  renderPulls(prSearch.value);
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
