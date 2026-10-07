import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import type { Proposal, VaultEvents } from "../../lib/vault/types";
import { MemoryVault } from "../workspace/preview/memory-vault";
import { useWorkspace } from "../workspace/store";
import { POLL_MS, usePendingCount, useReview } from "./store";

const waiting = (id: string, created: string, status: Proposal["status"] = "pending"): Proposal => ({
  id,
  created,
  session: "S",
  client: "claude-code",
  status,
  op: { kind: "trash", path: "a.md" },
  target: null,
  reason: "",
  note: null,
  diff: "",
  before: null,
  after: null,
  decided: null,
  decidedBy: null,
});

function Badge() {
  return <span data-testid="count">{usePendingCount()}</span>;
}

let vault: MemoryVault;
let read: MockInstance<() => Promise<Proposal[]>>;
let visibility: DocumentVisibilityState;

beforeEach(() => {
  vi.useFakeTimers();
  vault = new MemoryVault({});
  read = vi.spyOn(vault, "proposals").mockResolvedValue([waiting("02", "2026-09-24T10:00:00Z"), waiting("01", "2026-09-24T09:00:00Z"), waiting("00", "2026-09-24T08:00:00Z", "accepted")]);
  useWorkspace.setState({ client: vault });
  useReview.setState({ proposals: [], loaded: false, error: null });
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Lets the vault's answers arrive. */
const settle = () => act(async () => {});

describe("review polling", () => {
  it("reads the queue at once, keeps pending ones oldest first, and counts them", async () => {
    const { getByTestId } = render(<Badge />);
    await settle();
    expect(read).toHaveBeenCalledTimes(1);
    expect(useReview.getState().proposals.map((p) => p.id)).toEqual(["01", "02"]);
    expect(getByTestId("count").textContent).toBe("2");
  });

  it("asks every 20 s while the window is visible, and on focus", async () => {
    render(<Badge />);
    await settle();
    await act(async () => vi.advanceTimersByTime(POLL_MS));
    expect(read).toHaveBeenCalledTimes(2);

    visibility = "hidden";
    await act(async () => vi.advanceTimersByTime(POLL_MS * 3));
    expect(read).toHaveBeenCalledTimes(2);

    visibility = "visible";
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(read).toHaveBeenCalledTimes(3);
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(read).toHaveBeenCalledTimes(4);
  });

  it("shares one poller between views and stops when none is left", async () => {
    const first = render(<Badge />);
    const second = render(<Badge />);
    await settle();
    const before = read.mock.calls.length;
    await act(async () => vi.advanceTimersByTime(POLL_MS));
    expect(read.mock.calls.length).toBe(before + 1);

    first.unmount();
    await act(async () => vi.advanceTimersByTime(POLL_MS));
    expect(read.mock.calls.length).toBe(before + 2);

    second.unmount();
    await act(async () => vi.advanceTimersByTime(POLL_MS * 2));
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(read.mock.calls.length).toBe(before + 2);
  });

  it("reads at once when the vault reports a proposal file, and follows a new vault", async () => {
    let events = null as VaultEvents | null;
    const stop = vi.fn();
    // As the Tauri client does: the core's watcher events.
    Object.assign(vault, { watch: (e: VaultEvents) => ((events = e), stop) });
    render(<Badge />);
    await settle();
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => events!.changed(["library/a.md"]));
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => events!.changed([".kasten/proposals/01K5Z3.json"]));
    expect(read).toHaveBeenCalledTimes(2);

    // Another vault: the old watch stops and the new vault is read.
    const next = new MemoryVault({});
    const nextRead = vi.spyOn(next, "proposals").mockResolvedValue([]);
    await act(async () => useWorkspace.setState({ client: next }));
    expect(stop).toHaveBeenCalled();
    expect(nextRead).toHaveBeenCalledTimes(1);
    expect(useReview.getState().proposals).toEqual([]);
  });

  it("keeps the last list when a read fails, and says why", async () => {
    render(<Badge />);
    await settle();
    read.mockRejectedValueOnce("The vault is locked");
    await act(async () => vi.advanceTimersByTime(POLL_MS));
    expect(useReview.getState().error).toBe("The vault is locked");
    expect(useReview.getState().proposals).toHaveLength(2);
  });
});
