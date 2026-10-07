// Commands for lint: the Lint dialog, from the Tools menu, and the badges on the filmstrip, from the View menu. Lint speaks only when
// asked: the badges are off until the person turns them on.

import type { Command } from "./types.ts";

export const lintCommands: Command[] = [
  {
    id: "lint.open",
    label: "Lint",
    icon: "circle-check",
    run: ({ ui }) => ui.openDialog("lint"),
  },
  {
    id: "lint.badges",
    label: "Lint badges",
    icon: "triangle-alert",
    checked: (_, ui) => ui.lintBadges,
    run: ({ ui }) => ui.toggleLintBadges(),
  },
];
