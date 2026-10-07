// What the editor does by itself when the host does not say otherwise: make
// the file for an export and hand it to the host. A host that has a better way
// (a print dialog, the operating system's save panel) gives its own action, and
// that one is used.

import type { SlidesHost } from "./host.ts";
import type { Exported } from "./session/exporting.ts";
import type { EditorSession } from "./session/session.ts";
import type { EditorActions } from "./ui-state.ts";

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

export function defaultActions(session: EditorSession, host: SlidesHost): EditorActions {
  const tell = (message: string): void => host.notify?.(message);
  const hand = async (make: () => Promise<Exported> | Exported): Promise<void> => {
    try {
      const { file, warnings } = await make();
      await host.deliver(file);
      // Where the file went is for the host to say; what could not be written exactly is for the editor.
      if (warnings.length > 0) tell(`${file.name}: ${plural(warnings.length, "thing")} could not be written exactly. ${warnings[0]?.message ?? ""}`);
    } catch (error) {
      tell(`The export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  return {
    present(from, options) {
      // Loaded when it is first wanted: reveal.js and the presentation are not the editor's to carry at start.
      void import("../present/start.ts")
        .then(({ presentDeck }) => presentDeck(session, host, from, options))
        .catch((error: unknown) => tell(`Presenting failed: ${error instanceof Error ? error.message : String(error)}`));
    },
    print(options) {
      void session.exports.print(options).catch((error: unknown) => tell(`Printing failed: ${error instanceof Error ? error.message : String(error)}`));
    },
    png(options) {
      void hand(() => session.exports.png(options));
    },
    exportAs(format) {
      if (format === "pptx") void hand(() => session.exports.pptx());
      else if (format === "markdown") void hand(() => session.exports.markdown());
      else if (format === "html") void hand(() => session.exports.html());
      else tell(`Export as ${format} is not available here yet.`);
    },
  };
}
