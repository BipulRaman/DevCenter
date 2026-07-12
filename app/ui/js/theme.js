try {
  const savedTheme = localStorage.getItem("dc.theme");
  if (savedTheme === "light" || savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", savedTheme);
  }
} catch (e) {}

// Expose the device pixel ratio to CSS as `--dpr` so hairline separators can be
// drawn at exactly ONE device pixel via `calc(1px / var(--dpr))`. Without this,
// a 1px CSS border and a 1px-wide element line rasterize to different device
// widths at fractional display scaling (e.g. Windows 125%), so pane dividers and
// header underlines look inconsistently thick. Re-applied whenever the ratio
// changes (zoom, moving the window between monitors of different scaling).
(function () {
  const root = document.documentElement;
  const apply = () => root.style.setProperty("--dpr", String(window.devicePixelRatio || 1));
  apply();
  let mq;
  const watch = () => {
    if (mq) mq.removeEventListener("change", onChange);
    mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener("change", onChange);
  };
  function onChange() { apply(); watch(); }
  try { watch(); } catch (e) {}
  window.addEventListener("resize", apply);
})();