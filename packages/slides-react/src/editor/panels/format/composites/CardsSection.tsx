import type { Card } from "@kasten-slides/wasm";

import type { Patch } from "../../../session/elements.ts";
import { TextButton } from "../../../ui/Button.tsx";
import { NumberField } from "../../../ui/Fields.tsx";
import { Row, TextField } from "../controls.tsx";
import type { SectionProps } from "../types.ts";
import { agree, json, only, same } from "../values.ts";
import { patchEach } from "../write.ts";
import { CodeArea } from "./CodeArea.tsx";
import { CompositeSection } from "./CompositeSection.tsx";
import { ListEditor, MixedList } from "./ListEditor.tsx";

/** The most cards to a row that the panel offers. */
const MOST_COLUMNS = 6;

/** Cards in a grid: a title and a line for each, and how many to a row. */
export function CardsSection({ session, ui, elements }: SectionProps) {
  const grids = only(elements, "card-grid");
  const lists = grids.map((g) => g.cards);
  const alike = lists.every((list) => same(list, lists[0]));
  const cards: Card[] = lists[0] ?? [];
  const columns = agree<number | null>(grids.map((g) => g.columns ?? null), null);
  const change = (patch: Patch) => patchEach(session, grids, () => patch);
  const set = (next: Card[]) => change({ cards: json(next) });
  // A card with no line under its title has no `body`, rather than an empty one.
  const edit = (index: number, part: { title?: string; body?: string }) =>
    set(
      cards.map((c, i) => {
        if (i !== index) return c;
        const [title, body] = [part.title ?? c.title, part.body ?? c.body ?? ""];
        return body.trim() === "" ? { title } : { title, body };
      }),
    );

  return (
    <CompositeSection id="cards" title="Cards" ui={ui} ids={grids.map((g) => g.id)}>
      {alike ? (
        <ListEditor
          label="Cards"
          items={cards}
          rowName={(i) => `Card ${i + 1}`}
          empty="There are no cards yet."
          addLabel="Add card"
          row={(card, i) => (
            <>
              <div data-primary={i === 0 ? "" : undefined}>
                <TextField label={`Title of card ${i + 1}`} value={card.title} placeholder="Title" onCommit={(title) => edit(i, { title })} />
              </div>
              <CodeArea label={`Text of card ${i + 1}`} value={card.body ?? ""} code={false} rows={2} placeholder="A line about it" onCommit={(body) => edit(i, { body })} />
            </>
          )}
          onAdd={() => set([...cards, { title: "" }])}
          onRemove={(i) => set(cards.filter((_, at) => at !== i))}
          onMove={(from, to) => {
            const next = [...cards];
            const [moved] = next.splice(from, 1);
            if (moved) next.splice(to, 0, moved);
            set(next);
          }}
        />
      ) : (
        <MixedList what="cards" />
      )}
      <Row label="Columns">
        <span className="ks-sp-plain">
          <NumberField label="Cards to a row" min={1} max={MOST_COLUMNS} decimals={0} width={56} value={columns} onCommit={(n) => change({ columns: Math.round(n) })} />
        </span>
        <TextButton disabled={columns === null} onClick={() => change({ columns: null })}>
          Automatic
        </TextButton>
      </Row>
    </CompositeSection>
  );
}
