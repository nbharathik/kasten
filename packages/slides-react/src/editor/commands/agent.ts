// Commands for an assistant's work: accepting it, which takes the badge off.

import { markedAmong, pendingIn } from "../agent/marks.ts";
import type { Command } from "./types.ts";

export const agentCommands: Command[] = [
  {
    id: "agent.accept",
    label: "Accept",
    icon: "check",
    enabled: (s) => {
      const slide = s.deck.slides.find((x) => x.id === s.slideId);
      return slide !== undefined && markedAmong(slide, s.selection).length > 0;
    },
    run: ({ session }) => void session.marks.accept(),
  },
  {
    id: "agent.accept-all",
    label: "Accept all changes by the assistant",
    icon: "circle-check",
    enabled: (s) => pendingIn(s.deck) > 0,
    run: ({ session }) => void session.marks.acceptAll(),
  },
];
