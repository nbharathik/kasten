import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VerifyReport } from "../../lib/vault/types";
import { MemoryVault } from "./preview/memory-vault";
import { useWorkspace } from "./store";
import { checkDue, weeklyCheck } from "./weekly-check";

const DAY = 24 * 60 * 60 * 1000;

/** The preview vault, standing in for a folder on disk. */
class DiskVault extends MemoryVault {
  override readonly kind = "desktop" as never;
  override readonly label = "/home/me/Notes" as never;
  problems = 0;
  override verify = vi.fn(async (): Promise<VerifyReport> => ({ notes: 3, boards: 0, decks: 0, gitObjects: 9, problems: Array.from({ length: this.problems }, () => ({ kind: "link", path: "library/a.md", detail: "Links to a missing page" })) as never }));
}

beforeEach(() => {
  localStorage.clear();
  useWorkspace.setState({ toasts: [] });
});

describe("the weekly vault check", () => {
  it("is due a week after the last one", () => {
    expect(checkDue(null, 0)).toBe(true);
    expect(checkDue(0, 6 * DAY)).toBe(false);
    expect(checkDue(0, 7 * DAY)).toBe(true);
  });

  it("runs once a week, and speaks only when it finds something", async () => {
    const vault = new DiskVault({});
    await useWorkspace.getState().connect({ client: vault });
    expect(await weeklyCheck(10 * DAY)).toBe(true);
    expect(useWorkspace.getState().toasts).toEqual([]);
    expect(await weeklyCheck(12 * DAY)).toBe(false);
    vault.problems = 2;
    expect(await weeklyCheck(17 * DAY)).toBe(true);
    const toast = useWorkspace.getState().toasts.at(-1)!;
    expect(toast.text).toBe("The weekly vault check found 2 things to look at");
    expect(toast.action?.label).toBe("Show");
    expect(vault.verify).toHaveBeenCalledTimes(2);
  });

  it("leaves the browser preview alone", async () => {
    const vault = new MemoryVault({});
    const verify = vi.spyOn(vault, "verify");
    await useWorkspace.getState().connect({ client: vault });
    expect(await weeklyCheck()).toBe(false);
    expect(verify).not.toHaveBeenCalled();
  });
});
