// Board files that changed on disk (an agent, another app, a sync), so an
// open board can reload. The app's own writes come back here too; a board
// compares what it reads with what it has before replacing anything.

import { useBoards } from "./store";

type Listener = (paths: string[]) => void;

const listeners = new Set<Listener>();

/** Calls `listener` with the board paths that changed; returns how to stop. */
export function onBoardFiles(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Called with every batch of changed vault paths. */
export function boardFilesChanged(paths: string[]): void {
  const boards = paths.filter((p) => p.endsWith(".canvas"));
  if (boards.length === 0) return;
  for (const listener of [...listeners]) listener(boards);
  void useBoards.getState().load();
}
