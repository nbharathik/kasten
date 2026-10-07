// The browser preview's stand-in for agent sessions: versions an agent wrote
// carry its session and client, so the History view lists the session and
// undoing it reverts them, newest first, as the core does with git. The chat's
// and the brainstorm's preview stand-ins write as agents. Also the file a saved
// chat becomes (the core's `save_chat`).

import { isoDay } from "../../../lib/dates";
import type { SessionInfo } from "../../../lib/vault/types";
import { yamlScalar } from "../../pages/page/page-meta";
import type { Version } from "./stored";
import { newId, newestFirst, slugify, stamps } from "./vault-text";

/** Who writes: an agent session and the client it belongs to. */
export interface Agent {
  session: string;
  client: string;
}

type Versions = Record<string, Version[]>;

/** Ids of the versions a later version undid. */
export function undoneIds(versions: Versions): Set<string> {
  return new Set(
    Object.values(versions)
      .flat()
      .flatMap((v) => (v.undoes ? [v.undoes] : [])),
  );
}

/** Agent sessions from their versions, the latest first. */
export function sessionsIn(versions: Versions, limit = 50): SessionInfo[] {
  const undone = undoneIds(versions);
  const by = new Map<string, SessionInfo>();
  for (const version of Object.values(versions).flat()) {
    if (!version.session) continue;
    const s = by.get(version.session) ?? { id: version.session, client: version.client ?? "agent", started: version.time, last: version.time, commits: 0, undone: true };
    s.commits += 1;
    s.started = Math.min(s.started, version.time);
    s.last = Math.max(s.last, version.time);
    s.undone &&= undone.has(version.id);
    by.set(version.session, s);
  }
  return [...by.values()].sort((a, b) => b.last - a.last).slice(0, limit);
}

export interface SessionEdit {
  path: string;
  version: Version;
  /** The note's version before this one; null when this one made the note. */
  before: Version | null;
}

/** A session's versions not undone yet, newest first: the order an undo takes. */
export function sessionEdits(versions: Versions, session: string): SessionEdit[] {
  const undone = undoneIds(versions);
  const out: SessionEdit[] = [];
  for (const [path, list] of Object.entries(versions)) {
    list.forEach((version, i) => {
      if (version.session === session && !undone.has(version.id)) out.push({ path, version, before: i > 0 ? list[i - 1]! : null });
    });
  }
  return out.sort((a, b) => newestFirst(a.version, b.version));
}

/** A saved chat: `chats/<day>-<slug>.md` with `type: chat`, the transcript as its body. */
export function chatFile(title: string, markdown: string, now: number): { stem: string; text: string } {
  const name = title.trim().replace(/[\r\n]+/g, " ") || "Chat";
  const at = stamps(now).rfc3339;
  const head = ["---", `id: ${newId(now)}`, `title: ${yamlScalar(name)}`, "type: chat", `created: ${at}`, `updated: ${at}`, "---", ""].join("\n");
  return { stem: `${isoDay(new Date(now))}-${slugify(name)}`, text: head + (markdown.endsWith("\n") ? markdown : `${markdown}\n`) };
}
