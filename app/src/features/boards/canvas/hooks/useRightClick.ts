// Right-clicks on the board. A click that stays put opens the board's menu
// for what it is on; a right-drag pans instead. Text being written keeps
// the system's menu, for cutting, copying, pasting and spelling. The menu
// key or Shift+F10 opens the board's menu for what is selected, beside it.

import { useReactFlow, type XYPosition } from "@xyflow/react";
import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import type { BoardController } from "../state/controller";
import { selectedEdges, selectedNodes, type Menu } from "../state/store";
import { editable } from "./useBoardKeys";

/** How far a right-click may wander, in pixels, and still be a click. */
const CLICK_SLOP = 5;

/** How soon after a right-drag's release its menu comes, on Windows. */
const MENU_AFTER_RELEASE_MS = 500;

/** The menu the keys open: for the selected nodes, below the first of
 * them; for a selected connection, at its middle; or for the board, in
 * the middle of the view. Always within the board's frame. */
export function menuFromKeys(board: BoardController, frame: HTMLElement, toFlow: (point: XYPosition) => XYPosition): Menu {
  const box = frame.getBoundingClientRect();
  const within = (x: number, y: number) => ({
    x: Math.min(Math.max(x, box.left + 8), Math.max(box.left + 8, box.right - 8)),
    y: Math.min(Math.max(y, box.top + 8), Math.max(box.top + 8, box.bottom - 8)),
  });
  const middle = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const state = board.store.getState();
  const nodes = selectedNodes(state).filter((n) => !n.hidden);
  if (nodes.length > 0) {
    const at = frame.querySelector(`.react-flow__node[data-id="${CSS.escape(nodes[0]!.id)}"]`)?.getBoundingClientRect();
    return { ...within(at ? at.left + 12 : middle.x, at ? at.bottom + 4 : middle.y), target: { kind: "nodes", ids: nodes.map((n) => n.id) } };
  }
  const edge = selectedEdges(state)[0];
  if (edge) {
    const at = frame.querySelector(`.react-flow__edge[data-id="${CSS.escape(edge.id)}"]`)?.getBoundingClientRect();
    return { ...within(at ? at.left + at.width / 2 : middle.x, at ? at.top + at.height / 2 : middle.y), target: { kind: "edge", id: edge.id } };
  }
  return { ...middle, target: { kind: "pane", at: toFlow(middle) } };
}

interface Options {
  presenting: boolean;
  /** React Flow's own handler for the empty board's menu. */
  onPaneContextMenu?: (event: ReactMouseEvent) => void;
}

/** The board frame's handlers for the right button and the menu key. */
export function useRightClick(board: BoardController, { presenting, onPaneContextMenu }: Options) {
  const flow = useReactFlow();
  const drag = useRef<{ x: number; y: number; moved: boolean; released?: number } | null>(null);

  return {
    onPointerDown(event: ReactPointerEvent) {
      drag.current = event.button === 2 ? { x: event.clientX, y: event.clientY, moved: false } : null;
    },
    onPointerUpCapture(event: ReactPointerEvent) {
      if (event.button === 2 && drag.current) drag.current.released = event.timeStamp;
    },
    onPointerMoveCapture(event: ReactPointerEvent) {
      // Only a move with the right button held is a drag: after a
      // right-click the pointer goes on to the menu it opened.
      const held = drag.current;
      if (held && !held.moved && event.buttons & 2 && Math.hypot(event.clientX - held.x, event.clientY - held.y) > CLICK_SLOP) {
        held.moved = true;
        board.store.setState({ menu: null });
      }
    },
    onContextMenuCapture(event: ReactMouseEvent<HTMLElement>) {
      // Text being written keeps the system's menu.
      if (editable(event.target)) {
        event.stopPropagation();
        return;
      }
      // The menu arrives after the button is up on Windows, before it on
      // macOS and Linux; either way a right-drag has panned, not clicked.
      // A menu later on, from the keys, is not the drag's.
      const held = drag.current;
      const dragged = held?.moved && (held.released === undefined || event.timeStamp - held.released < MENU_AFTER_RELEASE_MS);
      if (dragged || presenting) {
        drag.current = null;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // The keys open it on what has the focus: the board itself.
      if (event.target === event.currentTarget) {
        event.preventDefault();
        board.store.setState({ menu: menuFromKeys(board, event.currentTarget, flow.screenToFlowPosition) });
        return;
      }
      // React Flow leaves the empty board's menu out once the right button pans.
      if ((event.target as HTMLElement).classList.contains("react-flow__pane")) {
        event.preventDefault();
        onPaneContextMenu?.(event);
      }
    },
  };
}
