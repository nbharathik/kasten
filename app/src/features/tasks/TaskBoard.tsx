// A board of #task notes by status: the task tag's own kanban view, over
// the notes in one place (a project, pages in no project) or everywhere.
// "+ New" in a column makes the task there (a project's tasks in it).

import { useEffect, useMemo } from "react";

import type { NoteMeta, TagView } from "../../lib/vault/types";
import { DashEmpty } from "../dashboard/DashCard";
import { schemaOf } from "../panel/properties/schemas";
import { addNote } from "../tags/actions";
import { applyView, notesWith } from "../tags/model";
import { useTags } from "../tags/store";
import { KanbanView } from "../tags/views/KanbanView";
import { useWorkspace } from "../workspace/store";

const TAG = "task";
const FALLBACK: TagView = { name: "Board", type: "kanban", group_by: "status" };

/** Whether a #task note lives in `where`: "all", "other" or "project:<folder>". */
export function taskIn(note: NoteMeta, where: string): boolean {
  if (where === "all") return true;
  if (where === "other") return !note.project;
  return where.startsWith("project:") && note.project === where.slice("project:".length);
}

/** The project a place names, for new tasks made there. */
const folderOf = (where: string) => (where.startsWith("project:") ? where.slice("project:".length) : null);

export function useTaskNotes(where: string, text = ""): NoteMeta[] {
  const notes = useWorkspace((s) => s.notes);
  return useMemo(() => {
    const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return notesWith(notes, TAG).filter((n) => taskIn(n, where) && words.every((w) => n.title.toLowerCase().includes(w)));
  }, [notes, where, text]);
}

export function TaskBoard({ where, text = "", bare = false }: { where: string; text?: string; bare?: boolean }) {
  const schemas = useTags((s) => s.schemas);
  useEffect(() => {
    if (useTags.getState().schemas === null) void useTags.getState().load();
  }, []);
  const schema = schemaOf(schemas, TAG) ?? null;
  const view = useMemo(() => (schema?.views.find((v) => v.type === "kanban") as TagView | undefined) ?? FALLBACK, [schema]);
  const tasks = useTaskNotes(where, text);
  const shown = useMemo(() => applyView(tasks, view, schema), [tasks, view, schema]);
  const saveView = (next: TagView) => {
    if (!schema) return;
    void useTags.getState().saveViews(schema.name, schema.views.map((v) => (v === view ? next : (v as TagView))));
  };
  if (schemas === null) return <DashEmpty>Opening the board…</DashEmpty>;
  if (!schema) {
    return (
      <DashEmpty>
        Notes tagged #task, with a status such as Todo, Doing and Done, show here as a board.{" "}
        <button type="button" className="kasten-dash-link" onClick={() => void addNote(TAG, "New task", {}, { project: folderOf(where) })}>
          Add a task
        </button>
      </DashEmpty>
    );
  }
  return (
    <div className="kasten-dash-kanban">
      <KanbanView tag={schema.name} schema={schema} view={view} notes={shown} onChange={saveView} project={folderOf(where)} bare={bare} />
    </div>
  );
}
