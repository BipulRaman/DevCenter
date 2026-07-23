import { render } from "preact";
import { App } from "@/app";
import { applyBrand } from "@/platform/brand";
import { ipc } from "@/platform/ipc";

// Mount the Preact app.
const root = document.getElementById("app");
if (!root) throw new Error("#app root element not found");
render(<App />, root);

// Resolve the brand from the backend (productName) and sync title/globals.
void applyBrand();

// Splash/reveal handshake — mirror app/ui/js/api.js: once the first real paint
// is on screen (2× rAF), dismiss the native splash and reveal the main window.
window.addEventListener("load", () => {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      ipc.closeSplash().catch(() => {});
    }),
  );
});
