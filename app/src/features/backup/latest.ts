// Get latest, by hand: what was typed is written and committed first, then
// the backup's changes come in beside this computer's. Nothing is
// overwritten: a page both computers changed keeps the other version as a
// copy beside it, and the toast opens it.

import { writeEverything } from "../workspace/page/before-exit";
import { useVaultStatus } from "../workspace/status";
import { useWorkspace } from "../workspace/store";
import { getLatest, getLatestFromFile, type Latest } from "./api";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** What Get latest did, in a sentence. */
export function describeLatest(latest: Latest): string {
  switch (latest.outcome) {
    case "upToDate":
      return "Already up to date";
    case "fastForward":
      return `Got the latest: ${plural(latest.changed.length, "file")} changed`;
    case "merged":
      return latest.copies.length === 0
        ? "Got the latest, joined with your changes"
        : `Got the latest. ${plural(latest.copies.length, "page")} changed on both computers: the other version is kept beside yours`;
  }
}

/** Gets the latest from the backup remote, or from a backup file, and says
 * what happened. Answers what it did, or null when it could not. */
export async function runGetLatest(fromFile?: string): Promise<Latest | null> {
  const { toast, openPath, refresh } = useWorkspace.getState();
  await writeEverything();
  try {
    const latest = fromFile ? await getLatestFromFile(fromFile) : await getLatest();
    await refresh();
    const copy = latest.copies[0];
    toast(describeLatest(latest), copy ? { label: "Show", run: () => openPath(copy) } : undefined);
    return latest;
  } catch (err) {
    toast(message(err));
    return null;
  } finally {
    void useVaultStatus.getState().refresh();
  }
}
