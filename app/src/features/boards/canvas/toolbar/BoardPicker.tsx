// Picks a board to show inside this one, or makes a new one.

import { useEffect, type RefObject } from "react";

import { Picker } from "../../../library/Picker";
import { useBoards } from "../../store";
import { useBoard } from "../context";
import type { Point } from "../model/placement";
import { addNewBoard, addNotes } from "../state/making";
import { lineIcon } from "../../../../ui/glyph";

export function BoardPicker({ within, centre, onClose }: { within: RefObject<HTMLElement | null>; centre: () => Point; onClose: () => void }) {
  const board = useBoard();
  const list = useBoards((s) => s.list);
  const loaded = useBoards((s) => s.loaded);
  useEffect(() => void useBoards.getState().load(), []);
  const shown = board.doc.nodes.filter((n) => n.file?.endsWith(".canvas")).map((n) => n.file);
  const options = loaded
    ? list
        .filter((b) => b.path !== board.path)
        .map((b) => ({ key: b.path, label: b.title, icon: lineIcon("board"), detail: shown.includes(b.path) ? "on this board" : (b.project ?? undefined) }))
    : null;
  return (
    <Picker
      label="Add a board"
      placeholder="Find or name a board…"
      options={options}
      empty="No other boards yet"
      within={within}
      onClose={onClose}
      onPick={(path) => {
        onClose();
        void addNotes(board, [path], centre());
      }}
      create={{
        label: (text) => (text ? `New board “${text}”` : "New board…"),
        prompt: "Name the new board",
        run: (title) => {
          onClose();
          void addNewBoard(board, title, centre()).then(() => useBoards.getState().load());
        },
      }}
    />
  );
}
