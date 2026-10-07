import { useState } from "react";

import type { Patch } from "../../../session/elements.ts";
import { NumberField, Segmented } from "../../../ui/Fields.tsx";
import { TextButton } from "../../../ui/Button.tsx";
import { Row, TextField, TriToggle } from "../controls.tsx";
import type { SectionProps } from "../types.ts";
import { agree, only, same, shared } from "../values.ts";
import { patchEach } from "../write.ts";
import { CodeArea } from "./CodeArea.tsx";
import { CompositeSection } from "./CompositeSection.tsx";
import { lastLine, linesOf, nextFocus, normalizeFocus, pastEnd } from "./focus-steps.ts";
import { LanguageSelect } from "./LanguageSelect.tsx";
import { ListEditor, MixedList } from "./ListEditor.tsx";

/** One entry of the walkthrough: the lines to look at in a step. It is kept only when it is lines and ranges; anything else is left as typed, marked, until it is put right. */
function FocusEntry({ step, value, onCommit }: { step: number; value: string; onCommit(entry: string): void }) {
  const [bad, setBad] = useState(false);
  return (
    <TextField
      label={`Lines in focus at step ${step}`}
      value={value}
      placeholder="2-3"
      invalid={bad}
      onCommit={(typed) => {
        const entry = normalizeFocus(typed);
        setBad(entry === null);
        if (entry !== null && entry !== value) onCommit(entry);
      }}
    />
  );
}

/** A block of code: the code itself, its language and looks, and the lines each step of a walkthrough looks at. */
export function CodeSection({ session, ui, elements }: SectionProps) {
  const blocks = only(elements, "code");
  const code = shared(blocks.map((b) => b.code), "");
  const language = agree(blocks.map((b) => b.language.trim() === "" ? "text" : b.language), "text");
  const theme = agree(blocks.map((b) => b.theme ?? "dark"), "dark");
  const numbers = agree(blocks.map((b) => Boolean(b.lineNumbers)), false);
  const first = agree(blocks.map((b) => b.firstLine ?? 1), 1);
  const size = agree<number | null>(blocks.map((b) => b.fontSize ?? null), null);
  const lists = blocks.map((b) => b.focus ?? []);
  const alike = lists.every((list) => same(list, lists[0]));
  const entries = lists[0] ?? [];
  const lines = linesOf(code.mixed ? "" : code.value);
  const change = (patch: Patch) => patchEach(session, blocks, () => patch);
  const setFocus = (next: string[]) => change({ focus: next.length > 0 ? next : null });

  return (
    <CompositeSection id="code" title="Code" ui={ui} ids={blocks.map((b) => b.id)}>
      <CodeArea label="Code" value={code.value} mixed={code.mixed} primary rows={9} placeholder="Paste or type code" onCommit={(text) => change({ code: text })} />
      <Row label="Language">
        <LanguageSelect value={language} onPick={(id) => change({ language: id })} />
      </Row>
      <Row label="Colours">
        <Segmented<"dark" | "light">
          label="Code colours"
          value={theme}
          options={[
            { value: "dark", label: "Dark", title: "Dark code colours" },
            { value: "light", label: "Light", title: "Light code colours" },
          ]}
          onPick={(picked) => change({ theme: picked })}
        />
      </Row>
      <TriToggle label="Line numbers" on={numbers} onChange={(on) => change({ lineNumbers: on })} />
      <Row label="First line">
        <span className="ks-sp-plain">
          <NumberField label="First line number" min={1} decimals={0} width={64} value={first} onCommit={(n) => change({ firstLine: Math.round(n) === 1 ? null : Math.round(n) })} />
        </span>
      </Row>
      <Row label="Font size">
        <span className="ks-sp-plain">
          <NumberField label="Code size" unit="pt" min={6} max={96} decimals={1} width={64} value={size} onCommit={(n) => change({ fontSize: n })} />
        </span>
        <TextButton aria-label="Use the theme's code size" disabled={size === null} onClick={() => change({ fontSize: null })}>
          Reset
        </TextButton>
      </Row>
      <div className="ks-sp-field">
        <span className="ks-sp-label">Focus steps</span>
        {alike ? (
          <>
            <ListEditor
              label="Steps in focus"
              items={entries}
              compact
              rowName={(i) => `Step ${i + 1}`}
              row={(entry, i) => <FocusEntry step={i + 1} value={entry} onCommit={(next) => setFocus(entries.map((e, at) => (at === i ? next : e)))} />}
              addLabel="Add step"
              empty="Add a step for each thing to look at: the lines outside it are dimmed."
              onAdd={() => setFocus([...entries, nextFocus(entries, lines)])}
              onRemove={(i) => setFocus(entries.filter((_, at) => at !== i))}
              onMove={(from, to) => {
                const next = [...entries];
                const [moved] = next.splice(from, 1);
                if (moved !== undefined) next.splice(to, 0, moved);
                setFocus(next);
              }}
            />
            {entries.some((e) => pastEnd(e, lines)) && lines > 0 ? (
              <p className="ks-sp-hint is-error" role="status">
                {entries.flatMap((e, i) => (pastEnd(e, lines) ? [`Step ${i + 1} names line ${lastLine(e)}`] : [])).join("; ")}, and the code has {lines}.
              </p>
            ) : null}
          </>
        ) : (
          <MixedList what="steps in focus" />
        )}
      </div>
    </CompositeSection>
  );
}
