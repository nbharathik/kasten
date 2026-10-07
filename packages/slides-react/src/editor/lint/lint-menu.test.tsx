import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { COMMANDS } from "../commands/index.ts";
import { MenuBar } from "../menus/MenuBar.tsx";
import { bar, click, openEditor, row } from "../menus/testing.ts";

afterEach(cleanup);

describe("Lint in the Tools menu", () => {
  it("opens the Lint dialog", async () => {
    const { session, ui } = await openEditor();
    render(<MenuBar session={session} ui={ui} />);
    click(bar("Tools"));
    expect(row(/^Find and replace/)).toBeTruthy();
    fireEvent.click(row(/^Lint/));
    expect(ui.state.dialog).toBe("lint");
  });

  it("is a command of its own, with no key that could take one from another command", () => {
    const command = COMMANDS.get("lint.open");
    expect(command?.label).toBe("Lint");
    expect(command?.keys).toBeUndefined();
  });
});
