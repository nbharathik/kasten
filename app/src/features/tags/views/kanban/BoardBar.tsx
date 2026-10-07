// The strip above the columns: how to move cards, and "Colour by", which
// tints each card Trello-style by one of the tag's selects. The choice is
// saved with the view (`color_by` in the tag's YAML); None removes the key.

import type { TagSchema, TagView } from "../../../../lib/vault/types";
import { colorDef, withColorBy } from "./model";

interface BoardBarProps {
  view: TagView;
  schema: TagSchema | null;
  onChange(next: TagView): void;
}

export function BoardBar({ view, schema, onChange }: BoardBarProps) {
  const selects = (schema?.properties ?? []).filter((p) => p.type === "select");
  const current = colorDef(view, schema)?.key ?? "";
  return (
    <div className="kasten-kanban-bar">
      <span className="kasten-kanban-tip">Drag cards between columns, or focus one and press Alt+← / Alt+→</span>
      <label className="kasten-tagdb-pick">
        Colour by
        <select aria-label="Colour cards by" value={current} onChange={(event) => onChange(withColorBy(view, event.target.value || null))}>
          <option value="">None</option>
          {selects.map((p) => (
            <option key={p.key} value={p.key}>
              {p.key}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
