// Notes and boards as a dashboard shows them: gallery tiles with a cover
// (or a tint of their own), and compact rows.

import type { MouseEvent, ReactNode } from "react";

import { relativeTime } from "../../lib/dates";
import type { BoardInfo, NoteMeta } from "../../lib/vault/types";
import { BoardThumb } from "../boards/BoardThumb";
import { usePreview } from "../boards/previews";
import { coverBackground } from "../pages/page/covers";
import { iconOf, titleOf } from "../workspace/names";
import { howFrom, howFromView, useWorkspace } from "../workspace/store";
import { IconOrEmoji } from "../../ui/IconOrEmoji";
import { lineIcon } from "../../ui/glyph";

/** A soft colour of the note's own, for tiles without a cover. */
export function tint(text: string): string {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return `color-mix(in srgb, hsl(${Math.abs(hash) % 360} 70% 60%) 22%, var(--color-canvas))`;
}

const open = (path: string, peek = false) => (e: MouseEvent) => useWorkspace.getState().openPath(path, peek ? howFromView(e) : howFrom(e));
const middle = (path: string) => (e: MouseEvent) => e.button === 1 && useWorkspace.getState().openPath(path, "tab");

/** A page or card: its cover or a tint, its icon, title and a detail line.
 * `peek` opens it as views of many do (a plain click peeks). */
export function NoteTile({ note, detail, peek = false }: { note: NoteMeta; detail?: ReactNode; peek?: boolean }) {
  return (
    <button type="button" onClick={open(note.path, peek)} onAuxClick={middle(note.path)} className="kasten-tile">
      <span className="kasten-tile-cover" style={{ background: (note.cover && coverBackground(note.cover)) || tint(note.title) }} aria-hidden="true" />
      <span className="kasten-tile-body">
        <span className="kasten-tile-icon"><IconOrEmoji icon={iconOf(note)} /></span>
        <span className="kasten-tile-title">{titleOf(note)}</span>
        {note.kind === "card" && note.excerpt && <span className="kasten-tile-excerpt">{note.excerpt}</span>}
        <span className="kasten-tile-detail">{detail ?? relativeTime(note.modified)}</span>
      </span>
    </button>
  );
}

/** A whiteboard, with a sketch of it on top. */
export function BoardTile({ board, detail }: { board: BoardInfo; detail?: ReactNode }) {
  const view = usePreview(board);
  return (
    <button type="button" onClick={open(board.path)} onAuxClick={middle(board.path)} className="kasten-tile is-board">
      <span className="kasten-tile-sketch" aria-hidden="true">
        <BoardThumb board={view} />
      </span>
      <span className="kasten-tile-body">
        <span className="kasten-tile-title">
          <IconOrEmoji icon={lineIcon("board")} /> {board.title}
        </span>
        <span className="kasten-tile-detail">{detail ?? `Whiteboard · ${relativeTime(board.modified)}`}</span>
      </span>
    </button>
  );
}

/** One note as a row: icon, title and a detail at the right. */
export function NoteRow({ note, detail }: { note: NoteMeta; detail?: ReactNode }) {
  return (
    <button type="button" onClick={open(note.path)} onAuxClick={middle(note.path)} className="kasten-dash-row">
      <span className="kasten-dash-row-icon" aria-hidden="true">
        <IconOrEmoji icon={iconOf(note)} />
      </span>
      <span className="kasten-dash-row-title">{titleOf(note)}</span>
      <span className="kasten-dash-row-detail">{detail ?? relativeTime(note.modified)}</span>
    </button>
  );
}
