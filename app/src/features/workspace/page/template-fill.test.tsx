// An empty page shows its title and body, nothing more: no row of
// templates, AI or Import under the title. "Template…" in the editor's
// slash menu (its onTemplate) opens the gallery to fill the page, on the
// project's own template when the project names one.

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useShell } from "../../../lib/store";
import type { PageEditorProps } from "../../pages/editor/PageEditor";
import { setPageTemplate } from "../../projects/page-template";
import { MemoryVault } from "../preview/memory-vault";
import { useWorkspace } from "../store";
import { noteAt } from "../tree";
import { NotePage } from "./NotePage";

// The editor as the page sets it up; its slash menu has tests of its own.
const seen = vi.hoisted(() => ({ editor: null as PageEditorProps | null }));
vi.mock("../../pages/editor/PageEditor", () => ({
  PageEditor: (props: PageEditorProps) => {
    seen.editor = props;
    return <div data-testid="page-editor">{props.body}</div>;
  },
}));

const PAGE = "library/empty.md";
const PROJECT = "projects/trip/_project.md";
const IN_PROJECT = "projects/trip/pages/packing.md";
let vault: MemoryVault;

async function open(path: string): Promise<PageEditorProps> {
  useWorkspace.getState().openPath(path);
  render(<NotePage client={vault} path={path} />);
  await screen.findByTestId("page-editor", {}, { timeout: 20_000 });
  return seen.editor!;
}

beforeEach(async () => {
  localStorage.clear();
  seen.editor = null;
  useShell.getState().openGallery(null);
  vault = new MemoryVault({
    [PAGE]: "---\ntitle: Fresh\n---\n",
    [PROJECT]: "---\ntitle: Trip\ntype: project\n---\nPlans.\n",
    [IN_PROJECT]: "---\ntitle: Packing\nproject: trip\n---\n",
    "templates/paper.md": '---\ntitle: "{{title}}"\ntags: [paper]\n---\n## Abstract\n',
  });
  await useWorkspace.getState().connect({ client: vault });
});
afterEach(cleanup);

describe("an empty page", () => {
  it("shows nothing under its title but the page", async () => {
    const editor = await open(PAGE);
    expect(screen.queryByRole("group", { name: "Start with" })).toBeNull();
    for (const name of ["All templates…", "Draft with AI…", "Import…", "Use a template"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(editor.onTemplate).toBeTypeOf("function");
  });

  it("fills from the template picked after Template…, keeping its title", async () => {
    const editor = await open(PAGE);
    act(() => editor.onTemplate!());
    const gallery = useShell.getState().gallery;
    expect(gallery?.onPick).toBeTypeOf("function");
    expect(gallery?.select).toBeUndefined();
    await act(async () => gallery!.onPick!("paper"));
    await expect.poll(() => screen.getByTestId("page-editor").textContent, { timeout: 5_000 }).toContain("Abstract");
    const filled = (await vault.read(PAGE)).text;
    expect(filled).toContain("title: Fresh\n");
    expect(filled).toContain("tags: [paper]\n");
    expect(filled).toContain("## Abstract\n");
  });

  it("opens the gallery on its project's template", async () => {
    const project = () => noteAt(useWorkspace.getState().notes, PROJECT)!;
    await act(async () => setPageTemplate(project(), "paper"));
    const editor = await open(IN_PROJECT);
    act(() => editor.onTemplate!());
    expect(useShell.getState().gallery?.select).toBe("paper");
  });
});
