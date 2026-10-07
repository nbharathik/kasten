import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dayFrom } from "../lib/dates";
import { MemoryVault } from "../features/workspace/preview/memory-vault";
import { CaptureBox, type CaptureHost } from "./CaptureBox";

let vault: MemoryVault;
let hide: ReturnType<typeof vi.fn<() => void>>;
let done: ReturnType<typeof vi.fn<CaptureHost["done"]>>;
let host: CaptureHost;

beforeEach(() => {
  localStorage.clear();
  vault = new MemoryVault({
    "projects/trip/trip.md": "---\ntitle: Trip\ntype: project\n---\n",
    "templates/journal.md": '---\ntitle: "{{date}}"\ntype: journal\n---\n',
  });
  hide = vi.fn<() => void>();
  done = vi.fn<CaptureHost["done"]>();
  host = { client: vault, hide, done, onOpen: () => () => {} };
});
afterEach(cleanup);

const box = () => screen.getByRole("textbox", { name: "Quick capture" });
const type = (text: string) => fireEvent.change(box(), { target: { value: text } });
const press = (key: string, extra: Record<string, boolean> = {}) => act(async () => void fireEvent.keyDown(box(), { key, ...extra }));

describe("the quick capture box", () => {
  it("saves to the inbox with Enter and tells the main window", async () => {
    render(<CaptureBox host={host} />);
    type("Call the plumber\nabout the sink");
    await press("Enter");
    await waitFor(() => expect(done).toHaveBeenCalled());
    const captured = done.mock.calls[0]![0];
    expect(captured.place).toBe("Inbox");
    expect((await vault.read(captured.path)).text).toContain("about the sink");
    expect((box() as HTMLTextAreaElement).value).toBe("");
  });

  it("goes to today's journal after one Tab", async () => {
    render(<CaptureBox host={host} />);
    type("Felt good about the plan");
    await press("Tab");
    expect(screen.getByRole("button", { name: /Save to Today's journal/ })).toBeTruthy();
    await press("Enter");
    await waitFor(() => expect(done).toHaveBeenCalled());
    const day = await vault.journal(dayFrom(0));
    expect(day.text).toContain("Felt good about the plan");
  });

  it("hides with Esc and keeps the draft for next time", async () => {
    const first = render(<CaptureBox host={host} />);
    type("Half a thought");
    await press("Escape");
    expect(hide).toHaveBeenCalled();
    first.unmount();
    render(<CaptureBox host={host} />);
    expect((box() as HTMLTextAreaElement).value).toBe("Half a thought");
  });

  it("keeps Shift+Enter for a new line", async () => {
    render(<CaptureBox host={host} />);
    type("Line one");
    await press("Enter", { shiftKey: true });
    expect(done).not.toHaveBeenCalled();
  });
});
