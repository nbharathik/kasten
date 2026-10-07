// The sections of Home. A section with nothing to show renders nothing and
// its cell folds away (dashboard.css), except To-dos and Journal, which
// always offer a way to start.

import { useMemo, type MouseEvent } from "react";

import { useShell } from "../../lib/store";
import type { BoardInfo, NoteMeta, TaskRow } from "../../lib/vault/types";
import { Icon, type IconName } from "../../ui/Icon";
import { useBoards } from "../boards/store";
import { DashCard, DashEmpty } from "../dashboard/DashCard";
import { BoardTile, NoteRow, NoteTile } from "../dashboard/NoteTiles";
import { TodoList } from "../dashboard/TodoList";
import { keyLabel, useKeys } from "../shortcuts/store";
import { captureCard } from "../workspace/overlays/commands";
import { byModified } from "../workspace/overlays/match";
import { usePrefs } from "../workspace/prefs";
import { howFrom, useWorkspace } from "../workspace/store";
import { inboxCards, journalDays, noteAt } from "../workspace/tree";
import { Capture } from "../workspace/views/Capture";
import { PageDirectory } from "./PageDirectory";
import { ProjectTiles } from "./ProjectTiles";
import type { HomeSection } from "./sections";

export function HomeSectionView({ id }: { id: HomeSection }) {
  switch (id) {
    case "actions":
      return <Actions />;
    case "capture":
      return <Capture />;
    case "recent":
      return <Recent />;
    case "todo":
      return <Todos />;
    case "inbox":
      return <Inbox />;
    case "projects":
      return <ProjectTiles />;
    case "journal":
      return <Journal />;
    case "favourites":
      return <Favourites />;
    case "boards":
      return <Boards />;
    case "pages":
      return <PageDirectory />;
  }
}

function Actions() {
  const keymap = useKeys((s) => s.keymap);
  const { newPage, openJournal } = useWorkspace.getState();
  return (
    <div className="flex flex-wrap gap-2">
      <Action icon="compose" label="New page" keys={keyLabel(keymap, "new-page")} onClick={() => newPage()} />
      <Action icon="inbox" label="Quick note" keys={keyLabel(keymap, "new-card")} onClick={() => captureCard()} />
      <Action icon="journal" label="Today's journal" keys={keyLabel(keymap, "journal")} onClick={(e) => void openJournal(undefined, howFrom(e))} />
      <Action icon="template" label="From a template" onClick={() => useShell.getState().openGallery({})} />
      <Action icon="search" label="Search" keys={keyLabel(keymap, "palette")} onClick={() => useShell.getState().setPalette(true)} />
    </div>
  );
}

function Action({ icon, label, keys, onClick }: { icon: IconName; label: string; keys?: string; onClick: (event: MouseEvent) => void }) {
  return (
    <button type="button" onClick={onClick} title={keys ? `${label} (${keys})` : label} className="ui-btn">
      <Icon name={icon} className="size-4 text-muted" />
      {label}
    </button>
  );
}

/** Recent pages and boards, then the latest edited pages, eight in all. */
function Recent() {
  const notes = useWorkspace((s) => s.notes);
  const recent = useWorkspace((s) => s.recent);
  const boards = useBoards((s) => s.list);
  const items = useMemo(() => {
    const out: (NoteMeta | BoardInfo)[] = [];
    for (const path of recent) {
      if (out.length >= 8) break;
      const found = path.endsWith(".canvas") ? boards.find((b) => b.path === path) : noteAt(notes, path);
      if (found && (!("kind" in found) || (found.kind !== "journal" && found.kind !== "template"))) out.push(found);
    }
    for (const n of byModified(notes)) {
      if (out.length >= 8) break;
      if (n.kind !== "journal" && !out.includes(n)) out.push(n);
    }
    return out;
  }, [notes, recent, boards]);
  if (items.length === 0) return null;
  return (
    <DashCard title="Jump back in" icon="clock" plain>
      <div className="kasten-tiles is-four">
        {items.map((item) => ("kind" in item ? <NoteTile key={item.path} note={item} /> : <BoardTile key={item.path} board={item} />))}
      </div>
    </DashCard>
  );
}

const everything = (row: TaskRow) => !row.path.startsWith("templates/");

function Todos() {
  const find = useMemo(() => ({ key: "home:journal", find: () => useWorkspace.getState().ensureJournal() }), []);
  return (
    <DashCard title="To-dos" icon="tasks" actions={<SeeAll label="Tasks" run={() => useWorkspace.getState().go({ view: "tasks" })} />}>
      <TodoList filter={everything} addTo={find} empty="Nothing to do. A to-do added here goes into today's journal." />
    </DashCard>
  );
}

function Inbox() {
  const cards = useWorkspace((s) => inboxCards(s.notes));
  if (cards.length === 0) return null;
  return (
    <DashCard title="Inbox" icon="inbox" count={cards.length} actions={<SeeAll label="Sort" run={() => useWorkspace.getState().go({ view: "inbox" })} />}>
      <div className="kasten-dash-rows">
        {cards.slice(0, 6).map((card) => (
          <NoteRow key={card.path} note={card} detail={card.excerpt || undefined} />
        ))}
      </div>
    </DashCard>
  );
}

function Journal() {
  const days = useWorkspace((s) => journalDays(s.notes));
  const { openJournal } = useWorkspace.getState();
  const latest = [...days].sort((a, b) => b.title.localeCompare(a.title)).slice(0, 5);
  return (
    <DashCard title="Journal" icon="journal" actions={<SeeAll label="Write today" run={() => void openJournal()} />}>
      {latest.length === 0 ? (
        <DashEmpty>No days written yet. Today's page is one click away.</DashEmpty>
      ) : (
        <div className="kasten-dash-rows">
          {latest.map((day) => (
            <NoteRow key={day.path} note={day} detail={day.excerpt || "No entry"} />
          ))}
        </div>
      )}
    </DashCard>
  );
}

function Favourites() {
  const favourites = usePrefs((s) => s.favourites);
  const notes = useWorkspace((s) => s.notes);
  const shown = favourites.map((path) => noteAt(notes, path)).filter((n): n is NoteMeta => Boolean(n));
  if (shown.length === 0) return null;
  return (
    <DashCard title="Favourites" icon="star" count={shown.length}>
      <div className="kasten-dash-rows">
        {shown.slice(0, 8).map((note) => (
          <NoteRow key={note.path} note={note} />
        ))}
      </div>
    </DashCard>
  );
}

function Boards() {
  const boards = useBoards((s) => s.list);
  const latest = useMemo(() => [...boards].sort((a, b) => b.modified - a.modified).slice(0, 8), [boards]);
  if (latest.length === 0) return null;
  return (
    <DashCard title="Whiteboards" icon="board" count={boards.length} actions={<SeeAll label="All whiteboards" run={() => useWorkspace.getState().go({ view: "boards" })} />}>
      <div className="kasten-tiles is-four">
        {latest.map((board) => (
          <BoardTile key={board.path} board={board} />
        ))}
      </div>
    </DashCard>
  );
}

function SeeAll({ label, run }: { label: string; run: () => void }) {
  return (
    <button type="button" className="kasten-dash-action" onClick={run}>
      {label}
      <Icon name="arrow-up-right" className="size-3.5" />
    </button>
  );
}
