// The floating bar at the bottom of a board: new card, sticky, section,
// link, an existing note, a nested board, the layout helpers and an AI
// brainstorm.

import { useEffect, useRef, useState, type ReactNode } from "react";

import { NoteFinder } from "../../../stack/NoteFinder";
import { BrainstormForm } from "../../brainstorm/BrainstormForm";
import { useBrainstorms } from "../../brainstorm/run";
import { useBoard } from "../context";
import { centredAt, type Point } from "../model/placement";
import { EXPANDED } from "../state/gestures";
import { addLink, addNotes, addSection, addSticky, newCard } from "../state/making";
import { BoardPicker } from "./BoardPicker";
import { ToolIcon, type ToolIconName } from "./icons";
import { LayoutMenu } from "./LayoutMenu";

type Open = "link" | "note" | "board" | "layout" | "brainstorm" | null;

function Tool({ icon, label, hint, pressed, busy, onClick }: { icon: ToolIconName; label: string; hint?: string; pressed?: boolean; busy?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="kasten-tool" aria-label={label} aria-pressed={pressed} data-busy={busy || undefined} title={hint ? `${label} (${hint})` : label} onClick={onClick}>
      <ToolIcon name={icon} />
    </button>
  );
}

/** A small panel above the bar. */
function Pop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="dialog" aria-label={label} className="kasten-pop">
      {children}
    </div>
  );
}

export function BottomBar({ centre }: { centre: () => Point }) {
  const board = useBoard();
  const [open, setOpen] = useState<Open>(null);
  const bar = useRef<HTMLDivElement>(null);
  const thinking = useBrainstorms((s) => Boolean(s.running[board.path]));
  const toggle = (what: Exclude<Open, null>) => setOpen((now) => (now === what ? null : what));
  const close = () => setOpen(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!bar.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);
  return (
    <div ref={bar} className="kasten-bottombar" role="toolbar" aria-label="Add to the board" onKeyDown={(e) => e.key === "Escape" && close()}>
      <Tool icon="card" label="New card" hint="double-click the board" onClick={() => void newCard(board, centredAt(centre(), EXPANDED))} />
      <Tool icon="sticky" label="Sticky" onClick={() => void addSticky(board, centre())} />
      <Tool icon="section" label="Section" onClick={() => void addSection(board, centre())} />
      <span className="relative inline-flex">
        <Tool icon="link" label="Link" pressed={open === "link"} onClick={() => toggle("link")} />
        {open === "link" && (
          <Pop label="Add a link">
            <LinkForm
              onDone={(url) => {
                close();
                if (url) void addLink(board, url, centre());
              }}
            />
          </Pop>
        )}
      </span>
      <span className="relative inline-flex">
        <Tool icon="note" label="Add a note" hint="or drag notes in" pressed={open === "note"} onClick={() => toggle("note")} />
        {open === "note" && (
          <Pop label="Add a note">
            <NoteFinder
              autoFocus
              placeholder="Find a note to add…"
              onPick={(path) => {
                close();
                void addNotes(board, [path], centre());
              }}
            />
          </Pop>
        )}
      </span>
      <span className="relative inline-flex">
        <Tool icon="board" label="Board inside this board" pressed={open === "board"} onClick={() => toggle("board")} />
        {open === "board" && <BoardPicker within={bar} centre={centre} onClose={close} />}
      </span>
      <span className="kasten-toolbar-sep" />
      <span className="relative inline-flex">
        <Tool icon="layout" label="Layout" pressed={open === "layout"} onClick={() => toggle("layout")} />
        {open === "layout" && (
          <Pop label="Layout">
            <LayoutMenu onDone={close} />
          </Pop>
        )}
      </span>
      <span className="relative inline-flex">
        <Tool icon="spark" label="Brainstorm with AI" hint={thinking ? "thinking…" : undefined} pressed={open === "brainstorm"} busy={thinking} onClick={() => toggle("brainstorm")} />
        {open === "brainstorm" && (
          <Pop label="Brainstorm on this board">
            <BrainstormForm onClose={() => setOpen((now) => (now === "brainstorm" ? null : now))} />
          </Pop>
        )}
      </span>
    </div>
  );
}

function LinkForm({ onDone }: { onDone: (url: string | null) => void }) {
  const [url, setUrl] = useState("");
  return (
    <form
      className="flex items-center gap-2 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        onDone(url.trim() || null);
      }}
    >
      <input
        autoFocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onDone(null)}
        placeholder="https://"
        aria-label="Web address"
        className="h-8 w-64 rounded-md border border-line bg-canvas px-2 text-13 outline-none focus:border-accent/60"
      />
      <button type="submit" className="h-8 rounded-md bg-accent px-3 text-13 font-medium text-on-accent disabled:opacity-40" disabled={!url.trim()}>
        Add
      </button>
    </form>
  );
}
