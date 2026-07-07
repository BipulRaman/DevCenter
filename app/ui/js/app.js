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
  stop: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="5" y="5" width="14" height="14" rx="3"/></svg>',
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
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v14"/><polyline points="3 13 7 17 11 13"/><path d="M17 21V7"/><polyline points="13 11 17 7 21 11"/></svg>',
  mergeGit: '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.2731 7.73055C12.8027 7.26291 12.1664 7.00048 11.5031 7.00057C11.009 7.00024 10.5258 7.14639 10.1147 7.42049C9.70352 7.69458 9.38283 8.08436 9.19309 8.54061C9.13474 8.68241 9.09117 8.8298 9.06308 8.98055C8.04074 8.86836 7.08726 8.41091 6.36002 7.68367C5.63278 6.95643 5.17527 6.00289 5.06308 4.98055C5.21383 4.95246 5.36128 4.90889 5.50308 4.85054C5.95933 4.6608 6.34911 4.34017 6.6232 3.92903C6.8973 3.51789 7.04339 3.03474 7.04306 2.54061C7.05044 2.19765 6.9857 1.85696 6.85306 1.54061C6.72839 1.23755 6.54492 0.962142 6.3132 0.730425C6.08149 0.498708 5.80614 0.31518 5.50308 0.190508C5.18673 0.0578651 4.84604 -0.00680644 4.50308 0.00056644C4.00895 0.000236947 3.5258 0.146394 3.11466 0.420488C2.70352 0.694583 2.38283 1.08436 2.19309 1.54061C2.00508 1.9984 1.95607 2.50141 2.0521 2.98689C2.14813 3.47238 2.38493 3.91884 2.73307 4.27059C3.08357 4.61279 3.52396 4.84851 4.00308 4.95052V10.0506C3.68453 10.1128 3.3818 10.2386 3.11307 10.4206C2.7053 10.6979 2.38595 11.0867 2.19309 11.5406C2.00221 11.998 1.9516 12.5017 2.04764 12.9879C2.14368 13.4741 2.38202 13.9208 2.73245 14.2712C3.08289 14.6216 3.52959 14.86 4.01578 14.956C4.50197 15.052 5.00575 15.0015 5.46311 14.8106C5.91935 14.6209 6.30913 14.3001 6.58322 13.889C6.85732 13.4779 7.00341 12.9947 7.00308 12.5006C7.01046 12.1576 6.94572 11.8169 6.81308 11.5006C6.68841 11.1975 6.50494 10.9222 6.27323 10.6905C6.04151 10.4588 5.76616 10.2753 5.46311 10.1506C5.31476 10.0889 5.16065 10.042 5.00308 10.0106V7.61055C5.51974 8.34075 6.2061 8.93443 7.00308 9.34053C7.65433 9.67397 8.36417 9.87772 9.09311 9.94051C9.16543 10.3031 9.31723 10.6452 9.53763 10.942C9.75803 11.2388 10.0415 11.483 10.3676 11.6571C10.6938 11.8311 11.0545 11.9307 11.4237 11.9486C11.793 11.9665 12.1616 11.9023 12.5031 11.7606C12.9593 11.5708 13.3491 11.2501 13.6232 10.8389C13.8973 10.4278 14.0434 9.94465 14.0431 9.45052C14.0195 8.79894 13.7434 8.18211 13.2731 7.73055V7.73055ZM5.07309 11.1106C5.34915 11.2275 5.58535 11.4221 5.75308 11.6706C5.9453 11.9591 6.03162 12.3052 5.99741 12.6502C5.96319 12.9952 5.81055 13.3178 5.5654 13.5629C5.32026 13.8081 4.9978 13.9607 4.6528 13.995C4.30781 14.0292 3.96159 13.9428 3.67307 13.7506C3.42456 13.5828 3.23004 13.3466 3.11307 13.0705C3.00208 12.798 2.97429 12.4988 3.03311 12.2105C3.08958 11.9185 3.23212 11.6502 3.44242 11.4399C3.65271 11.2296 3.92112 11.0871 4.21311 11.0306C4.50138 10.9718 4.80061 10.9996 5.07309 11.1106V11.1106ZM4.50308 4.00057C4.20784 4.00073 3.9191 3.91377 3.67307 3.75057C3.42456 3.58283 3.23004 3.34657 3.11307 3.07051C3.00208 2.79803 2.97429 2.49881 3.03311 2.21053C3.08958 1.91854 3.23212 1.65019 3.44242 1.4399C3.65271 1.22961 3.92112 1.08706 4.21311 1.0306C4.50138 0.971769 4.80061 0.999561 5.07309 1.11055C5.34915 1.22752 5.58535 1.42211 5.75308 1.67061C5.90323 1.89662 5.98924 2.15909 6.00199 2.43013C6.01473 2.70117 5.95375 2.97057 5.82547 3.20967C5.6972 3.44878 5.50646 3.64865 5.27359 3.78792C5.04073 3.92719 4.77442 4.00067 4.50308 4.00057V4.00057ZM12.5631 10.5606C12.3184 10.8055 11.9965 10.9582 11.652 10.9929C11.3075 11.0275 10.9616 10.9419 10.6731 10.7506C10.4246 10.5828 10.23 10.3466 10.1131 10.0705C10.0021 9.79803 9.97429 9.49881 10.0331 9.21053C10.0896 8.91854 10.2321 8.65019 10.4424 8.4399C10.6527 8.22961 10.9211 8.08706 11.2131 8.0306C11.5014 7.97177 11.8006 7.99956 12.0731 8.11055C12.3491 8.22752 12.5853 8.42211 12.7531 8.67061C12.9444 8.95917 13.03 9.30501 12.9954 9.64949C12.9608 9.99398 12.808 10.3159 12.5631 10.5606V10.5606Z" fill="currentColor"/></svg>',
};

// Provider glyph for a repo/account ("github" | "azure" | other).
function providerIcon(p) {
  return p === "github" ? ICON.github : p === "azure" ? ICON.azure : ICON.repo;
}

// Turn a repo's cleaned remote (`host/path`, already stripped of scheme/.git/user
// by the backend) into a browsable web URL. Handles the Azure DevOps SSH form
// (ssh.dev.azure.com/v3/org/project/repo → dev.azure.com/org/project/_git/repo).
function repoWebUrl(remote) {
  const s = (remote || "").trim();
  if (!s) return null;
  const az = s.match(/^ssh\.dev\.azure\.com\/v3\/([^/]+)\/([^/]+)\/([^/]+)\/?$/i);
  if (az) return `https://dev.azure.com/${az[1]}/${az[2]}/_git/${az[3]}`;
  return "https://" + s.replace(/^\/+/, "");
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
      const web = repoWebUrl(r.remote);
      if (web) items.push({ label: "Open in browser", icon: ICON.external, onClick: () => DC.openUrl(web).catch((e) => console.error("openUrl failed", e)) });
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
        ? `<button class="btn btn-stop btn-sm" data-stop="${a.id}">${ICON.stop}Stop</button>
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

  // Shared actions menu used by BOTH the kebab (click) and a right-click context
  // menu on the card — mirroring the Git Board repo cards.
  const appMenuItems = (a) => {
    const items = [{ label: "Edit", icon: ICON.pencil, onClick: () => openAppForm(a) }];
    if (DC && DC.hasBackend) {
      items.push(
        { label: "Open folder", icon: ICON.folder, onClick: () => DC.openPath(a.projectDir).catch((err) => console.error(err)) },
        { label: "Open terminal", icon: ICON.terminal, onClick: () => DC.openTerminal(a.projectDir).catch((err) => console.error(err)) }
      );
    }
    items.push({ separator: true });
    items.push({ label: "Delete", icon: ICON.trash, danger: true, onClick: () => deleteApp(a) });
    return items;
  };

  listEl.querySelectorAll("[data-menu]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (Dropdown.isOpenFor(btn)) { Dropdown.close(); return; }
      const a = appById(btn.dataset.menu);
      if (a) Dropdown.menu(btn, appMenuItems(a));
    }));

  // Right-click anywhere on a card opens the same actions menu (like Git Board).
  // Direct per-row listener (delegated handlers can silently fail in WebView2);
  // stopPropagation prevents the global "Reload" context menu from firing.
  listEl.querySelectorAll(".app-row").forEach((row) =>
    row.addEventListener("contextmenu", (e) => {
      const a = appById(row.dataset.row);
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      Dropdown.context(e.clientX, e.clientY, appMenuItems(a));
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
      const I = {
        search: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
        wrap: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><path d="M3 12h15a3 3 0 1 1 0 6h-4"/><polyline points="16 16 14 18 16 20"/><line x1="3" y1="18" x2="10" y2="18"/></svg>`,
        copy: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
        save: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><polyline points="8 11 12 15 16 11"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>`,
        pause: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`,
        play: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>`,
      };
      body.innerHTML = `
        <div class="log-bar">
          <div class="search log-search">${I.search}<input id="logFilter" placeholder="Filter logs…" spellcheck="false" /></div>
          <div class="log-actions">
            <button class="log-icon active" id="logWrapBtn" type="button" title="Toggle line wrapping">${I.wrap}</button>
            <button class="log-icon" id="logCopyBtn" type="button" title="Copy logs">${I.copy}</button>
            <button class="log-icon" id="logExportBtn" type="button" title="Export logs to a file">${I.save}</button>
            <button class="log-pause" id="logPauseBtn" type="button" title="Pause auto-scroll"><span class="log-pause-ico">${I.pause}</span><span class="log-pause-label">Pause</span></button>
          </div>
        </div>
        <pre class="log-view wrap" id="logView"></pre>
        <div class="log-status">
          <span class="log-live" id="logLive"></span>
          <span id="logCount">0 lines</span>
        </div>`;
      const view = body.querySelector("#logView");
      const filterEl = body.querySelector("#logFilter");
      const pauseBtn = body.querySelector("#logPauseBtn");
      const pauseIco = pauseBtn.querySelector(".log-pause-ico");
      const pauseLabel = pauseBtn.querySelector(".log-pause-label");
      const liveEl = body.querySelector("#logLive");
      const countEl = body.querySelector("#logCount");
      let lines = [];
      let following = true; // auto-scroll while the view is pinned to the bottom

      // Format each line once (ANSI colours + linkified URLs + semantic
      // highlighting) and cache the HTML so live tailing doesn't re-run the
      // regex work on every redraw.
      const lineHtml = (l) => {
        if (l.__html == null) {
          const det = window.LogFmt ? LogFmt.detectLevel(l.line) : null;
          const lvl = det || (l.level === "error" ? "error" : l.stream === "system" ? "sys" : "out");
          const text = window.LogFmt ? LogFmt.format(l.line) : escapeHtml(l.line);
          const ts = l.ts ? `<span class="log-ts">${escapeHtml(l.ts)}</span>` : "";
          l.__html = `<span class="log-line log-${lvl}">${ts}<span class="log-text">${text}</span></span>`;
        }
        return l.__html;
      };
      const visible = () => {
        const q = filterEl.value.toLowerCase();
        return q ? lines.filter((l) => l.line.toLowerCase().includes(q)) : lines;
      };
      const atBottom = () => view.scrollHeight - view.scrollTop - view.clientHeight < 28;

      // Pause/Resume mirrors whether the view is following the tail. It's driven
      // automatically by scrolling (scroll up = pause, return to the bottom =
      // resume) and can also be toggled by clicking the button.
      const setFollowing = (f) => {
        following = f;
        pauseBtn.classList.toggle("paused", !f);
        pauseIco.innerHTML = f ? I.pause : I.play;
        pauseLabel.textContent = f ? "Pause" : "Resume";
        liveEl.className = "log-live" + (f ? "" : " paused");
        liveEl.title = f ? "Following new output" : "Paused — scrolled up";
      };
      const updateCount = (shownN) => {
        const total = lines.length;
        if (shownN == null) shownN = visible().length;
        countEl.textContent = filterEl.value
          ? `${shownN} of ${total} line${total === 1 ? "" : "s"}`
          : `${total} line${total === 1 ? "" : "s"}`;
      };
      const draw = () => {
        const shown = visible();
        const prevTop = view.scrollTop;
        view.innerHTML = shown.length
          ? shown.map(lineHtml).join("")
          : `<span class="log-empty">No log output ${filterEl.value ? "matches the filter" : "yet"}.</span>`;
        // Stick to the bottom while following; otherwise keep the reader's spot.
        view.scrollTop = following ? view.scrollHeight : prevTop;
        updateCount(shown.length);
      };
      filterEl.addEventListener("input", () => draw());

      // Scrolling drives the follow state: at the bottom → follow, scrolled up →
      // pause. rAF-debounced so rapid scroll events stay cheap.
      let scrollRaf = 0;
      view.addEventListener("scroll", () => {
        if (scrollRaf) return;
        scrollRaf = requestAnimationFrame(() => {
          scrollRaf = 0;
          const f = atBottom();
          if (f !== following) setFollowing(f);
        });
      });

      // Clicking a linkified URL opens it in the system browser.
      view.addEventListener("click", (e) => {
        const link = e.target.closest("a.lg-link");
        if (!link) return;
        e.preventDefault();
        if (link.dataset.url && DC && DC.openUrl) DC.openUrl(link.dataset.url);
      });

      const flash = (btn) => { if (!btn) return; btn.classList.add("flash"); setTimeout(() => btn.classList.remove("flash"), 900); };

      // Wrap toggle (on by default).
      const wrapBtn = body.querySelector("#logWrapBtn");
      wrapBtn.addEventListener("click", () => {
        wrapBtn.classList.toggle("active", view.classList.toggle("wrap"));
      });

      // Copy / Export operate on ALL captured lines (not just the filtered view).
      const asText = () => lines.map((l) => `${l.ts ? "[" + l.ts + "] " : ""}${l.line}`).join("\n");
      const copyBtn = body.querySelector("#logCopyBtn");
      copyBtn.addEventListener("click", async () => {
        await copyToClipboard(asText());
        flash(copyBtn);
      });
      const exportBtn = body.querySelector("#logExportBtn");
      exportBtn.addEventListener("click", async () => {
        try {
          const dlg = window.__TAURI__ && window.__TAURI__.dialog;
          if (!dlg || !dlg.save) return;
          const fname = `${(a.name || "app").replace(/[^\w.-]+/g, "_")}-logs.txt`;
          const path = await dlg.save({ title: "Export logs", defaultPath: fname, filters: [{ name: "Log file", extensions: ["txt", "log"] }] });
          if (!path) return;
          await DC.writeTextFile(path, asText());
          flash(exportBtn);
        } catch (err) { console.error("export failed", err); }
      });

      // Pause / resume auto-scroll. Resuming jumps straight to the latest output.
      pauseBtn.addEventListener("click", () => {
        if (following) setFollowing(false);
        else { setFollowing(true); view.scrollTop = view.scrollHeight; }
      });

      // Initial snapshot + live tail.
      if (DC && DC.hasBackend) {
        DC.appLogs(Number(a.id)).then((snap) => { lines = snap || []; draw(); }).catch((e) => console.error(e));
        DC.onAppLog((l) => {
          if (String(l.id) !== String(a.id)) return;
          lines.push(l);
          if (lines.length > 2000) lines.shift();
          draw();
        }).then((un) => { appLogUnsub = un; });
      } else {
        view.innerHTML = `<span class="log-empty">Logs stream in the desktop app.</span>`;
      }

      const clear = mkBtn("btn-ghost", "Clear");
      clear.addEventListener("click", () => { lines = []; setFollowing(true); draw(); });
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

// A small, dependency-free "markdown-lite" renderer for PR comment bodies
// (headers, bold/italic, inline code, fenced code blocks, links, images,
// lists, blockquotes, rules). Input is HTML-escaped FIRST, so nothing it
// produces can introduce unescaped user HTML — only the whitelisted tags
// built below ever appear, and link/image URLs are restricted to http(s).
function mdInline(s) {
  return s
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (_, alt, url) => `<img class="prr-md-img" src="${url}" alt="${alt}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, text, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`)
    .replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`)
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<strong>${a || b}</strong>`)
    .replace(/\*([^*]+)\*|_([^_]+)_/g, (_, a, b) => `<em>${a || b}</em>`);
}
function mdLite(raw) {
  if (!raw) return "";
  const blocks = [];
  let s = escapeHtml(raw)
    .replace(/\r\n/g, "\n")
    .replace(/```[a-zA-Z0-9]*\n([\s\S]*?)```/g, (_, code) => {
      blocks.push(`<pre class="prr-md-pre"><code>${code.replace(/\n$/, "")}</code></pre>`);
      return `\u0000${blocks.length - 1}\u0000`;
    });

  const out = [];
  let para = [];
  let list = null; // { tag, items }
  const flushPara = () => { if (para.length) { out.push(`<p>${para.join("<br>")}</p>`); para = []; } };
  const flushList = () => {
    if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.tag}>`); list = null; }
  };
  for (const line of s.split("\n")) {
    if (!line.trim()) { flushPara(); flushList(); continue; }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { flushPara(); flushList(); out.push(`<h4>${mdInline(m[2])}</h4>`); continue; }
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) { flushPara(); flushList(); out.push("<hr>"); continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara();
      if (!list || list.tag !== "ul") { flushList(); list = { tag: "ul", items: [] }; }
      list.items.push(mdInline(m[1]));
      continue;
    }
    if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      flushPara();
      if (!list || list.tag !== "ol") { flushList(); list = { tag: "ol", items: [] }; }
      list.items.push(mdInline(m[1]));
      continue;
    }
    if ((m = line.match(/^&gt;\s?(.*)$/))) { flushPara(); flushList(); out.push(`<blockquote>${mdInline(m[1])}</blockquote>`); continue; }
    flushList();
    para.push(mdInline(line));
  }
  flushPara();
  flushList();
  return out.join("").replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[Number(i)]);
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

// Open the "Merge into <current>" dialog. `branches` are the candidate source
// branches (current already excluded). `onMerge(source)` runs on confirm.
function openMergeBranchDialog({ branches, current, onMerge }) {
  Modal.custom({
    title: `Merge into “${current}”`,
    render: (body, foot, close, mkBtn) => {
      body.innerHTML = `
        <div class="form-row">
          <label class="form-label" for="mbSource">Branch to merge</label>
          <select class="modal-input" id="mbSource"></select>
          <div class="form-hint">Merges the selected branch's history into “${escapeHtml(current)}”. If both branches changed the same lines, you'll be asked to resolve conflicts.</div>
        </div>`;
      const sel = body.querySelector("#mbSource");
      branches.forEach((b) => {
        const o = document.createElement("option");
        o.value = b;
        o.textContent = b;
        sel.appendChild(o);
      });
      const cancel = mkBtn("btn-ghost", "Cancel");
      cancel.addEventListener("click", () => close(null));
      const merge = mkBtn("btn-primary", "Merge branch");
      merge.addEventListener("click", () => close(sel.value));
      foot.append(cancel, merge);
      setTimeout(() => sel.focus(), 40);
    },
  }).then((source) => {
    if (source) onMerge(source);
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

// Generic multi-field text-input dialog — used by several git-menu flows
// (Add Remote, Pull from…, Push to…, Create Tag…). `fields` is an array of
// { label, placeholder, value }. Resolves to an array of trimmed values (same
// order as `fields`), or null if cancelled.
function openFieldsDialog({ title, message, fields, confirmText, validate }) {
  return Modal.custom({
    title,
    render: (body, foot, close, mkBtn) => {
      body.innerHTML =
        (message ? `<p class="modal-msg">${escapeHtml(message)}</p>` : "") +
        fields
          .map(
            (f, i) => `
          <div class="form-row">
            <label class="form-label" for="fd${i}">${escapeHtml(f.label)}</label>
            <input class="modal-input" id="fd${i}" type="text" placeholder="${escapeHtml(f.placeholder || "")}" value="${escapeHtml(f.value || "")}" spellcheck="false" autocomplete="off" />
          </div>`
          )
          .join("") + `<div class="modal-error" id="fdErr"></div>`;
      const inputs = fields.map((_, i) => body.querySelector(`#fd${i}`));
      const errEl = body.querySelector("#fdErr");
      const submit = () => {
        const values = inputs.map((el) => el.value.trim());
        const msg = validate ? validate(values) : null;
        if (msg) {
          errEl.textContent = msg;
          return;
        }
        close(values);
      };
      inputs.forEach((el) =>
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter") submit();
        })
      );
      const cancel = mkBtn("btn-ghost", "Cancel");
      cancel.addEventListener("click", () => close(null));
      const ok = mkBtn("btn-primary", confirmText || "OK");
      ok.addEventListener("click", submit);
      foot.append(cancel, ok);
      setTimeout(() => inputs[0] && inputs[0].focus(), 40);
    },
  });
}

// Generic "pick one item from a list, then confirm" dialog — used by several
// git-menu flows (choose a stash/tag/remote/branch to act on). `items` is a
// plain array; `label(item)` returns the option's display text. Resolves to
// the chosen item, or null if cancelled.
function openPickDialog({ title, message, items, label, confirmText, danger }) {
  return Modal.custom({
    title,
    render: (body, foot, close, mkBtn) => {
      body.innerHTML =
        (message ? `<p class="modal-msg">${escapeHtml(message)}</p>` : "") +
        `<div class="form-row"><select class="modal-input" id="pickSel"></select></div>`;
      const sel = body.querySelector("#pickSel");
      items.forEach((it, i) => {
        const o = document.createElement("option");
        o.value = String(i);
        o.textContent = label(it);
        sel.appendChild(o);
      });
      const cancel = mkBtn("btn-ghost", "Cancel");
      cancel.addEventListener("click", () => close(null));
      const ok = mkBtn(danger ? "btn-danger" : "btn-primary", confirmText || "OK");
      ok.addEventListener("click", () => close(items[Number(sel.value)]));
      foot.append(cancel, ok);
    },
  });
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
          ${p.repoId ? `<button class="btn btn-primary btn-sm" data-pr-review="${p.id}" data-pr-repo="${p.repoId}">Review</button>` : ""}
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
  document.querySelectorAll("#prList [data-pr-review]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pr = pulls.find((p) => String(p.id) === btn.dataset.prReview && p.repoId === btn.dataset.prRepo);
      if (pr && window.PrReviewer) window.PrReviewer.open(pr.repoId, pr);
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
    footEl.hidden = false; // reset — a previous modal (e.g. Git Output) may have hidden it
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
// Generic file-tree/list renderer shared by the Changes page (staged/unstaged/
// history/PR file lists) and the PR Review page, so every file explorer in the
// app looks and behaves identically (collapsible folders, VS Code-style single-
// child compaction, tree/list toggle).
const FOLDER_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>';
const TREE_CARET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
// Source-control row/group action icons (stage +, unstage −, discard ↩).
const ACT_STAGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const ACT_UNSTAGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const ACT_DISCARD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path d="M3.00098 2.5C3.00098 2.22386 3.22483 2 3.50098 2C3.77712 2 4.00098 2.22386 4.00098 2.5V6.34262L7.17202 3.17157C8.73412 1.60948 11.2668 1.60948 12.8289 3.17157C14.391 4.73367 14.391 7.26633 12.8289 8.82843L7.80375 13.8536C7.60849 14.0488 7.2919 14.0488 7.09664 13.8536C6.90138 13.6583 6.90138 13.3417 7.09664 13.1464L12.1218 8.12132C13.2933 6.94975 13.2933 5.05025 12.1218 3.87868C10.9502 2.70711 9.0507 2.70711 7.87913 3.87868L4.75781 7H8.50098C8.77712 7 9.00098 7.22386 9.00098 7.5C9.00098 7.77614 8.77712 8 8.50098 8H3.60098C3.26961 8 3.00098 7.73137 3.00098 7.4V2.5Z"/></svg>';

const statBadge = (s) =>
  ({ new: "A", untracked: "U", modified: "M", deleted: "D", renamed: "R", conflicted: "C", typechange: "T" }[s] || "M");

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
 * opts: { files, collapsed, viewMode, rerender, group, onAction, onFolderAction,
 *         activeFile, activeGroup, onSelect, fileBadge }
 *   group: "staged" | "unstaged" | null (null = history/PR/commit, no hover actions)
 *   onSelect(path, group): called when a file row is clicked
 *   fileBadge(path): optional extra HTML shown before the change-stat badge
 *     (e.g. the PR Review page's comment-thread count)
 * Returns the ordered list of visible { path, group } entries (for keyboard nav).
 */
function renderFileTree(container, opts) {
  const order = [];
  const rows = [];
  const group = opts.group || null;
  const withActions = group !== null;
  const esc = escapeHtml;

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
  const badgeHtml = (path) => (opts.fileBadge ? opts.fileBadge(path) : "");

  const fileRow = (f, depth) => {
    const on = opts.activeFile === f.path && (opts.activeGroup || null) === group;
    order.push({ path: f.path, group });
    return `<div class="tree-row tree-file${on ? " selected" : ""}" data-file="${esc(f.path)}" data-group="${group || ""}" style="--d:${depth}" title="${esc(f.path)}">
      <span class="tree-twisty" style="visibility:hidden">${TREE_CARET}</span>
      <span class="tree-name">${esc(f.name)}</span>
      ${actionsHtml("file", f.path)}
      ${badgeHtml(f.path)}
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
        <span class="tree-twisty ${isCollapsed ? "collapsed" : ""}" data-twisty="${esc(eff.path)}">${TREE_CARET}</span>
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
        const on = opts.activeFile === f.path && (opts.activeGroup || null) === group;
        order.push({ path: f.path, group });
        rows.push(`<div class="tree-row tree-file${on ? " selected" : ""}" data-file="${esc(f.path)}" data-group="${group || ""}" title="${esc(f.path)}" style="--d:0">
          <span class="tree-name"><span class="change-dir">${esc(dir)}</span>${esc(name)}</span>
          ${actionsHtml("file", f.path)}
          ${badgeHtml(f.path)}
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
      opts.onSelect(row.dataset.file, row.dataset.group || null);
    }));

  return order;
}

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
  let prFetch = null;       // in-flight `git fetch` so PR branches are available locally for diffs

  // Diff/navigation state.
  let activeFile = null;
  let activeGroup = null;   // "staged" | "unstaged" | null (history/commit)
  let navOrder = [];        // visible {path, group} in render order (prev/next + keys)
  let busy = false;

  // Bumped on every navigation away from the current context (repo switch,
  // tab switch). Async loads (loadChanges/loadHistory/loadRepoPulls/
  // selectCommit/selectFile/selectPull/…) capture this value before their
  // first await and re-check it after — if it changed, a newer navigation
  // has already superseded them, so their (now-stale) result is discarded
  // instead of overwriting whatever the user has since navigated to. This is
  // what prevents an old file/commit/PR/repo load from "winning" the race and
  // flashing stale data into the detail/diff panes.
  let loadGen = 0;

  const $ = (id) => document.getElementById(id);
  const esc = escapeHtml;

  const CHEV_UP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
  const CHEV_DOWN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
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
    loadGen++; // cancel any in-flight load for the previously selected repo
    repoId = r.id;
    branch = r.branch || "main";
    try { localStorage.setItem("dc.changes.repoId", r.id); } catch (e) {}
    const repoLabel = $("chgRepoLabel");
    repoLabel.textContent = r.name;
    repoLabel.title = r.name;
    const repoIco = $("chgRepoIcon");
    if (repoIco) repoIco.innerHTML = providerIcon(r.provider);
    $("chgBranchLabel").textContent = branch;
    // Fully reset every piece of state carried over from the previous repo —
    // otherwise a leftover value (stashes, sync counts, collapse state, …)
    // can flash/act stale until the new repo's data finishes loading.
    activeSha = null; activeFile = null; activeGroup = null; activePull = null; navOrder = [];
    staged = []; unstaged = []; stashes = []; history = []; commitFiles = [];
    collapsedChanges = new Set(); collapsedStaged = new Set(); collapsedGroups = new Set(); collapsedDetail = new Set();
    repoPulls = []; pullsLoaded = false; prFetch = null;
    syncAhead = 0; syncBehind = 0; syncHasUpstream = false;
    renderSync({ ahead: 0, behind: 0, hasUpstream: false });
    // Clear all three list panes immediately, regardless of which tab is
    // active, so switching tabs mid-load can never reveal the old repo's data.
    $("changesList").innerHTML = `<div class="changes-empty">Loading…</div>`;
    $("historyList").innerHTML = `<div class="changes-empty">Loading…</div>`;
    $("repoPrList").innerHTML = `<div class="changes-empty">Loading…</div>`;
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
    loadGen++;
    const gen = loadGen;
    const forRepo = repoId;
    $("changesList").innerHTML = `<div class="changes-empty">Loading…</div>`;
    try {
      const cs = await DC.gitChanges(forRepo, null);
      if (gen !== loadGen || repoId !== forRepo) return; // superseded by a newer navigation
      branch = cs.branch || branch;
      $("chgBranchLabel").textContent = branch;
      collapsedChanges = new Set();
      collapsedStaged = new Set();
      activeFile = null; activeGroup = null;
      setChangeSet(cs);
    } catch (e) {
      if (gen !== loadGen || repoId !== forRepo) return;
      console.error("gitChanges failed", e);
      $("changesList").innerHTML = `<div class="changes-empty">${esc(String(e))}</div>`;
    }
  }

  // Re-fetch the working tree WITHOUT the "Loading…" flash or dropping the open
  // diff. Used by the focus auto-refresh so commits made outside DevCenter (e.g.
  // from VS Code) update the Push/Pull counts and file list in place.
  async function refreshChangesSilently() {
    if (!repoId) return;
    const gen = loadGen;
    const forRepo = repoId;
    try {
      const cs = await DC.gitChanges(forRepo, null);
      if (gen !== loadGen || repoId !== forRepo) return; // a real navigation/load has since taken over
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
  }

  // Show a banner linking to the conflict resolver while the repo has conflicts.
  function updateConflictBanner() {
    const banner = $("conflictBanner");
    if (!banner) return;
    const set = new Set();
    [...staged, ...unstaged].forEach((f) => { if (f.status === "conflicted") set.add(f.path); });
    const n = set.size;
    banner.hidden = n === 0;
    if (n) $("conflictBannerText").textContent = `${n} merge conflict${n === 1 ? "" : "s"}`;
  }

  function renderChanges() {
    // Keep the conflict banner in sync with the live change set on every render
    // (load, stage/unstage, discard, commit, filter) so it appears only while
    // real conflicts remain and hides the moment they're resolved.
    updateConflictBanner();
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
        `<span class="tree-twisty${isCollapsed ? " collapsed" : ""}">${TREE_CARET}</span>` +
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
        activeFile,
        activeGroup,
        onSelect: selectFile,
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
      `<span class="tree-twisty${isCollapsed ? " collapsed" : ""}">${TREE_CARET}</span>` +
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

  // ---- git actions ("gear" menu: pull / push / fetch / sync / merge / branch / stash / commit) ----
  let syncAhead = 0, syncBehind = 0, syncHasUpstream = false;

  function renderSync(cs) {
    syncAhead = cs.ahead || 0;
    syncBehind = cs.behind || 0;
    syncHasUpstream = !!cs.hasUpstream;
    const total = syncAhead + syncBehind;
    const badge = $("gitMenuBadge");
    badge.hidden = total === 0;
    badge.textContent = total;
    $("gitMenuBtn").title = syncHasUpstream
      ? `${syncAhead} to push · ${syncBehind} to pull`
      : "Branch has no upstream yet — Publish to create one";
  }

  // Runs a pull/push/fetch/sync op with the gear button spinning; refreshes the
  // Changes tab with the resulting ChangeSet.
  async function doSync(kind) {
    if (busy || !repoId) return;
    const btn = $("gitMenuBtn");
    busy = true; btn.classList.add("busy");
    try {
      let cs;
      if (kind === "push") cs = await DC.gitPush(repoId);
      else if (kind === "pull") cs = await DC.gitPull(repoId, false);
      else if (kind === "sync") {
        // Combined pull-then-push: fetch to get current ahead/behind, pull
        // (fast-forward) if the remote is ahead, then push local commits
        // (or publish, if the branch has no upstream yet).
        await DC.fetchRepo(repoId);
        cs = await DC.gitChanges(repoId, null);
        if (cs.hasUpstream && cs.behind > 0) cs = await DC.gitPull(repoId, false);
        if (cs.ahead > 0 || !cs.hasUpstream) cs = await DC.gitPush(repoId);
      } else { await DC.fetchRepo(repoId); cs = await DC.gitChanges(repoId, null); }
      branch = cs.branch || branch;
      $("chgBranchLabel").textContent = branch;
      busy = false;
      setChangeSet(cs);
    } catch (e) {
      console.error(kind + " failed", e);
      await Modal.alert({ title: `${kind[0].toUpperCase() + kind.slice(1)} failed`, message: String(e) });
    } finally {
      busy = false; btn.classList.remove("busy");
      updateCommitBtn();
    }
  }

  // Generic wrapper for a one-shot git action that returns a ChangeSet: spins
  // the gear button, applies the result, and surfaces errors. Used by most
  // "gear" menu actions beyond doSync/doMerge (which have their own flow).
  async function runGitAction(label, fn) {
    if (busy || !repoId) return null;
    const btn = $("gitMenuBtn");
    busy = true; btn.classList.add("busy");
    try {
      const cs = await fn();
      branch = cs.branch || branch;
      $("chgBranchLabel").textContent = branch;
      busy = false;
      setChangeSet(cs);
      return cs;
    } catch (e) {
      console.error(label + " failed", e);
      await Modal.alert({ title: `${label} failed`, message: String(e) });
      return null;
    } finally {
      busy = false; btn.classList.remove("busy");
      updateCommitBtn();
    }
  }

  // After a merge-like op (merge/rebase/pull --rebase), open the conflict
  // resolver if it left conflicts in progress, else confirm success.
  async function afterMergeLike(cs, doneMessage) {
    if (!cs || !repoId) return;
    const info = await DC.gitConflicts(repoId).catch(() => null);
    if (info && info.kind !== "none") {
      if (window.ConflictResolver) window.ConflictResolver.open(repoId);
    } else if (doneMessage) {
      await Modal.alert({ title: "Done", message: doneMessage });
    }
  }

  async function pullRebaseFlow() {
    const cs = await runGitAction("Pull (rebase)", () => DC.gitPull(repoId, true));
    await afterMergeLike(cs, `Rebased “${branch}” on the latest from upstream.`);
  }

  async function pullFromFlow() {
    if (!repoId || busy) return;
    const res = await openFieldsDialog({
      title: "Pull from…",
      fields: [
        { label: "Remote", placeholder: "origin", value: "origin" },
        { label: "Branch", placeholder: "main" },
      ],
      confirmText: "Pull",
      validate: ([remote, br]) => (!remote || !br ? "Enter a remote and a branch." : null),
    });
    if (!res) return;
    const cs = await runGitAction("Pull from", () => DC.gitPullFrom(repoId, res[0], res[1]));
    await afterMergeLike(cs, `Pulled “${res[1]}” from “${res[0]}”.`);
  }

  async function pushToFlow() {
    if (!repoId || busy) return;
    const res = await openFieldsDialog({
      title: "Push to…",
      fields: [
        { label: "Remote", placeholder: "origin", value: "origin" },
        { label: "Branch", placeholder: branch, value: branch },
      ],
      confirmText: "Push",
      validate: ([remote, br]) => (!remote || !br ? "Enter a remote and a branch." : null),
    });
    if (!res) return;
    runGitAction("Push to", () => DC.gitPushTo(repoId, res[0], res[1]));
  }

  // ---- merge / rebase another branch into the current branch ----
  async function pickOtherBranch(purpose) {
    if (!repoId || !DC || !DC.hasBackend || busy) return null;
    let branches;
    try {
      branches = await DC.listBranches(repoId);
    } catch (e) {
      console.error("listBranches failed", e);
      await Modal.alert({ title: "Couldn't load branches", message: String(e) });
      return null;
    }
    const candidates = (branches || []).filter((b) => b !== branch);
    if (!candidates.length) {
      await Modal.alert({ title: "No other branches", message: `There are no other local branches to ${purpose}.` });
      return null;
    }
    return candidates;
  }

  async function openMergeDialog() {
    const candidates = await pickOtherBranch(`merge into “${branch}”`);
    if (!candidates) return;
    openMergeBranchDialog({ branches: candidates, current: branch, onMerge: (source) => doMerge(source) });
  }

  async function doMerge(source) {
    const cs = await runGitAction("Merge", () => DC.mergeBranch(repoId, source));
    await afterMergeLike(cs, `Merged “${source}” into “${branch}”.`);
  }

  async function rebaseBranchFlow() {
    const candidates = await pickOtherBranch(`rebase “${branch}” onto`);
    if (!candidates) return;
    const onto = await openPickDialog({
      title: "Rebase branch",
      message: `Rebase “${branch}” onto the selected branch. If both changed the same lines, you'll be asked to resolve conflicts.`,
      items: candidates,
      label: (b) => b,
      confirmText: "Rebase",
    });
    if (!onto) return;
    const cs = await runGitAction("Rebase", () => DC.rebaseBranch(repoId, onto));
    await afterMergeLike(cs, `Rebased “${branch}” onto “${onto}”.`);
  }

  // ---- new branch (standalone, from the git actions menu) ----
  async function newBranchFlow() {
    if (!repoId || !DC || !DC.hasBackend || busy) return;
    let branches;
    try {
      branches = await DC.listBranches(repoId);
    } catch (e) {
      console.error("listBranches failed", e);
      await Modal.alert({ title: "Couldn't load branches", message: String(e) });
      return;
    }
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
    });
  }

  async function renameCurrentBranchFlow() {
    if (!repoId || busy) return;
    let branches;
    try {
      branches = await DC.listBranches(repoId);
    } catch (e) {
      console.error("listBranches failed", e);
      await Modal.alert({ title: "Couldn't load branches", message: String(e) });
      return;
    }
    openRenameBranchDialog({
      branch,
      existing: branches || [],
      onRename: async (newName) => {
        try {
          const updated = await DC.renameBranch(repoId, branch, newName);
          const at = repos.findIndex((x) => x.id === updated.id);
          if (at >= 0) repos[at] = updated;
          branch = updated.branch || newName;
          $("chgBranchLabel").textContent = branch;
        } catch (e) {
          console.error("renameBranch failed", e);
          await Modal.alert({ title: "Rename failed", message: String(e) });
        }
      },
    });
  }

  async function deleteBranchPickerFlow() {
    const candidates = await pickOtherBranch("delete");
    if (!candidates) return;
    const target = await openPickDialog({
      title: "Delete branch",
      items: candidates,
      label: (b) => b,
      confirmText: "Delete",
      danger: true,
    });
    if (!target) return;
    deleteBranchFlow({
      repoId,
      branch: target,
      onChanged: (updated) => {
        const at = repos.findIndex((x) => x.id === updated.id);
        if (at >= 0) repos[at] = updated;
        if (tab === "history") loadHistory(); else loadChanges();
      },
    });
  }

  async function deleteRemoteBranchFlow() {
    if (!repoId || busy) return;
    const name = await Modal.prompt({
      title: "Delete remote branch",
      label: "Branch name (on origin)",
      value: branch,
      confirmText: "Delete",
      validate: (v) => (v ? null : "Enter a branch name."),
    });
    if (!name) return;
    const ok = await Modal.confirm({
      title: "Delete remote branch",
      message: `Delete “${name}” from origin? This cannot be undone.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    runGitAction("Delete remote branch", () => DC.deleteRemoteBranch(repoId, name));
  }

  // ---- remotes ----
  async function addRemoteFlow() {
    if (!repoId || busy) return;
    const res = await openFieldsDialog({
      title: "Add remote",
      fields: [
        { label: "Name", placeholder: "origin" },
        { label: "URL", placeholder: "https://github.com/owner/repo.git" },
      ],
      confirmText: "Add",
      validate: ([name, url]) => (!name || !url ? "Enter a remote name and URL." : null),
    });
    if (!res) return;
    runGitAction("Add remote", () => DC.gitAddRemote(repoId, res[0], res[1]));
  }

  async function removeRemoteFlow() {
    if (!repoId || busy) return;
    let remotes;
    try {
      remotes = await DC.gitListRemotes(repoId);
    } catch (e) {
      console.error("listRemotes failed", e);
      await Modal.alert({ title: "Couldn't load remotes", message: String(e) });
      return;
    }
    if (!remotes || !remotes.length) {
      await Modal.alert({ title: "No remotes", message: "This repository has no remotes configured." });
      return;
    }
    const target = await openPickDialog({
      title: "Remove remote",
      items: remotes,
      label: (r) => `${r.name} — ${r.url}`,
      confirmText: "Remove",
      danger: true,
    });
    if (!target) return;
    runGitAction("Remove remote", () => DC.gitRemoveRemote(repoId, target.name));
  }

  // ---- undo the most recent commit / abort a rebase (from the gear menu) ----
  async function undoLastCommitFromMenu() {
    if (!repoId || busy) return;
    let latest;
    try {
      latest = await DC.gitLog(repoId, 1);
    } catch (e) {
      console.error("gitLog failed", e);
      await Modal.alert({ title: "Couldn't load commit history", message: String(e) });
      return;
    }
    if (!latest || !latest.length) {
      await Modal.alert({ title: "Nothing to undo", message: "This repository has no commits yet." });
      return;
    }
    undoCommit(latest[0]);
  }

  function abortRebaseFlow() {
    runGitAction("Abort rebase", () => DC.conflictAbort(repoId));
  }

  // ---- commit variants (plain / staged / all, each optionally amend / signed off) ----
  async function doCommitVariant({ all, amend, signoff }) {
    if (busy) return;
    const summary = ($("commitSummary").value || "").trim();
    const desc = $("commitDesc").value || "";
    if (!summary) {
      await Modal.alert({ title: "Enter a summary", message: "Type a commit summary in the box before committing." });
      return;
    }
    busy = true; updateCommitBtn();
    try {
      const cs = await DC.gitCommit(repoId, summary, desc, all, amend, signoff);
      $("commitSummary").value = ""; $("commitDesc").value = "";
      branch = cs.branch || branch;
      $("chgBranchLabel").textContent = branch;
      activeFile = null; activeGroup = null;
      showDiffEmpty("Commit created. Select a file to view its diff.");
      setChangeSet(cs);
    } catch (e) {
      console.error("commit failed", e);
      await Modal.alert({ title: "Commit failed", message: String(e) });
    } finally {
      busy = false; updateCommitBtn();
    }
  }

  // Main Commit button: staged-only if anything is staged, else stage + commit
  // everything. Swaps the button label for a spinner while committing.
  async function doCommit() {
    if (busy) return;
    const summary = ($("commitSummary").value || "").trim();
    if (!summary || (staged.length === 0 && unstaged.length === 0)) return;
    const btn = $("commitBtn");
    const prev = btn.innerHTML;
    btn.innerHTML = `<span class="spin">${ICON.sync}</span>Committing…`;
    try {
      await doCommitVariant({ all: staged.length === 0, amend: false, signoff: false });
    } finally {
      btn.innerHTML = prev;
      updateCommitBtn();
    }
  }

  // ---- stash: pick-one flows ----
  function stashLabel(st) {
    return `${st.message || "(no message)"} — ${st.branch} · ${st.when}`;
  }

  async function pickStashFlow({ title, confirmText, danger }) {
    if (!stashes.length) {
      await Modal.alert({ title: "No stashes", message: "There are no stashes to pick from." });
      return null;
    }
    return openPickDialog({ title, items: stashes, label: stashLabel, confirmText, danger });
  }

  async function applyStashPickerFlow() {
    const st = await pickStashFlow({ title: "Apply stash", confirmText: "Apply" });
    if (st) stashApply(st);
  }
  async function popStashPickerFlow() {
    const st = await pickStashFlow({ title: "Pop stash", confirmText: "Pop" });
    if (st) stashRestore(st);
  }
  async function dropStashPickerFlow() {
    const st = await pickStashFlow({ title: "Drop stash", confirmText: "Drop", danger: true });
    if (st) stashDrop(st);
  }
  async function dropAllStashesFlow() {
    if (!stashes.length) {
      await Modal.alert({ title: "No stashes", message: "There are no stashes to drop." });
      return;
    }
    const ok = await Modal.confirm({
      title: "Drop all stashes",
      message: `Delete all ${stashes.length} stash${stashes.length === 1 ? "" : "es"}? This cannot be undone.`,
      confirmText: "Drop all",
      danger: true,
    });
    if (ok) runStaging(() => DC.gitStashClear(repoId));
  }
  async function viewStashPickerFlow() {
    const st = await pickStashFlow({ title: "View stash", confirmText: "View" });
    if (st) viewStashDialog(st);
  }
  async function viewStashDialog(st) {
    let text;
    try {
      text = await DC.gitStashShow(repoId, st.index);
    } catch (e) {
      console.error("stashShow failed", e);
      await Modal.alert({ title: "Couldn't load stash", message: String(e) });
      return;
    }
    Modal.custom({
      title: stashLabel(st),
      wide: true,
      render: (body, foot) => {
        body.innerHTML = `<pre class="git-output-pre">${escapeHtml(text || "(empty diff)")}</pre>`;
        foot.hidden = true;
      },
    });
  }

  // ---- tags ----
  async function createTagFlow() {
    if (!repoId || busy) return;
    const res = await openFieldsDialog({
      title: "Create tag",
      fields: [
        { label: "Tag name", placeholder: "v1.0.0" },
        { label: "Target (optional, defaults to HEAD)", placeholder: branch },
        { label: "Message (optional — creates an annotated tag)", placeholder: "" },
      ],
      confirmText: "Create",
      validate: ([name]) => (!name ? "Enter a tag name." : null),
    });
    if (!res) return;
    runGitAction("Create tag", () => DC.gitCreateTag(repoId, res[0], res[1], res[2]));
  }

  async function pickTagFlow({ title, confirmText, danger }) {
    let tags;
    try {
      tags = await DC.gitListGitTags(repoId);
    } catch (e) {
      console.error("listGitTags failed", e);
      await Modal.alert({ title: "Couldn't load tags", message: String(e) });
      return null;
    }
    if (!tags || !tags.length) {
      await Modal.alert({ title: "No tags", message: "This repository has no tags." });
      return null;
    }
    return openPickDialog({ title, items: tags, label: (t) => (t.message ? `${t.name} — ${t.message}` : t.name), confirmText, danger });
  }
  async function deleteTagFlow() {
    const t = await pickTagFlow({ title: "Delete tag", confirmText: "Delete", danger: true });
    if (t) runGitAction("Delete tag", () => DC.gitDeleteTag(repoId, t.name));
  }
  async function deleteRemoteTagFlow() {
    const t = await pickTagFlow({ title: "Delete remote tag", confirmText: "Delete", danger: true });
    if (t) runGitAction("Delete remote tag", () => DC.gitDeleteRemoteTag(repoId, t.name));
  }
  function pushTagsFlow() {
    runGitAction("Push tags", () => DC.gitPushTags(repoId));
  }

  // ---- worktrees ----
  async function addWorktreeFlow() {
    if (!repoId || busy) return;
    let dir;
    try {
      dir = await window.__TAURI__.dialog.open({ directory: true, multiple: false, title: "Choose a folder for the new worktree" });
    } catch (e) {
      console.error("folder picker failed", e);
      return;
    }
    if (!dir) return;
    let branches = [];
    try { branches = (await DC.listBranches(repoId)) || []; } catch (e) { /* non-fatal */ }
    const res = await openFieldsDialog({
      title: "Add worktree",
      message: `Folder: ${dir}`,
      fields: [{ label: "Branch (existing, or new)", placeholder: branch }],
      confirmText: "Add",
      validate: ([b]) => (!b ? "Enter a branch name." : null),
    });
    if (!res) return;
    const br = res[0];
    const createBranch = !branches.includes(br);
    runGitAction("Add worktree", () => DC.gitAddWorktree(repoId, dir, br, createBranch));
  }

  async function removeWorktreeFlow() {
    if (!repoId || busy) return;
    let list;
    try {
      list = await DC.gitListWorktrees(repoId);
    } catch (e) {
      console.error("listWorktrees failed", e);
      await Modal.alert({ title: "Couldn't load worktrees", message: String(e) });
      return;
    }
    const candidates = (list || []).filter((w) => !w.isMain);
    if (!candidates.length) {
      await Modal.alert({ title: "No worktrees", message: "There are no linked worktrees to remove." });
      return;
    }
    const target = await openPickDialog({
      title: "Remove worktree",
      items: candidates,
      label: (w) => (w.branch ? `${w.name} (${w.branch})` : w.name),
      confirmText: "Remove",
      danger: true,
    });
    if (!target) return;
    runGitAction("Remove worktree", () => DC.gitRemoveWorktree(repoId, target.path, false));
  }

  // ---- Show Git Output ----
  async function showGitOutputFlow() {
    let entries = [];
    try { entries = (await DC.gitActionLog()) || []; } catch (e) { /* ignore */ }
    Modal.custom({
      title: "Git Output",
      wide: true,
      render: (body, foot) => {
        if (!entries.length) {
          body.innerHTML = `<p class="modal-msg">No git actions have run yet this session.</p>`;
        } else {
          const lines = entries.map((e) => `[${e.time}] ${e.repo} — ${e.action} — ${e.ok ? "OK" : "ERROR: " + (e.detail || "")}`);
          body.innerHTML = `<pre class="git-output-pre">${escapeHtml(lines.join("\n"))}</pre>`;
        }
        foot.hidden = true;
      },
    });
  }

  // ---- clone (top-level "Clone" action) ----
  async function cloneRepoFlow() {
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
    try {
      const repo = await DC.cloneRepo(url, dir);
      if (repo && !repos.some((r) => r.id === repo.id)) repos.push(repo);
      rerenderGit();
      if (repo) openRepoById(repo.id);
    } catch (e) {
      console.error("cloneRepo failed", e);
      await Modal.alert({ title: "Clone failed", message: String(e) });
    }
  }

  // ---- Git actions "gear" menu (strictly mirrors the reference layout) ----
  function gitMenuItems(conflictKind) {
    const hasStaged = staged.length > 0;
    const hasUnstaged = unstaged.length > 0;
    const hasChanges = hasStaged || hasUnstaged;
    const hasStashes = stashes.length > 0;
    const hasSummary = !!($("commitSummary").value || "").trim();
    const pushLabel = syncHasUpstream ? "Push" : "Publish";
    const isRebasing = conflictKind === "rebase";

    return [
      { label: "Pull", icon: ICON.down, onClick: () => doSync("pull") },
      { label: pushLabel, icon: ICON.up, onClick: () => doSync("push") },
      { label: "Fetch", icon: ICON.sync, onClick: () => doSync("fetch") },
      { label: "Checkout to…", icon: ICON.branch, onClick: openBranchPicker },
      { label: "Clone", icon: ICON.copy, onClick: cloneRepoFlow },
      { separator: true },
      {
        label: "Commit",
        icon: ICON.check,
        submenu: [
          { label: "Commit", icon: ICON.check, disabled: !hasChanges || !hasSummary, onClick: () => doCommitVariant({ all: !hasStaged, amend: false, signoff: false }) },
          { label: "Commit Staged", icon: ICON.check, disabled: !hasStaged || !hasSummary, onClick: () => doCommitVariant({ all: false, amend: false, signoff: false }) },
          { label: "Commit All", icon: ICON.check, disabled: !hasChanges || !hasSummary, onClick: () => doCommitVariant({ all: true, amend: false, signoff: false }) },
          { label: "Undo Last Commit", icon: ACT_DISCARD, onClick: undoLastCommitFromMenu },
          { label: "Abort Rebase", icon: ICON.x, danger: true, disabled: !isRebasing, onClick: abortRebaseFlow },
          { separator: true },
          { label: "Commit (Amend)", icon: ICON.pencil, disabled: !hasSummary, onClick: () => doCommitVariant({ all: !hasStaged, amend: true, signoff: false }) },
          { label: "Commit Staged (Amend)", icon: ICON.pencil, disabled: !hasStaged || !hasSummary, onClick: () => doCommitVariant({ all: false, amend: true, signoff: false }) },
          { label: "Commit All (Amend)", icon: ICON.pencil, disabled: !hasSummary, onClick: () => doCommitVariant({ all: true, amend: true, signoff: false }) },
          { separator: true },
          { label: "Commit (Signed Off)", icon: ICON.check, disabled: !hasChanges || !hasSummary, onClick: () => doCommitVariant({ all: !hasStaged, amend: false, signoff: true }) },
          { label: "Commit Staged (Signed Off)", icon: ICON.check, disabled: !hasStaged || !hasSummary, onClick: () => doCommitVariant({ all: false, amend: false, signoff: true }) },
          { label: "Commit All (Signed Off)", icon: ICON.check, disabled: !hasChanges || !hasSummary, onClick: () => doCommitVariant({ all: true, amend: false, signoff: true }) },
        ],
      },
      {
        label: "Changes",
        icon: ICON.changes,
        submenu: [
          { label: "Stage All Changes", icon: ICON.plus, disabled: !hasUnstaged, onClick: () => bulkAction("stage", "unstaged") },
          { label: "Unstage All Changes", icon: ICON.x, disabled: !hasStaged, onClick: () => bulkAction("unstage", "staged") },
          { label: "Discard All Changes", icon: ACT_DISCARD, danger: true, disabled: !hasUnstaged, onClick: () => bulkAction("discard", "unstaged") },
        ],
      },
      {
        label: "Pull, Push",
        icon: ICON.swap,
        submenu: [
          { label: "Sync", icon: ICON.swap, onClick: () => doSync("sync") },
          { separator: true },
          { label: "Pull", icon: ICON.down, onClick: () => doSync("pull") },
          { label: "Pull (Rebase)", icon: ICON.down, onClick: pullRebaseFlow },
          { label: "Pull from…", icon: ICON.down, onClick: pullFromFlow },
          { separator: true },
          { label: pushLabel, icon: ICON.up, onClick: () => doSync("push") },
          { label: "Push to…", icon: ICON.up, onClick: pushToFlow },
          { separator: true },
          { label: "Fetch", icon: ICON.sync, onClick: () => doSync("fetch") },
          { label: "Fetch (Prune)", icon: ICON.sync, onClick: () => runGitAction("Fetch (prune)", () => DC.gitFetchPrune(repoId)) },
          { label: "Fetch From All Remotes", icon: ICON.sync, onClick: () => runGitAction("Fetch (all remotes)", () => DC.gitFetchAll(repoId)) },
        ],
      },
      {
        label: "Branch",
        icon: ICON.branch,
        submenu: [
          { label: "Merge…", icon: ICON.mergeGit, onClick: openMergeDialog },
          { label: "Rebase Branch…", icon: ICON.swap, onClick: rebaseBranchFlow },
          { separator: true },
          { label: "Create Branch…", icon: ICON.plus, onClick: newBranchFlow },
          { label: "Create Branch From…", icon: ICON.plus, onClick: newBranchFlow },
          { separator: true },
          { label: "Rename Branch…", icon: ICON.pencil, onClick: renameCurrentBranchFlow },
          { label: "Delete Branch…", icon: ICON.trash, danger: true, onClick: deleteBranchPickerFlow },
          { label: "Delete Remote Branch…", icon: ICON.trash, danger: true, onClick: deleteRemoteBranchFlow },
          { separator: true },
          { label: "Publish Branch…", icon: ICON.up, disabled: syncHasUpstream, onClick: () => doSync("push") },
        ],
      },
      {
        label: "Remote",
        icon: ICON.external,
        submenu: [
          { label: "Add Remote…", icon: ICON.plus, onClick: addRemoteFlow },
          { label: "Remove Remote", icon: ICON.trash, danger: true, onClick: removeRemoteFlow },
        ],
      },
      {
        label: "Stash",
        icon: ICON.archive,
        submenu: [
          { label: "Stash", icon: ICON.archive, disabled: !hasChanges, onClick: () => runStaging(() => DC.gitStashPush(repoId, "", false)) },
          { label: "Stash (Include Untracked)", icon: ICON.archive, disabled: !hasChanges, onClick: () => runStaging(() => DC.gitStashPush(repoId, "", true)) },
          { label: "Stash Staged", icon: ICON.archive, disabled: !hasStaged, onClick: () => runStaging(() => DC.gitStashPushStaged(repoId, "")) },
          { separator: true },
          { label: "Apply Latest Stash", icon: ICON.copy, disabled: !hasStashes, onClick: () => stashApply(stashes[0]) },
          { label: "Apply Stash…", icon: ICON.copy, disabled: !hasStashes, onClick: applyStashPickerFlow },
          { separator: true },
          { label: "Pop Latest Stash", icon: ACT_RESTORE, disabled: !hasStashes, onClick: () => stashRestore(stashes[0]) },
          { label: "Pop Stash…", icon: ACT_RESTORE, disabled: !hasStashes, onClick: popStashPickerFlow },
          { separator: true },
          { label: "Drop Stash…", icon: ICON.trash, danger: true, disabled: !hasStashes, onClick: dropStashPickerFlow },
          { label: "Drop All Stashes…", icon: ICON.trash, danger: true, disabled: !hasStashes, onClick: dropAllStashesFlow },
          { separator: true },
          { label: "View Stash…", icon: ICON.eye, disabled: !hasStashes, onClick: viewStashPickerFlow },
        ],
      },
      {
        label: "Tags",
        icon: ICON.tag,
        submenu: [
          { label: "Create Tag…", icon: ICON.tag, onClick: createTagFlow },
          { label: "Delete Tag…", icon: ICON.trash, danger: true, onClick: deleteTagFlow },
          { label: "Delete Remote Tag…", icon: ICON.trash, danger: true, onClick: deleteRemoteTagFlow },
          { separator: true },
          { label: "Push Tags", icon: ICON.up, onClick: pushTagsFlow },
        ],
      },
      {
        label: "Worktrees",
        icon: ICON.folder,
        submenu: [
          { label: "Add Worktree…", icon: ICON.plus, onClick: addWorktreeFlow },
          { label: "Remove Worktree…", icon: ICON.trash, danger: true, onClick: removeWorktreeFlow },
        ],
      },
      { separator: true },
      { label: "Show Git Output", icon: ICON.terminal, onClick: showGitOutputFlow },
    ];
  }

  async function openGitMenu(anchor) {
    if (!repoId || !DC || !DC.hasBackend) return;
    let conflictKind = "none";
    try {
      const info = await DC.gitConflicts(repoId);
      conflictKind = (info && info.kind) || "none";
    } catch (e) { /* treat as none */ }
    Dropdown.flyout(anchor, gitMenuItems(conflictKind));
  }

  function updateCommitBtn() {
    const summary = ($("commitSummary").value || "").trim();
    const has = staged.length > 0 || unstaged.length > 0;
    $("commitBtn").disabled = busy || !summary || !has;
    if (!busy) $("commitBtn").textContent = staged.length > 0 ? "Commit" : "Commit all";
    const stashBtn = $("changeStashBtn");
    if (stashBtn) stashBtn.disabled = busy || !has;
  }

  // ---- history tab ----
  async function loadHistory() {
    if (!repoId) return;
    loadGen++;
    const gen = loadGen;
    const forRepo = repoId;
    $("historyList").innerHTML = `<div class="changes-empty">Loading…</div>`;
    try {
      const log = await DC.gitLog(forRepo, 200);
      if (gen !== loadGen || repoId !== forRepo) return; // superseded by a newer navigation
      history = log;
      renderHistory();
      // Auto-select the newest commit so the detail + diff panes aren't left
      // empty (fills the space and matches GitHub Desktop behaviour).
      if (history.length && !activeSha) selectCommit(history[0].hash);
    } catch (e) {
      if (gen !== loadGen || repoId !== forRepo) return;
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
    $("historyList").querySelectorAll(".history-row").forEach((row) => {
      row.addEventListener("click", () => selectCommit(row.dataset.sha));
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const c = history.find((x) => x.hash === row.dataset.sha);
        if (c) openCommitContextMenu(e, c);
      });
    });
  }

  function openCommitContextMenu(e, c) {
    if (!DC || !DC.hasBackend) return;
    const isLatest = history.length > 0 && history[0].hash === c.hash;
    Dropdown.context(e.clientX, e.clientY, [
      {
        label: "Undo commit",
        icon: ACT_DISCARD,
        disabled: !isLatest,
        onClick: () => undoCommit(c),
      },
    ]);
  }

  // Undo the most recent commit: soft-resets HEAD to its parent so the
  // commit's changes move back into Staged Changes instead of being lost.
  async function undoCommit(c) {
    if (busy || !repoId) return;
    const ok = await Modal.confirm({
      title: "Undo commit",
      message: `Undo “${c.summary}”? Its changes will move back to Staged Changes so you can edit or re-commit them.`,
      confirmText: "Undo commit",
    });
    if (!ok) return;
    busy = true;
    try {
      const cs = await DC.undoCommit(repoId, c.hash);
      history = history.filter((h) => h.hash !== c.hash);
      activeSha = null;
      setChangeSet(cs);
      switchTab("changes");
    } catch (e) {
      console.error("undoCommit failed", e);
      await Modal.alert({ title: "Undo commit failed", message: String(e) });
    } finally {
      busy = false;
    }
  }

  async function selectCommit(sha) {
    loadGen++;
    const gen = loadGen;
    const forRepo = repoId;
    activeSha = sha; activeFile = null; navOrder = [];
    $("historyList").querySelectorAll(".history-row").forEach((r) =>
      r.classList.toggle("selected", r.dataset.sha === sha));
    const c = history.find((x) => x.hash === sha);
    $("detailHead").innerHTML = `<div class="detail-msg">${esc(c ? c.summary : "")}</div>
      <div class="detail-meta"><span class="avatar">${esc((c && c.author ? c.author : "?").slice(0, 2).toUpperCase())}</span><span class="detail-author" title="${esc(c ? c.author : "")}">${esc(c ? c.author : "")}</span><span class="hm-dot">·</span><span class="history-when">${esc(c ? c.when : "")}</span><span class="history-hash">${esc(c ? c.id : sha.slice(0, 7))}</span></div>`;
    $("detailFiles").innerHTML = `<div class="changes-empty">Loading…</div>`;
    $("detailCollapseBtn").hidden = true;
    showDiffEmpty("Loading commit…");
    collapsedDetail = new Set();
    try {
      const cs = await DC.gitChanges(forRepo, sha);
      // Bail if a newer navigation (another commit, repo, or tab) has since
      // taken over — otherwise this stale response can hijack whatever the
      // user is looking at now (it shares activeFile/diffBody with the
      // Changes tab and the Pull Requests tab).
      if (gen !== loadGen || repoId !== forRepo || activeSha !== sha) return;
      commitFiles = cs.files || [];
      renderDetail();
      if (commitFiles.length) selectFile(commitFiles[0].path, null);
      else showDiffEmpty("This commit has no file changes.");
    } catch (e) {
      if (gen !== loadGen || repoId !== forRepo || activeSha !== sha) return;
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
      files: commitFiles, collapsed: collapsedDetail, viewMode: detailView, group: null,
      activeFile, activeGroup, onSelect: selectFile, rerender: renderDetail,
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
    loadGen++;
    const gen = loadGen;
    const forRepo = repoId;
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
        ? await DC.prFileDiff(forRepo, activePull.base, activePull.branch, path)
        : await DC.gitDiff(forRepo, path, activeSha, group === "staged");
      // Bail if a newer navigation (another file, repo, or tab) has since taken
      // over — the diff pane is shared by all three tabs.
      if (gen !== loadGen || repoId !== forRepo || activeFile !== path || activeGroup !== group) return;
      renderDiff(d);
    } catch (e) {
      if (gen !== loadGen || repoId !== forRepo || activeFile !== path || activeGroup !== group) return;
      console.error("gitDiff failed", e);
      $("diffBody").innerHTML = `<div class="diff-binary">${esc(String(e))}</div>`;
    }
  }

  function renderDiff(d) {
    $("diffHead").innerHTML = diffHeadHtml(d.path, `+${d.additions}`, `−${d.deletions}`);
    wireDiffNav();
    if (d.oldImage || d.newImage) { renderImageDiff(d); return; }
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

  // Render an image file as a visual before/after preview instead of a text diff.
  // `src` is a backend-built data: URL for a whitelisted raster mime, so it's
  // safe to inline; the alt text is escaped.
  function renderImageDiff(d) {
    const fig = (label, src) =>
      `<figure class="diff-img-fig">` +
        `<figcaption class="diff-img-cap">${label}</figcaption>` +
        `<div class="diff-img-wrap"><img class="diff-img" src="${src}" alt="${esc(d.path)}" loading="lazy" /></div>` +
      `</figure>`;
    let inner;
    if (d.oldImage && d.newImage) inner = fig("Before", d.oldImage) + fig("After", d.newImage);
    else if (d.newImage) inner = fig("Added", d.newImage);
    else inner = fig("Removed", d.oldImage);
    $("diffBody").innerHTML = `<div class="diff-image">${inner}</div>`;
  }

  // ---- tabs / view mode ----
  function switchTab(next) {
    loadGen++; // cancel any in-flight load for the tab being left
    tab = next;
    $("cpane-changes").hidden = next !== "changes";
    $("cpane-history").hidden = next !== "history";
    $("cpane-pulls").hidden = next !== "pulls";
    $("commitDetail").hidden = next !== "history" && next !== "pulls";
    $("commitLayout").classList.toggle("mode-history", next === "history");
    $("commitLayout").classList.toggle("mode-pulls", next === "pulls");
    document.querySelectorAll(".commit-tab").forEach((t) => t.classList.toggle("active", t.dataset.ctab === next));
    activeFile = null; activeGroup = null; navOrder = [];
    // Drop the previous tab's detail-panel files immediately so "Collapse all"
    // (or anything else touching `commitFiles`) can't act on stale data from
    // the tab just left (e.g. History's last-selected commit) while the new
    // tab's own commit/PR is still loading.
    commitFiles = [];
    $("detailCollapseBtn").hidden = true;
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
      // Always refresh from the backend on switch-in (matches History) so PRs
      // opened/closed/updated elsewhere are never shown stale.
      loadRepoPulls();
    } else {
      activeSha = null; activePull = null;
      showDiffEmpty("Select a file to view its diff.");
      // Always refresh from the backend on switch-in — the working tree can
      // change externally (terminal, VS Code) while another tab was active.
      if (repoId) loadChanges(); else renderChanges();
    }
  }

  // ---- pull requests tab ----
  async function loadRepoPulls() {
    if (!repoId) return;
    loadGen++;
    const gen = loadGen;
    const forRepo = repoId;
    pullsLoaded = false; activePull = null;
    $("repoPrList").innerHTML = `<div class="changes-empty">Loading pull requests…</div>`;
    // Fetch in the background so the PR's head/base branches are present locally
    // for the diff view (selectPull awaits this before the local base...head
    // diff). Runs in parallel with the PR list load; non-fatal on failure
    // (offline, no remote, auth, …).
    prFetch = DC.hasBackend
      ? DC.fetchRepo(forRepo).catch((e) => console.warn("PR branch fetch failed", e))
      : null;
    try {
      const data = await DC.listRepoPullRequests(forRepo);
      if (gen !== loadGen || repoId !== forRepo) return; // superseded by a newer navigation
      repoPulls = Array.isArray(data) ? data : [];
      pullsLoaded = true;
      renderRepoPulls($("pullFilter").value || "");
      // Auto-open the newest PR so the detail + diff panes aren't left empty.
      if (repoPulls.length && !activePull) selectPull(repoPulls[0].id);
    } catch (e) {
      if (gen !== loadGen || repoId !== forRepo) return;
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
    loadGen++;
    const gen = loadGen;
    const forRepo = repoId;
    activePull = pr; activeSha = null; activeFile = null; navOrder = [];
    $("repoPrList").querySelectorAll(".history-row").forEach((r) =>
      r.classList.toggle("selected", r.dataset.prId === String(id)));
    const initials = (pr.author || "?").slice(0, 2).toUpperCase();
    const rev = REVIEW_MAP[pr.reviews] || REVIEW_MAP.pending;
    $("detailHead").innerHTML = `<div class="detail-msg">${esc(pr.title)}</div>
      <div class="detail-meta"><span class="avatar">${esc(initials)}</span><span class="detail-author" title="${esc(pr.author)}">${esc(pr.author)}</span><span class="hm-dot">·</span><span class="history-when">${esc(pr.updated)}</span><span class="pr-state ${esc(pr.status)}">${prStateLabel(pr.status)}</span></div>
      <div class="pr-detail-branch"><code title="${esc(pr.branch)}">${esc(pr.branch)}</code><span class="pr-arrow">→</span><code title="${esc(pr.base)}">${esc(pr.base)}</code></div>
      <div class="pr-detail-stats"><span class="chip review ${rev.cls}">${rev.icon}${rev.label}</span><span class="chip">${ICON.comment}${pr.comments}</span><span class="pr-diff"><span class="add">+${pr.additions}</span> <span class="del">−${pr.deletions}</span></span><button class="btn btn-primary btn-sm" id="prReviewBtn">Review</button><button class="btn btn-ghost btn-sm" id="prViewBtn">${ICON.external}View</button></div>`;
    const vb = $("prViewBtn");
    if (vb) vb.addEventListener("click", () => openPrUrl(pr.url));
    const rb = $("prReviewBtn");
    if (rb) rb.addEventListener("click", () => { if (window.PrReviewer) window.PrReviewer.open(repoId, pr); });
    $("detailFiles").innerHTML = `<div class="changes-empty">Loading…</div>`;
    $("detailCollapseBtn").hidden = true;
    showDiffEmpty("Loading pull request…");
    collapsedDetail = new Set();
    try {
      let cs;
      try {
        // Fast path: diff against the PR branches already present locally.
        cs = await DC.prChanges(forRepo, pr.base, pr.branch);
      } catch (err) {
        // Branches probably aren't fetched yet — wait for the in-flight background
        // fetch (kicked off in loadRepoPulls) and retry once.
        if (!prFetch) throw err;
        if (gen !== loadGen || repoId !== forRepo || activePull !== pr) return;
        showDiffEmpty("Fetching pull request branches…");
        await prFetch;
        if (gen !== loadGen || repoId !== forRepo || activePull !== pr) return;
        cs = await DC.prChanges(forRepo, pr.base, pr.branch);
      }
      if (gen !== loadGen || repoId !== forRepo || activePull !== pr) return; // a newer selection won
      commitFiles = cs.files || [];
      renderDetail();
      if (commitFiles.length) selectFile(commitFiles[0].path, null);
      else showDiffEmpty("This pull request has no file changes.");
    } catch (e) {
      if (gen !== loadGen || repoId !== forRepo || activePull !== pr) return;
      console.error("prChanges failed", e);
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
    $("gitMenuBtn").addEventListener("click", () => openGitMenu($("gitMenuBtn")));
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

// ============================================================================
// PR Review page — full-screen file list + diff (with inline comment threads)
// + a Conversation tab (general discussion), plus Approve/Request changes/
// Comment review submission. Opened from the Pull Requests tab's "Review"
// button. Mirrors ConflictResolver's module shape (own `.page`, own `open()`).
// ============================================================================
const PrReviewer = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = escapeHtml;

  let repoId = null;
  let pr = null;           // the PullRequest object passed in from the PR tab
  let files = [];          // FileChange[] for the PR's base...head diff
  let threads = [];        // PrThread[] — general + inline, refreshed after any mutation
  let activeFile = null;
  let activeTab = "files"; // "files" | "conversation"
  let collapsed = new Set(); // collapsed folders in the file tree
  let busy = false;

  function threadsFor(path) {
    return threads.filter((t) => t.path === path);
  }
  function generalThreads() {
    return threads.filter((t) => t.path == null);
  }

  async function open(id, pullRequest) {
    repoId = id;
    pr = pullRequest;
    files = []; threads = []; activeFile = null; activeTab = "files"; collapsed = new Set();
    document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === "page-pr-review"));
    document.querySelectorAll(".prr-tab").forEach((t) => t.classList.toggle("active", t.dataset.prrtab === "files"));
    $("prrLayout").dataset.tab = "files";
    $("prrFilesView").hidden = false;
    $("prrConversationView").hidden = true;
    renderHeader();
    $("prrFiles").innerHTML = `<div class="changes-empty">Loading…</div>`;
    showDiffEmpty("Loading…");
    await Promise.all([loadFiles(), loadThreads()]);
    if (files.length) selectFile(files[0].path);
    else showDiffEmpty("This pull request has no file changes.");
  }

  function renderHeader() {
    $("prrTitle").textContent = pr.title || `Pull request #${pr.id}`;
    $("prrMeta").innerHTML = `${esc(pr.repo || "")} #${esc(String(pr.id))} · by ${esc(pr.author || "")} · <code>${esc(pr.branch)}</code> → <code>${esc(pr.base)}</code>`;
  }

  async function loadFiles() {
    try {
      const cs = await DC.prChanges(repoId, pr.base, pr.branch);
      files = cs.files || [];
    } catch (e) {
      console.error("prChanges failed", e);
      files = [];
    }
    renderFileList();
  }

  async function loadThreads() {
    try {
      threads = await DC.fetchPrThreads(repoId, pr.id);
    } catch (e) {
      console.error("fetchPrThreads failed", e);
      threads = [];
    }
    renderFileList();
    if (activeTab === "conversation") renderConversation();
    else if (activeFile) renderCurrentDiff();
  }

  // Same tree/list file explorer as the Changes page (renderFileTree, global).
  function renderFileList() {
    const list = $("prrFiles");
    if (!files.length) {
      list.innerHTML = `<div class="changes-empty">No file changes.</div>`;
      return;
    }
    renderFileTree(list, {
      files,
      collapsed,
      viewMode: "tree",
      group: null,
      activeFile,
      activeGroup: null,
      onSelect: (path) => selectFile(path),
      rerender: renderFileList,
      fileBadge: (path) => {
        const n = threadsFor(path).length;
        return n ? `<span class="prr-thread-badge">${n}</span>` : "";
      },
    });
  }

  function showDiffEmpty(msg) {
    $("prrDiffEmpty").textContent = msg;
    $("prrDiffEmpty").hidden = false;
    $("prrDiffContent").hidden = true;
  }

  async function selectFile(path) {
    activeFile = path;
    // Switch to the Files view directly (without going through switchTab,
    // which would call back into selectFile via renderCurrentDiff).
    if (activeTab !== "files") {
      activeTab = "files";
      document.querySelectorAll(".prr-tab").forEach((t) => t.classList.toggle("active", t.dataset.prrtab === "files"));
      $("prrLayout").dataset.tab = "files";
      $("prrFilesView").hidden = false;
      $("prrConversationView").hidden = true;
    }
    renderFileList();
    showDiffEmpty("Loading diff…");
    try {
      const d = await DC.prFileDiff(repoId, pr.base, pr.branch, path);
      if (activeFile !== path) return; // a newer selection won
      renderDiff(d);
    } catch (e) {
      if (activeFile !== path) return;
      showDiffEmpty(String(e));
    }
  }

  function renderCurrentDiff() {
    if (!activeFile) return;
    selectFile(activeFile);
  }

  function lang(path) { return (window.Highlighter && Highlighter.langForPath(path)) || ""; }
  function hl(s, path) { return window.Highlighter ? Highlighter.line(s, lang(path)) : esc(s); }

  function diffHeadHtml(d) {
    return `<span class="diff-path" title="${esc(d.path)}">${esc(d.path)}</span><span class="diff-adds">+${d.additions}</span><span class="diff-dels">−${d.deletions}</span>`;
  }

  function renderDiff(d) {
    $("prrDiffEmpty").hidden = true;
    $("prrDiffContent").hidden = false;
    $("prrDiffHead").innerHTML = diffHeadHtml(d);
    const bodyEl = $("prrDiffBody");
    if (d.oldImage || d.newImage) {
      bodyEl.innerHTML = `<div class="diff-binary">Image file — open the Changes page to preview it.</div>`;
      return;
    }
    if (d.binary) {
      bodyEl.innerHTML = `<div class="diff-binary">Binary file — no text diff to display.</div>`;
      return;
    }
    if (!d.hunks.length) {
      bodyEl.innerHTML = `<div class="diff-binary">No textual changes to display.</div>`;
      return;
    }
    const rows = [];
    d.hunks.forEach((h) => {
      rows.push(`<div class="diff-hunk-head">${esc(h.header)}</div>`);
      h.lines.forEach((l) => {
        const cls = l.kind === "add" ? "add" : l.kind === "del" ? "del" : "";
        const oldN = l.oldLineno != null ? l.oldLineno : "";
        const newN = l.newLineno != null ? l.newLineno : "";
        const body = l.content ? hl(l.content, d.path) : "&nbsp;";
        const canComment = l.newLineno != null;
        rows.push(
          `<div class="diff-line ${cls}"${canComment ? ` data-line="${l.newLineno}"` : ""}>` +
            `<span class="diff-gutter"><span>${oldN}</span><span>${newN}</span>${canComment ? `<button class="prr-line-add" type="button" data-add-line="${l.newLineno}" title="Add a comment on this line">+</button>` : ""}</span>` +
            `<span class="diff-text">${body}</span></div>`
        );
      });
    });
    bodyEl.innerHTML = `<div class="diff-code" id="prrDiffCode">${rows.join("")}</div>`;

    // Second pass: inject existing threads + wire the "+" composer trigger.
    const code = $("prrDiffCode");
    threadsFor(d.path).forEach((t) => {
      if (t.line == null) return;
      const lineEl = code.querySelector(`.diff-line[data-line="${t.line}"]`);
      if (lineEl) lineEl.insertAdjacentHTML("afterend", threadHtml(t));
    });
    wireThreadActions(code);
    code.querySelectorAll(".prr-line-add").forEach((btn) =>
      btn.addEventListener("click", () => openNewThreadComposer(code, d.path, Number(btn.dataset.addLine))));
  }

  function commentHtml(c) {
    const initials = (c.author || "?").slice(0, 2).toUpperCase();
    return `<div class="prr-comment">
      <div class="prr-comment-meta"><span class="avatar">${esc(initials)}</span><span class="prr-comment-author">${esc(c.author)}</span><span>${esc(c.created)}</span></div>
      <div class="prr-comment-body">${mdLite(c.body)}</div>
    </div>`;
  }

  function threadHtml(t) {
    const resolveBtn = t.canResolve
      ? `<button class="btn btn-ghost btn-sm" data-resolve-thread="${esc(t.id)}" data-resolved="${t.resolved ? "0" : "1"}">${t.resolved ? "Reopen" : "Resolve"}</button>`
      : "";
    return `<div class="prr-thread${t.resolved ? " resolved" : ""}" data-thread-id="${esc(t.id)}">
      <div class="prr-thread-head">
        <span class="prr-thread-path">${t.path ? esc(t.path) + (t.line != null ? ":" + t.line : "") : "General discussion"}</span>
        ${resolveBtn}
      </div>
      ${t.comments.map(commentHtml).join("")}
      <div class="prr-composer">
        <textarea placeholder="Reply…" data-reply-for="${esc(t.id)}"></textarea>
        <div class="prr-composer-actions"><button class="btn btn-primary btn-sm" data-reply-submit="${esc(t.id)}">Reply</button></div>
      </div>
    </div>`;
  }

  function wireThreadActions(scope) {
    scope.querySelectorAll("[data-resolve-thread]").forEach((btn) =>
      btn.addEventListener("click", () => resolveThread(btn.dataset.resolveThread, btn.dataset.resolved === "1")));
    scope.querySelectorAll("[data-reply-submit]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const id = btn.dataset.replySubmit;
        const ta = scope.querySelector(`textarea[data-reply-for="${CSS.escape(id)}"]`);
        const body = (ta.value || "").trim();
        if (!body) return;
        postComment({ body, threadId: id });
      }));
  }

  function openNewThreadComposer(code, path, line) {
    const existing = code.querySelector(`.prr-new-composer[data-line="${line}"]`);
    if (existing) { existing.querySelector("textarea").focus(); return; }
    const lineEl = code.querySelector(`.diff-line[data-line="${line}"]`);
    if (!lineEl) return;
    // Insert after the line (and after any existing thread already anchored there).
    let after = lineEl;
    let next = after.nextElementSibling;
    while (next && next.classList.contains("prr-thread")) { after = next; next = after.nextElementSibling; }
    after.insertAdjacentHTML(
      "afterend",
      `<div class="prr-thread prr-new-composer" data-line="${line}">
        <div class="prr-composer">
          <textarea placeholder="Add a comment…" autofocus></textarea>
          <div class="prr-composer-actions">
            <button class="btn btn-ghost btn-sm" data-cancel-new>Cancel</button>
            <button class="btn btn-primary btn-sm" data-submit-new>Comment</button>
          </div>
        </div>
      </div>`
    );
    const box = code.querySelector(`.prr-new-composer[data-line="${line}"]`);
    const ta = box.querySelector("textarea");
    ta.focus();
    box.querySelector("[data-cancel-new]").addEventListener("click", () => box.remove());
    box.querySelector("[data-submit-new]").addEventListener("click", () => {
      const body = (ta.value || "").trim();
      if (!body) return;
      postComment({ body, path, line });
    });
  }

  // Unified comment submit — reply (threadId set), new inline thread (path+line
  // set), or new general comment (neither set, used by the Conversation tab).
  async function postComment({ body, threadId, path, line }) {
    if (busy) return;
    busy = true;
    try {
      threads = await DC.postPrComment(repoId, pr.id, body, threadId || null, path || null, line ?? null);
      renderFileList();
      if (activeTab === "conversation") renderConversation();
      else if (activeFile) renderCurrentDiff();
    } catch (e) {
      console.error("postPrComment failed", e);
      await Modal.alert({ title: "Couldn't post comment", message: String(e) });
    } finally {
      busy = false;
    }
  }

  async function resolveThread(threadId, resolved) {
    if (busy) return;
    busy = true;
    try {
      threads = await DC.resolvePrThread(repoId, pr.id, threadId, resolved);
      renderFileList();
      if (activeTab === "conversation") renderConversation();
      else if (activeFile) renderCurrentDiff();
    } catch (e) {
      console.error("resolvePrThread failed", e);
      await Modal.alert({ title: "Couldn't update thread", message: String(e) });
    } finally {
      busy = false;
    }
  }

  function renderConversation() {
    const gen = generalThreads();
    const composer = `<div class="prr-thread-general">
      <div class="prr-composer">
        <textarea placeholder="Write a comment…" id="prrGeneralInput"></textarea>
        <div class="prr-composer-actions"><button class="btn btn-primary btn-sm" id="prrGeneralSubmit">Comment</button></div>
      </div>
    </div>`;
    const body = gen.length
      ? gen.map((t) => `<div class="prr-thread-general">${t.comments.map(commentHtml).join("")}</div>`).join("")
      : `<div class="changes-empty">No comments yet — start the discussion below.</div>`;
    $("prrConversationView").innerHTML = `<div class="prr-conversation">${body}${composer}</div>`;
    $("prrGeneralSubmit").addEventListener("click", () => {
      const ta = $("prrGeneralInput");
      const val = (ta.value || "").trim();
      if (!val) return;
      postComment({ body: val }).then(() => { if ($("prrGeneralInput")) $("prrGeneralInput").value = ""; });
    });
  }

  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll(".prr-tab").forEach((t) => t.classList.toggle("active", t.dataset.prrtab === tab));
    $("prrLayout").dataset.tab = tab;
    $("prrFilesView").hidden = tab !== "files";
    $("prrConversationView").hidden = tab !== "conversation";
    if (tab === "conversation") renderConversation();
    else if (activeFile) renderCurrentDiff();
    else showDiffEmpty("This pull request has no file changes.");
  }

  async function openReviewDialog(type) {
    if (busy) return;
    const titles = { approve: "Approve pull request", changes: "Request changes", comment: "Add a review comment" };
    const confirmLabels = { approve: "Approve", changes: "Request changes", comment: "Submit" };
    const requireBody = type === "comment";
    const res = await openFieldsDialogArea({
      title: titles[type],
      label: requireBody ? "Comment (required)" : "Summary comment (optional)",
      confirmText: confirmLabels[type],
      danger: type === "changes",
      required: requireBody,
    });
    if (res === null) return;
    busy = true;
    try {
      threads = await DC.submitPrReview(repoId, pr.id, type, res);
      renderFileList();
      if (activeTab === "conversation") renderConversation();
      await Modal.alert({ title: "Review submitted", message: titles[type] + " — done." });
    } catch (e) {
      console.error("submitPrReview failed", e);
      await Modal.alert({ title: "Couldn't submit review", message: String(e) });
    } finally {
      busy = false;
    }
  }

  // A single-textarea confirm dialog (Modal.custom has no built-in textarea
  // prompt). Resolves to the trimmed text, or null if cancelled.
  function openFieldsDialogArea({ title, label, confirmText, danger, required }) {
    return Modal.custom({
      title,
      render: (body, foot, close, mkBtn) => {
        body.innerHTML = `
          <div class="form-row">
            <label class="form-label" for="prrReviewBody">${esc(label)}</label>
            <textarea class="modal-input" id="prrReviewBody" rows="4" spellcheck="true"></textarea>
          </div>
          <div class="modal-error" id="prrReviewErr"></div>`;
        const ta = body.querySelector("#prrReviewBody");
        const errEl = body.querySelector("#prrReviewErr");
        const cancel = mkBtn("btn-ghost", "Cancel");
        cancel.addEventListener("click", () => close(null));
        const ok = mkBtn(danger ? "btn-danger" : "btn-primary", confirmText);
        ok.addEventListener("click", () => {
          const val = (ta.value || "").trim();
          if (required && !val) { errEl.textContent = "Enter a comment."; return; }
          close(val);
        });
        foot.append(cancel, ok);
        setTimeout(() => ta.focus(), 40);
      },
    });
  }

  document.querySelectorAll(".prr-tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.prrtab)));
  $("prrBackBtn") && $("prrBackBtn").addEventListener("click", () => showPage("changes"));
  $("prrOpenBtn") && $("prrOpenBtn").addEventListener("click", () => { if (pr && pr.url) DC.openUrl(pr.url); });
  $("prrApproveBtn") && $("prrApproveBtn").addEventListener("click", () => openReviewDialog("approve"));
  $("prrChangesBtn") && $("prrChangesBtn").addEventListener("click", () => openReviewDialog("changes"));
  $("prrCommentReviewBtn") && $("prrCommentReviewBtn").addEventListener("click", () => openReviewDialog("comment"));

  return { open };
})();
window.PrReviewer = PrReviewer;

// Restore the last-viewed page across reloads (right-click → Reload keeps you here).
try {
  const savedPage = localStorage.getItem("dc.page");
  if (savedPage && [...navItems].some((n) => n.dataset.page === savedPage)) {
    showPage(savedPage);
  }
} catch (e) {}
