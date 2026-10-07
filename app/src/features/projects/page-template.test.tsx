// A project can name the template its new pages start from: it is kept in
// the project page's properties. The gallery opens on it from an empty
// page's "Template…" (template-fill.test.tsx).

import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { MemoryVault } from "../workspace/preview/memory-vault";
import { useWorkspace } from "../workspace/store";
import { noteAt } from "../workspace/tree";
import { pageTemplateOf, setPageTemplate } from "./page-template";

const PROJECT = "projects/trip/_project.md";
let vault: MemoryVault;

beforeEach(async () => {
  localStorage.clear();
  vault = new MemoryVault({
    [PROJECT]: "---\ntitle: Trip\ntype: project\n---\nPlans.\n",
    "templates/paper.md": '---\ntitle: "{{title}}"\n---\n## Abstract\n',
  });
  await useWorkspace.getState().connect({ client: vault });
});

describe("a project's template for new pages", () => {
  it("is kept on the project page, and cleared again", async () => {
    const project = () => noteAt(useWorkspace.getState().notes, PROJECT)!;
    expect(pageTemplateOf(project())).toBeNull();
    await act(async () => setPageTemplate(project(), "paper"));
    expect(pageTemplateOf(project())).toBe("paper");
    expect((await vault.read(PROJECT)).text).toContain("page_template: paper");

    await act(async () => setPageTemplate(project(), null));
    expect((await vault.read(PROJECT)).text).not.toContain("page_template");
  });
});
