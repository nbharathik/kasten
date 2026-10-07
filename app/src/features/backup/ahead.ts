// On opening a vault, a quick look (never a download) whether the backup
// has changes another computer made that this one lacks; if so, one
// notice offers Get latest. Kasten is desktop-first: nothing comes in until
// asked.

import { useVaultStatus } from "../workspace/status";
import { useWorkspace } from "../workspace/store";
import { backupAhead, canBackUp } from "./api";
import { runGetLatest } from "./latest";

/** Wait after opening, so the look never slows the first screen. */
const AFTER_MS = 4_000;

/** Looks once, a moment after opening; returns how to stop it. */
export function lookForNewerBackup(): () => void {
  if (!canBackUp()) return () => {};
  const timer = setTimeout(() => {
    const status = useVaultStatus.getState().status;
    if (!status?.remote || status.backup.state === "unconfirmed" || status.backup.state === "off") return;
    backupAhead().then(
      (ahead) => {
        if (!ahead) return;
        useWorkspace.getState().toast("The backup has changes from another computer", { label: "Get latest", run: () => void runGetLatest() });
      },
      () => {},
    );
  }, AFTER_MS);
  return () => clearTimeout(timer);
}
