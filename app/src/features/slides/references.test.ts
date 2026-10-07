import { describe, expect, it, vi } from "vitest";

import type { VaultClient } from "../../lib/vault/types";
import { bibFilesChanged } from "./events";
import { kastenHost } from "./kasten-host";

const client = (text: string) => ({ references: vi.fn(async () => text) }) as unknown as VaultClient;

describe("the bibliography of the Slides editor in Kasten", () => {
  it("is what the vault's .bib files say", async () => {
    const c = client("@article{a, title={A}}");
    const host = kastenHost(c, "library/talk.deck", "h1", () => {});
    expect(await host.references?.()).toBe("@article{a, title={A}}");
    expect(c.references).toHaveBeenCalledTimes(1);
  });

  it("is told to be read again when a .bib file changes, and only then", () => {
    const host = kastenHost(client(""), "library/talk.deck", "h1", () => {});
    const changed = vi.fn();
    const stop = host.watchReferences?.(changed);
    bibFilesChanged(["library/talk.deck", "notes/a.md", "assets/x.png"]);
    expect(changed).not.toHaveBeenCalled();
    bibFilesChanged(["papers/Refs.BIB"]);
    expect(changed).toHaveBeenCalledTimes(1);
    stop?.();
    bibFilesChanged(["refs.bib"]);
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
