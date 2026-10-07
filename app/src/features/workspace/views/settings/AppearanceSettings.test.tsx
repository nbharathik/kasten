// Settings → Appearance → Motion: the choice is kept, and the window
// follows it at once.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { usePrefs } from "../../prefs";
import { AppearanceSettings } from "./AppearanceSettings";

afterEach(() => {
  cleanup();
  usePrefs.getState().set({ motion: "system" });
  delete document.documentElement.dataset.motion;
});

describe("Motion", () => {
  it("is kept, and switches the window's motion off and on", async () => {
    render(<AppearanceSettings />);
    const motion = screen.getByRole("radiogroup", { name: "Motion" });
    expect(within(motion).getByRole("radio", { name: "System" }).getAttribute("aria-checked")).toBe("true");

    await act(async () => fireEvent.click(within(motion).getByRole("radio", { name: "Off" })));
    expect(document.documentElement.dataset.motion).toBe("off");
    expect(JSON.parse(localStorage.getItem("kasten.prefs")!).motion).toBe("off");
    expect(within(motion).getByRole("radio", { name: "Off" }).getAttribute("aria-checked")).toBe("true");

    await act(async () => fireEvent.click(within(motion).getByRole("radio", { name: "On" })));
    expect(document.documentElement.dataset.motion).toBe("on");
  });
});
