// Small circular avatar showing the first two letters of a name. Shared by the
// Changes commit/PR detail views and the PR reviewer's comment threads. The
// base styling is component-owned (Avatar.module.css); consumers pass a `class`
// for context-specific sizing (e.g. Changes `.detailAvatar`, PR `.commentAvatar`).

import styles from "./Avatar.module.css";

export function Avatar({ name, class: cls }: { name?: string | null; class?: string }) {
  return <span class={cls ? `${styles.avatar} ${cls}` : styles.avatar}>{(name || "?").slice(0, 2).toUpperCase()}</span>;
}
