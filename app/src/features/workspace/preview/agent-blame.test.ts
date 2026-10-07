// The preview's agent marks follow the core's (crates/kasten-core/src/marks):
// an agent's lines are marked until a person edits their paragraph or
// accepts them, in runs of one change that blank lines do not break.

import { describe, expect, it } from "vitest";

import { blame } from "./agent-blame";
import { MemoryVault } from "./memory-vault";

const NOW = Date.UTC(2026, 8, 24, 8, 0, 0);
const AGENT = { session: "s1", client: "kasten-brainstorm" };
const card = (title: string) => ({ kind: "card" as const, title, date: "2026-09-24" });

function vault() {
  const clock = { now: NOW };
  return { v: new MemoryVault({}, undefined, () => clock.now), later: () => (clock.now += 60_000) };
}

describe("preview agent marks", () => {
  it("marks an agent's card in one run, blank lines and all", async () => {
    const { v } = vault();
    const made = await v.agentCreate(AGENT, card("Nara"), "Deer and temples.\n\nAn easy day trip.\n");
    const marks = await v.agentMarks(made.meta.path);
    expect(marks).toEqual([{ start: 0, end: 3, session: "s1", client: "kasten-brainstorm", commit: expect.any(String), time: NOW }]);
    expect(await v.agentMarked([made.meta.path, "inbox/none.md"])).toEqual([made.meta.path]);
  });

  it("settles the paragraph a person edits, and keeps the rest marked", async () => {
    const { v, later } = vault();
    const made = await v.agentCreate(AGENT, card("Nara"), "Deer and temples.\n\nAn easy day trip.\n");
    later();
    await v.saveBody(made.meta.path, "Deer and old temples.\n\nAn easy day trip.\n", made.hash);
    expect((await v.agentMarks(made.meta.path)).map((m) => [m.start, m.end])).toEqual([[2, 3]]);
  });

  it("marks only what an agent added to a person's page", () => {
    const head = "---\ntitle: Hilltown\n---\n";
    const version = (id: string, body: string, agent?: typeof AGENT) => ({ id, time: NOW, summary: "edit: Hilltown", text: head + body, ...agent });
    const versions = [version("v1", "My plan.\n\n## Ideas\n"), version("v2", "My plan.\n\n## Ideas\n\nArashiyama at dawn.\nThe old temple.\n", AGENT)];
    expect(blame(versions)).toEqual([{ start: 4, end: 6, session: "s1", client: "kasten-brainstorm", commit: "v2", time: NOW }]);
    // A person's edit elsewhere leaves them marked; one in their paragraph settles it.
    const elsewhere = [...versions, version("v3", "My whole plan.\n\n## Ideas\n\nArashiyama at dawn.\nThe old temple.\n")];
    expect(blame(elsewhere).map((m) => [m.start, m.end])).toEqual([[4, 6]]);
    const inside = [...elsewhere, version("v4", "My whole plan.\n\n## Ideas\n\nArashiyama at dawn.\n")];
    expect(blame(inside)).toEqual([]);
  });

  it("settles everything once accepted, as a version of its own", async () => {
    const { v, later } = vault();
    const made = await v.agentCreate(AGENT, card("Nara"), "Deer and temples.\n");
    later();
    await v.acceptAgentMarks(made.meta.path);
    expect(await v.agentMarks(made.meta.path)).toEqual([]);
    expect((await v.history(made.meta.path))[0]).toMatchObject({ summary: "accept: Nara", author: "You" });
    // Nothing more to accept: no second version.
    await v.acceptAgentMarks(made.meta.path);
    expect((await v.history(made.meta.path)).filter((c) => c.summary.startsWith("accept:"))).toHaveLength(1);
  });

  it("has no marks once the session is undone", async () => {
    const { v } = vault();
    const made = await v.agentCreate(AGENT, card("Nara"), "Deer and temples.\n");
    await v.undoSession("s1");
    expect(await v.agentMarks(made.meta.path)).toEqual([]);
    expect(await v.agentMarked([made.meta.path])).toEqual([]);
  });
});
