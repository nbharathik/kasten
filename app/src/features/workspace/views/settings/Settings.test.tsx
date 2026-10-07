import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetChat, scriptedChat } from "../../../chat/test-kit";
import { SECTIONS, sectionId } from "./sections";
import { Settings } from "./Settings";

beforeEach(() => {
  localStorage.clear();
  resetChat(scriptedChat([]));
});
afterEach(cleanup);

describe("Settings", () => {
  it("lists every group beside the page, each with an anchor that exists", async () => {
    render(<Settings />);
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([...SECTIONS]);
    for (const title of SECTIONS) {
      const section = await screen.findByRole("region", { name: title });
      expect(section.id).toBe(sectionId(title));
      expect(within(nav).getByRole("link", { name: title }).getAttribute("href")).toBe(`#${sectionId(title)}`);
    }
  });

  it("scrolls to a group when its name is clicked, and marks it as the current one", async () => {
    render(<Settings />);
    const section = await screen.findByRole("region", { name: "History and backup" });
    const scroll = vi.spyOn(section, "scrollIntoView");
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    const link = within(nav).getByRole("link", { name: "History and backup" });
    await act(async () => fireEvent.click(link));
    expect(scroll).toHaveBeenCalledWith({ block: "start" });
    expect(link.getAttribute("aria-current")).toBe("true");
    expect(within(nav).getByRole("link", { name: "Appearance" }).getAttribute("aria-current")).toBeNull();
  });

  it("gives each group an id from its title", () => {
    expect(sectionId("AI providers")).toBe("settings-ai-providers");
    expect(sectionId("History and backup")).toBe("settings-history-and-backup");
  });
});
