// Boards read once for their thumbnails, kept until they change.

import { useEffect, useState } from "react";

import type { BoardInfo, BoardView } from "../../lib/vault/types";
import { useWorkspace } from "../workspace/store";

const cache = new Map<string, { modified: number; board: BoardView }>();
/** Thumbnails kept at most; boards beyond them are read again when shown. */
const MOST = 200;

/** The board behind `info`, for its thumbnail; null while it is read. */
export function usePreview(info: BoardInfo): BoardView | null {
  const client = useWorkspace((s) => s.client);
  const hit = cache.get(info.path);
  const [board, setBoard] = useState<BoardView | null>(hit?.modified === info.modified ? hit.board : null);
  useEffect(() => {
    if (!client) return;
    const cached = cache.get(info.path);
    if (cached?.modified === info.modified) {
      setBoard(cached.board);
      return;
    }
    let live = true;
    client.board(info.path).then(
      (read) => {
        cache.delete(info.path);
        cache.set(info.path, { modified: info.modified, board: read });
        if (cache.size > MOST) cache.delete(cache.keys().next().value!);
        if (live) setBoard(read);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [client, info.path, info.modified]);
  return board;
}
