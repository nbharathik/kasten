// Commands for steps: the builds, and the keys that step the preview.

import { buildScope } from "../session/steps.ts";
import type { Command } from "./types.ts";

/** How many steps the slide on the canvas has. */
const stepsOf = (state: { deck: { slides: { id: string; steps?: number }[] }; slideId: string }): number => state.deck.slides.find((s) => s.id === state.slideId)?.steps ?? 0;

/** Steps: building them, and looking at them on the canvas. */
export const stepsCommands: Command[] = [
  {
    id: "steps.reveal",
    label: "Steps: reveal one by one",
    icon: "list",
    enabled: (s) => buildScope(s).length > 0,
    run: ({ session }) => void session.steps.build("reveal"),
  },
  {
    id: "steps.walkthrough",
    label: "Steps: walk through",
    icon: "highlighter",
    enabled: (s) => buildScope(s).length > 0,
    run: ({ session }) => void session.steps.build("walkthrough"),
  },
  {
    id: "steps.spotlight",
    label: "Steps: spotlight",
    icon: "eye",
    enabled: (s) => buildScope(s).length > 1,
    run: ({ session }) => void session.steps.build("spotlight"),
  },
  {
    id: "steps.clear",
    label: "Steps: clear",
    icon: "x",
    enabled: (s) => buildScope(s, "clear").length > 0,
    run: ({ session }) => void session.steps.build("clear"),
  },
  {
    id: "steps.next",
    label: "Next step",
    icon: "chevron-right",
    keys: ["Alt+]"],
    scope: "global",
    enabled: (s) => stepsOf(s) > 0,
    // From the slide as it is styled, the first step is how it appears.
    run: ({ session, ui }) => ui.setPreviewStep(Math.min((ui.state.previewStep ?? -1) + 1, stepsOf(session.state))),
  },
  {
    id: "steps.previous",
    label: "Previous step",
    icon: "chevron-left",
    keys: ["Alt+["],
    scope: "global",
    enabled: (s) => stepsOf(s) > 0,
    // From the slide as it is styled, going back shows the last.
    run: ({ session, ui }) => ui.setPreviewStep(Math.max((ui.state.previewStep ?? stepsOf(session.state) + 1) - 1, 0)),
  },
];
