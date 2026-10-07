// Stands in for the text module's `TextBlock` in tests of the renderer, so
// they check what the renderer asks of it (a test with the real one would
// also test the text module). It writes its props where a test can read them.

import type { Text } from "@kasten-slides/wasm";
import type { JSX } from "react";

export function TextBlock(props: { text: Text } & Record<string, unknown>): JSX.Element {
  const shown = Object.fromEntries(Object.entries(props).filter(([key]) => key !== "theme"));
  const words = props.text.paragraphs.map((paragraph) => paragraph.runs.map((run) => run.t).join("")).join(" / ");
  return (
    <div data-testid="text-block" data-props={JSON.stringify(shown)}>
      {words}
    </div>
  );
}
