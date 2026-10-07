import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, FolderApi, contentHash } from "./api.ts";
import { FolderHost } from "./folder-host.ts";

const reply = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** An API whose server is a function, recording what was asked. */
function serverOf(answer: (url: string, init?: RequestInit) => Response) {
  const asked: { url: string; init?: RequestInit }[] = [];
  const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    asked.push({ url: String(input), ...(init ? { init } : {}) });
    return Promise.resolve(answer(String(input), init));
  });
  return { api: new FolderApi("", fetcher as unknown as typeof fetch), asked };
}

describe("the hash", () => {
  it("is the hash the server gives, so the page and the folder agree on what is the same file", () => {
    // Known values of FNV-1a 64, which crates/slides-cli/src/dev/files.rs computes on the bytes.
    expect(contentHash("")).toBe("cbf29ce484222325");
    expect(contentHash("a")).toBe("af63dc4c8601ec8c");
    expect(contentHash("é")).toBe(contentHash("é"));
    expect(contentHash("é")).not.toBe(contentHash("e"));
  });
});

describe("the requests", () => {
  it("name the deck and the version a save started from, and send the text as the body", async () => {
    const { api, asked } = serverOf(() => reply({ status: "written", deck: { path: "a b.deck", text: "{}", hash: "h2", modified: 1 } }));
    await api.save("a b.deck", '{"x":1}', "h1");
    expect(asked[0]?.url).toBe("/api/deck?path=a+b.deck&base=h1");
    expect(asked[0]?.init?.method).toBe("PUT");
    expect(asked[0]?.init?.body).toBe('{"x":1}');
    expect(asked[0]?.init?.headers).toMatchObject({ "X-Slides": "1", "Content-Type": "application/json" });
  });

  it("send the header only this page sends with everything that changes something", async () => {
    const { api, asked } = serverOf(() => reply({ path: "x.deck", trashed: ".trash/x.deck" }));
    await api.create("Talk", "Dark");
    await api.trash("x.deck");
    await api.addAsset("a.png", new Uint8Array([1]));
    expect(asked.map((a) => a.init?.method)).toEqual(["POST", "POST", "POST"]);
    for (const a of asked) expect(a.init?.headers).toMatchObject({ "X-Slides": "1" });
    expect(asked[0]?.url).toBe("/api/decks?title=Talk&theme=Dark");
  });

  it("turn a refusal into an error that says why", async () => {
    const { api } = serverOf(() => reply({ error: "not a deck" }, 422));
    await expect(api.deck("x.deck")).rejects.toMatchObject({ status: 422, message: "not a deck" });
    await expect(api.deck("x.deck")).rejects.toBeInstanceOf(ApiError);
  });

  it("give a picture's address the server understands", () => {
    const { api } = serverOf(() => reply({}));
    expect(api.assetUrl("assets/my logo.png")).toBe("/api/asset?path=assets%2Fmy+logo.png");
  });
});

/** The server's stream of changes, as the page sees it: the test sends what the server would. */
class FakeStream {
  static all: FakeStream[] = [];
  onmessage: ((message: { data: string }) => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeStream.all.push(this);
  }
  close(): void {
    this.closed = true;
  }
  send(event: unknown): void {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

describe("the folder host", () => {
  const hand = vi.fn();
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeStream.all = [];
  });

  it("saves from the version it last saw and remembers the new one", async () => {
    const { api, asked } = serverOf(() => reply({ status: "written", deck: { path: "t.deck", text: "T", hash: "h2", modified: 1 } }));
    const host = new FolderHost(api, "t.deck", "h1", hand);
    expect(await host.save("T")).toEqual({ status: "saved" });
    expect(host.base).toBe("h2");
    await host.save("U");
    expect(asked[1]?.url).toContain("base=h2");
  });

  it("reports a conflict with the file's text and where its own was kept, and keeps its base", async () => {
    const { api } = serverOf(() => reply({ status: "conflict", copy: "t (conflict).deck", deck: { path: "t.deck", text: "THEIRS", hash: "h9", modified: 1 } }));
    const host = new FolderHost(api, "t.deck", "h1", hand);
    expect(await host.save("MINE")).toEqual({ status: "conflict", theirs: "THEIRS", copy: "t (conflict).deck" });
    expect(host.base).toBe("h1");
  });

  it("overwrites from the version now on disk, not the one it read", async () => {
    let calls = 0;
    const { api, asked } = serverOf(() => (calls++ === 0 ? reply({ path: "t.deck", text: "NOW", hash: "hNow", modified: 1 }) : reply({ status: "written", deck: { path: "t.deck", text: "MINE", hash: "h3", modified: 1 } })));
    const host = new FolderHost(api, "t.deck", "h1", hand);
    await host.save("MINE", { overwrite: true });
    expect(asked[1]?.url).toContain("base=hNow");
    expect(host.base).toBe("h3");
  });

  it("takes the hash of a version the editor took from outside", () => {
    const { api } = serverOf(() => reply({}));
    const host = new FolderHost(api, "t.deck", "h1", hand);
    host.synced("a");
    expect(host.base).toBe("af63dc4c8601ec8c");
  });

  it("reads the bibliography of the folder as text", async () => {
    const { api, asked } = serverOf(() => reply({ text: "@article{a, title={One}}\n" }));
    const host = new FolderHost(api, "t.deck", "h1", hand);
    expect(await host.references()).toBe("@article{a, title={One}}\n");
    expect(asked[0]?.url).toBe("/api/references");
  });

  it("is told to read the bibliography again when the folder says a .bib file changed, and only then", () => {
    vi.stubGlobal("EventSource", FakeStream);
    const { api } = serverOf(() => reply({}));
    const host = new FolderHost(api, "t.deck", "h1", hand);
    const changed = vi.fn();
    const stop = host.watchReferences(changed);
    const stream = FakeStream.all.at(-1);
    expect(stream?.url).toBe("/api/events");
    stream?.send({ kind: "deck", change: "changed", path: "t.deck", hash: "h2" });
    stream?.send({ kind: "asset", change: "added", path: "assets/a.png" });
    expect(changed).not.toHaveBeenCalled();
    for (const change of ["added", "changed", "removed"]) stream?.send({ kind: "references", change, path: "refs.bib" });
    expect(changed).toHaveBeenCalledTimes(3);
    stream?.onmessage?.({ data: "this is not an event" });
    expect(changed).toHaveBeenCalledTimes(3);
    stop();
    expect(stream?.closed).toBe(true);
  });

  it("shows only pictures kept under assets/", () => {
    const { api } = serverOf(() => reply({}));
    const host = new FolderHost(api, "t.deck", "h1", hand);
    expect(host.imageUrl("assets/a.png")).toBe("/api/asset?path=assets%2Fa.png");
    expect(host.imageUrl("https://example.com/a.png")).toBeUndefined();
    expect(host.imageUrl("../secret.png")).toBeUndefined();
  });

  it("hands the editor the pictures with what their sidecars remember", async () => {
    const entry = { path: "assets/fig.png", name: "Fig 1.png", bytes: 1405, added: 5, width: 640, height: 160, id: "01K5", source: "pasted", createdBy: "person", tags: ["figure"], caption: "Attention", citationKey: "vaswani2017", sha256: "ab" };
    const bare = { path: "assets/old.png", name: "old.png", bytes: 87, added: 1, tags: [] };
    const { api } = serverOf(() => reply([entry, bare]));
    const host = new FolderHost(api, "t.deck", "h1", hand);
    expect(await host.images()).toEqual([
      { path: "assets/fig.png", name: "Fig 1.png", bytes: 1405, added: 5, width: 640, height: 160, id: "01K5", source: "pasted", createdBy: "person", tags: ["figure"], caption: "Attention", citationKey: "vaswani2017" },
      { path: "assets/old.png", name: "old.png", bytes: 87, added: 1, tags: [] },
    ]);
    expect((await host.assetInfo("assets/old.png"))?.name).toBe("old.png");
    expect(await host.assetInfo("assets/none.png")).toBeUndefined();
    expect(host.deckPath).toBe("t.deck");
  });

  it("says how a picture came in and gets the same path back for the same bytes", async () => {
    const { api, asked } = serverOf(() => reply({ path: "assets/a.png", created: false }));
    const host = new FolderHost(api, "t.deck", "h1", hand);
    expect(await host.addImage("a b.png", new Uint8Array([1]), { source: "pasted" })).toBe("assets/a.png");
    await host.addImage("c.png", new Uint8Array([2]));
    expect(asked.map((a) => a.url)).toEqual(["/api/asset?name=a+b.png&source=pasted", "/api/asset?name=c.png&source=file"]);
  });

  it("changes a picture's notes and asks where pictures are used", async () => {
    const { api, asked } = serverOf((url) => (url.startsWith("/api/usage") ? reply({ "assets/a.png": { notes: [], boards: [], decks: [{ path: "t.deck", title: "T", slides: [{ number: 2, id: "s-2" }], theme: false }] } }) : reply({ path: "assets/a.png", name: "a.png", bytes: 1, added: 1, tags: ["x"], caption: "c" })));
    const host = new FolderHost(api, "t.deck", "h1", hand);
    const changed = await host.setImageMeta("assets/a.png", { tags: ["x"], caption: "c" });
    expect(changed).toMatchObject({ tags: ["x"], caption: "c" });
    expect(asked[0]?.url).toBe("/api/asset-meta?path=assets%2Fa.png");
    expect(asked[0]?.init).toMatchObject({ method: "PUT", body: '{"tags":["x"],"caption":"c"}' });
    expect(asked[0]?.init?.headers).toMatchObject({ "X-Slides": "1" });
    expect((await host.imageUsage())["assets/a.png"]?.decks[0]?.slides).toEqual([{ number: 2, id: "s-2" }]);
  });

  it("gives a small copy of the pictures the server can shrink, and none for the rest", () => {
    const { api } = serverOf(() => reply({}));
    const host = new FolderHost(api, "t.deck", "h1", hand);
    expect(host.thumbnailUrl("assets/a.png", 256)).toBe("/api/thumb?path=assets%2Fa.png&size=256");
    expect(host.thumbnailUrl("assets/a.JPG", 1024)).toBe("/api/thumb?path=assets%2Fa.JPG&size=1024");
    expect(host.thumbnailUrl("assets/logo.svg", 256)).toBeUndefined();
    expect(host.thumbnailUrl("assets/photo.avif", 256)).toBeUndefined();
  });
});
