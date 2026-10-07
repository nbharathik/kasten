// Tab sets, at the end of a pane's tabs: save the tabs open here under a
// name and open them all again later, pinned ones pinned (tab-sets.ts).

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { Popup } from "../features/pages/page/Popup";
import { usePrefs } from "../features/workspace/prefs";
import { useWorkspace } from "../features/workspace/store";
import { setOf, withSet, withoutSet, type TabSet } from "../features/workspace/tab-sets";
import type { Pane } from "../features/workspace/tabs";
import { IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";

const WIDTH = 280;

export function TabSets({ pane }: { pane: Pane }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const rect = button.current.getBoundingClientRect();
    setAt({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.right - WIDTH, window.innerWidth - WIDTH - 8)) });
  }, [open]);
  return (
    <>
      <IconButton ref={button} icon="layers" label="Tab sets" size="sm" active={open} className="my-auto" onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className="fixed z-50" style={{ ...at, width: WIDTH }}>
          <Popup label="Tab sets" anchor={button} onClose={() => setOpen(false)} className="kasten-shell-menu relative w-full p-1.5">
            <SetsMenu pane={pane} onDone={() => setOpen(false)} />
          </Popup>
        </div>
      )}
    </>
  );
}

function SetsMenu({ pane, onDone }: { pane: Pane; onDone(): void }) {
  const sets = usePrefs((s) => s.tabSets);
  const [name, setName] = useState("");
  const draft = setOf(pane, name || "x");
  const save = () => {
    const set = setOf(pane, name);
    if (!set) return;
    usePrefs.getState().set({ tabSets: withSet(usePrefs.getState().tabSets, set) });
    setName("");
  };
  const openSet = (set: TabSet) => {
    useWorkspace.getState().openTabs(
      set.tabs.map((t) => t.place),
      set.tabs.filter((t) => t.pinned).map((t) => t.place),
    );
    onDone();
  };
  return (
    <div className="text-13">
      <p className="px-2 pb-1.5 pt-1 text-12 font-semibold text-muted">Tab sets</p>
      <form
        className="flex items-center gap-1.5 px-1 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={draft ? `Name these ${draft.tabs.length} tabs…` : "Open some pages first"}
          aria-label="Name for the tabs open here"
          disabled={!draft}
          className="h-7 min-w-0 flex-1 rounded-[4px] bg-well px-2 outline-none placeholder:text-faint focus:ring-1 focus:ring-accent/60"
        />
        <button type="submit" className="ui-btn is-primary is-sm" disabled={!draft || !name.trim()}>
          Save
        </button>
      </form>
      {sets.length === 0 ? (
        <p className="px-2 pb-2 text-12 leading-snug text-muted">Save the tabs open here to bring them all back together later, pinned ones pinned.</p>
      ) : (
        <ul className="border-t border-line pt-1">
          {sets.map((set) => (
            <li key={set.name} className="group flex items-center rounded-[5px] hover:bg-hover">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left" onClick={() => openSet(set)} title={`Open ${set.tabs.length} tabs`}>
                <Icon name="layers" className="size-[15px] text-muted" />
                <span className="min-w-0 flex-1 truncate">{set.name}</span>
                <span className="text-12 text-muted">{set.tabs.length} tabs</span>
              </button>
              <IconButton
                icon="close"
                label={`Forget the set ${set.name}`}
                size="sm"
                className="mr-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => usePrefs.getState().set({ tabSets: withoutSet(usePrefs.getState().tabSets, set.name) })}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
