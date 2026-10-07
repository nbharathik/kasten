// Commands for importing: slides from a PowerPoint file.

import type { Command } from "./types.ts";

export const importingCommands: Command[] = [
  {
    id: "file.import-pptx",
    label: "Import slides from PowerPoint…",
    icon: "file-plus",
    run: ({ ui }) => ui.openDialog("import"),
  },
];
