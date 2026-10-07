// The images drawer's host members in Kasten: the vault's assets as the editor's images.

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AssetInfo } from "../../lib/vault/asset-types";
import type { VaultClient } from "../../lib/vault/types";
import { assetFilesChanged, assetVersion } from "./events";
import { galleryHost, hostImage } from "./gallery-host";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const asset = (over: Partial<AssetInfo> = {}): AssetInfo => ({
  path: "assets/figure.png",
  name: "Figure 3.png",
  id: "01K5",
  bytes: 1405,
  sha256: null,
  width: 640,
  height: 160,
  source: "pdf-clip",
  createdBy: "person",
  created: "2026-09-24T08:00:00Z",
  added: 5,
  tags: ["figure"],
  caption: "Attention",
  citationKey: "vaswani2017",
  clip: { pdf: "sources/a.pdf", page: 3, rect: [1, 2, 3, 4] },
  deck: null,
  paper: "Attention Is All You Need",
  described: true,
  ...over,
});

const clientOf = (parts: Partial<VaultClient>) => parts as unknown as VaultClient;

describe("an asset as the editor's image", () => {
  it("carries what is known and leaves out what is not", () => {
    expect(hostImage(asset())).toEqual({
      path: "assets/figure.png",
      name: "Figure 3.png",
      bytes: 1405,
      added: 5,
      tags: ["figure"],
      width: 640,
      height: 160,
      id: "01K5",
      source: "pdf-clip",
      createdBy: "person",
      caption: "Attention",
      citationKey: "vaswani2017",
      clip: { pdf: "sources/a.pdf", page: 3, rect: [1, 2, 3, 4] },
      paper: "Attention Is All You Need",
    });
    const old = hostImage(asset({ id: null, width: null, height: null, source: null, createdBy: null, caption: null, citationKey: null, clip: null, paper: null, tags: [] }));
    expect(old).toEqual({ path: "assets/figure.png", name: "Figure 3.png", bytes: 1405, added: 5, tags: [] });
  });
});

describe("the host members", () => {
  it("lists images and their use through the vault, and keeps new ones as files unless told they were pasted", async () => {
    const added: unknown[] = [];
    const usage = { "assets/figure.png": { notes: [], boards: [], decks: [] } };
    const host = galleryHost(
      clientOf({
        assets: async () => [asset()],
        asset: async () => asset({ name: "One.png" }),
        assetsUsage: async () => usage,
        setAssetMeta: async (_path, edit) => asset({ tags: edit.tags ?? [] }),
        addAsset: async (name, _bytes, meta) => (added.push([name, meta]), { path: "assets/x.png", created: true, asset: asset() }),
      }),
    );
    expect((await host.images()).map((i) => i.name)).toEqual(["Figure 3.png"]);
    expect((await host.assetInfo("assets/one.png"))?.name).toBe("One.png");
    expect(await host.imageUsage()).toBe(usage);
    expect((await host.setImageMeta("assets/figure.png", { tags: ["a"] }))?.tags).toEqual(["a"]);
    expect(await host.addImage("a.png", new Uint8Array([1]))).toBe("assets/x.png");
    await host.addImage("b.png", new Uint8Array([1]), { source: "pasted" });
    expect(added).toEqual([
      ["a.png", { source: "file" }],
      ["b.png", { source: "pasted" }],
    ]);
  });

  it("makes each small copy once, as a blob URL, and again when the file changed", async () => {
    const asked: string[] = [];
    const made = vi.fn(() => "blob:small");
    vi.stubGlobal("URL", Object.assign(Object.create(URL), { createObjectURL: made }));
    const host = galleryHost(
      clientOf({
        assetThumb: async (path, size) => {
          asked.push(`${path}@${size}`);
          return path.endsWith(".svg") ? undefined : new Uint8Array([82, 73, 70, 70]);
        },
      }),
    );
    expect(await host.thumbnailUrl("assets/a.png", 256)).toBe("blob:small");
    expect(await host.thumbnailUrl("assets/a.png", 256)).toBe("blob:small");
    await host.thumbnailUrl("assets/a.png", 1024);
    expect(asked).toEqual(["assets/a.png@256", "assets/a.png@1024"]);
    expect(made).toHaveBeenCalledTimes(2);
    // The file changed: the copy made before is not the one to show.
    assetFilesChanged(["assets/a.png"]);
    await host.thumbnailUrl("assets/a.png", 256);
    expect(asked.at(-1)).toBe("assets/a.png@256");
    expect(asked).toHaveLength(3);
    // A picture with no small copy is shown as itself where the app can show files (the preview cannot: nothing).
    expect(await host.thumbnailUrl("assets/logo.svg", 256)).toBeUndefined();
  });

  it("tells when files under assets/ change, and counts a file's versions", () => {
    const host = galleryHost(clientOf({}));
    const seen: number[] = [];
    const stop = host.watchImages(() => seen.push(1));
    const before = assetVersion("assets/w.png");
    assetFilesChanged(["notes/a.md", "library/x.deck"]);
    expect(seen).toEqual([]);
    assetFilesChanged(["assets/w.png", "assets/.meta/w.png.json"]);
    expect(seen).toEqual([1]);
    expect(assetVersion("assets/w.png")).toBe(before + 1);
    stop();
    assetFilesChanged(["assets/w.png"]);
    expect(seen).toEqual([1]);
  });
});
