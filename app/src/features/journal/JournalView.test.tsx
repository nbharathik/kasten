import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { dayFrom, longDay } from "../../lib/dates";
import { useShell } from "../../lib/store";
import { AppShell } from "../../shell/AppShell";
import { MemoryVault } from "../workspace/preview/memory-vault";
import { loadNotePage } from "../workspace/page/LazyNotePage";
import { useWorkspace } from "../workspace/store";
import { derive } from "../workspace/store-layout";
import { initialLayout } from "../workspace/tabs";
import { journalPath } from "./feed";

const today = dayFrom(0);
const yesterday = dayFrom(-1);
const twoDaysAgo = dayFrom(-2);

// Journal interactions begin once the lazily loaded editor is available.
beforeAll(async () => { await loadNotePage(); }, 60_000);

const SEED = {
  "templates/journal.md": '---\ntitle: "{{date}}"\ntype: journal\n---\n',
  [journalPath(twoDaysAgo)]: `---\ntitle: "${twoDaysAgo}"\ntype: journal\n---\nWalked by the river.\n`,
  "tags/task.yaml": "name: task\ncolor: green\nproperties:\n  - {key: due, type: date}\n",
  "library/ship.md": `---\ntitle: Ship the release\ntags: [task]\nprops:\n  due: ${today}\n---\nSoon.\n`,
};

let vault: MemoryVault;

beforeEach(() => {
  localStorage.clear();
  vault = new MemoryVault(SEED);
  useWorkspace.setState({ client: null, ready: false, notes: [], ...derive(initialLayout()), stack: [], stackOpen: false, recent: ["library/ship.md"], toasts: [] });
  useShell.setState({ sidebarOpen: true, paletteOpen: false, gallery: null });
});
afterEach(cleanup);

async function openJournal() {
  render(<AppShell connect={async () => ({ client: vault })} />);
  const sidebar = await screen.findByRole("navigation", { name: "Sidebar" });
  await act(async () => fireEvent.click(within(sidebar).getByRole("button", { name: /^Journal/ })));
  return screen.findByRole("complementary", { name: "Days" });
}

const exists = async (day: string) => (await vault.list()).some((n) => n.path === journalPath(day));
const row = (days: HTMLElement, day: string) => days.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)!;

describe("journal", () => {
  it("shows today as a full page, with every earlier day listed beside it", async () => {
    const days = await openJournal();
    const title = (await screen.findByRole("textbox", { name: "Page title" }, { timeout: 20_000 })) as HTMLTextAreaElement;
    expect(title.value).toBe(longDay(today));
    // Today's page is made on opening the journal; other days are not.
    await expect.poll(() => exists(today)).toBe(true);
    expect(await exists(yesterday)).toBe(false);
    expect(row(days, today).getAttribute("aria-current")).toBe("date");
    expect(row(days, yesterday).textContent).toContain("No entry");
    expect(row(days, yesterday).classList.contains("is-empty")).toBe(true);
    expect(row(days, twoDaysAgo).textContent).toContain("Walked by the river.");
  });

  it("opens an earlier day from the list, makes its page only on writing, and goes back", async () => {
    const days = await openJournal();
    await act(async () => fireEvent.click(row(days, yesterday)));
    expect(useWorkspace.getState().place).toEqual({ view: "journal", path: journalPath(yesterday) });
    expect(await screen.findByText("Nothing was written on this day.")).toBeTruthy();
    expect(await exists(yesterday)).toBe(false);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Write in this day" })));
    await expect.poll(() => exists(yesterday)).toBe(true);
    // Back returns to the day before, as the mouse's back button does.
    await act(async () => useWorkspace.getState().goBack());
    expect(useWorkspace.getState().place.path ?? journalPath(today)).toBe(journalPath(today));
  });

  it("folds what else happened that day into one toggle", async () => {
    await openJournal();
    const toggle = await screen.findByRole("button", { name: /On this day/ }, { timeout: 20_000 });
    await expect.poll(() => toggle.textContent).toContain("1 due");
    const footer = screen.getByRole("contentinfo", { name: "About this page" });
    expect(footer.textContent).not.toContain("Ship the release");
    await act(async () => fireEvent.click(toggle));
    const strip = screen.getByLabelText("On this day");
    const due = within(strip).getByText("Due").parentElement!;
    expect(within(due).getByRole("button", { name: /Ship the release/ })).toBeTruthy();
  });

  it("shows a trip under way as Ongoing with its day, not under Due", async () => {
    vault = new MemoryVault({
      ...SEED,
      "tags/travel.yaml": "name: travel\ncolor: teal\nproperties:\n  - {key: start, type: date}\n  - {key: end, type: date}\n",
      "library/seaside.md": `---\ntitle: Seaside trip\nicon: ✈️\ntags: [travel]\nprops:\n  start: ${yesterday}\n  end: ${dayFrom(3)}\n---\nPastéis de nata.\n`,
    });
    await openJournal();
    const toggle = await screen.findByRole("button", { name: /On this day/ }, { timeout: 20_000 });
    await expect.poll(() => toggle.textContent).toContain("1 ongoing");
    await act(async () => fireEvent.click(toggle));
    const strip = screen.getByLabelText("On this day");
    const ongoing = within(strip).getByText("Ongoing").parentElement!;
    const chip = await within(ongoing).findByRole("button", { name: "Seaside trip · day 2 of 5" });
    expect(chip.textContent).toBe("✈️Seaside trip · day 2 of 5");
    const due = within(strip).getByText("Due").parentElement!;
    expect(within(due).queryByRole("button", { name: /Seaside/ })).toBeNull();
    expect(strip.firstElementChild).toBe(ongoing);
  });

  it("jumps to a day from the month, which marks days with pages", async () => {
    const days = await openJournal();
    await act(async () => fireEvent.click(within(days).getByRole("button", { name: "Go to a day" })));
    const month = await screen.findByRole("region", { name: "Month" });
    expect(month.querySelector(`[data-day="${today}"]`)?.getAttribute("aria-current")).toBe("date");
    if (twoDaysAgo.slice(0, 7) !== today.slice(0, 7)) await act(async () => fireEvent.click(within(month).getByRole("button", { name: "Previous month" })));
    const button = month.querySelector<HTMLButtonElement>(`[data-day="${twoDaysAgo}"]`)!;
    expect(button.getAttribute("aria-label")).toContain("journal page");
    await act(async () => fireEvent.click(button));
    expect(useWorkspace.getState().place).toEqual({ view: "journal", path: journalPath(twoDaysAgo) });
    expect(screen.queryByRole("region", { name: "Month" })).toBeNull();
  });
});

describe("the journal past midnight", () => {
  afterEach(() => vi.useRealTimers());
  // A month back, clear of the days the seed writes (today and the two
  // before it), whatever the date the tests run on.
  const eve = dayFrom(-30);
  const next = dayFrom(-29);
  const at = (day: string, hour: number, minute: number) => {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y!, m! - 1, d!, hour, minute);
  };

  it("stays on the day it opened on while it is being written in", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at(eve, 23, 59));
    await openJournal();
    const title = (await screen.findByRole("textbox", { name: "Page title" }, { timeout: 20_000 })) as HTMLTextAreaElement;
    expect(title.value).toBe(longDay(eve));
    // Midnight passes, and something redraws the journal.
    vi.setSystemTime(at(next, 0, 1));
    await vault.create({ kind: "page", title: "Late thought", date: next });
    await act(() => useWorkspace.getState().refresh());
    await act(async () => new Promise((done) => setTimeout(done, 50)));
    expect((screen.getByRole("textbox", { name: "Page title" }) as HTMLTextAreaElement).value).toBe(longDay(eve));
    expect(await exists(next)).toBe(false);
  });
});
