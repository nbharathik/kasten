// What to do with the pages picked in the sidebar (selection.ts): put them
// inside a page, move them to a project, put them on a whiteboard, or move
// them to the trash. Each goes page by page through the core, as the Card
// Library's bulk actions do (library/bulk.ts), with one summary at the end.

import { useEffect, useRef, useState } from "react";

import { useBoards } from "../features/boards/store";
import { addToBoard, moveTo, trashAll, announce, type BulkDeps, type Done } from "../features/library/bulk";
import { Picker, type PickerOption } from "../features/library/Picker";
import { iconOf, titleOf } from "../features/workspace/names";
import { nestable, nestNote, putBack, spotOf, type Spot } from "../features/workspace/placing";
import { isArchived } from "../features/workspace/project-order";
import { useWorkspace } from "../features/workspace/store";
import { noteAt, projects } from "../features/workspace/tree";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { IconButton } from "../ui/Button";
import { useSidebarSelection } from "./selection";

type Menu = "page" | "project" | "board";

/** Past this many, the trash asks first, as the Card Library does. */
const ASK_OVER = 5;

const pages = (n: number) => `${n} ${n === 1 ? "page" : "pages"}`;

export function SelectionBar() {
  const picked = useSidebarSelection((s) => s.picked);
  const notes = useWorkspace((s) => s.notes);
  const boards = useBoards((s) => s.list);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  // Picked notes that are still there (one may have gone meanwhile).
  const chosen = picked.filter((p) => noteAt(notes, p));

  // Escape ends picking, once any picker or question has closed.
  useEffect(() => {
    if (chosen.length === 0) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !menu && !asking) useSidebarSelection.getState().clear();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [chosen.length, menu, asking]);

  // The whiteboards to offer, fresh when the list is asked for.
  useEffect(() => {
    if (menu === "board") void useBoards.getState().load();
  }, [menu]);

  if (chosen.length === 0) return null;

  async function run(verb: string, action: (deps: BulkDeps) => Promise<Done>) {
    const ws = useWorkspace.getState();
    if (!ws.client) return;
    setMenu(null);
    setAsking(false);
    setBusy(`${verb}…`);
    const deps: BulkDeps = {
      client: ws.client,
      notes: () => useWorkspace.getState().notes,
      noteChanged: ws.noteChanged,
      refresh: ws.refresh,
      move: (path, project) => ws.move(path, project, true),
      trash: (path) => ws.trash(path, true),
      progress: (done, total) => total > 1 && setBusy(`${verb} ${done} of ${total}…`),
      noun: "page",
    };
    try {
      announce(await action(deps), useWorkspace.getState().toast);
      useSidebarSelection.getState().clear();
    } catch (err) {
      useWorkspace.getState().toast(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  /** Puts every picked page that can go there inside `target`, one by one. */
  const putInside = (target: string) =>
    run("Moving", async () => {
      const notes = useWorkspace.getState().notes;
      const into = noteAt(notes, target);
      if (!into) return { text: "That page is gone" };
      const going = nestable(notes, chosen, into);
      const back: [string, Spot][] = [];
      for (const note of going) {
        const spot = spotOf(notes, note.path);
        const put = await nestNote(note.path, into.path, false);
        if (put && spot) back.push([put.meta.path, spot]);
      }
      const left = chosen.length - going.length;
      return {
        text: `Put ${pages(going.length)} in “${titleOf(into)}”${left ? ` (${left} can't go there)` : ""}`,
        undo: back.length ? async () => void (await Promise.all(back.map(([path, spot]) => putBack(path, spot)))) : undefined,
      };
    });

  const pageOptions: PickerOption[] = notes
    .filter((n) => n.kind === "page" && !chosen.includes(n.path))
    .map((n) => ({ key: n.path, label: titleOf(n), icon: iconOf(n), detail: n.project ? (projects(notes).find((p) => p.project === n.project)?.title ?? n.project) : undefined }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const projectOptions: PickerOption[] = [
    { key: "", label: "Pages", detail: "No project" },
    ...projects(notes)
      .filter((p) => !isArchived(p))
      .map((p) => ({ key: p.project ?? "", label: titleOf(p), icon: iconOf(p) })),
  ];
  const boardOptions: PickerOption[] = boards.map((b) => ({ key: b.path, label: b.title }));

  return (
    <div ref={bar} role="toolbar" aria-label="Picked pages" className="relative mx-2 mt-1 flex items-center gap-0.5 rounded-lg border border-line bg-canvas p-1 shadow-card">
      <span className="min-w-0 flex-1 truncate px-1.5 text-12 font-medium" aria-live="polite">
        {busy ?? pages(chosen.length)}
      </span>
      <IconButton icon="page-plus" size="sm" label="Put inside a page" active={menu === "page"} disabled={Boolean(busy)} onClick={() => setMenu(menu === "page" ? null : "page")} />
      <IconButton icon="move-to" size="sm" label="Move to a project" active={menu === "project"} disabled={Boolean(busy)} onClick={() => setMenu(menu === "project" ? null : "project")} />
      <IconButton icon="board" size="sm" label="Add to a whiteboard" active={menu === "board"} disabled={Boolean(busy)} onClick={() => setMenu(menu === "board" ? null : "board")} />
      <IconButton
        icon="trash"
        size="sm"
        label="Move to Trash"
        disabled={Boolean(busy)}
        onClick={() => (chosen.length > ASK_OVER ? setAsking(true) : void run("Moving to the trash", (deps) => trashAll(deps, chosen)))}
      />
      <IconButton icon="close" size="sm" label="Done picking" onClick={() => useSidebarSelection.getState().clear()} />
      {menu === "page" && <Picker label="Put inside" placeholder="Find a page…" options={pageOptions} within={bar} onClose={() => setMenu(null)} onPick={putInside} />}
      {menu === "project" && (
        <Picker
          label="Move to"
          placeholder="Find a project…"
          options={projectOptions}
          within={bar}
          onClose={() => setMenu(null)}
          onPick={(key) => void run("Moving", (deps) => moveTo(deps, chosen, key || null, projectOptions.find((o) => o.key === key)?.label ?? "Pages"))}
        />
      )}
      {menu === "board" && (
        <Picker
          label="Add to whiteboard"
          placeholder="Find a whiteboard…"
          options={boardOptions}
          empty="No whiteboards yet"
          within={bar}
          onClose={() => setMenu(null)}
          onPick={(path) => void run("Adding", (deps) => addToBoard(deps, chosen, { path, title: boards.find((b) => b.path === path)?.title ?? path }))}
        />
      )}
      {asking && (
        <ConfirmDialog title={`Move ${pages(chosen.length)} to the trash?`} confirm="Move to trash" danger alert onConfirm={() => void run("Moving to the trash", (deps) => trashAll(deps, chosen))} onClose={() => setAsking(false)}>
          They go to the vault's .trash folder with their sub-pages, and each one can come back from Trash.
        </ConfirmDialog>
      )}
    </div>
  );
}
