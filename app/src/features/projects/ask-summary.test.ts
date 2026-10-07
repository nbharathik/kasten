// "Ask AI" on a project's summary works before the chat has ever drawn,
// says so when the chat is still busy, and leads to Settings when no AI
// is set up.

import { beforeEach, describe, expect, it } from "vitest";

import { metaFor } from "../workspace/preview/note-meta";
import { takeProvidersJump } from "../chat/actions";
import { useChat } from "../chat/store";
import { resetChat, scriptedChat, type Scripted } from "../chat/test-kit";
import { useWorkspace } from "../workspace/store";
import { askForSummary } from "./ask-summary";

const project = metaFor("projects/trip/_project.md", "---\ntitle: Trip\ntype: project\n---\n", 0);
const toasts = () => useWorkspace.getState().toasts.map((t) => t.text);

let chat: Scripted;

beforeEach(() => {
  localStorage.clear();
  chat = scriptedChat();
  resetChat(chat);
  useWorkspace.setState({ toasts: [] });
});

describe("asking for a project's summary", () => {
  it("loads the AI providers first when the chat has not yet", async () => {
    expect(useChat.getState().providers).toBeNull();
    await askForSummary(project, []);
    expect(chat.requests).toHaveLength(1);
    expect(chat.requests[0]!.text).toContain("[[Trip]]");
    expect(toasts()).toEqual([]);
  });

  it("says the chat is busy rather than asking for a provider", async () => {
    await useChat.getState().loadProviders();
    const id = useChat.getState().start({ open: true });
    await useChat.getState().send(id, "Something long");
    await askForSummary(project, []);
    expect(chat.requests).toHaveLength(1);
    expect(toasts()).toEqual(["The chat is still answering; ask for the summary when it is done"]);
  });

  it("offers to set up a provider when there is none", async () => {
    chat = scriptedChat([]);
    resetChat(chat);
    await askForSummary(project, []);
    expect(chat.requests).toHaveLength(0);
    const notice = useWorkspace.getState().toasts.at(-1)!;
    expect(notice.text).toBe("Set up an AI provider in Settings to ask for a summary");
    expect(notice.action?.label).toBe("Set up");
    notice.action!.run();
    expect(useWorkspace.getState().place.view).toBe("settings");
    expect(takeProvidersJump()).toBe(true);
  });
});
