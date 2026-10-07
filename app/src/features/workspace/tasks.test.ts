import { describe, expect, it } from "vitest";

import { setTask, tasksIn } from "./tasks";

const BODY = "## Plan\r\n- [ ] Draft intro\r\n  - [x] Outline\r\n1. [ ] Numbered\r\n```\r\n- [ ] not a task\r\n```\r\n* [X] Done one\r\n";

describe("tasks", () => {
  it("finds to-dos outside code, with nesting and state", () => {
    expect(tasksIn(BODY)).toEqual([
      { line: 1, done: false, text: "Draft intro", depth: 0 },
      { line: 2, done: true, text: "Outline", depth: 1 },
      { line: 3, done: false, text: "Numbered", depth: 0 },
      { line: 7, done: true, text: "Done one", depth: 0 },
    ]);
  });

  it("ticks one line and keeps every other byte", () => {
    const [first, second] = tasksIn(BODY);
    expect(setTask(BODY, first!, true)).toBe(BODY.replace("- [ ] Draft intro", "- [x] Draft intro"));
    expect(setTask(BODY, second!, false)).toBe(BODY.replace("- [x] Outline", "- [ ] Outline"));
    expect(setTask(BODY.replace("Draft intro", "Changed"), first!, true)).toBeNull();
  });
});
