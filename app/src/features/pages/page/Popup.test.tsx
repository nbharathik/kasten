import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { Popup } from "./Popup";

function Opener() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={button} type="button" onClick={() => setOpen((o) => !o)}>
        Open
      </button>
      {open && (
        <Popup label="Pick one" anchor={button} onClose={() => setOpen(false)}>
          <button type="button">First</button>
          <button type="button">Last</button>
        </Popup>
      )}
    </>
  );
}

afterEach(cleanup);

describe("a popup", () => {
  it("takes the focus, keeps Tab inside and gives the focus back", () => {
    render(<Opener />);
    const open = screen.getByRole("button", { name: "Open" });
    open.focus();
    fireEvent.click(open);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
    screen.getByRole("button", { name: "Last" }).focus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Pick one" })).toBeNull();
    expect(document.activeElement).toBe(open);
  });
});
