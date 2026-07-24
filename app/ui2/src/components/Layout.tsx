// App frame: the fixed left Navigation rail plus a scrollable main region that
// hosts the active page (passed as children). Also mounts the global overlay
// hosts (modal, context menu, branch picker) so any page can trigger them.

import type { ComponentChildren } from "preact";
import { Navigation } from "@/components/Navigation";
import { ModalHost } from "@/components/modal";
import { MenuHost } from "@/components/menu";
import { BranchPickerHost } from "@/components/BranchPicker";
import styles from "./Layout.module.css";

export function Layout({ children }: { children?: ComponentChildren }) {
  return (
    <div class={styles.app}>
      <Navigation />
      <main class={styles.main}>{children}</main>
      <ModalHost />
      <MenuHost />
      <BranchPickerHost />
    </div>
  );
}
