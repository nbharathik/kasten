import { describe, expect, it } from "vitest";

import type { PropDef, TagSchema } from "../../../../lib/vault/types";
import { metaFor } from "../../../workspace/preview/note-meta";
import { columnsOf, type Column } from "../../model";
import { NO_VALUE, cardDefs, colorDef, columnKey, fromValue, labelOf, stepColumn, steadyColumns, takesCards, withColorBy, withPending } from "./model";

const STATUS: PropDef = { key: "status", type: "select", options: ["Todo", "Doing", "Done"] };
const SCHEMA: TagSchema = {
  name: "task",
  color: "green",
  path: "tags/task.yaml",
  properties: [STATUS, { key: "due", type: "date", options: [] }, { key: "priority", type: "select", options: ["Low", "Medium", "High"] }, { key: "notes", type: "text", options: [] }],
  views: [],
};

const note = (path: string, status?: string) => metaFor(path, `---\ntitle: ${path}\ntags: [task]\n${status ? `props:\n  status: ${status}\n` : ""}---\nBody\n`, 0);

describe("kanban board model", () => {
  it("names columns by their value whatever the case, and notes without one apart", () => {
    expect(columnKey("Done")).toBe("done");
    expect(columnKey(null)).toBe(NO_VALUE);
    expect(columnKey("")).not.toBe(NO_VALUE);
    expect(labelOf(null, STATUS)).toBe("No status");
    expect(labelOf("doing", STATUS)).toBe("Doing");
    expect(labelOf("Blocked", STATUS)).toBe("Blocked");
  });

  it("takes cards only where the core can write the value", () => {
    expect(takesCards("Done", STATUS)).toBe(true);
    expect(takesCards("done", STATUS)).toBe(true);
    expect(takesCards(null, STATUS)).toBe(true);
    expect(takesCards("Blocked", STATUS)).toBe(false);
    // A select without options takes any value.
    expect(takesCards("Blocked", { ...STATUS, options: [] })).toBe(true);
  });

  it("steps a keyboard move to the next column that takes cards", () => {
    const columns = [null, "Todo", "Blocked", "Done"].map((value) => ({ value }));
    expect(stepColumn(columns, 1, 1, STATUS)).toBe(3);
    expect(stepColumn(columns, 3, -1, STATUS)).toBe(1);
    expect(stepColumn(columns, 1, -1, STATUS)).toBe(0);
    expect(stepColumn(columns, 0, -1, STATUS)).toBeNull();
    expect(stepColumn(columns, 3, 1, STATUS)).toBeNull();
    expect(stepColumn(columns, -1, 1, STATUS)).toBeNull();
  });

  it("shows moves on their way, keeping every other note as it was", () => {
    const notes = [note("a.md", "Todo"), note("b.md", "Doing"), note("c.md")];
    expect(withPending(notes, new Map())).toBe(notes);
    const pending = new Map([
      ["a.md", { key: "status", value: "Done" }],
      ["b.md", { key: "status", value: null }],
    ]);
    const shown = withPending(notes, pending);
    expect(shown[0]!.props).toEqual({ status: "Done" });
    expect(shown[1]!.props).toEqual({});
    expect(shown[2]).toBe(notes[2]);
    // The same copies while they wait, so their cards need no redrawing.
    const again = withPending(notes, new Map(pending));
    expect(again[0]).toBe(shown[0]);
    expect(again[1]).toBe(shown[1]);
    expect(notes[0]!.props).toEqual({ status: "Todo" });
    expect(columnsOf(shown, STATUS).map((c) => [c.label, c.notes.map((n) => n.path)])).toEqual([
      ["No status", ["b.md", "c.md"]],
      ["Todo", []],
      ["Doing", []],
      ["Done", ["a.md"]],
    ]);
  });

  it("keeps columns whose cards did not change, so they skip redrawing", () => {
    const notes = [note("a.md", "Todo"), note("b.md", "Doing"), note("c.md", "Done")];
    const before = columnsOf(notes, STATUS);
    const same = steadyColumns(before, columnsOf([...notes], STATUS));
    same.forEach((column, i) => expect(column).toBe(before[i]));
    const moved = steadyColumns(before, columnsOf(withPending(notes, new Map([["a.md", { key: "status", value: "Doing" }]])), STATUS));
    expect(moved[0]).not.toBe(before[0]);
    expect(moved[1]).not.toBe(before[1]);
    expect(moved[2]).toBe(before[2]);
    const empty: Column[] = [];
    expect(steadyColumns(empty, before)).toEqual(before);
  });

  it("reads the value a move starts from, for its Undo", () => {
    expect(fromValue(note("a.md", "Doing"), "status")).toBe("Doing");
    expect(fromValue(note("a.md"), "status")).toBeNull();
    expect(fromValue({ ...note("a.md"), props: { status: ["Todo", "Done"] } }, "status")).toBe("Todo");
    expect(fromValue({ ...note("a.md"), props: { status: 3 } }, "status")).toBe("3");
  });

  it("colours cards by a select the schema still has, and saves or drops the key", () => {
    const view = { name: "Board", type: "kanban" as const, group_by: "status", sort: [{ key: "due", dir: "asc" as const }] };
    expect(colorDef(view, SCHEMA)).toBeNull();
    expect(colorDef({ ...view, color_by: "priority" }, SCHEMA)?.key).toBe("priority");
    expect(colorDef({ ...view, color_by: "notes" }, SCHEMA)).toBeNull();
    expect(colorDef({ ...view, color_by: "gone" }, SCHEMA)).toBeNull();
    expect(colorDef({ ...view, color_by: "priority" }, null)).toBeNull();
    expect(withColorBy(view, "priority")).toEqual({ ...view, color_by: "priority" });
    const plain = withColorBy({ ...view, color_by: "priority" }, null);
    expect(plain).toEqual(view);
    expect("color_by" in plain).toBe(false);
  });

  it("shows every property on cards but the one the board groups by", () => {
    expect(cardDefs(SCHEMA.properties, "status").map((d) => d.key)).toEqual(["due", "priority", "notes"]);
    expect(cardDefs(undefined, "status")).toEqual([]);
  });
});
