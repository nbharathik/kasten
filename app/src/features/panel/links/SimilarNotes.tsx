// "Similar notes": notes about the same things as this one, linked or not,
// found by the telling words they share (the core's related notes). For
// making the connections that were never made.

import { useEffect, useState } from "react";

import type { RelatedNote, VaultClient } from "../../../lib/vault/types";
import { dragNotes } from "../../workspace/drag";
import { iconOf } from "../../workspace/names";
import { howFrom, useWorkspace } from "../../workspace/store";
import { errorText } from "../page-edit";
import { IconOrEmoji } from "../../../ui/IconOrEmoji";

/** `stamp` changes when other notes do, so the list follows along. */
export function SimilarNotes({ client, path, stamp }: { client: VaultClient; path: string; stamp: string }) {
  const [found, setFound] = useState<RelatedNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      client.related(path, 8).then(
        (notes) => {
          if (!live) return;
          setFound(notes);
          setError(null);
        },
        (err: unknown) => live && setError(errorText(err)),
      );
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [client, path, stamp]);

  if (!found && !error) return null;
  return (
    <section className="kasten-panel-section" aria-label="Similar notes">
      <h3 className="kasten-panel-label">
        <span title="Notes that use the same telling words, linked or not">
          Similar notes {found && <span className="kasten-panel-count">{found.length}</span>}
        </span>
      </h3>
      {error ? (
        <p className="kasten-panel-empty">Similar notes could not be found: {error}</p>
      ) : found!.length === 0 ? (
        <p className="kasten-panel-empty">No other note shares this one’s telling words yet.</p>
      ) : (
        <ul className="kasten-links">
          {found!.map((n) => (
            <li key={n.path} className="kasten-link" draggable onDragStart={(e) => dragNotes(e, [n.path])}>
              <button
                type="button"
                className="kasten-link-open"
                title={`Open ${n.title} (Ctrl+click: new tab, Shift+click: side stack)`}
                onClick={(e) => useWorkspace.getState().openPath(n.path, howFrom(e))}
              >
                <span className="kasten-link-title">
                  <IconOrEmoji icon={iconOf({ icon: n.icon, kind: "page" })} /> {n.title}
                  {n.linked && <span className="kasten-link-badge">linked</span>}
                </span>
                {n.shared.length > 0 && <span className="kasten-link-snippet">shares {n.shared.join(", ")}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
