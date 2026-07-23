import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { fileURLToPath, URL } from "node:url";

// Frontend for DevGitCenter, built with Preact. Runs in parallel to app/ui.
// Tauri serves the STATIC build output directly (no dev server / port), exactly
// like the old app/ui:
// - `bun run dev`   -> `vite build --watch` continuously rebuilds `dist-dev`.
//   Tauri's built-in dev server serves `dist-dev` (frontendDist) and hot-reloads
//   the webview whenever those files change, so edits appear live while
//   `cargo tauri dev` keeps Rust in dev too.
// - `bun run build` -> a clean production build into the same `dist-dev` folder,
//   which `cargo tauri build` embeds.
export default defineConfig(({ mode }) => {
  const dev = mode === "development";
  return {
    plugins: [preact()],
    // Tauri expects a fixed output and should not clear the terminal.
    clearScreen: false,
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    build: {
      // WebView2 / modern WKWebView / WebKitGTK all support esnext.
      target: "esnext",
      outDir: "dist-dev",
      emptyOutDir: true,
      // Dev watch builds stay readable + fast; production builds are minified.
      minify: dev ? false : "esbuild",
      sourcemap: true,
    },
  };
});

