import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const unlisten = vi.fn();
let deliver: ((event: { payload: unknown }) => void) | null = null;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  isTauri: () => true,
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (name: string, handler: (event: { payload: unknown }) => void) => {
    expect(name).toBe("kasten://present");
    deliver = handler;
    return unlisten;
  },
}));

const { allowEmbeds, embeddedPages, openTauriPresenter, tauriLink } = await import("./presenter-link");

afterEach(() => {
  invoke.mockReset();
  unlisten.mockReset();
  deliver = null;
});

describe("the link between the two windows of a talk", () => {
  it("hands on the messages of the other window, and nothing else", async () => {
    const link = await tauriLink();
    const heard: unknown[] = [];
    link.subscribe((message) => heard.push(message));
    deliver?.({ payload: { type: "hello" } });
    deliver?.({ payload: { type: "state", state: { indexh: 2, indexv: 0 } } });
    deliver?.({ payload: "hello" });
    deliver?.({ payload: { type: "run", code: "alert(1)" } });
    expect(heard).toEqual([{ type: "hello" }, { type: "state", state: { indexh: 2, indexv: 0 } }]);
  });

  it("stops handing a message on to one that unsubscribed", async () => {
    const link = await tauriLink();
    const heard: unknown[] = [];
    const stop = link.subscribe((message) => heard.push(message));
    stop();
    deliver?.({ payload: { type: "hello" } });
    expect(heard).toEqual([]);
  });

  it("posts through the core, and a message the core refuses is not an error", async () => {
    const link = await tauriLink();
    invoke.mockRejectedValue(new Error("not a message"));
    link.post({ type: "bye" });
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledWith("presenter_post", { message: { type: "bye" } });
  });

  it("stops listening when it is closed", async () => {
    const link = await tauriLink();
    link.close();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});

describe("opening the presenter's window", () => {
  it("listens first, then asks the core for the window, and gives the link", async () => {
    invoke.mockResolvedValue(undefined);
    const link = await openTauriPresenter("decks/Talk.deck");
    expect(link).not.toBeNull();
    expect(deliver).not.toBeNull();
    expect(invoke).toHaveBeenCalledWith("open_presenter", { deckPath: "decks/Talk.deck" });
    expect(unlisten).not.toHaveBeenCalled();
  });

  it("gives null, and stops listening, when the window would not open", async () => {
    invoke.mockRejectedValue(new Error("no window"));
    expect(await openTauriPresenter("decks/Talk.deck")).toBeNull();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});

describe("the pages a deck embeds", () => {
  it("are found at any depth, once each", () => {
    const deck = {
      slides: [
        { elements: [{ type: "embed", url: "https://example.org/a" }, { type: "group", children: [{ type: "embed", url: "http://localhost:3000/" }, { type: "text" }] }] },
        { elements: [{ type: "embed", url: "https://example.org/a" }, { type: "embed" }] },
      ],
    };
    expect(embeddedPages(deck)).toEqual(["https://example.org/a", "http://localhost:3000/"]);
    expect(embeddedPages({ slides: [] })).toEqual([]);
    expect(embeddedPages(null)).toEqual([]);
  });

  it("are handed to the core to allow, and an empty list ends it", async () => {
    invoke.mockResolvedValue(undefined);
    await allowEmbeds(["https://example.org/a"]);
    await allowEmbeds([]);
    expect(invoke.mock.calls).toEqual([
      ["allow_embeds", { urls: ["https://example.org/a"] }],
      ["allow_embeds", { urls: [] }],
    ]);
  });

  it("are asked for without an error when the core refuses", async () => {
    invoke.mockRejectedValue(new Error("refused"));
    await expect(allowEmbeds(["https://example.org/a"])).resolves.toBeUndefined();
  });
});
