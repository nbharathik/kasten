import { useId } from "react";

import type { NextToken } from "@kasten-slides/wasm";

import type { Patch } from "../../../session/elements.ts";
import { TextButton } from "../../../ui/Button.tsx";
import { NumberField } from "../../../ui/Fields.tsx";
import { TextField } from "../controls.tsx";
import type { SectionProps } from "../types.ts";
import { json, only, same, shared } from "../values.ts";
import { patchEach } from "../write.ts";
import { CodeArea } from "./CodeArea.tsx";
import { CompositeSection } from "./CompositeSection.tsx";
import { ListEditor, MixedList } from "./ListEditor.tsx";

/** The tokens as the box holds them: one to a line, a leading space kept. */
const linesOf = (tokens: readonly string[]): string => tokens.join("\n");
/** The tokens from the box: a token is a line, and an empty line is no token. */
const tokensOf = (text: string): string[] => text.replace(/\r/g, "").split("\n").filter((token) => token !== "");

const percent = (p: number): number => Math.round(p * 1000) / 10;
const fraction = (percentage: number): number => Math.round(percentage * 100) / 10000;

/** The text so far as tokens, and the tokens that might come next, each with its chance and which one was picked. */
export function TokenProbsSection({ session, ui, elements }: SectionProps) {
  const rows = only(elements, "token-probs");
  const uid = useId();
  const tokens = shared(rows.map((r) => linesOf(r.tokens ?? [])), "");
  const nexts = rows.map((r) => r.next);
  const alike = nexts.every((list) => same(list, nexts[0])) && rows.every((r) => (r.chosen ?? null) === (rows[0]?.chosen ?? null));
  const next: NextToken[] = nexts[0] ?? [];
  const chosen = rows[0]?.chosen ?? null;
  const change = (patch: Patch) => patchEach(session, rows, () => patch);
  const setNext = (list: NextToken[], picked: number | null = chosen) => change({ next: json(list), chosen: picked });
  const total = next.reduce((sum, n) => sum + n.p, 0);
  const uneven = next.length > 0 && Math.abs(percent(total) - 100) > 0.5;

  return (
    <CompositeSection id="token-probs" title="Token probabilities" ui={ui} ids={rows.map((r) => r.id)}>
      <div className="ks-sp-field">
        <span className="ks-sp-label">Tokens so far, one to a line</span>
        <CodeArea label="Tokens so far" value={tokens.value} mixed={tokens.mixed} code tabs={false} primary rows={5} placeholder={"The\n cat\n sat"} onCommit={(text) => change({ tokens: tokensOf(text) })} />
      </div>
      <div className="ks-sp-field">
        <span className="ks-sp-label">What may come next</span>
        {alike ? (
          <>
            <div role="radiogroup" aria-label="The token that was picked">
              <ListEditor
                label="Next tokens"
                items={next}
                compact
                rowName={(i) => `Next token ${i + 1}`}
                empty="Add the tokens that might come next."
                addLabel="Add token"
                row={(entry, i) => (
                  <div className="ks-cs-next">
                    <input type="radio" name={`${uid}-chosen`} aria-label={`Picked: next token ${i + 1}`} checked={chosen === i} onChange={() => setNext(next, i)} />
                    <TextField label={`Next token ${i + 1}`} value={entry.token} placeholder="token" onCommit={(token) => setNext(next.map((n, at) => (at === i ? { ...n, token } : n)))} />
                    <span className="ks-sp-plain">
                      <NumberField label={`Chance of next token ${i + 1}`} unit="%" min={0} max={100} decimals={1} width={56} value={percent(entry.p)} onCommit={(n) => setNext(next.map((m, at) => (at === i ? { ...m, p: fraction(n) } : m)))} />
                    </span>
                  </div>
                )}
                onAdd={() => setNext([...next, { token: "", p: 0 }])}
                onRemove={(i) => setNext(next.filter((_, at) => at !== i), chosen === null || chosen === i ? null : chosen > i ? chosen - 1 : chosen)}
              />
            </div>
            {uneven || chosen !== null ? (
              <div className="ks-sp-inline">
                <span className="ks-sp-hint">{uneven ? `These add up to ${percent(total)}%; the bars are drawn as given.` : ""}</span>
                <TextButton disabled={chosen === null} onClick={() => setNext(next, null)}>
                  Clear pick
                </TextButton>
              </div>
            ) : null}
          </>
        ) : (
          <MixedList what="next tokens" />
        )}
      </div>
    </CompositeSection>
  );
}
