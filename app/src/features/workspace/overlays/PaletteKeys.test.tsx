// The palette says which row is chosen to screen readers, as the arrows
// move it, and offers the searches run lately when it opens empty.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryVault } from "../preview/memory-vault";
import { derive } from "../store-layout";
import { useWorkspace } from "../store";
import { initialLayout } from "../tabs";
import { Palette } from "./Palette";
import { keepSearch } from "./palette-rows";

beforeEach(async () => {
  localStorage.clear();
  const vault = new MemoryVault({
    "library/kiln.md": "---\ntitle: Kiln firing\n---\nStoneware to cone six.\n",
    "library/glaze.md": "---\ntitle: Glaze recipes\n---\nA stoneware glaze.\n",
  });
  useWorkspace.setState({ client: vault, ready: true, notes: await vault.list(), ...derive(initialLayout()), stack: [], recent: [], toasts: [] });
});
afterEach(cleanup);

const input = () => screen.getByRole("textbox", { name: "Search" });

describe("the palette", () => {
  it("names the chosen row as the arrows move it", () => {
    render(<Palette />);
    const options = screen.getAllByRole("option");
    expect(input().getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id);
    expect(input().getAttribute("aria-activedescendant")).toBe(options[0]!.id);
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-activedescendant")).toBe(options[1]!.id);
  });

  it("finds a page by its words' first letters or with a typo", () => {
    render(<Palette />);
    fireEvent.change(input(), { target: { value: "kf" } });
    expect(screen.getAllByRole("option")[0]!.textContent).toContain("Kiln firing");
    fireEvent.change(input(), { target: { value: "galze" } });
    expect(screen.getAllByRole("option")[0]!.textContent).toContain("Glaze recipes");
  });

  it("offers recent searches again, and keeps one that was run", () => {
    keepSearch("stoneware");
    render(<Palette />);
    fireEvent.click(screen.getByRole("option", { name: /stoneware.*Recent search/ }));
    expect(input()).toHaveProperty("value", "stoneware");
    fireEvent.change(input(), { target: { value: "glaze" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(JSON.parse(localStorage.getItem("kasten.palette.searches")!)).toEqual(["glaze", "stoneware"]);
  });
});
