import { Fragment, useLayoutEffect, useRef, useState } from "react";

import { placeKey } from "../features/workspace/drafts";
import { PaneContext } from "../features/workspace/pane-context";
import { useWorkspace } from "../features/workspace/store";
import { activeTab, type Pane as PaneData } from "../features/workspace/tabs";
import { useShell } from "../lib/store";
import { PaneDivider } from "./PaneDivider";
import { TAB_DRAG, TabStrip } from "./TabStrip";
import { TopBar } from "./TopBar";
import { useViewEnter } from "./view-enter";
import { ViewOutlet } from "./ViewOutlet";

/** The main area: up to three panes side by side, each with its tabs,
 * with a line between them that moves. */
export function Panes() {
  const panes = useWorkspace((s) => s.layout.panes);
  const focus = useWorkspace((s) => s.layout.focus);
  const focusMode = useShell((s) => s.focusMode);
  const shown = focusMode ? panes.filter((p) => p.id === focus) : panes;
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      {shown.map((pane, i) => (
        <Fragment key={pane.id}>
          {i > 0 && <PaneDivider left={shown[i - 1]!} right={pane} />}
          <Pane pane={pane} first={i === 0} last={i === shown.length - 1} focused={pane.id === focus && panes.length > 1} bare={focusMode} />
        </Fragment>
      ))}
    </div>
  );
}

interface PaneProps {
  pane: PaneData;
  first: boolean;
  last: boolean;
  /** Marks the pane keys act on, when there are several. */
  focused: boolean;
  /** Focus mode: only the view. */
  bare: boolean;
}

/** Where each tab's places were scrolled to, so Back returns there and a
 * new place starts at the top. */
const scrolls = new Map<string, number>();
const MAX_SCROLLS = 300;

/** Where each scroller was last seen scrolled to, from its scroll events:
 * reading scrollTop would lay out the page being opened. */
const seen = new WeakMap<HTMLElement, number>();

function useScrollMemory(key: string) {
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = scrolls.get(key) ?? 0;
    // Setting scrollTop lays the new page out at once; most pages open at
    // the top of a scroller that is already there.
    if ((seen.get(el) ?? 0) !== target) el.scrollTop = target;
    // Pages fill in a moment later; keep trying while they grow.
    let frames = 0;
    let raf = 0;
    const settle = () => {
      if (el.scrollTop >= target - 1 || frames++ > 60) return;
      el.scrollTop = target;
      raf = requestAnimationFrame(settle);
    };
    if (target > 0) raf = requestAnimationFrame(settle);
    // Kept as the reader scrolls: by the time the view changes, the old
    // position has already been clamped to the new view's height.
    const onScroll = () => {
      seen.set(el, el.scrollTop);
      scrolls.delete(key);
      scrolls.set(key, el.scrollTop);
      if (scrolls.size > MAX_SCROLLS) scrolls.delete(scrolls.keys().next().value!);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
    };
  }, [key]);
  return scroller;
}

function Pane({ pane, first, last, focused, bare }: PaneProps) {
  const tab = activeTab(pane);
  const [dropping, setDropping] = useState(false);
  const ws = useWorkspace.getState();
  // A new page's draft and the page it becomes are one place.
  const at = tab.place.path ? placeKey(tab.place.path) : "";
  const scroller = useScrollMemory(`${tab.id}|${tab.place.view}|${at}`);
  // The journal's days are one place as you move between them.
  useViewEnter(scroller, `${tab.id}|${tab.place.view}|${tab.place.view === "journal" ? "" : at}`);
  return (
    <section
      aria-label="Pane"
      className={`kasten-pane relative flex min-w-0 flex-col ${last ? "" : "border-r border-line"} ${focused ? "is-focused" : ""}`}
      style={{ flex: `${bare ? 1 : (pane.size ?? 1)} 1 0%` }}
      onMouseDownCapture={() => ws.focusPane(pane.id)}
      onFocusCapture={() => ws.focusPane(pane.id)}
    >
      <PaneContext.Provider value={pane.id}>
        {!bare && <TabStrip pane={pane} actions={last} />}
        {!bare && <TopBar pane={pane} first={first} />}
        <div
          ref={scroller}
          className="min-h-0 flex-1 overflow-auto"
          data-scroll-root
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(TAB_DRAG)) return;
            const box = e.currentTarget.getBoundingClientRect();
            const near = e.clientX > box.right - 96;
            setDropping(near);
            if (near) e.preventDefault();
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={(e) => {
            setDropping(false);
            const data = e.dataTransfer.getData(TAB_DRAG);
            if (!data) return;
            e.preventDefault();
            const { paneId, tabId } = JSON.parse(data) as { paneId: string; tabId: string };
            const moving = useWorkspace.getState().layout.panes.find((p) => p.id === paneId)?.tabs.find((t) => t.id === tabId);
            if (!moving) return;
            ws.focusPane(pane.id);
            ws.splitRight(moving.place);
            const from = useWorkspace.getState().layout.panes.find((p) => p.id === paneId);
            if (from && from.tabs.length > 1) ws.closeTab(paneId, tabId);
          }}
        >
          <ViewOutlet place={tab.place} />
        </div>
        {dropping && <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 rounded-l-xl border-2 border-accent/50 bg-accent/10" aria-hidden="true" />}
      </PaneContext.Provider>
    </section>
  );
}
