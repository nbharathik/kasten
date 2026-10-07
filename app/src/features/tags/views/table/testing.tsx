// Test helpers for the table view: a preview vault with a `task` tag, the
// Tag Database open on it, and ways to find a row's cell by column name.

import { act, render, screen, waitFor, within } from "@testing-library/react";
import { expect } from "vitest";

import type { TagView } from "../../../../lib/vault/types";
import { MemoryVault } from "../../../workspace/preview/memory-vault";
import { useWorkspace } from "../../../workspace/store";
import { useTags } from "../../store";
import { TagDatabase } from "../../TagDatabase";

export const PROPS =
  "properties:\n" +
  "  - {key: status, type: select, options: [Todo, Doing, Done]}\n" +
  "  - {key: due, type: date}\n" +
  "  - {key: points, type: number}\n" +
  "  - {key: urgent, type: checkbox}\n" +
  "  - {key: summary, type: text}\n" +
  "  - {key: link, type: url}\n" +
  "  - {key: labels, type: multi_select, options: [ui, core]}\n" +
  "  - {key: blocks, type: relation}\n";

/** A `task` tag whose first view is `view`, written as YAML flow maps. */
export function taskYaml(view = "{name: All, type: table}", more = ""): string {
  return `name: task\ncolor: green\n${PROPS}views:\n  - ${view}\n${more}`;
}

export const NOTES: Record<string, string> = {
  "library/intro.md": "---\nid: n-intro\ntitle: Write intro\ntags: [task]\nprops:\n  status: Doing\n  due: 2026-10-02\n  points: 3\n---\nA\n",
  "library/flights.md": "---\nid: n-flights\ntitle: Book flights\ntags: [task]\nprops:\n  status: Todo\n  points: 5\n  summary: Window seats\n---\nB\n",
  "library/budget.md": "---\nid: n-budget\ntitle: Plan budget\ntags: [task]\nprops:\n  status: Done\n  urgent: true\n---\nC\n",
  "library/idea.md": "---\ntitle: Idea\ntags: [idea]\n---\nI\n",
};

export interface Opened {
  vault: MemoryVault;
  grid: HTMLElement;
}

/** The preview vault with these files, and the Tag Database open on #task. */
export async function openTable(files: Record<string, string>, tag = "task"): Promise<Opened> {
  localStorage.clear();
  const vault = new MemoryVault(files);
  useTags.setState({ schemas: null });
  useWorkspace.setState({ place: { view: "tags", path: `#${tag}` }, toasts: [] });
  await useWorkspace.getState().connect({ client: vault });
  render(<TagDatabase tag={tag} />);
  // Until the schemas are in, the database shows a default view, whose table
  // the tag's first view then replaces.
  await waitFor(() => expect(useTags.getState().schemas).not.toBeNull());
  await act(async () => {});
  const grid = await screen.findByRole("grid");
  return { vault, grid };
}

/** The table's column names, in order. */
export const headers = (grid: HTMLElement) => within(grid).getAllByRole("columnheader").map((h) => h.querySelector(".kasten-table-th-label")?.textContent ?? "");

/** The rows' titles, top to bottom. */
export const titles = (grid: HTMLElement) =>
  within(grid)
    .queryAllByRole("rowheader")
    .map((c) => c.querySelector(".kasten-table-title")?.textContent ?? "");

/** What the table's foot counts. */
export const count = () => document.querySelector(".kasten-table-count")?.textContent ?? "";

/** The row of the note titled `title`. */
export function rowOf(grid: HTMLElement, title: string): HTMLElement {
  const head = within(grid)
    .getAllByRole("rowheader")
    .find((c) => c.querySelector(".kasten-table-title")?.textContent === title);
  if (!head) throw new Error(`No row titled ${title}`);
  return head.closest('[role="row"]') as HTMLElement;
}

/** The cell of `title`'s row under the column named `column`. */
export function cellOf(grid: HTMLElement, title: string, column: string): HTMLElement {
  const at = headers(grid).indexOf(column);
  if (at < 0) throw new Error(`No column ${column}`);
  const cells = [...rowOf(grid, title).querySelectorAll<HTMLElement>('[role="gridcell"], [role="rowheader"]')];
  return cells[at]!;
}

/** The note's property values as the vault has them now. */
export const propsOf = async (vault: MemoryVault, path: string) => (await vault.read(path)).meta.props;

/** The first view of #task as the vault has it now. */
export const savedView = async (vault: MemoryVault): Promise<TagView> => (await vault.tagSchemas()).find((s) => s.name === "task")!.views[0] as TagView;
