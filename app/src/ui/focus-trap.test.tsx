import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Modal } from "./Modal";

afterEach(cleanup);

describe("a modal dialog", () => {
  it("keeps Tab going round inside it", () => {
    render(
      <>
        <button type="button">Behind</button>
        <Modal label="Pick" onClose={() => {}}>
          <button type="button">First</button>
          <button type="button" disabled>
            Off
          </button>
          <button type="button">Last</button>
        </Modal>
      </>,
    );
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    // A Tab something inside took, such as an editor's, is left alone.
    first.focus();
    const taken = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    taken.preventDefault();
    first.dispatchEvent(taken);
    expect(document.activeElement).toBe(first);
  });
});
