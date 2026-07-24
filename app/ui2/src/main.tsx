import { render } from "preact";
import { App } from "@/app";
import { applyBrand } from "@/platform/brand";
import { ipc } from "@/platform/ipc";

const splashStartedAt = performance.now();
const minimumSplashMs = 1500;

// Mount the Preact app.
const root = document.getElementById("app");
if (!root) throw new Error("#app root element not found");
render(<App />, root);

// Resolve the brand from the backend (productName) and sync title/globals.
void applyBrand();

// Keep fast warm launches from dismissing the splash before it can be seen.
window.addEventListener("load", () => {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const remaining = Math.max(0, minimumSplashMs - (performance.now() - splashStartedAt));
      window.setTimeout(() => ipc.closeSplash().catch(() => {}), remaining);
    }),
  );
});
