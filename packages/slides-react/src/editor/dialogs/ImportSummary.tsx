import type { ImportedPptx } from "@kasten-slides/wasm";
import { type JSX, useMemo } from "react";

/** The place of each slide of the file, from 1, by id. */
function placesOf(imported: ImportedPptx): Map<string, number> {
  try {
    const deck = JSON.parse(imported.deck) as { slides?: { id: string }[] };
    return new Map((deck.slides ?? []).map((slide, i) => [slide.id, i + 1]));
  } catch {
    return new Map();
  }
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

const KINDS: Record<string, string> = {
  "pptx:chart": "chart",
  "pptx:smartart": "SmartArt diagram",
  "pptx:ole-object": "embedded object",
  "pptx:custom-shape": "freeform shape",
  "pptx:media": "video or audio clip",
  "pptx:picture": "picture",
};

/** What was in the file: how much came over, what was kept as it was, and what the import says about the rest. */
export function ImportSummary({ imported, name }: { imported: ImportedPptx; name: string }): JSX.Element {
  const { report } = imported;
  const places = useMemo(() => placesOf(imported), [imported]);
  const kept = report.raw.reduce<Map<string, number>>((all, note) => all.set(note.original, (all.get(note.original) ?? 0) + 1), new Map());
  return (
    <div className="ks-im-summary" aria-label="What is in the file">
      <p className="ks-im-file">
        <strong>{name}</strong>
      </p>
      <p>
        {plural(report.slides, "slide", "slides")}
        {report.hidden > 0 ? `, ${report.hidden} hidden` : ""}, {plural(report.pictures, "picture", "pictures")}
      </p>
      {kept.size > 0 && (
        <p className="ks-sp-hint">
          Kept as they were, and not editable here:{" "}
          {[...kept].map(([original, count]) => `${count} ${KINDS[original] ?? "object"}${count === 1 ? "" : "s"}`).join(", ")}. They show as a picture or a box, and go back to PowerPoint whole.
        </p>
      )}
      {report.warnings.length > 0 && (
        <details className="ks-im-notes">
          <summary>{plural(report.warnings.length, "note", "notes")} about how the file was read</summary>
          <ul>
            {report.warnings.map((warning, i) => {
              const place = warning.slide ? places.get(warning.slide) : undefined;
              return <li key={i}>{`${place ? `Slide ${place}: ` : ""}${warning.message}`}</li>;
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
