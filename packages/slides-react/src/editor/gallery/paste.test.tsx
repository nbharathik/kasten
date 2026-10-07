import { act, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runCommand } from "../commands/index.ts";
import { clipboardPictures, pastedName } from "./files.ts";
import { mountGallery } from "./test-kit.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const item = (types: string[], blob: Blob) => ({ types, getType: async () => blob });

describe("the clipboard", () => {
  it("gives the pictures on it as files, and none when it cannot be read", async () => {
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    vi.stubGlobal("navigator", { clipboard: { read: async () => [item(["text/plain"], new Blob(["x"])), item(["image/png"], png)] } });
    const found = await clipboardPictures();
    expect(found.map((f) => [f.name, f.type, f.size])).toEqual([["image.png", "image/png", 4]]);
    vi.stubGlobal("navigator", { clipboard: { read: async () => Promise.reject(new Error("denied")) } });
    expect(await clipboardPictures()).toEqual([]);
    vi.stubGlobal("navigator", {});
    expect(await clipboardPictures()).toEqual([]);
  });

  it("names a pasted picture after when it was pasted, and keeps a name it has", () => {
    const at = new Date(2026, 8, 29, 10, 5, 7);
    expect(pastedName({ name: "image.png", type: "image/png" }, at)).toBe("Pasted image 2026-09-29 100507.png");
    expect(pastedName({ name: "", type: "image/jpeg" }, at)).toBe("Pasted image 2026-09-29 100507.jpg");
    expect(pastedName({ name: "Figure 3.png", type: "image/png" }, at)).toBe("Figure 3.png");
  });
});

describe("Paste on the slide", () => {
  it("keeps a screenshot on the clipboard as a pasted picture and puts it on the slide", async () => {
    const kit = await mountGallery();
    const png = new Blob([new Uint8Array([137, 80, 78, 71, 3])], { type: "image/png" });
    vi.stubGlobal("navigator", { clipboard: { read: async () => [item(["image/png"], png)], readText: async () => "" } });
    const seen: unknown[] = [];
    const add = kit.host.addImage.bind(kit.host);
    kit.host.addImage = async (name, bytes, options) => {
      seen.push([name, options]);
      return add(name, bytes, options);
    };
    await act(async () => runCommand("edit.paste", { session: kit.session, ui: kit.ui }));
    await act(async () => {});
    expect(seen).toHaveLength(1);
    expect((seen[0] as [string, unknown])[0]).toMatch(/^Pasted image \d{4}-\d\d-\d\d \d{6}\.png$/);
    expect((seen[0] as [string, unknown])[1]).toEqual({ source: "pasted" });
    expect(kit.session.slide.elements.filter((e) => e.type === "image")).toHaveLength(1);
  });

  it("still pastes copied elements when the clipboard holds no picture", async () => {
    const kit = await mountGallery();
    vi.stubGlobal("navigator", { clipboard: { read: async () => [item(["text/plain"], new Blob(["x"]))], readText: async () => "" } });
    await act(async () => runCommand("edit.paste", { session: kit.session, ui: kit.ui }));
    expect(kit.session.slide.elements.filter((e) => e.type === "image")).toHaveLength(0);
    expect(kit.errors).toEqual([]);
  });
});
