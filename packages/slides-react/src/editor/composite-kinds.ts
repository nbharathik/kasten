// The nine kinds of composite element, as the editor offers them: what each is
// called, how big it starts, and what it holds when it is first made.

import type { Element } from "@kasten-slides/wasm";

import type { Corner } from "./placement.ts";
import type { IconName } from "./ui/icons.ts";

export type CompositeKind = "code" | "math" | "chat" | "token-probs" | "card-grid" | "citation" | "step-label" | "embed" | "video";

/** Every composite kind, in the order the Insert menu lists them. */
export const COMPOSITE_TYPES: readonly CompositeKind[] = ["code", "math", "chat", "token-probs", "card-grid", "citation", "step-label", "embed", "video"];

export interface CompositeSpec {
  kind: CompositeKind;
  /** What the Insert menu and the format panel call it. */
  label: string;
  icon: IconName;
  /** How big it starts, in slide units. */
  size: { w: number; h: number };
  /** Other words a person may look for it by. */
  keywords: readonly string[];
  /** Kinds that cannot be made without an address, a file or a choice say which dialog asks for it. */
  asks?: "embed" | "video" | "citation";
  /** A small kind that belongs at the edge of the slide goes in this corner, if it is free. */
  corner?: Corner;
}

export const COMPOSITES: readonly CompositeSpec[] = [
  { kind: "code", label: "Code block", icon: "code", size: { w: 640, h: 240 }, keywords: ["source", "program", "syntax", "snippet", "programming"] },
  { kind: "math", label: "Formula", icon: "sigma", size: { w: 480, h: 120 }, keywords: ["equation", "latex", "katex", "maths", "math"] },
  { kind: "chat", label: "Conversation", icon: "message-square", size: { w: 640, h: 340 }, keywords: ["chat", "messages", "dialogue", "prompt", "llm"] },
  { kind: "token-probs", label: "Token probabilities", icon: "chart-no-axes-column", size: { w: 640, h: 340 }, keywords: ["tokens", "next word", "logits", "llm", "bars"] },
  { kind: "card-grid", label: "Card grid", icon: "layout-dashboard", size: { w: 840, h: 230 }, keywords: ["cards", "tiles", "boxes"] },
  { kind: "citation", label: "Citation…", icon: "quote", size: { w: 360, h: 32 }, keywords: ["reference", "bibliography", "cite", "bibtex", "paper", "source"], corner: "bottom-left", asks: "citation" },
  { kind: "step-label", label: "Step label", icon: "captions", size: { w: 140, h: 32 }, keywords: ["step", "counter", "progress"], corner: "bottom-right" },
  { kind: "embed", label: "Embedded page…", icon: "globe", size: { w: 640, h: 360 }, keywords: ["web page", "website", "iframe", "url", "live"], asks: "embed" },
  { kind: "video", label: "Video…", icon: "film", size: { w: 640, h: 360 }, keywords: ["movie", "clip", "mp4", "media"], asks: "video" },
];

export const compositeSpec = (kind: CompositeKind): CompositeSpec => COMPOSITES.find((spec) => spec.kind === kind) as CompositeSpec;

/** Whether an element's type is one of the nine. */
export const isCompositeType = (type: string): type is CompositeKind => (COMPOSITE_TYPES as readonly string[]).includes(type);

/** What an embedded page or a video is made from. */
export interface Source {
  /** The address of the page, or of the video (or the name of a file the host holds). */
  address?: string;
  /** What a page is called. */
  title?: string;
}

const PYTHON = ["def fib(n):", "    a, b = 0, 1", "    for _ in range(n):", "        a, b = b, a + b", "    return a", "print(fib(10))"].join("\n");

/**
 * A new composite of a kind, filled with something to look at and then change,
 * without an id (the engine gives it one) or a box (the caller places it).
 */
export function newComposite(kind: CompositeKind, { address = "", title }: Source = {}): Element {
  switch (kind) {
    case "code":
      return { type: "code", id: "", language: "python", code: PYTHON, theme: "dark" } as Element;
    case "math":
      return { type: "math", id: "", latex: "E = mc^2" } as Element;
    case "chat":
      return {
        type: "chat",
        id: "",
        messages: [
          { role: "system", text: "You are a helpful assistant." },
          { role: "user", text: "What is the capital of France?" },
          { role: "assistant", text: "The capital of France is Paris." },
        ],
      } as Element;
    case "token-probs":
      return {
        type: "token-probs",
        id: "",
        tokens: ["The", " cat", " sat", " on", " the"],
        next: [
          { token: " mat", p: 0.42 },
          { token: " floor", p: 0.3 },
          { token: " sofa", p: 0.14 },
          { token: " bed", p: 0.09 },
          { token: " roof", p: 0.05 },
        ],
        chosen: 0,
      } as Element;
    case "card-grid":
      return {
        type: "card-grid",
        id: "",
        cards: [
          { title: "Plan", body: "Break the goal into steps." },
          { title: "Act", body: "Call a tool with an input." },
          { title: "Observe", body: "Read what came back." },
        ],
      } as Element;
    case "citation":
      return { type: "citation", id: "", keys: [] } as Element;
    case "step-label":
      return { type: "step-label", id: "" } as Element;
    case "embed":
      return { type: "embed", id: "", url: address, ...(title ? { title } : {}) } as Element;
    case "video":
      return { type: "video", id: "", src: address } as Element;
  }
}
