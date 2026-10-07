// A dialog is a place of its own for the keys and for selecting text: it keeps the focus, closes on Escape from wherever the person
// clicked, and Ctrl+A selects its words, not the page behind it.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Dialog } from "../ui/Dialog.tsx";

afterEach(cleanup);

const selected = () => window.getSelection()?.toString().replace(/\s+/g, " ").trim() ?? "";

function open(body = <p>Nothing is wrong with this deck.</p>, footer = <button type="button">Close</button>) {
  const onClose = vi.fn();
  render(
    <div>
      <p>Text of the page behind</p>
      <Dialog title="Lint" onClose={onClose} footer={footer}>
        {body}
      </Dialog>
    </div>,
  );
  return { onClose, box: screen.getByRole("dialog") };
}

describe("the focus of a dialog", () => {
  it("goes to the first thing that can take it", () => {
    const { box } = open(<input aria-label="Search" />);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Search" }));
    expect(box.contains(document.activeElement)).toBe(true);
  });

  it("goes to the dialog itself when the only candidate cannot take it yet (a disabled button), so Escape still closes it", () => {
    const { onClose, box } = open(
      <button type="button" data-autofocus="" disabled>
        Checking…
      </button>,
      <p>No footer button</p>,
    );
    expect(document.activeElement).toBe(box);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays in the dialog when text in it is pressed, since the dialog can take the focus", () => {
    const { box } = open();
    expect(box.tabIndex).toBe(-1);
  });
});

describe("Ctrl+A in a dialog", () => {
  it("selects the words of the dialog, and only those", () => {
    const { box } = open();
    fireEvent.keyDown(box, { key: "a", code: "KeyA", ctrlKey: true });
    const words = selected();
    expect(words).toContain("Nothing is wrong with this deck.");
    expect(words).not.toContain("Text of the page behind");
    expect(box.contains(window.getSelection()?.getRangeAt(0).commonAncestorContainer ?? null)).toBe(true);
  });

  it("is prevented, so the browser does not select the page instead", () => {
    const { box } = open();
    expect(fireEvent.keyDown(box, { key: "a", code: "KeyA", ctrlKey: true })).toBe(false);
  });

  it("is left to a field of the dialog, which selects its own text", () => {
    open(<input aria-label="Search" defaultValue="tools" />);
    const field = screen.getByRole("textbox", { name: "Search" });
    expect(fireEvent.keyDown(field, { key: "a", code: "KeyA", ctrlKey: true })).toBe(true);
  });

  it("does not answer with Shift or Alt, which are other keys", () => {
    const { box } = open();
    expect(fireEvent.keyDown(box, { key: "A", code: "KeyA", ctrlKey: true, shiftKey: true })).toBe(true);
    expect(fireEvent.keyDown(box, { key: "a", code: "KeyA", ctrlKey: true, altKey: true })).toBe(true);
  });
});
