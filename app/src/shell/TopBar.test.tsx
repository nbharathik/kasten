import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useSources } from "../features/sources/store";
import { PRIMER, sampleVault } from "../features/sources/test-kit";
import { useWorkspace } from "../features/workspace/store";
import { TopBar } from "./TopBar";

const bar = () => render(<TopBar pane={useWorkspace.getState().layout.panes[0]!} first />);

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("the top bar", () => {
  it("shows a PDF in the reader under Highlights, the way back to them all", async () => {
    await sampleVault();
    await useSources.getState().loadList();
    useWorkspace.getState().go({ view: "highlights", path: PRIMER });
    bar();
    expect(screen.getByText("A Zettelkasten primer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Highlights" }));
    expect(useWorkspace.getState().place).toEqual({ view: "highlights" });
  });

  it("names a view with nothing open in it", async () => {
    await sampleVault();
    useWorkspace.getState().go({ view: "highlights" });
    bar();
    expect(screen.getByText("Highlights")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Highlights" })).toBeNull();
  });
});
