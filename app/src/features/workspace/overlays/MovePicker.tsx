import "./overlays.css";

import { useMemo, useState } from "react";

import { useShell } from "../../../lib/store";
import { IconOrEmoji } from "../../../ui/IconOrEmoji";
import { Modal } from "../../../ui/Modal";
import { titleOf } from "../names";
import { useWorkspace } from "../store";
import { noteAt, projects } from "../tree";
import { goTo, placesFor, type Place } from "./move-places";

/** "Move to": Pages, any project or, for a page, another page to go inside,
 * filtered as you type, or a new project named by what is typed. A loose
 * page is "added to a project". */
export function MovePicker({ path }: { path: string }) {
  const notes = useWorkspace((s) => s.notes);
  const note = noteAt(notes, path);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const close = () => useShell.getState().setMoving(null);
  const loose = Boolean(note && !note.project && !note.parent);
  const places = useMemo(() => placesFor(notes, note, query), [notes, note, query]);
  const current = Math.min(selected, Math.max(0, places.length - 1));
  const hint = note?.kind === "page" ? "a project or a page" : "a project";

  const pick = (place: Place) => {
    if (place.here) return;
    close();
    void goTo(path, place.go);
  };

  return (
    <Modal plain label="Move to" onClose={close} className="kasten-palette">
      <input
        autoFocus
        className="kasten-palette-input"
        placeholder={loose ? `Add to ${hint}, or name a new project…` : `Move “${note ? titleOf(note) : path}” to ${hint}…`}
        aria-label="Move to"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          else if (e.key === "ArrowDown") setSelected(Math.min(current + 1, places.length - 1));
          else if (e.key === "ArrowUp") setSelected(Math.max(current - 1, 0));
          else if (e.key === "Enter" && places[current]) pick(places[current]!);
          else return;
          e.preventDefault();
        }}
      />
      <div className="kasten-palette-list" role="listbox" aria-label="Places">
        {projects(notes).length === 0 && !query.trim() && <p className="kasten-palette-empty">No projects yet. Type a name to make one.</p>}
        {places.map((place, i) => (
          <button
            key={place.key}
            type="button"
            role="option"
            aria-selected={i === current}
            disabled={place.here}
            className="kasten-palette-row"
            onMouseMove={() => setSelected(i)}
            onClick={() => pick(place)}
          >
            <span className="kasten-palette-icon" aria-hidden="true">
              <IconOrEmoji icon={place.icon} />
            </span>
            <span className="kasten-palette-text">
              <span className="kasten-palette-label">{place.label}</span>
              <span className="kasten-palette-detail">{place.detail}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
