import { lazy, Suspense } from "react";

// React Flow and the canvas load with the first board, not with the app.
const BoardCanvas = lazy(() => import("./BoardCanvas").then((m) => ({ default: m.BoardCanvas })));

/** A whiteboard, loaded on first use. */
export function LazyBoard({ path }: { path: string }) {
  return (
    <Suspense fallback={<div className="grid h-full place-items-center text-13 text-muted">Opening the board…</div>}>
      <BoardCanvas path={path} />
    </Suspense>
  );
}
