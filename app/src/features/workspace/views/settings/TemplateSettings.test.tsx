// Settings → Templates chooses the template new journal days start from,
// kept in the vault's config; the preview makes days from it as the core does.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryVault } from "../../preview/memory-vault";
import { useWorkspace } from "../../store";
import { TemplateSettings } from "./TemplateSettings";

let vault: MemoryVault;

beforeEach(async () => {
  localStorage.clear();
  vault = new MemoryVault({
    "templates/journal.md": '---\ntitle: "{{date}}"\ntype: journal\n---\n## Today\n',
    "templates/daily-planner.md": '---\ntitle: Daily planner\n---\n## Top three\n',
  });
  await useWorkspace.getState().connect({ client: vault });
});
afterEach(cleanup);

describe("the journal's template", () => {
  it("is chosen in Settings, and new days start from it", async () => {
    render(<TemplateSettings />);
    const pick = (await screen.findByRole("combobox", { name: "Journal days start from" })) as HTMLSelectElement;
    expect(pick.value).toBe("journal");
    expect([...pick.options].map((o) => o.value).sort()).toEqual(["daily-planner", "journal"]);
    expect([...pick.options].find((o) => o.value === "journal")!.textContent).toContain("(the usual)");
    await act(async () => fireEvent.change(pick, { target: { value: "daily-planner" } }));
    expect((await vault.getConfig()).journal_template).toBe("daily-planner");
    expect((await vault.journal("2026-10-05")).text).toContain("## Top three");

    await act(async () => fireEvent.change(pick, { target: { value: "journal" } }));
    expect((await vault.getConfig()).journal_template).toBeNull();
    expect((await vault.journal("2026-10-06")).text).toContain("## Today");
  });
});
