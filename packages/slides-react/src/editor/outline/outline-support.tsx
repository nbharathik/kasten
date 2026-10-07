// What the tests of the outline share: an outline on a deck, and ways to read and drive it.

import type { Paragraph, Text } from "@kasten-slides/wasm";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { type DeckOptions, idsOf, openDeck } from "../filmstrip/test-support.ts";
import { OutlineView } from "./OutlineView.tsx";

export const words = (text: Text | undefined) => (text?.paragraphs ?? []).map((paragraph) => paragraph.runs.map((run) => run.t).join(""));
export const p = (t: string, extra: Partial<Paragraph> = {}): Paragraph => ({ runs: [{ t }], ...extra });

export async function setup(options: DeckOptions = {}) {
  const made = await openDeck(options);
  vi.useFakeTimers();
  const view = render(
    <div className="ks-editor">
      <OutlineView session={made.session} ui={made.ui} />
    </div>,
  );
  const ids = idsOf(made.session);
  /** The text of the element in a slot of a slide, as it is in the deck now. */
  const slot = (place: number, role: string) => {
    const element = made.session.deck.slides[place]!.elements.find((e) => e.placeholder === role);
    return element && "text" in element ? (element.text as Text | undefined) : undefined;
  };
  return { ...made, ...view, ids, slot };
}

export const title = (n: number) => screen.getByLabelText(`Title of slide ${n}`) as HTMLInputElement;
export const body = (n: number) => screen.getByLabelText(`Text of slide ${n}`) as HTMLTextAreaElement;
export const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });
export const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
