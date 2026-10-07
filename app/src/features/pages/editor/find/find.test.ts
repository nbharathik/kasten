// Find and replace in a page: matches ignore case, stay inside a block and
// skip page links; stepping goes round; replacing one moves on, and
// "Replace all" is one change that one undo takes back.

import { undo } from "@milkdown/kit/prose/history";
import { describe, expect, it } from "vitest";

import { useTestEditor } from "../../../../test/editor";
import { clearFind, findState, replaceAll, replaceCurrent, setQuery, step } from "./find";

const editor = useTestEditor();

const BODY = "Plan the trip. The **plan** has a plan B.\n\nA [[Plan]] link, and plan-\nning across lines.\n";

const texts = () => findState(editor.view.state).matches.map((m) => editor.doc.textBetween(m.from, m.to));

describe("finding in a page", () => {
  it("finds every place, ignoring case, across marks but not across links or blocks", () => {
    editor.open(BODY);
    setQuery(editor.view, "plan");
    expect(texts()).toEqual(["Plan", "plan", "plan", "plan"]);
    expect(editor.view.dom.querySelectorAll(".kasten-find-match")).toHaveLength(4);
    expect(editor.view.dom.querySelectorAll(".kasten-find-match.is-current")).toHaveLength(1);
    setQuery(editor.view, "trip. the");
    expect(texts()).toEqual(["trip. The"]);
    setQuery(editor.view, "");
    expect(texts()).toEqual([]);
  });

  it("steps through the matches and goes round at the ends", () => {
    editor.open(BODY);
    editor.caret("has");
    setQuery(editor.view, "plan");
    // From the caret: the next match after it.
    expect(findState(editor.view.state).index).toBe(2);
    step(editor.view, 1);
    expect(findState(editor.view.state).index).toBe(3);
    step(editor.view, 1);
    expect(findState(editor.view.state).index).toBe(0);
    step(editor.view, -1);
    expect(findState(editor.view.state).index).toBe(3);
    const { from, to } = editor.view.state.selection;
    expect(editor.doc.textBetween(from, to)).toBe("plan");
  });

  it("replaces one and moves on, even when the new text holds the query", () => {
    editor.open("A plan, a plan.\n");
    editor.caret("A");
    setQuery(editor.view, "plan");
    replaceCurrent(editor.view, "better plan");
    expect(editor.save()).toBe("A better plan, a plan.\n");
    expect(findState(editor.view.state).index).toBe(1);
    replaceCurrent(editor.view, "map");
    expect(editor.save()).toBe("A better plan, a map.\n");
  });

  it("replaces all in one change, keeping marks and the other blocks as written", () => {
    editor.open(BODY);
    setQuery(editor.view, "plan");
    expect(replaceAll(editor.view, "route")).toBe(4);
    expect(editor.save()).toBe("route the trip. The **route** has a route B.\n\nA [[Plan]] link, and route-\nning across lines.\n");
    expect(findState(editor.view.state).matches).toEqual([]);
    undo(editor.view.state, editor.view.dispatch);
    expect(editor.save()).toBe(BODY);
    clearFind(editor.view);
    expect(editor.view.dom.querySelectorAll(".kasten-find-match")).toHaveLength(0);
  });
});
