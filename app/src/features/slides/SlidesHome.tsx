import { memo, useEffect, useMemo, useState } from "react";

import { relativeTime } from "../../lib/dates";
import type { DeckInfo, NoteMeta } from "../../lib/vault/types";
import { Menu } from "../../shell/Menu";
import { Icon } from "../../ui/Icon";
import { projectTitle } from "../boards/store";
import { dragNotes } from "../workspace/drag";
import { usePrefs } from "../workspace/prefs";
import { howFrom, useWorkspace } from "../workspace/store";
import { DeckThumb } from "./DeckThumb";
import { ImportButton } from "./ImportButton";
import { NewDeck } from "./NewDeck";
import { useDeckPreview } from "./previews";
import { useDecks } from "./store";

interface Group {
  key: string;
  title: string;
  decks: DeckInfo[];
}

/** Decks by project (projects by title, loose decks last), newest first. */
function groups(decks: readonly DeckInfo[], notes: readonly NoteMeta[]): Group[] {
  const byKey = new Map<string, Group>();
  for (const deck of decks) {
    const key = deck.project ?? "";
    let group = byKey.get(key);
    if (!group) byKey.set(key, (group = { key, title: key ? projectTitle(notes, key) : "Not in a project", decks: [] }));
    group.decks.push(deck);
  }
  for (const group of byKey.values()) group.decks.sort((a, b) => b.modified - a.modified || a.title.localeCompare(b.title));
  return [...byKey.values()].sort((a, b) => (a.key === "") !== (b.key === "") ? (a.key === "" ? 1 : -1) : a.title.localeCompare(b.title));
}

/** The Slides view: every deck as a card with its first slide, by project, and a way to start a new one. */
export function SlidesHome() {
  const list = useDecks((s) => s.list);
  const loaded = useDecks((s) => s.loaded);
  const creating = useDecks((s) => s.creating);
  const draftProject = useDecks((s) => s.draftProject);
  const notes = useWorkspace((s) => s.notes);
  const [query, setQuery] = useState("");
  useEffect(() => void useDecks.getState().load(), []);

  const words = query.trim().toLowerCase();
  const shown = useMemo(() => (words ? list.filter((d) => d.title.toLowerCase().includes(words)) : list), [list, words]);
  const sections = useMemo(() => groups(shown, notes), [shown, notes]);
  const start = () => useDecks.setState({ creating: true, draftProject: null });

  return (
    <div className="mx-auto max-w-[1120px] px-6 pb-24 pt-10">
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-[240px] flex-1">
          <h1 className="text-28 font-bold tracking-tight">
            <Icon name="present" className="mr-2.5 inline size-[26px] align-[-4px] text-muted" />
            Slides
          </h1>
          <p className="mt-1 text-14 text-muted">Decks you can present and export to PowerPoint. They are plain files in your vault, so history and agents work on them like on any note.</p>
        </div>
        {list.length > 0 && (
          <label className="flex h-9 w-60 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 text-muted transition focus-within:border-accent/60 focus-within:ring-[3px] focus-within:ring-accent/15">
            <Icon name="search" />
            <input type="search" aria-label="Find a deck" placeholder="Find a deck" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-13 text-ink outline-none" />
          </label>
        )}
        <ImportButton project={null} className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-canvas px-3.5 text-13 text-ink transition hover:bg-hover disabled:opacity-50">
          Import PowerPoint…
        </ImportButton>
        <button type="button" onClick={start} className="flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-13 font-medium text-on-accent shadow-card transition hover:brightness-110">
          <Icon name="plus" className="size-4" />
          New deck
        </button>
      </header>

      {creating && <NewDeck key={draftProject ?? ""} />}

      {loaded && list.length === 0 && !creating && (
        <div className="mt-16 grid place-items-center text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-panel text-muted" aria-hidden="true">
            <Icon name="present" className="size-7" />
          </div>
          <h2 className="mt-3 text-20 font-semibold">No decks yet</h2>
          <p className="mt-1 max-w-[420px] text-14 text-muted">Make slides for a talk, a lecture or a review. Build them here, present them, and download a PowerPoint file when you need to share one.</p>
          <button type="button" onClick={start} className="mt-5 h-9 rounded-lg bg-accent px-4 text-13 font-medium text-on-accent shadow-card hover:brightness-110">
            Make your first deck
          </button>
        </div>
      )}

      {words && shown.length === 0 && <p className="mt-10 text-center text-14 text-muted">No deck is called “{query.trim()}”.</p>}

      {sections.map((group) => (
        <section key={group.key} aria-label={group.title} className="mt-9">
          <h2 className="mb-3 flex items-center gap-2 text-12 font-medium text-muted">
            {group.title}
            <span className="rounded bg-well px-1.5 text-11 font-medium normal-case tracking-normal text-muted">{group.decks.length}</span>
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(228px,1fr))] gap-4">
            {group.decks.map((deck) => (
              <DeckTile key={deck.path} info={deck} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const DeckTile = memo(function DeckTile({ info }: { info: DeckInfo }) {
  const deck = useDeckPreview(info);
  const favourite = usePrefs((s) => s.favourites.includes(info.path));
  const { openPath, trash } = useWorkspace.getState();
  const slides = info.slides === 1 ? "1 slide" : `${info.slides} slides`;
  return (
    <div
      draggable
      onDragStart={(e) => dragNotes(e, [info.path])}
      className="group relative overflow-hidden rounded-xl border border-line bg-canvas shadow-card transition ease-standard hover:border-line-hover hover:shadow-hover motion-reduce:transition-none"
    >
      <button type="button" aria-label={`Open ${info.title}`} onClick={(e) => openPath(info.path, howFrom(e))} onAuxClick={(e) => e.button === 1 && openPath(info.path, "tab")} className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
        <div className="border-b border-line bg-panel/70 p-3">
          <div className="overflow-hidden rounded-md border border-line shadow-card">
            <DeckThumb deck={deck} />
          </div>
        </div>
        <div className="px-3.5 pb-3 pt-2.5">
          <div className="truncate text-14 font-semibold">{info.title}</div>
          <div className="mt-0.5 text-12 text-muted">{info.problem ? <span className="text-danger">Cannot be read</span> : `${slides} · ${relativeTime(info.modified)}`}</div>
        </div>
      </button>
      <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-lg bg-canvas p-0.5 opacity-0 shadow-card transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 data-[on=true]:opacity-100" data-on={favourite}>
        <button
          type="button"
          aria-label={favourite ? `Remove ${info.title} from Favourites` : `Add ${info.title} to Favourites`}
          title={favourite ? "Remove from Favourites" : "Add to Favourites"}
          onClick={() => usePrefs.getState().toggleFavourite(info.path)}
          className={`grid size-6 place-items-center rounded-md hover:bg-hover ${favourite ? "text-favourite" : "text-muted"}`}
        >
          <Icon name="star" className={`size-4 ${favourite ? "fill-current" : ""}`} />
        </button>
        <Menu
          label={`More for ${info.title}`}
          buttonClass="grid size-6 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink"
          items={[
            { label: "Open in new tab", icon: <Icon name="external" className="size-4" />, hint: "Ctrl+click", onSelect: () => openPath(info.path, "tab") },
            "divider",
            { label: "Move to Trash", icon: <Icon name="trash" className="size-4" />, danger: true, onSelect: () => void trash(info.path) },
          ]}
        >
          <Icon name="more" className="size-4" />
        </Menu>
      </div>
    </div>
  );
});
