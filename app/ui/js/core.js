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
      const theme = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      root.setAttribute("data-theme", theme);
      try { localStorage.setItem("dc.theme", theme); } catch (e) {}
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
