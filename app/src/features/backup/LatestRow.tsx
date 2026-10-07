// Backing up now, and Get latest: the changes another computer backed up
// come in beside this one's, from the remote or from a backup file.
// Kasten is desktop-first, so this happens when you ask, not on its own.

import { useState } from "react";

import { FolderPicker } from "../vaults/FolderPicker";
import { describeBackup, useVaultStatus } from "../workspace/status";
import { useWorkspace } from "../workspace/store";
import { runGetLatest } from "./latest";
import { BUTTON, message, type RowComponent } from "./parts";

export function LatestRow({ Row }: { Row: RowComponent }) {
  const client = useWorkspace((s) => s.client);
  const status = useVaultStatus((s) => s.status);
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const { toast } = useWorkspace.getState();
  if (!client || !status?.history) return null;

  const remote = status.remote !== null;
  const confirmed = remote && status.backup.state !== "unconfirmed";
  const said = describeBackup(status);
  const push = async () => {
    setBusy("push");
    try {
      const after = await client.pushNow();
      toast(after.state === "failing" ? `Backup failed: ${after.lastError ?? "unknown error"}` : "Backed up");
    } catch (err) {
      toast(message(err));
    } finally {
      setBusy(null);
      void useVaultStatus.getState().refresh();
    }
  };
  const latest = async (file?: string) => {
    setPicking(false);
    setBusy("latest");
    await runGetLatest(file);
    setBusy(null);
  };

  return (
    <>
      {remote && (
        <Row label={said.label} detail={said.detail}>
          <button type="button" className={BUTTON} disabled={busy !== null} onClick={() => void push()}>
            {busy === "push" ? "Pushing…" : confirmed ? "Back up now" : "Back up there"}
          </button>
        </Row>
      )}
      {(confirmed || status.backupFolder) && (
        <Row
          label="Get latest"
          detail={
            status.unfinished
              ? "Getting the latest stopped part way. Get latest finishes it."
              : "Brings in what you changed on another computer. Nothing here is overwritten: a page changed on both keeps the other version beside yours."
          }
        >
          <div className="flex items-center gap-1.5">
            {confirmed && (
              <button type="button" className={BUTTON} disabled={busy !== null} onClick={() => void latest()}>
                {busy === "latest" ? "Getting…" : "Get latest"}
              </button>
            )}
            <button type="button" className={BUTTON} disabled={busy !== null} onClick={() => setPicking(true)}>
              From a file…
            </button>
          </div>
        </Row>
      )}
      {picking && (
        <FolderPicker title="Get latest from a backup file" start={status.backupFolder ?? undefined} files="bundle" pickLabel="Use" onPick={(path) => void latest(path)} onClose={() => setPicking(false)} />
      )}
    </>
  );
}
