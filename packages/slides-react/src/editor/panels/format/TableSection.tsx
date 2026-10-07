import { IconButton } from "../../ui/Button.tsx";
import { Cluster, Row, TriToggle } from "./controls.tsx";
import { PanelSection } from "./PanelSection.tsx";
import { canShrink, grow, shrink } from "./table-edit.ts";
import type { SectionProps } from "./types.ts";
import { agree, json, only } from "./values.ts";
import { patchEach } from "./write.ts";

/** The rows and columns of a table, and whether its first row is a header. */
export function TableSection({ session, elements }: SectionProps) {
  const tables = only(elements, "table");
  const rows = agree(tables.map((t) => t.rows.length), 0);
  const columns = agree(tables.map((t) => t.columns.length), 0);
  const header = agree(tables.map((t) => Boolean(t.headerRow)), false);
  const slide = session.deck.size;

  const change = (along: "row" | "column", kind: "add" | "remove") =>
    patchEach(session, tables, (table) => {
      const box = session.elements.boxOf(table);
      if (!box) return null;
      if (kind === "remove" && !canShrink(table, along)) return null;
      const room = along === "row" ? slide.h - box.y : slide.w - box.x;
      const next = kind === "add" ? grow(table, box, along, room) : shrink(table, box, along);
      return { rows: json(next.rows), columns: next.columns, w: next.w, h: next.h };
    });

  const stepper = (name: "row" | "column", count: number | "mixed") => (
    <Row label={name === "row" ? "Rows" : "Columns"}>
      <Cluster label={name === "row" ? "Rows" : "Columns"}>
        <IconButton icon="minus" label={`Remove ${name}`} disabled={count !== "mixed" ? count <= 1 : tables.some((t) => !canShrink(t, name))} onClick={() => change(name, "remove")} />
        <output className="ks-sp-count" aria-label={`${name === "row" ? "Rows" : "Columns"} in the table`}>
          {count === "mixed" ? "—" : count}
        </output>
        <IconButton icon="plus" label={`Add ${name}`} onClick={() => change(name, "add")} />
      </Cluster>
    </Row>
  );

  return (
    <PanelSection id="table" title="Table">
      {stepper("row", rows)}
      {stepper("column", columns)}
      <TriToggle label="Header row" on={header} onChange={(next) => patchEach(session, tables, (t) => (Boolean(t.headerRow) === next ? null : { headerRow: next }))} />
    </PanelSection>
  );
}
