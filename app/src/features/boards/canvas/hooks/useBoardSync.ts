// Keeping an open board in step with the vault: when its file changes on
// disk (an agent added cards, a sync, the app's own writes coming back) it
// is read again, and when a note on it leaves the notes list (trashed, or
// renamed, which moves the card with it) too.

import { useEffect } from "react";

import { useWorkspace } from "../../../workspace/store";
import { noteAt } from "../../../workspace/tree";
import { onBoardFiles } from "../../events";
import type { BoardController } from "../state/controller";

export function useBoardSync(board: BoardController): void {
  useEffect(() => {
    return onBoardFiles((paths) => void (paths.includes(board.path) && board.refresh()));
  }, [board]);

  const notes = useWorkspace((s) => s.notes);
  useEffect(() => {
    const gone = board.doc.nodes.some((n) => n.kind === "file" && n.file?.endsWith(".md") && !n.missing && !noteAt(notes, n.file));
    if (!gone) return;
    const timer = setTimeout(() => void board.refresh(), 250);
    return () => clearTimeout(timer);
  }, [board, notes]);
}
