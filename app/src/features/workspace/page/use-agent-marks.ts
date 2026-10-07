// An open page's agent marks: read when the
// page loads, and again when it reloads after an agent's edit, and what the
// badge on them does: accept, undo the session, or show it in History.

import { useEffect, useMemo, useState } from "react";

import type { AgentMark, Undone, VaultClient } from "../../../lib/vault/types";
import type { AgentActions } from "../../pages/editor/blocks/agent-marks";
import { agentMarksChanged } from "../../review/agent-marked";
import { showSession } from "../../review/session-request";
import { useReview } from "../../review/store";
import { count } from "../../review/words";
import { useWorkspace } from "../store";
import { reloadOpenPage } from "./open-page";
import type { PageSession } from "./page-session";

const NONE: AgentMark[] = [];

function undoneWords({ reverted, conflict }: Undone): string {
  if (!conflict) return `Undid the session: ${count(reverted.length, "change")} reverted`;
  const after = reverted.length > 0 ? `, after reverting ${count(reverted.length, "change")}` : "";
  return `The undo stopped at “${conflict.summary}”${after}: ${conflict.detail}`;
}

/** The marks for the page `session` shows. `exact` says the editor shows the
 * file's own body; typing waiting to be written would put lines elsewhere,
 * so then there are none until the next load. */
export function useAgentMarks(client: VaultClient, session: PageSession, exact: boolean): { marks: readonly AgentMark[]; agent: AgentActions } {
  const [marks, setMarks] = useState<readonly AgentMark[]>(NONE);

  useEffect(() => {
    if (!exact) return;
    let live = true;
    Promise.resolve(session.path).then((path) => client.agentMarks(path)).then(
      (found) => live && setMarks(found),
      // Marks are a guide only: without them the page works as ever.
      () => {},
    );
    return () => {
      live = false;
    };
  }, [client, session, exact]);

  const agent = useMemo<AgentActions>(
    () => ({
      async accept() {
        await session.flush();
        await client.acceptAgentMarks(session.path);
        setMarks(await client.agentMarks(session.path));
        agentMarksChanged();
        useWorkspace.getState().toast("Accepted: the agent's writing on this page is kept as it stands");
      },
      async undo(id) {
        await session.flush();
        const undone = await client.undoSession(id);
        useWorkspace.getState().toast(undoneWords(undone));
        void useWorkspace.getState().refresh();
        void useReview.getState().refresh();
        agentMarksChanged();
        reloadOpenPage(session.path);
      },
      history: (id) => showSession(id),
    }),
    [client, session],
  );

  return { marks: exact ? marks : NONE, agent };
}
