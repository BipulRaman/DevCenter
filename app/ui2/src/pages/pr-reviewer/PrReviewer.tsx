// PR Reviewer — full-screen file list + diff with inline comment threads, a
// Conversation tab, and provider-aware review actions. Ported from
// app/ui/js/pr-reviewer.js. Rendered as an overlay page when reviewerOpen.

import { useState } from "preact/hooks";
import { ipc } from "@/platform/ipc";
import { Avatar } from "@/components/Avatar";
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
import { FileTree, treeStyles } from "@/lib/file-tree";
import { PaneResizer } from "@/components/PaneResizer";
import { DiffView, diffStyles } from "@/components/DiffView";
import type { FileDiff, PrThread } from "@/types/models";
import styles from "./PrReviewer.module.css";

const VOTE_CLS: Record<string, string> = { "10": styles.ok, "5": styles.ok, "0": styles.muted, "-5": styles.warn, "-10": styles.danger };
const REVIEW_CLS: Record<string, string> = { ok: styles.ok, "ok-light": styles.okLight, warn: styles.warn, danger: styles.danger, muted: styles.muted };

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
    <section class={`page active ${styles.root}`} id="page-pr-review">
      <header class="page-head">
        <div class={styles.conflictHeadMain}>
          <button class="btn btn-icon btn-sm" type="button" title="Back" onClick={back}>
            <Raw html={ICONS.arrowLeft} />
          </button>
          <div>
            <h1>{pr.title || `Pull request #${pr.id}`}</h1>
            <p class="page-desc">
              <span class={styles.metaRow}>
                <span class={styles.repo}>{pr.repo || ""}</span>
                <span class={styles.number}>#{pr.id}</span>
                <span class={styles.dot}>·</span>
                <span class={styles.by}>{pr.author || ""}</span>
              </span>{" "}
              <span class={styles.branches}>
                <span class={styles.branchName} title={pr.branch}>
                  {pr.branch}
                </span>
                <svg class={styles.arrow} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
                <span class={`${styles.branchName} ${styles.base}`} title={pr.base}>
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

      <div class={styles.layout}>
        <aside class={styles.side}>
          <div class={styles.tabs} role="tablist" aria-label="Pull request review views">
            <button
              class={`${styles.tab}${reviewerTab.value === "files" ? ` ${styles.active}` : ""}`}
              type="button"
              role="tab"
              aria-selected={reviewerTab.value === "files"}
              onClick={() => (reviewerTab.value = "files")}
            >
              Files
            </button>
            <button
              class={`${styles.tab}${reviewerTab.value === "conversation" ? ` ${styles.active}` : ""}`}
              type="button"
              role="tab"
              aria-selected={reviewerTab.value === "conversation"}
              onClick={() => (reviewerTab.value = "conversation")}
            >
              Conversation
            </button>
          </div>
          <div class={styles.conflictFiles}>
            <FileList />
          </div>
        </aside>
        <PaneResizer resize="prr-side" varName="--prr-side" storageKey="dc.prr.side" min={200} max={620} def={290} ariaLabel="Resize file list" />
        <section class={styles.main}>
          {reviewerTab.value === "conversation" ? <Conversation /> : <ReviewerDiff />}
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
  const reviewClass = REVIEW_CLS[rv.cls] || styles.muted;
  const statusPill = (
    <span class={`${styles.status} ${reviewClass}`} title="Overall review status">
      <span class={`${styles.voteDot} ${reviewClass}`} />
      {rv.label}
    </span>
  );

  if (isDraft) {
    return (
      <>
        {statusPill}
        {openBtn}
        {commentBtn}
        <button class={`btn btn-primary btn-sm ${styles.publishBtn}`} type="button" title="Mark this draft ready for review" onClick={onPublish}>
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
        <div class={styles.vote}>
          <button
            class={`btn ${voted ? "btn-primary" : "btn-ghost"} btn-sm ${styles.voteBtn}`}
            type="button"
            aria-haspopup="true"
            onClick={(e) => voteMenu(e.currentTarget.closest(`.${styles.vote}`) as HTMLElement)}
          >
            <span class={`${styles.voteDot} ${cur}`} />
            <span>Vote</span>
            <svg class={styles.caret} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
      <button class={`btn btn-danger btn-sm${rejected ? ` ${styles.isCurrent}` : ""}`} type="button" onClick={() => runReview("changes")}>
        {rejected ? "Changes requested ✓" : "Request changes"}
      </button>
      <button class={`btn btn-primary btn-sm${approved ? ` ${styles.isCurrent}` : ""}`} type="button" onClick={() => runReview("approve")}>
        {approved ? "Approved ✓" : "Approve"}
      </button>
    </>
  );
}

function dot(cls: string): string {
  return `<span class="${styles.voteDot} ${styles.menuVoteDot} ${REVIEW_CLS[cls] || styles.muted}"></span>`;
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
    return <div class={treeStyles.changesEmpty}>{reviewerLoadError.value || "No file changes."}</div>;
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
        return n ? <span class={styles.threadBadge}>{n}</span> : null;
      }}
    />
  );
}

function ReviewerDiff() {
  const diff = reviewerDiff.value;
  return (
    <DiffView
      diff={reviewerActiveFile.value ? diff : null}
      loading={reviewerDiffLoading.value}
      empty={reviewerLoadError.value || "Select a file to view its diff."}
      wholeFile={reviewerWholeFile.value}
      onToggleWholeFile={toggleWholeFile}
      viewClass={styles.reviewerDiffView}
    >
      {reviewerActiveFile.value && diff ? <ReviewerDiffBody diff={diff} /> : null}
    </DiffView>
  );
}

function ReviewerDiffBody({ diff }: { diff: FileDiff }) {
  const [composerLine, setComposerLine] = useState<number | null>(null);

  return (
    <div class={diffStyles.diffBody}>
      {diff.oldImage || diff.newImage ? (
        <div class={diffStyles.diffBinary}>Image file — open the Changes page or the PR in the browser to preview it.</div>
      ) : diff.binary ? (
        <div class={diffStyles.diffBinary}>Binary file — no text diff to display.</div>
      ) : !diff.hunks.length ? (
        <div class={diffStyles.diffBinary}>No textual changes to display.</div>
      ) : (
        <div class={diffStyles.diffCode}>
          {diff.hunks.map((h, hi) => (
            <div key={hi}>
              <div class={diffStyles.diffHunkHead}>{h.header}</div>
              {h.lines.map((l, li) => {
                const cls = l.kind === "add" ? diffStyles.add : l.kind === "del" ? diffStyles.del : "";
                const canComment = l.newLineno != null;
                const lineThreads = canComment ? threadsFor(diff.path).filter((t) => t.line === l.newLineno) : [];
                return (
                  <div key={`${hi}-${li}`}>
                    <div class={`${diffStyles.diffLine} ${cls}`}>
                      <span class={diffStyles.diffGutter}>
                        <span>{l.oldLineno ?? ""}</span>
                        <span>{l.newLineno ?? ""}</span>
                        {canComment ? (
                          <button
                            class={diffStyles.lineAdd}
                            type="button"
                            title="Add a comment on this line"
                            onClick={() => setComposerLine(l.newLineno!)}
                          >
                            +
                          </button>
                        ) : null}
                      </span>
                      <span class={diffStyles.diffText} dangerouslySetInnerHTML={{ __html: hlLine(l.content, diff.path) }} />
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
  );
}

function Comment({ author, body, created }: { author: string; body: string; created: string }) {
  return (
    <div class={styles.comment}>
      <div class={styles.commentMeta}>
        <Avatar name={author} class={styles.commentAvatar} />
        <span class={styles.commentAuthor}>{author}</span>
        <span>{created}</span>
      </div>
      <div class={styles.commentBody} dangerouslySetInnerHTML={{ __html: mdLite(body, styles.mdPre) }} />
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
    <div class={`${styles.thread}${t.resolved ? ` ${styles.resolved}` : ""}`}>
      <div class={styles.threadHead}>
        <span class={styles.threadPath}>
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
      <div class={styles.composer}>
        <textarea placeholder="Reply…" value={reply} onInput={(e) => setReply((e.target as HTMLTextAreaElement).value)} />
        <div class={styles.composerActions}>
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
    <div class={styles.thread}>
      <div class={styles.composer}>
        <textarea placeholder="Add a comment…" autofocus value={body} onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)} />
        <div class={styles.composerActions}>
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
    <div class={styles.conversationView} role="tabpanel">
      <div class={styles.conversation}>
        {general.length ? (
          general.map((t) => (
            <div class={styles.threadGeneral} key={t.id}>
              {t.comments.map((c) => (
                <Comment key={c.id} author={c.author} body={c.body} created={c.created} />
              ))}
            </div>
          ))
        ) : (
          <div class={treeStyles.changesEmpty}>No comments yet — start the discussion below.</div>
        )}
        <div class={styles.threadGeneral}>
          <div class={styles.composer}>
            <textarea placeholder="Write a comment…" value={val} onInput={(e) => setVal((e.target as HTMLTextAreaElement).value)} />
            <div class={styles.composerActions}>
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
