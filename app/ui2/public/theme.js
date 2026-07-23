// Apply the saved theme + --dpr BEFORE first paint to avoid a flash.
// Ported from app/ui/js/theme.js. Kept as an external file (not inline) so it
// complies with the strict CSP (`script-src 'self'`) in tauri.conf.json.
try {
  var t = localStorage.getItem("dc.theme");
  if (t === "light" || t === "dark")
    document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
(function () {
  var root = document.documentElement;
  var apply = function () {
    root.style.setProperty("--dpr", String(window.devicePixelRatio || 1));
  };
  apply();
  var mq;
  function onChange() {
    apply();
    watch();
  }
  function watch() {
    if (mq) mq.removeEventListener("change", onChange);
    mq = window.matchMedia("(resolution: " + window.devicePixelRatio + "dppx)");
    mq.addEventListener("change", onChange);
  }
  try {
    watch();
  } catch (e) {}
  window.addEventListener("resize", apply);
})();
