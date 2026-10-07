import { useEffect, useRef, useState } from "react";

import { freeKey, inFocusedPane } from "../../lib/keys";
import { Markdown } from "../chat/markdown/Markdown";
import { splitFrontmatter } from "../pages/markdown/frontmatter";
import { useShell } from "../../lib/store";
import type { NoteMeta } from "../../lib/vault/types";
import { iconOf, titleOf } from "../workspace/names";
import { useWorkspace } from "../workspace/store";
import { showTag } from "../library/request";
import { BoardAction, TagAction, tagCard } from "./CardActions";
import { useSuggestedHome, type Home } from "./suggest";
import { IconOrEmoji } from "../../ui/IconOrEmoji";
import { Icon } from "../../ui/Icon";

type Open = "tag" | "board" | null;

/** Inbox triage: one card at a time, with
 * J/K to step, M to move, B to put on a board, T to tag, P to make it a
 * page, D for done (the trash), Enter to open and Esc to stop. S moves it
 * where its similar notes are, when they agree on a project. */
export function Triage({ cards, onExit }: { cards: NoteMeta[]; onExit: () => void }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState<Open>(null);
  const root = useRef<HTMLElement>(null);
  const moving = useShell((s) => s.moving);
  const card = cards[Math.min(index, cards.length - 1)];
  const { openPath, trash, convert } = useWorkspace.getState();
  const home = useSuggestedHome(card);
  const goHome = () => {
    if (card && home?.project) void useWorkspace.getState().move(card.path, home.project.folder);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (moving || open || event.ctrlKey || event.metaKey || event.altKey || !card) return;
      // Keys for a field, or for another pane, are not triage's.
      if (!freeKey(event) || !inFocusedPane(root.current)) return;
      const key = event.key.toLowerCase();
      if (key === "j") setIndex((i) => Math.min(i + 1, cards.length - 1));
      else if (key === "k") setIndex((i) => Math.max(i - 1, 0));
      else if (key === "m") useShell.getState().setMoving(card.path);
      else if (key === "t") setOpen("tag");
      else if (key === "b") setOpen("board");
      else if (key === "p") void convert(card.path, "page");
      else if (key === "d") void trash(card.path);
      else if (key === "s" && home?.project) goHome();
      else if (key === "enter" || key === "o") openPath(card.path, event.shiftKey ? "stack" : "here");
      else if (key === "escape") onExit();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, cards.length, moving, open, onExit, openPath, trash, convert, home]);

  if (!card) {
    return (
      <div className="mt-8 rounded-2xl border border-line bg-canvas p-12 text-center shadow-card">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-panel text-muted" aria-hidden="true">
          <Icon name="party" className="size-6" />
        </span>
        <p className="mt-2 text-16 font-semibold">Inbox zero</p>
        <p className="mt-1 text-13 text-muted">Everything has a place.</p>
        <button type="button" className="mt-4 text-13 font-medium text-accent hover:underline" onClick={onExit}>
          Back to the list
        </button>
      </div>
    );
  }

  const keys: [string, string, () => void][] = [
    ["K", "Previous", () => setIndex((i) => Math.max(i - 1, 0))],
    ["J", "Next", () => setIndex((i) => Math.min(i + 1, cards.length - 1))],
    ["M", "Move to…", () => useShell.getState().setMoving(card.path)],
    ["P", "Make a page", () => void convert(card.path, "page")],
    ["D", "Done", () => void trash(card.path)],
    ["↵", "Open", () => openPath(card.path)],
    ["Esc", "Stop", onExit],
  ];
  const at = Math.min(index, cards.length - 1);

  return (
    <section ref={root} aria-label="Triage" className="mt-8">
      <div className="flex items-center gap-3">
        <p className="text-13 font-medium text-muted">
          {at + 1} of {cards.length}
        </p>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-accent transition-[width] duration-(--motion-slow)" style={{ width: `${((at + 1) / cards.length) * 100}%` }} />
        </div>
      </div>
      <article key={card.path} className="mt-3 rounded-2xl border border-line bg-canvas p-6 shadow-lift [animation:kasten-rise-in_var(--motion-base)_var(--ease-standard)]">
        <h2 className="flex items-center gap-2 text-20 font-semibold">
          <IconOrEmoji icon={iconOf(card)} />
          {titleOf(card)}
        </h2>
        <FullText card={card} />
        {card.tags.length > 0 && (
          <p className="mt-3 flex flex-wrap gap-1.5">
            {card.tags.map((tag) => (
              <button key={tag} type="button" title={`Cards tagged #${tag}`} onClick={() => showTag(tag)} className="rounded bg-soft px-1.5 py-0.5 text-12 font-medium text-accent hover:underline">
                #{tag}
              </button>
            ))}
          </p>
        )}
      </article>
      {home && <SuggestedHome home={home} path={card.path} onMove={goHome} />}
      <div className="mt-4 flex flex-wrap gap-2">
        <TagAction path={card.path} hint="T" open={open === "tag"} onOpen={() => setOpen("tag")} onClose={() => setOpen(null)} />
        <BoardAction path={card.path} hint="B" open={open === "board"} onOpen={() => setOpen("board")} onClose={() => setOpen(null)} />
        {keys.map(([key, label, run]) => (
          <button key={label} type="button" onClick={run} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-13 ring-1 ring-line transition-colors hover:bg-hover">
            <kbd className="rounded bg-line/70 px-1.5 font-sans text-11">{key}</kbd>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

/** The whole capture, drawn from its Markdown, in a box that scrolls when
 * it is long; the excerpt stands in until it has loaded. */
function FullText({ card }: { card: NoteMeta }) {
  const [body, setBody] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    setBody(null);
    useWorkspace
      .getState()
      .client?.read(card.path)
      .then(
        (file) => current && setBody(splitFrontmatter(file.text).body.trim()),
        () => current && setBody(null),
      );
    return () => {
      current = false;
    };
  }, [card.path, card.modified]);
  const text = body ?? card.excerpt;
  if (!text) return <p className="mt-3 min-h-12 text-14 leading-relaxed text-muted">No text yet.</p>;
  return (
    <div role="region" aria-label="The whole card" className="mt-3 max-h-[50vh] min-h-12 overflow-y-auto text-14 leading-relaxed">
      {body === null ? <p className="text-muted">{text}</p> : <Markdown text={body} onOpenTitle={(title, how) => void useWorkspace.getState().openTitle(title, how)} />}
    </div>
  );
}

const chip = "rounded-md px-2.5 py-1 text-13 font-medium ring-1 ring-line transition-colors hover:bg-hover";

/** "Looks like it belongs with …", each a click to do. */
function SuggestedHome({ home, path, onMove }: { home: Home; path: string; onMove: () => void }) {
  if (!home.project && home.tags.length === 0) return null;
  const tag = (name: string) => tagCard(path, name);
  return (
    <p className="mt-3 flex flex-wrap items-center gap-2 text-13" aria-label="Suggested home">
      <span className="text-muted">Looks like it belongs with</span>
      {home.project && (
        <button type="button" className={chip} title={`${home.project.count} similar notes are there`} onClick={onMove}>
          <kbd className="mr-1 rounded bg-line/70 px-1 font-sans text-11">S</kbd>
          <Icon name="move-to" className="mr-1 inline size-3.5 align-[-2px]" />
          {home.project.title}
        </button>
      )}
      {home.tags.map((name) => (
        <button key={name} type="button" className={`${chip} text-accent`} title={`Add #${name}`} onClick={() => void tag(name)}>
          #{name}
        </button>
      ))}
    </p>
  );
}
