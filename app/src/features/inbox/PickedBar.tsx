// What to do with the captures picked in the Inbox: tag them, move them to
// a project, put them on a whiteboard, or mark them done (the trash). Each
// goes card by card through the core, as the Card Library's bulk actions
// do (library/bulk.ts), with one summary at the end.

import { useEffect, useRef, useState } from "react";

import { useBoards } from "../boards/store";
import { addTag, addToBoard, cleanTag, moveTo, trashAll, announce, type BulkDeps, type Done } from "../library/bulk";
import { Picker, type PickerOption } from "../library/Picker";
import { iconOf, titleOf } from "../workspace/names";
import { isArchived } from "../workspace/project-order";
import { useWorkspace } from "../workspace/store";
import { projects, tagCounts } from "../workspace/tree";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { IconButton } from "../../ui/Button";

type Menu = "tag" | "project" | "board";

/** Past this many, Done asks first, as the Card Library does. */
const ASK_OVER = 5;

const cards = (n: number) => `${n} ${n === 1 ? "card" : "cards"}`;

export function PickedBar({ picked, onClear }: { picked: readonly string[]; onClear(): void }) {
  const notes = useWorkspace((s) => s.notes);
  const boards = useBoards((s) => s.list);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const chosen = [...picked];

  // Escape ends picking, once any picker or question has closed.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !menu && !asking) onClear();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu, asking, onClear]);

  // The whiteboards to offer, fresh when the list is asked for.
  useEffect(() => {
    if (menu === "board") void useBoards.getState().load();
  }, [menu]);

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
    };
    try {
      announce(await action(deps), useWorkspace.getState().toast);
      onClear();
    } catch (err) {
      useWorkspace.getState().toast(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const tagOptions: PickerOption[] = tagCounts(notes).map((t) => ({ key: t.tag, label: `#${t.tag}`, detail: String(t.count) }));
  const projectOptions: PickerOption[] = [
    { key: "", label: "Pages", detail: "No project" },
    ...projects(notes)
      .filter((p) => !isArchived(p))
      .map((p) => ({ key: p.project ?? "", label: titleOf(p), icon: iconOf(p) })),
  ];
  const boardOptions: PickerOption[] = boards.map((b) => ({ key: b.path, label: b.title }));
  const done = () => run("Marking done", (deps) => trashAll(deps, chosen));

  return (
    <div ref={bar} role="toolbar" aria-label="Picked cards" className="sticky top-2 z-10 flex items-center gap-0.5 rounded-lg border border-line bg-canvas p-1 shadow-card">
      <span className="min-w-0 flex-1 truncate px-2 text-13 font-medium" aria-live="polite">
        {busy ?? `${cards(chosen.length)} picked`}
      </span>
      <IconButton icon="tag" size="sm" label="Add a tag" active={menu === "tag"} disabled={Boolean(busy)} onClick={() => setMenu(menu === "tag" ? null : "tag")} />
      <IconButton icon="move-to" size="sm" label="Move to a project" active={menu === "project"} disabled={Boolean(busy)} onClick={() => setMenu(menu === "project" ? null : "project")} />
      <IconButton icon="board" size="sm" label="Add to a whiteboard" active={menu === "board"} disabled={Boolean(busy)} onClick={() => setMenu(menu === "board" ? null : "board")} />
      <IconButton icon="check" size="sm" label="Done: move to the trash" disabled={Boolean(busy)} onClick={() => (chosen.length > ASK_OVER ? setAsking(true) : void done())} />
      <IconButton icon="close" size="sm" label="Done picking" onClick={onClear} />
      {menu === "tag" && (
        <Picker
          label="Add tag"
          placeholder="Find or type a tag…"
          options={tagOptions}
          within={bar}
          onClose={() => setMenu(null)}
          onPick={(tag) => void run("Tagging", (deps) => addTag(deps, chosen, tag))}
          create={{
            label: (text) => (cleanTag(text) ? `New tag #${cleanTag(text)}` : null),
            prompt: "Type the new tag's name",
            run: (text) => {
              const tag = cleanTag(text);
              if (tag) void run("Tagging", (deps) => addTag(deps, chosen, tag));
            },
          }}
        />
      )}
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
        <ConfirmDialog title={`Mark ${cards(chosen.length)} done?`} confirm="Move to trash" danger alert onConfirm={() => void done()} onClose={() => setAsking(false)}>
          They go to the vault's .trash folder, and each one can come back from Trash.
        </ConfirmDialog>
      )}
    </div>
  );
}
