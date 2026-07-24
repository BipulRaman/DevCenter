// Rich tag editor — chips + type-to-add + suggestions. Shared by Git Board
// (repo tags) and App Center (app tags). Ported from openAppTagEditor in
// app/ui/js/app-center.js. Resolves to the new tag list, or null if cancelled.

import { useState } from "preact/hooks";
import { modal } from "@/components/modal";
import { ICONS, Raw } from "@/lib/ico";
import styles from "./TagEditor.module.css";

export function openTagEditor(opts: {
  title: string;
  tags: string[];
  suggestions: string[];
}): Promise<string[] | null> {
  return modal.custom<string[] | null>({
    title: opts.title,
    body: (close) => <TagEditorBody initial={opts.tags} suggestions={opts.suggestions} close={close} />,
  });
}

function TagEditorBody({
  initial,
  suggestions,
  close,
}: {
  initial: string[];
  suggestions: string[];
  close: (v: string[] | null) => void;
}) {
  const [tags, setTags] = useState<string[]>([...initial]);
  const [input, setInput] = useState("");

  const add = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) setTags((prev) => [...prev, t]);
    setInput("");
  };
  const remove = (i: number) => setTags((prev) => prev.filter((_, j) => j !== i));

  const avail = suggestions.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()));

  return (
    <>
      <div class={styles.tagList}>
        {tags.length ? (
          tags.map((t, i) => (
            <span class={styles.tag} key={t}>
              {t}
              <button type="button" title="Remove" onClick={() => remove(i)}>
                <Raw html={ICONS.x} />
              </button>
            </span>
          ))
        ) : (
          <span class={styles.empty}>No tags yet.</span>
        )}
      </div>
      <input
        class="modal-input"
        placeholder="Add a tag and press Enter"
        spellcheck={false}
        autocomplete="off"
        maxLength={24}
        value={input}
        onInput={(e) => setInput((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(input);
          } else if (e.key === "Backspace" && !input && tags.length) {
            // Empty input + Backspace removes the most recently added tag.
            e.preventDefault();
            remove(tags.length - 1);
          }
        }}
      />
      {avail.length ? (
        <div class={styles.suggestions}>
          <span class={styles.suggestionsLabel}>Suggestions</span>
          {avail.slice(0, 12).map((s) => (
            <button type="button" key={s} onClick={() => add(s)}>
              {s}
            </button>
          ))}
        </div>
      ) : null}
      <div class="modal-foot">
        <button class="btn btn-ghost" type="button" onClick={() => close(null)}>
          Cancel
        </button>
        <button class="btn btn-primary" type="button" onClick={() => close([...tags, ...(input.trim() && !tags.some((x) => x.toLowerCase() === input.trim().toLowerCase()) ? [input.trim()] : [])])}>
          Save
        </button>
      </div>
    </>
  );
}
