import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mountDialogs } from "./test-kit.tsx";

afterEach(cleanup);

const button = (name: string) => screen.getByRole("button", { name });

describe("Save as PNG pictures", () => {
  it("saves every slide once, at twice the size, unless told otherwise", async () => {
    const png = vi.fn();
    const kit = await mountDialogs({ dialog: "png" });
    act(() => void (kit.ui.actions = { png }));
    fireEvent.click(button("Save"));
    expect(png).toHaveBeenCalledWith({ scope: "all", scale: 2, steps: "final" });
    expect(kit.ui.state.dialog).toBeNull();
  });

  it("takes the choices made", async () => {
    const png = vi.fn();
    const kit = await mountDialogs({ dialog: "png" });
    act(() => void (kit.ui.actions = { png }));
    fireEvent.click(screen.getByRole("radio", { name: "Only the slide being edited" }));
    fireEvent.click(screen.getByRole("radio", { name: "Four pixels to a unit: 3840 pixels wide" }));
    fireEvent.click(screen.getByRole("radio", { name: "A picture for every step of a slide that has steps" }));
    fireEvent.click(button("Save"));
    expect(png).toHaveBeenCalledWith({ scope: "current", scale: 4, steps: "each" });
  });

  it("says how large the pictures will be", async () => {
    await mountDialogs({ dialog: "png" });
    expect(screen.getByText("1920 × 1080 pixels")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "One pixel to a unit: 960 pixels wide" }));
    expect(screen.getByText("960 × 540 pixels")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Four pixels to a unit: 3840 pixels wide" }));
    expect(screen.getByText("3840 × 2160 pixels")).toBeTruthy();
  });

  it("cannot save where the host cannot", async () => {
    await mountDialogs({ dialog: "png" });
    expect(button("Save").hasAttribute("disabled")).toBe(true);
  });

  it("can be cancelled", async () => {
    const png = vi.fn();
    const kit = await mountDialogs({ dialog: "png" });
    act(() => void (kit.ui.actions = { png }));
    fireEvent.click(button("Cancel"));
    expect(png).not.toHaveBeenCalled();
    expect(kit.ui.state.dialog).toBeNull();
  });
});
