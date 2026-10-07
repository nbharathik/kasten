import { memo } from "react";

import { useBoards } from "../features/boards/store";
import { dragNotes } from "../features/workspace/drag";
import { usePrefs } from "../features/workspace/prefs";
import { howFrom, useWorkspace } from "../features/workspace/store";
import { Menu, openRowMenu } from "./Menu";
import { Icon } from "../ui/Icon";
import { IconOrEmoji } from "../ui/IconOrEmoji";
import { lineIcon } from "../ui/glyph";

/** A whiteboard in the sidebar: under its project, or in Favourites. Drag it
 * onto another board to nest it there. */
export const BoardRow = memo(function BoardRow({ path, title, depth = 0 }: { path: string; title: string; depth?: number }) {
  const active = useWorkspace((s) => s.place.view === "boards" && s.place.path === path);
  const favourite = usePrefs((s) => s.favourites.includes(path));
  const { openPath, trash } = useWorkspace.getState();
  return (
    <li>
      <div
        draggable
        onDragStart={(e) => dragNotes(e, [path])}
        onContextMenu={openRowMenu}
        className={`group flex h-7 items-center gap-1 rounded-md pr-1 text-13 transition-colors ${active ? "bg-selected font-medium" : "hover:bg-hover"}`}
        style={{ paddingLeft: `${4 + depth * 14}px` }}
      >
        <span className="size-5 shrink-0" aria-hidden="true" />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          onClick={(e) => openPath(path, howFrom(e))}
          onAuxClick={(e) => e.button === 1 && openPath(path, "tab")}
          aria-current={active ? "page" : undefined}
          title={`${title} (whiteboard)`}
        >
          <span className="grid w-5 shrink-0 place-items-center text-16 leading-none" aria-hidden="true">
            <IconOrEmoji icon={lineIcon("board")} />
          </span>
          <span className="truncate">{title}</span>
        </button>
        <span className="hidden items-center group-focus-within:flex group-hover:flex">
          <Menu
            label={`More for ${title}`}
            float
            align="left"
            buttonClass="grid size-5 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink"
            items={[
              { label: favourite ? "Remove from Favourites" : "Add to Favourites", icon: <Icon name="star" className="size-4" />, onSelect: () => usePrefs.getState().toggleFavourite(path) },
              { label: "Open in new tab", icon: <Icon name="external" className="size-4" />, hint: "Ctrl+click", onSelect: () => openPath(path, "tab") },
              "divider",
              { label: "Move to Trash", icon: <Icon name="trash" className="size-4" />, danger: true, onSelect: () => void trash(path) },
            ]}
          >
            <Icon name="more" className="size-4" />
          </Menu>
        </span>
      </div>
    </li>
  );
});

/** A project's whiteboards, listed after its pages. */
export function ProjectBoards({ project, depth }: { project: string; depth: number }) {
  const boards = useBoards((s) => s.list);
  return boards.filter((b) => b.project === project).map((b) => <BoardRow key={b.path} path={b.path} title={b.title} depth={depth} />);
}

/** Favourite whiteboards, by the order they were starred. */
export function FavouriteBoards({ paths }: { paths: readonly string[] }) {
  const boards = useBoards((s) => s.list);
  return paths.map((path) => {
    const board = boards.find((b) => b.path === path);
    return board ? <BoardRow key={path} path={path} title={board.title} /> : null;
  });
}
