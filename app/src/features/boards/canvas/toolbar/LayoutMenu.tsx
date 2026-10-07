// The layout helpers, for the selection or, with nothing selected, the
// whole board: align, distribute, tidy into a grid, cluster by tag, and a
// mind map of what is connected.

import { useBoard } from "../context";
import { layout, type LayoutKind } from "../state/gestures";

/** What an item does, where its name does not say it all. */
const HINTS: Partial<Record<LayoutKind, string>> = {
  mindmap: "Lay out what is connected as a tree from the left. Tab on one selected thing adds a child, Shift+Enter a sibling.",
};

const GROUPS: { title: string; items: [LayoutKind, string][] }[] = [
  {
    title: "Align",
    items: [
      ["left", "Left edges"],
      ["centre", "Centres"],
      ["right", "Right edges"],
      ["top", "Tops"],
      ["middle", "Middles"],
      ["bottom", "Bottoms"],
    ],
  },
  {
    title: "Arrange",
    items: [
      ["horizontal", "Distribute across"],
      ["vertical", "Distribute down"],
      ["tidy", "Tidy into a grid"],
      ["cluster", "Cluster by tag"],
      ["mindmap", "Mind map"],
    ],
  },
];

export function LayoutMenu({ onDone }: { onDone?: () => void }) {
  const board = useBoard();
  return (
    <div className="kasten-layout-menu" role="menu" aria-label="Layout">
      {GROUPS.map((group) => (
        <div key={group.title}>
          <p className="kasten-board-menu-heading">{group.title}</p>
          <div className="kasten-layout-grid">
            {group.items.map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                role="menuitem"
                title={HINTS[kind]}
                onClick={() => {
                  onDone?.();
                  layout(board, kind);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
