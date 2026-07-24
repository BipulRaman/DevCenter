import { modal } from "@/components/modal";
import { ipc } from "@/platform/ipc";

interface CheckOptions {
  reportCurrent?: boolean;
  reportErrors?: boolean;
}

export async function checkForUpdates({ reportCurrent = false, reportErrors = false }: CheckOptions = {}): Promise<void> {
  if (!ipc.hasBackend) return;

  try {
    const result = await ipc.checkForUpdates();
    const status = result.status;

    if (status === "available") {
      const version = (result as { version?: string }).version || "";
      const install = await modal.confirm({
        title: "Update available",
        message: `${window.BRAND} ${version} is available. Install it now? ${window.BRAND} will restart to finish updating.`,
        confirmText: "Update & restart",
      });
      if (!install) return;

      try {
        await ipc.installUpdate();
      } catch (error) {
        await modal.alert({ title: "Update failed", message: String(error) });
      }
    } else if (reportCurrent && status === "up_to_date") {
      await modal.alert({ title: "Up to date", message: "You're already on the latest version." });
    } else if (reportCurrent && status === "not_configured") {
      await modal.alert({
        title: "Updates unavailable",
        message: "In-app updates aren't available for this build. Download the latest release from GitHub.",
      });
    }
  } catch (error) {
    if (reportErrors) {
      await modal.alert({ title: "Update check failed", message: String(error) });
    }
  }
}