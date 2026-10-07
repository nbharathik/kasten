import "./stack.css";

import { useState } from "react";

import { Icon } from "../../ui/Icon";
import { ResizeHandle } from "../../ui/ResizeHandle";
import { useWorkspace } from "../workspace/store";
import { keyTitle } from "../shortcuts/store";
import { NoteFinder } from "./NoteFinder";
import { StackCard } from "./StackCard";

const WIDTH_KEY = "kasten.stack.width";
const WIDTH = { initial: 440, min: 320, max: 820 };

function savedWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY));
    return n >= WIDTH.min && n <= WIDTH.max ? n : WIDTH.initial;
  } catch {
    return WIDTH.initial;
  }
}

function keepWidth(width: number): void {
  try {
    localStorage.setItem(WIDTH_KEY, String(width));
  } catch {
    // Width is a convenience.
  }
}

/** Heptabase's side column: many notes open at once, stacked and editable,
 * beside whatever the tabs show. Shift+click a link or card to add one. */
export function SideStack() {
  const stack = useWorkspace((s) => s.stack);
  const [width, setWidth] = useState(savedWidth);
  const ws = useWorkspace.getState();

  return (
    <aside className="kasten-stack" style={{ width }} aria-label="Side stack">
      <header className="flex items-center gap-2 px-3 pb-2 pt-2.5">
        <Icon name="glance" className="size-4 text-muted" />
        <span className="text-13 font-semibold">Quick glance</span>
        <span className="text-12 text-muted">{stack.length}</span>
        <span className="flex-1" />
        {stack.length > 0 && (
          <button type="button" onClick={ws.clearStack} className="rounded-md px-1.5 py-0.5 text-12 text-muted hover:bg-line/60 hover:text-ink">
            Clear
          </button>
        )}
        <button type="button" aria-label="Close the side stack" title={keyTitle("Close", "stack")} onClick={() => ws.toggleStack(false)} className="grid size-6 place-items-center rounded-md text-muted hover:bg-line/60 hover:text-ink">
          <Icon name="close" className="size-3.5" />
        </button>
      </header>
      <div className="px-3 pb-2">
        <NoteFinder onPick={(path) => ws.openInStack(path)} placeholder="Find a page to keep here…" autoFocus={stack.length === 0} />
      </div>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-auto px-3 pb-6">
        {stack.length === 0 ? (
          <p className="px-1 pt-6 text-center text-13 leading-relaxed text-muted">
            Find a page above, or Shift+click any link, page or card to open it here. Keep several pages beside the one you are working on.
          </p>
        ) : (
          stack.map((path, i) => <StackCard key={path} path={path} first={i === 0} last={i === stack.length - 1} />)
        )}
      </div>
      <ResizeHandle label="Resize the side stack" edge="left" width={width} {...WIDTH} onChange={setWidth} onCommit={keepWidth} />
    </aside>
  );
}
