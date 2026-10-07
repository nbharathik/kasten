// "Related from": the notes whose relation properties point at this one,
// so a relation can be followed from either end (related.ts).

import { useMemo } from "react";

import type { NoteMeta, VaultClient } from "../../../lib/vault/types";
import { dragNotes } from "../../workspace/drag";
import { iconOf, titleOf } from "../../workspace/names";
import { howFrom, useWorkspace } from "../../workspace/store";
import { useSchemas } from "../properties/schemas";
import { relatedFrom } from "./related";
import { IconOrEmoji } from "../../../ui/IconOrEmoji";

export function RelatedFrom({ client, note }: { client: VaultClient; note: NoteMeta }) {
  const notes = useWorkspace((s) => s.notes);
  const schemas = useSchemas(client, note.path);
  const related = useMemo(() => (schemas ? relatedFrom(notes, note, schemas) : null), [notes, note, schemas]);
  // Most notes have no relations at all; the section shows only when some do.
  if (!related?.length) return null;
  return (
    <section className="kasten-panel-section" aria-label="Related from">
      <h3 className="kasten-panel-label">
        <span>
          Related from <span className="kasten-panel-count">{related.length}</span>
        </span>
      </h3>
      <ul className="kasten-links">
        {related.map(({ note: from, keys }) => (
          <li key={from.path} className="kasten-link" draggable onDragStart={(e) => dragNotes(e, [from.path])}>
            <button type="button" className="kasten-link-open" title={`Open ${titleOf(from)} (Ctrl+click: new tab)`} onClick={(e) => useWorkspace.getState().openPath(from.path, howFrom(e))}>
              <span className="kasten-link-title">
                <IconOrEmoji icon={iconOf(from)} /> {titleOf(from)}
              </span>
              <span className="kasten-link-snippet">through {keys.join(", ")}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
