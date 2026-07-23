// PR Reviewer — full-screen file list + diff with inline comment threads, a
// Conversation tab, and provider-aware review actions. Ported from
// app/ui/js/pr-reviewer.js. Rendered as an overlay page when reviewerOpen.

import { useState } from "preact/hooks";
import { ipc } from "@/platform/ipc";
import {
  reviewerOpen,
  reviewerPr,
  reviewerProvider,
  myVote,
  reviewerFiles,
  reviewerLoadError,
  reviewerActiveFile,
  reviewerTab,
  reviewerWholeFile,
  reviewerDiff,
  reviewerDiffLoading,
  threadsFor,
  generalThreads,
  closeReviewer,
  selectFile,
  toggleWholeFile,
  postComment,
  resolveThread,
  publishDraft,
  submitReview,
} from "@/state/reviewer";
import { showPage } from "@/state/ui";
import { ICONS, Raw } from "@/lib/ico";
import { prReviewChip, mdLite, escapeHtml } from "@/lib/helpers";
import { openMenu, type MenuItem } from "@/components/menu";
import { modal } from "@/components/modal";
import { FileTree } from "@/lib/file-tree";
import { PaneResizer } from "@/components/PaneResizer";
import type { FileDiff, PrThread } from "@/types/models";

const VOTE_CLS: Record<string, string> = { "10": "ok", "5": "ok", "0": "muted", "-5": "warn", "-10": "danger" };

const DIFF_EXPAND =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 9 12 4 17 9"/><polyline points="7 15 12 20 17 15"/></svg>';
const DIFF_COLLAPSE =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 4 12 9 17 4"/><polyline points="7 20 12 15 17 20"/></svg>';

function hlLine(content: string, path: string): string {
  const H = window.Highlighter;
  if (!content) return "&nbsp;";
  return H ? H.line(content, H.langForPath(path)) : escapeHtml(content);
}

export function PrReviewer() {
  if (!reviewerOpen.value) return null;
  const pr = reviewerPr.value;
  if (!pr) return null;

  const back = () => {
    const page = closeReviewer();
    showPage(page as never);
  };

  return (
    <section class="page active" id="page-pr-review">
      <header class="page-head">
        <div class="conflict-head-main">
          <button class="btn btn-icon btn-sm" type="button" title="Back" onClick={back}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1>{pr.title || `Pull request #${pr.id}`}</h1>
            <p class="page-desc">
              <span class="prr-meta-row">
                <span class="prr-repo">{pr.repo || ""}</span>
                <span class="prr-num">#{pr.id}</span>
                <span class="prr-dot">·</span>
                <span class="prr-by">{pr.author || ""}</span>
              </span>{" "}
              <span class="prr-branches">
                <span class="prr-branch-name" title={pr.branch}>
                  {pr.branch}
                </span>
                <svg class="prr-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
                <span class="prr-branch-name base" title={pr.base}>
                  {pr.base}
                </span>
              </span>
            </p>
          </div>
        </div>
        <div class="page-actions">
          <ReviewActions />
        </div>
      </header>

      <div class="prr-layout">
        <aside class="prr-side">
          <div class="prr-tabs" role="tablist" aria-label="Pull request review views">
            <button
              class={`prr-tab${reviewerTab.value === "files" ? " active" : ""}`}
              type="button"
              role="tab"
              aria-selected={reviewerTab.value === "files"}
              onClick={() => (reviewerTab.value = "files")}
            >
              Files
            </button>
            <button
              class={`prr-tab${reviewerTab.value === "conversation" ? " active" : ""}`}
              type="button"
              role="tab"
              aria-selected={reviewerTab.value === "conversation"}
              onClick={() => (reviewerTab.value = "conversation")}
            >
              Conversation
            </button>
          </div>
          <div class="conflict-files">
            <FileList />
          </div>
        </aside>
        <PaneResizer resize="prr-side" varName="--prr-side" storageKey="dc.prr.side" min={200} max={620} def={290} ariaLabel="Resize file list" />
        <section class="prr-main">
          {reviewerTab.value === "conversation" ? <Conversation /> : <DiffView />}
        </section>
      </div>
    </section>
  );
}

function ReviewActions() {
  const pr = reviewerPr.value!;
  const provider = reviewerProvider.value;
  const rv = prReviewChip(pr);
  const isDraft = pr.status === "draft";

  const openBtn = (
    <button class="btn btn-ghost btn-sm" type="button" onClick={() => pr.url && ipc.openUrl(pr.url).catch(() => {})}>
      <Raw html={ICONS.external} />
      Open
    </button>
  );
  const commentBtn = (
    <button class="btn btn-ghost btn-sm" type="button" onClick={() => runReview("comment")}>
      Comment
    </button>
  );
  const statusPill = (
    <span class={`prr-status ${rv.cls}`} title="Overall review status">
      <span class={`prr-vote-dot ${rv.cls}`} />
      {rv.label}
    </span>
  );

  if (isDraft) {
    return (
      <>
        {statusPill}
        {openBtn}
        {commentBtn}
        <button class="btn btn-primary btn-sm prr-publish-btn" type="button" title="Mark this draft ready for review" onClick={onPublish}>
          <Raw html={ICONS.up} />
          Publish
        </button>
      </>
    );
  }

  if (provider === "azure") {
    const voted = myVote.value !== 0;
    const cur = VOTE_CLS[String(myVote.value)] || "muted";
    const voteMenu = (anchor: HTMLElement) => {
      const items: MenuItem[] = [
        { label: "Approve", icon: dot("ok"), onClick: () => runReview("approve") },
        { label: "Approve with suggestions", icon: dot("ok"), onClick: () => runReview("approve_suggestions") },
        { label: "Wait for author", icon: dot("warn"), onClick: () => runReview("wait") },
        { label: "Reject", icon: dot("danger"), onClick: () => runReview("reject") },
        { separator: true },
        { label: "Reset feedback", icon: dot("muted"), onClick: () => runReview("reset") },
      ];
      openMenu(anchor, items);
    };
    return (
      <>
        {statusPill}
        {openBtn}
        {commentBtn}
        <div class="prr-vote">
          <button
            class={`btn ${voted ? "btn-primary" : "btn-ghost"} btn-sm prr-vote-btn`}
            type="button"
            aria-haspopup="true"
            onClick={(e) => voteMenu(e.currentTarget.closest(".prr-vote") as HTMLElement)}
          >
            <span class={`prr-vote-dot ${cur}`} />
            <span>Vote</span>
            <svg class="caret" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </>
    );
  }

  // GitHub
  const approved = myVote.value >= 5;
  const rejected = myVote.value <= -5;
  return (
    <>
      {statusPill}
      {openBtn}
      {commentBtn}
      <button class={`btn btn-danger btn-sm${rejected ? " is-current" : ""}`} type="button" onClick={() => runReview("changes")}>
        {rejected ? "Changes requested ✓" : "Request changes"}
      </button>
      <button class={`btn btn-primary btn-sm${approved ? " is-current" : ""}`} type="button" onClick={() => runReview("approve")}>
        {approved ? "Approved ✓" : "Approve"}
      </button>
    </>
  );
}

function dot(cls: string): string {
  return `<span class="prr-vote-dot ${cls}" style="display:inline-block;width:9px;height:9px;border-radius:50%"></span>`;
}

async function onPublish() {
  const ok = await modal.confirm({
    title: "Publish pull request",
    message: "Publish this draft pull request so it's ready for review?",
    confirmText: "Publish",
  });
  if (!ok) return;
  try {
    await publishDraft();
    await modal.alert({ title: "Published", message: "The pull request is now open for review." });
  } catch (e) {
    await modal.alert({ title: "Couldn't publish", message: String(e) });
  }
}

const REVIEW_META: Record<string, { title: string; confirm: string; danger: boolean; require: boolean }> = {
  approve: { title: "Approve pull request", confirm: "Approve", danger: false, require: false },
  approve_suggestions: { title: "Approve with suggestions", confirm: "Approve with suggestions", danger: false, require: false },
  wait: { title: "Wait for author", confirm: "Wait for author", danger: false, require: false },
  reject: { title: "Reject pull request", confirm: "Reject", danger: true, require: false },
  changes: { title: "Request changes", confirm: "Request changes", danger: true, require: false },
  reset: { title: "Reset feedback", confirm: "Reset", danger: false, require: false },
  comment: { title: "Add a review comment", confirm: "Submit", danger: false, require: true },
};

async function runReview(type: string) {
  const pr = reviewerPr.value;
  if (!pr) return;
  if (pr.status === "draft" && type !== "comment") {
    await modal.alert({ title: "Draft pull request", message: "This pull request is a draft and can't be approved yet." });
    return;
  }
  const meta = REVIEW_META[type] || REVIEW_META.comment;
  let body = "";
  if (type === "reset") {
    const ok = await modal.confirm({ title: meta.title, message: "Remove your vote from this pull request?", confirmText: "Reset" });
    if (!ok) return;
  } else {
    const res = await openReviewDialog(meta);
    if (res === null) return;
    body = res;
  }
  try {
    await submitReview(type, body);
    await modal.alert({ title: "Review submitted", message: `${meta.title} — done.` });
  } catch (e) {
    await modal.alert({ title: "Couldn't submit review", message: String(e) });
  }
}

function openReviewDialog(meta: { title: string; confirm: string; danger: boolean; require: boolean }): Promise<string | null> {
  return modal.custom<string | null>({
    title: meta.title,
    body: (close) => <ReviewDialogBody meta={meta} close={close} />,
  });
}

function ReviewDialogBody({
  meta,
  close,
}: {
  meta: { confirm: string; danger: boolean; require: boolean };
  close: (v: string | null) => void;
}) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  const submit = () => {
    const v = val.trim();
    if (meta.require && !v) return setErr("Enter a comment.");
    close(v);
  };
  return (
    <>
      <div class="form-row">
        <label class="form-label">{meta.require ? "Comment (required)" : "Summary comment (optional)"}</label>
        <textarea class="modal-input" rows={4} value={val} onInput={(e) => setVal((e.target as HTMLTextAreaElement).value)} />
      </div>
      {err ? <div class="modal-error">{err}</div> : null}
      <div class="modal-foot">
        <button class="btn btn-ghost" type="button" onClick={() => close(null)}>
          Cancel
        </button>
        <button class={`btn ${meta.danger ? "btn-danger" : "btn-primary"}`} type="button" onClick={submit}>
          {meta.confirm}
        </button>
      </div>
    </>
  );
}

function FileList() {
  const files = reviewerFiles.value;
  if (!files.length) {
    return <div class="changes-empty">{reviewerLoadError.value || "No file changes."}</div>;
  }
  return (
    <FileTree
      files={files}
      viewMode="tree"
      group={null}
      activeFile={reviewerActiveFile.value}
      onSelect={(path) => selectFile(path)}
      fileBadge={(path) => {
        const n = threadsFor(path).length;
        return n ? <span class="prr-thread-badge">{n}</span> : null;
      }}
    />
  );
}

function DiffView() {
  const diff = reviewerDiff.value;
  if (reviewerDiffLoading.value) {
    return (
      <div class="diff-view">
        <div class="diff-empty">Loading diff…</div>
      </div>
    );
  }
  if (!reviewerActiveFile.value || !diff) {
    return (
      <div class="diff-view">
        <div class="diff-empty">{reviewerLoadError.value || "Select a file to view its diff."}</div>
      </div>
    );
  }
  return (
    <div class="diff-view">
      <DiffContent diff={diff} />
    </div>
  );
}

function DiffContent({ diff }: { diff: FileDiff }) {
  const [composerLine, setComposerLine] = useState<number | null>(null);

  return (
    <div class="diff-content">
      <div class="diff-head">
        <span class="diff-path" title={diff.path}>
          {diff.path}
        </span>
        <span class="diff-adds">+{diff.additions}</span>
        <span class="diff-dels">−{diff.deletions}</span>
        <button
          class={`icon-mini diff-expand-btn${reviewerWholeFile.value ? " active" : ""}`}
          type="button"
          title={reviewerWholeFile.value ? "Show only changed lines" : "Show the whole file"}
          onClick={toggleWholeFile}
        >
          <Raw html={reviewerWholeFile.value ? DIFF_COLLAPSE : DIFF_EXPAND} />
        </button>
      </div>
      <div class="diff-body">
        {diff.oldImage || diff.newImage ? (
          <div class="diff-binary">Image file — open the Changes page or the PR in the browser to preview it.</div>
        ) : diff.binary ? (
          <div class="diff-binary">Binary file — no text diff to display.</div>
        ) : !diff.hunks.length ? (
          <div class="diff-binary">No textual changes to display.</div>
        ) : (
          <div class="diff-code">
            {diff.hunks.map((h, hi) => (
              <div key={hi}>
                <div class="diff-hunk-head">{h.header}</div>
                {h.lines.map((l, li) => {
                  const cls = l.kind === "add" ? "add" : l.kind === "del" ? "del" : "";
                  const canComment = l.newLineno != null;
                  const lineThreads = canComment ? threadsFor(diff.path).filter((t) => t.line === l.newLineno) : [];
                  return (
                    <div key={`${hi}-${li}`}>
                      <div class={`diff-line ${cls}`}>
                        <span class="diff-gutter">
                          <span>{l.oldLineno ?? ""}</span>
                          <span>{l.newLineno ?? ""}</span>
                          {canComment ? (
                            <button
                              class="prr-line-add"
                              type="button"
                              title="Add a comment on this line"
                              onClick={() => setComposerLine(l.newLineno!)}
                            >
                              +
                            </button>
                          ) : null}
                        </span>
                        <span class="diff-text" dangerouslySetInnerHTML={{ __html: hlLine(l.content, diff.path) }} />
                      </div>
                      {lineThreads.map((t) => (
                        <Thread key={t.id} thread={t} />
                      ))}
                      {composerLine === l.newLineno && canComment ? (
                        <NewComposer
                          path={diff.path}
                          line={l.newLineno!}
                          onClose={() => setComposerLine(null)}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Comment({ author, body, created }: { author: string; body: string; created: string }) {
  const initials = (author || "?").slice(0, 2).toUpperCase();
  return (
    <div class="prr-comment">
      <div class="prr-comment-meta">
        <span class="avatar">{initials}</span>
        <span class="prr-comment-author">{author}</span>
        <span>{created}</span>
      </div>
      <div class="prr-comment-body" dangerouslySetInnerHTML={{ __html: mdLite(body) }} />
    </div>
  );
}

function Thread({ thread: t }: { thread: PrThread }) {
  const [reply, setReply] = useState("");
  const submit = async () => {
    const body = reply.trim();
    if (!body) return;
    try {
      await postComment({ body, threadId: t.id });
      setReply("");
    } catch (e) {
      await modal.alert({ title: "Couldn't post comment", message: String(e) });
    }
  };
  return (
    <div class={`prr-thread${t.resolved ? " resolved" : ""}`}>
      <div class="prr-thread-head">
        <span class="prr-thread-path">
          {t.path ? `${t.path}${t.line != null ? ":" + t.line : ""}` : "General discussion"}
        </span>
        {t.canResolve ? (
          <button
            class="btn btn-ghost btn-sm"
            type="button"
            onClick={async () => {
              try {
                await resolveThread(t.id, !t.resolved);
              } catch (e) {
                await modal.alert({ title: "Couldn't update thread", message: String(e) });
              }
            }}
          >
            {t.resolved ? "Reopen" : "Resolve"}
          </button>
        ) : null}
      </div>
      {t.comments.map((c) => (
        <Comment key={c.id} author={c.author} body={c.body} created={c.created} />
      ))}
      <div class="prr-composer">
        <textarea placeholder="Reply…" value={reply} onInput={(e) => setReply((e.target as HTMLTextAreaElement).value)} />
        <div class="prr-composer-actions">
          <button class="btn btn-primary btn-sm" type="button" onClick={submit}>
            Reply
          </button>
        </div>
      </div>
    </div>
  );
}

function NewComposer({ path, line, onClose }: { path: string; line: number; onClose: () => void }) {
  const [body, setBody] = useState("");
  const submit = async () => {
    const v = body.trim();
    if (!v) return;
    try {
      await postComment({ body: v, path, line });
      onClose();
    } catch (e) {
      await modal.alert({ title: "Couldn't post comment", message: String(e) });
    }
  };
  return (
    <div class="prr-thread prr-new-composer">
      <div class="prr-composer">
        <textarea placeholder="Add a comment…" autofocus value={body} onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)} />
        <div class="prr-composer-actions">
          <button class="btn btn-ghost btn-sm" type="button" onClick={onClose}>
            Cancel
          </button>
          <button class="btn btn-primary btn-sm" type="button" onClick={submit}>
            Comment
          </button>
        </div>
      </div>
    </div>
  );
}

function Conversation() {
  const [val, setVal] = useState("");
  const general = generalThreads();
  const submit = async () => {
    const v = val.trim();
    if (!v) return;
    try {
      await postComment({ body: v });
      setVal("");
    } catch (e) {
      await modal.alert({ title: "Couldn't post comment", message: String(e) });
    }
  };
  return (
    <div id="prrConversationView" role="tabpanel">
      <div class="prr-conversation">
        {general.length ? (
          general.map((t) => (
            <div class="prr-thread-general" key={t.id}>
              {t.comments.map((c) => (
                <Comment key={c.id} author={c.author} body={c.body} created={c.created} />
              ))}
            </div>
          ))
        ) : (
          <div class="changes-empty">No comments yet — start the discussion below.</div>
        )}
        <div class="prr-thread-general">
          <div class="prr-composer">
            <textarea placeholder="Write a comment…" value={val} onInput={(e) => setVal((e.target as HTMLTextAreaElement).value)} />
            <div class="prr-composer-actions">
              <button class="btn btn-primary btn-sm" type="button" onClick={submit}>
                Comment
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
