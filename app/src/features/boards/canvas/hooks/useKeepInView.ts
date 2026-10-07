// The node being written in stays in view: a mind map grown with Tab soon
// reaches past the edge of the screen, a card made at the pointer near an
// edge would open half outside it, and a board draws only what is in view.
// The board pans just enough, keeping the zoom.

import { useReactFlow } from "@xyflow/react";
import { useEffect, type RefObject } from "react";

import { motionMs } from "../../../../lib/motion";
import { useBoardState } from "../context";
import type { BoardController } from "../state/controller";

/** Room kept between the node and the edge of the board. */
const MARGIN = 48;

/** How far to move the view so `[start, end]` fits in `[0, size]`. */
function shift(start: number, end: number, size: number): number {
  if (end - start > size - 2 * MARGIN) return MARGIN - start;
  if (start < MARGIN) return MARGIN - start;
  if (end > size - MARGIN) return size - MARGIN - end;
  return 0;
}

export function useKeepInView(board: BoardController, wrapper: RefObject<HTMLDivElement | null>): void {
  const flow = useReactFlow();
  const editing = useBoardState((s) => s.editing ?? s.focusCard?.id ?? null);
  useEffect(() => {
    const node = editing ? board.node(editing) : undefined;
    const box = wrapper.current?.getBoundingClientRect();
    if (!node || !box || box.width === 0) return;
    const { x, y, zoom } = flow.getViewport();
    const left = node.x * zoom + x;
    const top = node.y * zoom + y;
    const dx = shift(left, left + node.width * zoom, box.width);
    const dy = shift(top, top + node.height * zoom, box.height);
    if (dx !== 0 || dy !== 0) void flow.setViewport({ x: x + dx, y: y + dy, zoom }, { duration: motionMs(180) });
  }, [board, editing, flow, wrapper]);
}
