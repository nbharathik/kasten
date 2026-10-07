// The ✦ on cards whose notes carry agent writing not yet edited or accepted:
// one question for the whole board when it
// opens, asked again as the board and the notes change, never one per card.

import { useEffect, useMemo } from "react";

import { useAgentMarked } from "../../../review/agent-marked";
import { useWorkspace } from "../../../workspace/store";
import { useBoardState } from "../context";
import type { BoardController } from "../state/controller";

export function useBoardMarks(board: BoardController): void {
  const client = useWorkspace((s) => s.client);
  const doc = useBoardState((s) => s.doc);
  const key = useMemo(
    () =>
      [...new Set(doc.nodes.flatMap((n) => (n.kind === "file" && n.file?.endsWith(".md") ? [n.file] : [])))].sort().join("\n"),
    [doc],
  );
  const paths = useMemo(() => (key ? key.split("\n") : []), [key]);
  const marked = useAgentMarked(client, paths);
  useEffect(() => {
    board.store.setState({ marked });
  }, [board, marked]);
}
