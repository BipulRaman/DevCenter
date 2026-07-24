// Pull Requests page — list PRs across watched repos with repo/account/status
// filters. Ported from app/ui/js/pull-requests.js. The full in-app reviewer is
// a later phase; "Review"/title open the PR in the browser for now.

import { signal, useComputed } from "@preact/signals";
import { ipc } from "@/platform/ipc";
import { repos, repoAccount } from "@/state/repos";
import { pulls, pullsLoading, watchedRepoNames } from "@/state/pulls";
import { loadFilterSet, saveFilterSet, prReviewChip } from "@/lib/helpers";
import { ICONS, providerIconHtml, Raw, EmptyState } from "@/lib/ico";
import { Multiselect, type MultiOption } from "@/components/Multiselect";
import { openRepoById } from "@/state/changes";
import { openReviewer } from "@/state/reviewer";
import type { PullRequest } from "@/types/models";
import styles from "./PullRequests.module.css";

const REPO_KEY = "dc.pr.repoSelected";
const ACCT_KEY = "dc.pr.accountFilter";

const search = signal("");
const statusFilter = signal<"all" | "open" | "draft" | "merged">("all");
const repoSelected = signal<Set<string>>(loadFilterSet(REPO_KEY));
const acctFilter = signal<Set<string>>(loadFilterSet(ACCT_KEY));

function setRepoSel(next: Set<string>) {
  repoSelected.value = next;
  saveFilterSet(REPO_KEY, next);
}
function setAcct(next: Set<string>) {
  acctFilter.value = next;
  saveFilterSet(ACCT_KEY, next);
}

function prAccountKey(p: PullRequest): string | null {
  const r = repos.value.find((x) => x.name === p.repo);
  const a = r ? repoAccount(r) : null;
  return a ? a.key : null;
}

export function PullRequests() {
  const watched = useComputed(() => watchedRepoNames());

  const repoOptions = useComputed<MultiOption[]>(() =>
    watched.value.map((name) => {
      const r = repos.value.find((x) => x.name === name);
      return { value: name, label: name, icon: providerIconHtml(r?.provider) };
    }),
  );

  const acctOptions = useComputed<MultiOption[]>(() => {
    const map = new Map<string, MultiOption>();
    for (const r of repos.value.filter((x) => x.watched)) {
      const a = repoAccount(r);
      if (!a) continue;
      const e = map.get(a.key) || { value: a.key, label: a.label, count: 0, icon: providerIconHtml(a.provider) };
      e.count = (e.count || 0) + 1;
      map.set(a.key, e);
    }
    return [...map.values()].sort((x, y) => x.label.localeCompare(y.label));
  });

  const list = useComputed(() => {
    const f = search.value.toLowerCase();
    const names = watched.value;
    return pulls.value.filter((p) => {
      if (!names.includes(p.repo)) return false;
      const matchRepo = repoSelected.value.size === 0 || repoSelected.value.has(p.repo);
      const acctKey = prAccountKey(p);
      const matchAccount = acctFilter.value.size === 0 || (acctKey != null && acctFilter.value.has(acctKey));
      const matchText =
        p.title.toLowerCase().includes(f) || p.repo.toLowerCase().includes(f) || p.author.toLowerCase().includes(f);
      const matchStatus = statusFilter.value === "all" || p.status === statusFilter.value;
      return matchRepo && matchAccount && matchText && matchStatus;
    });
  });

  return (
    <>
      <header class="page-head">
        <div>
          <h1>Pull Requests</h1>
          <p class="page-desc">Track open and draft pull requests across your repositories.</p>
        </div>
        <div class="page-actions">
          <div class="search">
            <Raw html={ICONS.search} />
            <input
              type="text"
              placeholder="Search pull requests…"
              value={search.value}
              onInput={(e) => (search.value = (e.target as HTMLInputElement).value)}
            />
          </div>
          {acctOptions.value.length > 0 ? (
            <Multiselect
              options={acctOptions.value}
              selected={acctFilter.value}
              onChange={setAcct}
              allLabel="All accounts"
              buttonIcon={ICONS.card}
              countNoun="accounts"
              ariaLabel="Repository accounts"
            />
          ) : null}
          {repoOptions.value.length > 0 ? (
            <Multiselect
              options={repoOptions.value}
              selected={repoSelected.value}
              onChange={setRepoSel}
              allLabel="All watched repos"
              buttonIcon={ICONS.repo}
              countNoun="repos"
              ariaLabel="Watched repositories"
            />
          ) : null}
          <div class="seg" role="group" aria-label="Pull request status">
            {(["all", "open", "draft"] as const).map((s) => (
              <button
                key={s}
                class={`seg-btn${statusFilter.value === s ? " active" : ""}`}
                type="button"
                aria-pressed={statusFilter.value === s}
                onClick={() => (statusFilter.value = s)}
              >
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div class={styles.prList}>
        {watched.value.length === 0 ? (
          <EmptyState message='No repositories are being watched. Enable "Watch PRs" on a repo in Git Board to see its pull requests here.' />
        ) : pullsLoading.value && list.value.length === 0 ? (
          <EmptyState message="Loading pull requests…" />
        ) : list.value.length === 0 ? (
          <EmptyState message="No pull requests match your filters." />
        ) : (
          list.value.map((p) => <PrRow key={`${p.repoId}#${p.id}`} pr={p} />)
        )}
      </div>
    </>
  );
}

function PrRow({ pr: p }: { pr: PullRequest }) {
  const status = (["open", "draft", "merged"] as const).includes(p.status) ? p.status : "open";
  const rev = prReviewChip(p);
  const openUrl = () => {
    if (!p.url) return;
    if (ipc.hasBackend) ipc.openUrl(p.url).catch(() => {});
    else window.open(p.url, "_blank");
  };
  const openInChanges = () => {
    if (!p.repoId) return;
    openRepoById(p.repoId);
  };
  const review = () => {
    if (p.repoId) void openReviewer(p.repoId, p, { returnTo: "pull-requests" });
  };

  return (
    <div class={`${styles.prRow} ${styles[status]}`}>
      <div class={`${styles.prIcon} ${styles[status]}`}>
        <Raw html={status === "merged" ? ICONS.merge : ICONS.pr} />
      </div>
      <div class={styles.prMain}>
        <div class={styles.prTitleRow}>
          <span class={`${styles.prName}${p.repoId ? " repo-open-link" : ""}`} title={p.repoId ? "Open in PR Review" : undefined} onClick={p.repoId ? review : undefined}>
            {p.title || ""}
          </span>
          {status === "merged" ? (
            <span class="pr-state merged">
              <Raw html={ICONS.merge} />
              Merged
            </span>
          ) : status === "draft" ? (
            <span class="pr-state draft">
              <Raw html={ICONS.pr} />
              Draft
            </span>
          ) : (
            <span class="pr-state open">
              <Raw html={ICONS.pr} />
              Open
            </span>
          )}
        </div>
        <div class={styles.prSub}>
          <span>
            {p.repoId ? (
              <span class="repo-open-link" title="Open in Changes" onClick={openInChanges}>
                {p.repo || ""}
              </span>
            ) : (
              p.repo || ""
            )}{" "}
            #{p.id}
          </span>
          <span class="repo-dot">·</span>
          <span>
            <code>{p.branch || ""}</code> → <code>{p.base || ""}</code>
          </span>
          <span class="repo-dot">·</span>
          <span>by {p.author || ""}</span>
          <span class="repo-dot">·</span>
          <span>{p.updated || ""}</span>
        </div>
      </div>
      <div class={styles.prMeta}>
        <span class={`chip review ${rev.cls}`}>
          <Raw html={rev.icon} />
          {rev.label}
        </span>
      </div>
      <div class={styles.prActions}>
        {p.repoId ? (
          <button class="btn btn-primary btn-sm" onClick={review}>
            Review
          </button>
        ) : null}
        <button class="btn btn-ghost btn-sm" onClick={openUrl}>
          <Raw html={ICONS.external} />
          View
        </button>
      </div>
    </div>
  );
}
