// For the panel's tests: a note page from a MemoryVault, with the right
// panel open on a tab, as NotePage.test.tsx opens pages.

import { render, screen } from "@testing-library/react";
import { expect } from "vitest";

import { useShell } from "../../lib/store";
import { NotePage } from "../workspace/page/NotePage";
import type { MemoryVault } from "../workspace/preview/memory-vault";
import { useWorkspace } from "../workspace/store";
import { usePanel, type PanelTab } from "./panel-store";

export async function openWithPanel(vault: MemoryVault, path: string, tab: PanelTab) {
  usePanel.setState({ tab, tabs: {}, widths: {} });
  useWorkspace.setState({ place: { view: "home" }, back: [], forward: [], toasts: [] });
  await useWorkspace.getState().connect({ client: vault });
  useWorkspace.getState().openPath(path);
  useShell.setState({ panels: [useWorkspace.getState().layout.focus] });
  render(<NotePage client={vault} path={path} />);
  const editor = await screen.findByTestId("page-editor", {}, { timeout: 20_000 });
  await expect.poll(() => editor.querySelector(".ProseMirror") !== null, { timeout: 20_000 }).toBe(true);
  return { editor, panel: screen.getByRole("complementary", { name: "Page details" }) };
}

/** The texts of the toasts showing now. */
export const toasts = () => useWorkspace.getState().toasts.map((t) => t.text);
