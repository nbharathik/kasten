// Notes dragged in from the sidebar, the library or search become cards
// where they are dropped; a highlight becomes its card, made on
// the way if need be. Files dragged in from the desktop are
// kept in the vault's assets/ folder first; pictures show as pictures.

import { useReactFlow } from "@xyflow/react";
import { useState, type DragEvent } from "react";

import { useSources } from "../../../sources/store";
import { carriesHighlights, carriesNotes, droppedHighlights, droppedNotes } from "../../../workspace/drag";
import type { BoardController } from "../state/controller";
import { addFiles } from "../state/dropped-files";
import { addNotes } from "../state/making";

const carriesFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

export function useNoteDrop(board: BoardController) {
  const flow = useReactFlow();
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver(event: DragEvent) {
        const notes = carriesNotes(event) || carriesHighlights(event);
        if (!notes && !carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = notes && event.dataTransfer.effectAllowed === "link" ? "link" : "copy";
        if (!over) setOver(true);
      },
      onDragLeave(event: DragEvent) {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      },
      onDrop(event: DragEvent) {
        setOver(false);
        const at = () => flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        if (carriesHighlights(event)) {
          event.preventDefault();
          const where = at();
          // Each highlight's card, made where it has none yet.
          void Promise.all(droppedHighlights(event).map((h) => useSources.getState().card(h.source, h.id))).then((cards) => {
            const paths = cards.flatMap((card) => (card ? [card.meta.path] : []));
            if (paths.length > 0) void addNotes(board, paths, where);
          });
        } else if (carriesNotes(event)) {
          event.preventDefault();
          void addNotes(board, droppedNotes(event), at());
        } else if (event.dataTransfer.files.length > 0) {
          event.preventDefault();
          void addFiles(board, Array.from(event.dataTransfer.files), at());
        }
      },
    },
  };
}
