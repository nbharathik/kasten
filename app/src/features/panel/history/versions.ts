// How versions are named in the History tab.

import type { CommitInfo } from "../../../lib/vault/types";

/** Who made a version: an agent's client name ("agent:<client>"), or the author. */
export function authorOf(version: CommitInfo): string {
  return version.agent ? version.author.replace(/^agent:/, "") || "agent" : version.author || "Someone";
}

/** "24 Sep 2026, 10:20" for a version's time. */
export const versionTime = (millis: number) =>
  new Date(millis).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
