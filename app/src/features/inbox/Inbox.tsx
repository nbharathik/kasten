import { useState } from "react";

import { useWorkspace } from "../workspace/store";
import { inboxCards } from "../workspace/tree";
import { Capture } from "../workspace/views/Capture";
import { CaptureList } from "./CaptureList";
import { Triage } from "./Triage";
import { Icon } from "../../ui/Icon";

/** The Inbox: quick notes by the day they were caught, newest first.
 * Each can be tagged, put on a
 * board, moved, made a page or marked done; Triage takes them one at a time. */
export function Inbox() {
  const notes = useWorkspace((s) => s.notes);
  const cards = inboxCards(notes);
  const [triage, setTriage] = useState(false);

  return (
    <div className="mx-auto w-full max-w-[780px] px-6 pb-24 pt-10 sm:px-12">
      <div className="flex items-center gap-3">
        <h1 className="flex-1 text-28 font-bold tracking-tight">
          <Icon name="inbox" className="mr-2.5 inline size-[26px] align-[-4px] text-muted" />
          Inbox
        </h1>
        {cards.length > 0 && !triage && (
          <button
            type="button"
            onClick={() => setTriage(true)}
            className="rounded-lg bg-accent px-3 py-1.5 text-13 font-medium text-on-accent shadow-card transition hover:brightness-110"
            title="One card at a time, with keys"
          >
            Triage {cards.length}
          </button>
        )}
      </div>
      <p className="mt-1 text-14 text-muted">Catch thoughts here, then give each a home: a project, a board, a tag, or the trash when it is done.</p>
      {triage ? (
        <Triage cards={cards} onExit={() => setTriage(false)} />
      ) : (
        <>
          <Capture autoFocus />
          <CaptureList cards={cards} />
        </>
      )}
    </div>
  );
}
