// Home's Projects section: each project in use as a tile, in the sidebar's
// order, with its summary line, how much it holds and how far its to-dos are.

import { useMemo } from "react";

import { relativeTime } from "../../lib/dates";
import type { NoteMeta, TaskRow } from "../../lib/vault/types";
import { coverBackground } from "../pages/page/covers";
import { DashCard } from "../dashboard/DashCard";
import { tint } from "../dashboard/NoteTiles";
import { useTaskList } from "../dashboard/task-rows";
import { iconOf, titleOf } from "../workspace/names";
import { useProjectLists } from "../workspace/project-actions";
import { howFrom, useWorkspace } from "../workspace/store";
import { newProject } from "./new-project";
import { IconOrEmoji } from "../../ui/IconOrEmoji";

interface Tile {
  project: NoteMeta;
  pages: number;
  open: number;
  done: number;
  edited: number;
}

function tilesOf(projects: readonly NoteMeta[], notes: readonly NoteMeta[], rows: readonly TaskRow[]): Tile[] {
  const byFolder = new Map<string, Tile>();
  const tiles = projects.map((project) => {
    const tile = { project, pages: 0, open: 0, done: 0, edited: project.modified };
    if (project.project) byFolder.set(project.project, tile);
    return tile;
  });
  for (const note of notes) {
    const tile = note.project ? byFolder.get(note.project) : undefined;
    if (!tile || note.path === tile.project.path) continue;
    if (note.kind === "page") tile.pages++;
    tile.edited = Math.max(tile.edited, note.modified);
  }
  for (const row of rows) {
    const folder = /^projects\/([^/]+)\//.exec(row.path)?.[1];
    const tile = folder ? byFolder.get(folder) : undefined;
    if (tile) tile[row.done ? "done" : "open"]++;
  }
  return tiles;
}

export function ProjectTiles() {
  const { active } = useProjectLists();
  const notes = useWorkspace((s) => s.notes);
  const rows = useTaskList();
  const tiles = useMemo(() => tilesOf(active, notes, rows ?? []), [active, notes, rows]);
  if (tiles.length === 0) return null;
  return (
    <DashCard
      title="Projects"
      icon="project"
      count={tiles.length}
      actions={
        <button type="button" className="kasten-dash-action" onClick={newProject}>
          New project
        </button>
      }
    >
      <div className="kasten-tiles is-three">
        {tiles.map((tile) => (
          <ProjectTile key={tile.project.path} tile={tile} />
        ))}
      </div>
    </DashCard>
  );
}

function ProjectTile({ tile }: { tile: Tile }) {
  const { project, pages, open, done, edited } = tile;
  const summary = typeof project.props.summary === "string" && project.props.summary ? project.props.summary : project.excerpt;
  const total = open + done;
  return (
    <button type="button" className="kasten-tile is-project" onClick={(e) => useWorkspace.getState().openPath(project.path, howFrom(e))}>
      <span className="kasten-tile-cover" style={{ background: (project.cover && coverBackground(project.cover)) || tint(project.title) }} aria-hidden="true" />
      <span className="kasten-tile-body">
        <span className="kasten-tile-icon">
          <IconOrEmoji icon={iconOf(project)} />
        </span>
        <span className="kasten-tile-title">{titleOf(project)}</span>
        {summary && <span className="kasten-tile-excerpt">{summary}</span>}
        {total > 0 && (
          <span className="kasten-dash-track mt-2.5" role="progressbar" aria-label={`${titleOf(project)}: to-dos done`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
            <span style={{ width: `${Math.round((done / total) * 100)}%` }} />
          </span>
        )}
        <span className="kasten-tile-detail">
          {pages} {pages === 1 ? "page" : "pages"}
          {open > 0 ? ` · ${open} to do` : ""} · {relativeTime(edited)}
        </span>
      </span>
    </button>
  );
}
