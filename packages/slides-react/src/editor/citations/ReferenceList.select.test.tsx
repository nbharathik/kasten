// The works in the list are for choosing, and their words are for copying: a press on the words can start a selection, a click still
// chooses, and a drag that selected words is not a choice.

import type { Reference } from "@kasten-slides/wasm";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReferenceList } from "./ReferenceList.tsx";

afterEach(() => {
  cleanup();
  window.getSelection()?.removeAllRanges();
});

const works = [
  { key: "vaswani2017attention", short: "Vaswani et al., 2017", title: "Attention is all you need", full: "Vaswani et al. Attention is all you need. 2017." },
  { key: "lecun2015deep", short: "LeCun et al., 2015", title: "Deep learning", full: "LeCun et al. Deep learning. 2015." },
] as unknown as Reference[];

function open() {
  const onToggle = vi.fn();
  render(<ReferenceList works={works} chosen={new Set()} onToggle={onToggle} label="References" />);
  const search = screen.getByRole("combobox");
  const option = (name: RegExp) => screen.getByRole("option", { name });
  return { onToggle, search, option };
}

/** A press that a browser would let start a selection is one nobody called preventDefault on. */
const pressed = (target: Element) => fireEvent.mouseDown(target);

describe("pressing a work in the list", () => {
  it("lets the words start a selection: the words and the key are not held back by the list", () => {
    const { option } = open();
    const row = option(/Vaswani/);
    expect(pressed(row.querySelector(".ks-rl-who")!)).toBe(true);
    expect(pressed(row.querySelector(".ks-rl-title")!)).toBe(true);
    expect(pressed(row.querySelector(".ks-rl-key")!)).toBe(true);
  });

  it("keeps the focus in the search box when the press is anywhere else in the row", () => {
    const { option } = open();
    const row = option(/Vaswani/);
    expect(pressed(row)).toBe(false);
    expect(pressed(row.querySelector(".ks-rl-tick")!)).toBe(false);
  });

  it("chooses on a click, and puts the focus back in the search box for the arrow keys", () => {
    const { option, onToggle, search } = open();
    const row = option(/LeCun/);
    (row.querySelector(".ks-rl-title") as HTMLElement).focus();
    fireEvent.click(row.querySelector(".ks-rl-title")!);
    expect(onToggle).toHaveBeenCalledWith("lecun2015deep");
    expect(document.activeElement).toBe(search);
  });

  it("does not choose when the click ended a drag that selected words of the row", () => {
    const { option, onToggle } = open();
    const row = option(/Vaswani/);
    const words = row.querySelector(".ks-rl-who")!.firstChild!;
    window.getSelection()?.setBaseAndExtent(words, 0, words, 7);
    fireEvent.click(row.querySelector(".ks-rl-who")!);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("still chooses when the words selected are somewhere else", () => {
    const { option, onToggle } = open();
    const elsewhere = document.body.appendChild(document.createElement("p"));
    elsewhere.textContent = "Some other words";
    window.getSelection()?.setBaseAndExtent(elsewhere.firstChild!, 0, elsewhere.firstChild!, 4);
    fireEvent.click(option(/Vaswani/));
    expect(onToggle).toHaveBeenCalledWith("vaswani2017attention");
    elsewhere.remove();
  });
});
