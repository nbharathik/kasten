import { describe, expect, it } from "vitest";

import type { TagSchema, ViewFilter } from "../../../../lib/vault/types";
import { prefill } from "./prefill";

const SCHEMA: TagSchema = {
  name: "paper",
  color: null,
  path: "tags/paper.yaml",
  properties: [
    { key: "status", type: "select", options: ["Idea", "Drafting"] },
    { key: "stage", type: "select", options: [] },
    { key: "venue", type: "text", options: [] },
    { key: "pages", type: "number", options: [] },
    { key: "deadline", type: "date", options: [] },
    { key: "coauthors", type: "multi_select", options: ["Alex", "Sam"] },
    { key: "labels", type: "multi_select", options: [] },
    { key: "done", type: "checkbox", options: [] },
    { key: "urgent", type: "checkbox", options: [] },
    { key: "starred", type: "checkbox", options: [] },
    { key: "repo", type: "url", options: [] },
    { key: "related", type: "relation", options: [] },
  ],
  views: [],
};

const is = (key: string, value: unknown): ViewFilter => ({ key, op: "is", value });

describe("pre-filling a new row from the view's filters", () => {
  it("fills each property an `is` filter names, in the form the schema wants", () => {
    const filters: ViewFilter[] = [
      is("status", "drafting"),
      is("stage", "Review"),
      is("venue", "CHI"),
      is("pages", "12"),
      is("deadline", "2026-10-02"),
      is("coauthors", "alex"),
      is("coauthors", "Sam"),
      is("labels", "ml"),
      is("done", true),
      is("urgent", "false"),
      { key: "starred", op: "not_empty" },
      is("repo", "https://example.org/x"),
      is("related", "Attention paper"),
    ];
    expect(prefill(filters, SCHEMA)).toEqual({
      status: "Drafting",
      stage: "Review",
      venue: "CHI",
      pages: 12,
      deadline: "2026-10-02",
      coauthors: ["Alex", "Sam"],
      labels: ["ml"],
      done: true,
      urgent: false,
      starred: true,
      repo: "https://example.org/x",
      related: ["Attention paper"],
    });
  });

  it("skips values the core would refuse, and filters no value can satisfy", () => {
    const filters: ViewFilter[] = [
      is("status", "Published"),
      is("pages", "many"),
      is("deadline", "soon"),
      is("repo", "not a link"),
      is("coauthors", "Zed"),
      is("venue", ""),
      is("venue", null),
      { key: "venue", op: "contains", value: "CHI" },
      { key: "status", op: "is_not", value: "Idea" },
      { key: "deadline", op: "before", value: "2026-10-01" },
      { key: "done", op: "empty" },
    ];
    expect(prefill(filters, SCHEMA)).toEqual({});
  });

  it("leaves built-in fields alone, keeps the first value of a single-valued key", () => {
    expect(prefill([is("title", "Draft"), is("created", "2026-09-01"), is("status", "Idea"), is("status", "Drafting")], SCHEMA)).toEqual({ status: "Idea" });
  });

  it("takes names like an object's own methods as plain property names", () => {
    const schema = { ...SCHEMA, properties: [{ key: "constructor", type: "text", options: [] }] };
    expect(prefill([is("constructor", "foo"), is("toString", "bar")], schema)).toEqual({ constructor: "foo", toString: "bar" });
  });

  it("fills keys no schema names with their plain value", () => {
    expect(prefill([is("project", "photo-organiser"), is("score", 3), is("odd", { a: 1 })], SCHEMA)).toEqual({ project: "photo-organiser", score: 3 });
    expect(prefill([is("status", "Idea")], null)).toEqual({ status: "Idea" });
    expect(prefill(undefined, SCHEMA)).toEqual({});
  });
});
