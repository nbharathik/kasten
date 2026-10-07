import { describe, expect, it, vi } from "vitest";

import { registerPage } from "../workspace/page/open-page";
import { PageSession, type SessionEvents } from "../workspace/page/page-session";
import { MemoryVault } from "../workspace/preview/memory-vault";
import { writeProps } from "./write";

const PAGE = "---\ntitle: Ship\ntags: [task]\nprops:\n  due: 2026-10-01\n---\nFirst line\n";

async function setup() {
  const vault = new MemoryVault({ "library/ship.md": PAGE });
  const events = { onState: vi.fn(), onNote: vi.fn(), onRenamed: vi.fn(), onConflict: vi.fn(), onMerged: vi.fn(), onError: vi.fn() } satisfies SessionEvents;
  const session = new PageSession(vault, "library/ship.md", await vault.read("library/ship.md"), events, 10_000);
  const reload = vi.fn();
  const forget = registerPage(session, reload, () => {});
  return { vault, events, session, reload, forget };
}

describe("writing a date from the calendar", () => {
  it("writes the open page's waiting typing first, then the page takes the change in", async () => {
    const { vault, events, session, reload, forget } = await setup();
    session.editBody("Typed while it moved\n");
    const saved = await writeProps(vault, "library/ship.md", { due: "2026-10-03" });
    expect(saved.text).toContain("  due: 2026-10-03\n");
    expect(saved.text).toContain("Typed while it moved\n");
    // The page's next save builds on the new version instead of merging.
    expect(session.currentHash).toBe(saved.hash);
    expect(events.onNote).toHaveBeenLastCalledWith(saved);
    expect(reload).not.toHaveBeenCalled();
    forget();
  });

  it("writes straight through when no page shows the note", async () => {
    const { vault, forget } = await setup();
    forget();
    const saved = await writeProps(vault, "library/ship.md", { due: "2026-10-05" });
    expect((await vault.read("library/ship.md")).text).toBe(saved.text);
    expect(saved.text).toContain("  due: 2026-10-05\n");
  });
});
