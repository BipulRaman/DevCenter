// ============================================================================
// Central client-side state: a tiny pub/sub bus + page-lifecycle registry.
// Keeps the app's split-file, classic-script style (no framework/build step)
// while giving views a single place to react to shared-data changes so they
// never render stale caches (e.g. a PR's vote after returning from the reviewer).
// Loaded BEFORE core.js; only touches the shared globals (pulls, …) at call
// time, so their `let` declarations in later files are already initialized.
// ============================================================================

// ---------- Event bus ----------
const DCStore = (() => {
  const subs = new Map(); // event -> Set<cb>
  function on(event, cb) {
    if (!subs.has(event)) subs.set(event, new Set());
    subs.get(event).add(cb);
    return () => { const s = subs.get(event); if (s) s.delete(cb); };
  }
  function emit(event, payload) {
    const s = subs.get(event);
    if (!s) return;
    for (const cb of [...s]) {
      try { cb(payload); } catch (e) { console.error(`DCStore "${event}" handler failed`, e); }
    }
  }
  return { on, emit };
})();

// ---------- Page lifecycle ----------
// Pages register an onShow() that runs whenever showPage() navigates to them,
// so a page can refresh its data on every visit instead of rendering a stale
// cache. Registration is done at load; the hook fires later, on navigation.
const PageLifecycle = (() => {
  const hooks = new Map(); // page -> fn
  function onShow(page, fn) { hooks.set(page, fn); }
  function fire(page) {
    const fn = hooks.get(page);
    if (fn) { try { fn(); } catch (e) { console.error(`onShow("${page}") failed`, e); } }
  }
  return { onShow, fire };
})();

// ---------- Pull-request state helpers ----------
// The PR list is held in the global `pulls` array (declared in core.js). These
// helpers are the single write path for mutations so every subscriber stays in
// sync via the "pulls:changed" event.
const PrStore = (() => {
  function all() { return typeof pulls !== "undefined" && Array.isArray(pulls) ? pulls : []; }
  function find(repoId, id) {
    return all().find((p) => p.repoId === repoId && String(p.id) === String(id)) || null;
  }
  // Replace the whole list (used after an authoritative server refetch).
  function setAll(data) {
    pulls = Array.isArray(data) ? data : [];
    DCStore.emit("pulls:changed", pulls);
  }
  // Optimistically merge fields into one PR and notify subscribers. Returns the
  // patched PR, or null when it isn't in the current cache.
  function patch(repoId, id, partial) {
    const p = find(repoId, id);
    if (!p) return null;
    Object.assign(p, partial);
    DCStore.emit("pulls:changed", pulls);
    return p;
  }
  // Translate the reviewer's signed vote (Azure scale: 10/5/0/-5/-10) into the
  // list's review-chip fields, adjusting the approver count relative to whether
  // the current user was already counted as an approver. This is an optimistic
  // estimate; an authoritative refetch on page-show reconciles it.
  function applyMyVote(repoId, id, vote) {
    const p = find(repoId, id);
    if (!p) return null;
    const wasApproved = !!p.approvedByMe;
    const nowApproved = vote >= 5;
    let approvals = p.approvals || 0;
    if (nowApproved && !wasApproved) approvals += 1;
    else if (!nowApproved && wasApproved) approvals = Math.max(0, approvals - 1);
    const reviews = vote <= -5 ? "changes" : approvals > 0 ? "approved" : "pending";
    return patch(repoId, id, { approvedByMe: nowApproved, approvals, reviews });
  }
  return { all, find, setAll, patch, applyMyVote };
})();
