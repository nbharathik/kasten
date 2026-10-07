// The whiteboards a note sits on: one card can sit on many boards, and the
// right panel lists where it appears.

import { useEffect, useState } from "react";

import type { BoardInfo, VaultClient } from "../../../lib/vault/types";
import { projectTitle, useBoards } from "../../boards/store";
import { howFrom, useWorkspace } from "../../workspace/store";
import { IconOrEmoji } from "../../../ui/IconOrEmoji";
import { lineIcon } from "../../../ui/glyph";

export function OnBoards({ client, path }: { client: VaultClient; path: string }) {
  // A new list whenever a board file changes, so this follows along.
  const all = useBoards((s) => s.list);
  const notes = useWorkspace((s) => s.notes);
  const [boards, setBoards] = useState<BoardInfo[] | null>(null);

  useEffect(() => {
    let live = true;
    client.boardsWith(path).then(
      (found) => live && setBoards(found),
      () => live && setBoards([]),
    );
    return () => {
      live = false;
    };
  }, [client, path, all]);

  if (!boards) return null;
  return (
    <section className="kasten-panel-section" aria-label="On whiteboards">
      <h3 className="kasten-panel-label">
        <span>
          On whiteboards <span className="kasten-panel-count">{boards.length}</span>
        </span>
      </h3>
      {boards.length === 0 ? (
        <p className="kasten-panel-empty">Not on a whiteboard yet.</p>
      ) : (
        <ul className="kasten-links">
          {boards.map((board) => (
            <li key={board.path} className="kasten-link">
              <button type="button" className="kasten-link-open" title={`Open ${board.title} (Ctrl+click: new tab)`} onClick={(e) => useWorkspace.getState().openPath(board.path, howFrom(e))}>
                <span className="kasten-link-title">
                  <IconOrEmoji icon={lineIcon("board")} /> {board.title}
                </span>
                <span className="kasten-link-snippet">
                  {board.project ? `${projectTitle(notes, board.project)} · ` : ""}
                  {board.nodes === 1 ? "1 thing" : `${board.nodes} things`} on it
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
