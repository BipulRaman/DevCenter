/// <reference types="vite/client" />

// Preact JSX runtime type augmentation is provided by the `jsxImportSource`
// tsconfig option (preact). This file also declares the Tauri global.

import type { TauriGlobal } from "@/platform/tauri";

interface SetiIconsApi {
  forFile(name: string): { char: string; color: string };
  idForFile(name: string): string;
}

interface HighlighterApi {
  langForPath(path: string): string;
  line(code: string, lang: string): string;
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
    /** Brand name, resolved from the backend `app_name` (productName). */
    BRAND: string;
    /** Seti icon lookup (loaded from /seti-icons.js as a global). */
    SetiIcons?: SetiIconsApi;
    /** Syntax highlighter (loaded from /highlight.js as a global). */
    Highlighter?: HighlighterApi;
  }
}

export {};
