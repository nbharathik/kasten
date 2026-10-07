import { describe, expect, it } from "vitest";

import type { TagSchema } from "../../../lib/vault/types";
import { checkProps } from "./props-check";

const TASK: TagSchema = {
  name: "task",
  color: "green",
  path: "tags/task.yaml",
  views: [],
  properties: [
    { key: "status", type: "select", options: ["Todo", "Done"] },
    { key: "due", type: "date", options: [] },
    { key: "hours", type: "number", options: [] },
    { key: "labels", type: "multi_select", options: ["Home", "Work"] },
    { key: "done", type: "checkbox", options: [] },
  ],
};

describe("property checks in the preview", () => {
  it("normalises values the way the core writes them", () => {
    expect(checkProps([TASK], ["Task"], { status: "todo", hours: "3", labels: "work", done: "true", due: "2026-10-02", other: "free text" })).toEqual({
      status: "Todo",
      hours: 3,
      labels: ["Work"],
      done: true,
      due: "2026-10-02",
      other: "free text",
    });
  });

  it("refuses what the schema does not allow, and nested values anywhere", () => {
    expect(() => checkProps([TASK], ["task"], { status: "Maybe" })).toThrow("Property “status” (select) must be one of Todo, Done");
    expect(() => checkProps([TASK], ["task"], { due: "next week" })).toThrow(/date/);
    expect(() => checkProps([TASK], ["task"], { hours: "lots" })).toThrow(/number/);
    expect(() => checkProps([TASK], [], { status: "Maybe" })).not.toThrow();
    expect(() => checkProps([TASK], [], { nested: { a: 1 } })).toThrow(/mapping/);
  });
});
