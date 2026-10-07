// AI in a page, with a scripted provider: the panel opens below the text
// it is about, the answer is only a preview until taken, taking it is one
// change one undo takes back, and Discard, Escape and Stop leave the page
// as it was. The slash menu opens it too.

import { parserCtx, serializerCtx } from "@milkdown/kit/core";
import { undo } from "@milkdown/kit/prose/history";
import { TextSelection } from "@milkdown/kit/prose/state";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findText, useTestEditor } from "../../../../test/editor";
import { LOCAL, resetChat, scriptedChat, type Scripted } from "../../../chat/test-kit";
import { BLOCK_CHOICES } from "../menus/catalog";
import { choiceCommand } from "../menus/slash";
import { closeAi, onAiOpen, openAi, type AiOpen } from "./ai";
import { AiPanel } from "./AiPanel";

const editor = useTestEditor();
const BODY = "Pack the tent. Check the poles.\n\nThe tent goes last.\n";
let chat: Scripted;

/** The panel as the page editor draws it: in the page, below the text. */
function Panel() {
  const [open, setOpen] = useState<AiOpen | null>(null);
  useEffect(() => onAiOpen(editor.view, setOpen), []);
  if (!open) return null;
  const done = () => {
    closeAi(editor.view);
    setOpen(null);
  };
  return createPortal(
    <AiPanel key={open.opened} view={editor.view} open={open} title="Trip" parse={(markdown) => editor.ctx.get(parserCtx)(markdown)} serialize={(doc) => editor.ctx.get(serializerCtx)(doc)} onClose={done} />,
    open.host,
  );
}

function select(text: string) {
  const from = findText(editor.doc, text);
  const { view } = editor;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + text.length)));
}

async function opened(action: "ask" | "continue" | "summarize", name: string) {
  await act(async () => void openAi(editor.view, action));
  return screen.findByRole("dialog", { name });
}

beforeEach(() => {
  localStorage.clear();
  chat = scriptedChat([LOCAL]);
  resetChat(chat);
  editor.open(BODY);
  render(<Panel />);
});
afterEach(() => {
  cleanup();
  closeAi(editor.view);
});

describe("AI in a page", () => {
  it("asks about the selection and replaces it in one change that undo takes back", async () => {
    select("Check the poles.");
    const panel = await opened("ask", "Ask AI");
    // It sits in the page, just below the text it is about.
    expect(editor.view.dom.contains(panel)).toBe(true);
    expect(editor.view.dom.querySelector(".kasten-ai-range")?.textContent).toBe("Check the poles.");
    await act(async () => fireEvent.click(within(panel).getByRole("button", { name: "Make it shorter" })));
    await within(panel).findByRole("button", { name: "Replace selection" });
    expect(within(panel).getByLabelText("AI's answer").textContent).toBe("A clearer sentence.");
    expect(within(panel).getByText("Local server · local-model")).toBeTruthy();
    // Only a preview until taken.
    expect(editor.save()).toBe(BODY);
    expect(chat.writes).toEqual([
      {
        id: expect.any(String),
        provider: "Local server",
        model: "local-model",
        action: "ask",
        instruction: "Make it shorter",
        title: "Trip",
        selection: "Check the poles.",
        before: "Pack the tent. ",
        after: "\n\nThe tent goes last.",
      },
    ]);

    await act(async () => fireEvent.click(within(panel).getByRole("button", { name: "Replace selection" })));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(editor.view.dom.querySelector(".kasten-ai-range")).toBeNull();
    expect(editor.save()).toBe("Pack the tent. A clearer sentence.\n\nThe tent goes last.\n");
    undo(editor.view.state, editor.view.dispatch);
    expect(editor.save()).toBe(BODY);
  });

  it("takes what you type, and inserts below when asked", async () => {
    select("Check the poles.");
    const panel = await opened("ask", "Ask AI");
    const input = within(panel).getByRole("textbox", { name: "Ask AI" });
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.change(input, { target: { value: "Say it as a list" } });
    await act(async () => fireEvent.submit(input.closest("form")!));
    await act(async () => fireEvent.click(await within(panel).findByRole("button", { name: "Insert below" })));
    expect(chat.writes.at(-1)!.instruction).toBe("Say it as a list");
    expect(editor.save()).toBe("Pack the tent. Check the poles.\n\nA clearer sentence.\n\nThe tent goes last.\n");
  });

  it("continues from the caret, and Escape or Discard leave the page as it was", async () => {
    editor.caret("The tent goes last.", true);
    let panel = await opened("continue", "Continue writing");
    await within(panel).findByRole("button", { name: "Insert" });
    expect(chat.writes.at(-1)).toMatchObject({ action: "continue", instruction: "", selection: "", before: "Pack the tent. Check the poles.\n\nThe tent goes last." });
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(editor.save()).toBe(BODY);

    panel = await opened("summarize", "Summarize page");
    await within(panel).findByRole("button", { name: "Insert" });
    expect(chat.writes.at(-1)).toMatchObject({ action: "summarize", selection: "Pack the tent. Check the poles.\n\nThe tent goes last." });
    fireEvent.click(within(panel).getByRole("button", { name: "Discard" }));
    expect(editor.save()).toBe(BODY);
  });

  it("stops an answer and keeps what came, and says why one failed", async () => {
    chat.holdNext();
    editor.caret("The tent goes last.", true);
    const panel = await opened("continue", "Continue writing");
    await act(async () => fireEvent.click(await within(panel).findByRole("button", { name: "Stop" })));
    await within(panel).findByText("Stopped: take what was written, or try again.");
    expect(within(panel).getByLabelText("AI's answer").textContent).toBe("A clearer");

    chat.failNext("Local server answered 404: model not found. Check the base URL and the model's name.");
    await act(async () => fireEvent.click(within(panel).getByRole("button", { name: "Try again" })));
    expect((await within(panel).findByRole("alert")).textContent).toContain("Check the base URL");
    expect(within(panel).queryByRole("button", { name: "Insert" })).toBeNull();
    await act(async () => fireEvent.click(within(panel).getByRole("button", { name: "Try again" })));
    await within(panel).findByRole("button", { name: "Insert" });
    expect(editor.save()).toBe(BODY);
  });

  it("offers to set up a provider when there is none", async () => {
    chat = scriptedChat([]);
    resetChat(chat);
    select("Check the poles.");
    const panel = await opened("ask", "Ask AI");
    expect(await within(panel).findByRole("button", { name: "Set up AI" })).toBeTruthy();
    expect(chat.writes).toEqual([]);
  });

  it("opens from the slash menu's AI choices", async () => {
    editor.caret("The tent goes last.", true);
    const choice = BLOCK_CHOICES.find((c) => c.key === "summarize-ai")!;
    await act(async () => void editor.run(choiceCommand(choice, editor.ctx)));
    expect(await screen.findByRole("dialog", { name: "Summarize page" })).toBeTruthy();
    expect(BLOCK_CHOICES.filter((c) => c.section === "AI").map((c) => c.label)).toEqual(["Ask AI…", "Continue writing", "Summarize page"]);
  });
});
