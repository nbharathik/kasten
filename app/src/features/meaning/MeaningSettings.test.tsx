import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useChat } from "../chat/store";
import { MemoryVault } from "../workspace/preview/memory-vault";
import { useWorkspace } from "../workspace/store";
import type { MeaningApi, MeaningStatus } from "./client";
import { MeaningSettings } from "./MeaningSettings";

let vault: MemoryVault;

function fakeApi(status: MeaningStatus): MeaningApi & { progress?: (p: { done: number; total: number }) => void } {
  const api: MeaningApi & { progress?: (p: { done: number; total: number }) => void } = {
    available: () => true,
    status: vi.fn(async () => status),
    make: vi.fn(async () => {
      api.progress?.({ done: 5, total: 12 });
      return { ...status, done: 12 };
    }),
    stop: vi.fn(async () => {}),
    search: vi.fn(async () => []),
    onProgress: (listener) => {
      api.progress = listener;
      return () => {};
    },
  };
  return api;
}

beforeEach(() => {
  vault = new MemoryVault({ "library/a.md": "---\ntitle: A\n---\nA.\n" });
  useWorkspace.setState({ client: vault });
  useChat.setState({
    providers: [
      { name: "claude", kind: "anthropic", baseUrl: "", model: "model-small", hasKey: true, confirmed: true },
      { name: "openai", kind: "openai", baseUrl: "https://api.openai.com/v1", model: "other-model", hasKey: true, confirmed: true },
      { name: "local", kind: "openai", baseUrl: "http://llm-server:8000/v1", model: "local-model", hasKey: false, confirmed: true },
    ],
  });
});
afterEach(cleanup);

describe("Settings: search by meaning", () => {
  it("chooses an OpenAI-compatible provider and model, kept in the vault's config", async () => {
    const api = fakeApi({ provider: null, model: null, done: 0, total: 12, running: false });
    render(<MeaningSettings api={api} />);
    const provider = (await screen.findByRole("combobox", { name: "Provider for search by meaning" })) as HTMLSelectElement;
    // Only providers that make vectors are offered.
    expect([...provider.options].map((o) => o.value)).toEqual(["", "openai", "local"]);
    fireEvent.change(provider, { target: { value: "openai" } });
    const model = screen.getByRole("textbox", { name: "Embedding model" }) as HTMLInputElement;
    expect(model.value).toBe("text-embedding-3-small");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect((await vault.getConfig()).ai.embeddings).toEqual({ provider: "openai", model: "text-embedding-3-small" });
  });

  it("makes the vectors notes need, showing how far it got", async () => {
    await vault.setConfig({ ...(await vault.getConfig()), ai: { providers: [], embeddings: { provider: "openai", model: "text-embedding-3-small" } } });
    const api = fakeApi({ provider: "openai", model: "text-embedding-3-small", done: 0, total: 12, running: false });
    render(<MeaningSettings api={api} />);
    expect(await screen.findByText("0 of 12 notes have vectors")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Make vectors" })));
    expect(api.make).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("12 of 12 notes have vectors")).toBeTruthy());
  });

  it("in the browser preview, says it needs the desktop app", () => {
    render(<MeaningSettings api={{ ...fakeApi({ provider: null, model: null, done: 0, total: 0, running: false }), available: () => false }} />);
    expect(screen.getByText(/desktop app/)).toBeTruthy();
  });
});
