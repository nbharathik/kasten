import type { Element, Fill } from "@kasten-slides/wasm";

import type { Patch } from "../../session/elements.ts";
import { TextButton } from "../../ui/Button.tsx";
import { ColorButton, Row, Slider } from "./controls.tsx";
import { PanelSection } from "./PanelSection.tsx";
import type { SectionProps } from "./types.ts";
import { agree, json, same } from "./values.ts";
import { patchEach } from "./write.ts";

/** The fills an element has: a table has one for each of its cells. */
function fillsOf(element: Element): (Fill | null)[] {
  if (element.type === "table") return element.rows.flatMap((row) => row.cells.map((cell) => cell.fill ?? null));
  return [element.style?.fill ?? null];
}

/** The patch that gives an element the fill `change` makes of its own; null when that changes nothing. */
function withFill(element: Element, change: (fill: Fill | null) => Fill | null): Patch | null {
  if (element.type === "table") {
    const rows = element.rows.map((row) => ({
      ...row,
      cells: row.cells.map(({ fill, ...cell }) => {
        const next = change(fill ?? null);
        return next ? { ...cell, fill: next } : cell;
      }),
    }));
    return same(rows, element.rows) ? null : { rows: json(rows) };
  }
  const now = element.style?.fill ?? null;
  const next = change(now);
  if (same(now, next)) return null;
  // A merge patch keeps what it does not name: a fill that lost its opacity must say so.
  return { style: { fill: next ? { color: next.color, alpha: next.alpha ?? null } : null } };
}

/** The colour and opacity of what is inside a shape, a text box or the cells of a table. */
export function FillSection({ session, elements, theme }: SectionProps) {
  const fills = elements.flatMap(fillsOf);
  const filled = fills.filter((fill): fill is Fill => fill !== null);
  const colour = agree(fills.map((fill) => fill?.color ?? null), null);
  const opacity = agree(filled.map((fill) => Math.round((fill.alpha ?? 1) * 100)), 100);
  const apply = (change: (fill: Fill | null) => Fill | null) => patchEach(session, elements, (element) => withFill(element, change));
  return (
    <PanelSection id="fill" title="Fill">
      <Row label="Colour">
        <ColorButton
          theme={theme}
          label="Fill colour"
          value={colour}
          onPick={(picked) => apply(picked === null ? () => null : (fill) => ({ ...fill, color: picked }))}
        />
        <TextButton disabled={filled.length === 0} onClick={() => apply(() => null)}>
          None
        </TextButton>
      </Row>
      <Row label="Opacity">
        <Slider label="Fill opacity" value={opacity} disabled={filled.length === 0} onCommit={(percent) => apply((fill) => (fill ? { ...fill, alpha: percent >= 100 ? null : percent / 100 } : null))} />
      </Row>
    </PanelSection>
  );
}
