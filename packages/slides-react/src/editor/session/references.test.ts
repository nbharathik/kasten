import { referenceList, setReferences } from "@kasten-slides/wasm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { newDeck } from "../../test/engine.ts";
import type { SlidesHost } from "../host.ts";
import { EditorSession } from "./session.ts";

afterEach(() => setReferences(null));

const keys = () => referenceList()?.map((work) => work.key) ?? null;

/** What the editor needs of a host, and a bibliography the test can change and announce. */
function hostWith(references: (() => Promise<string>) | undefined) {
  let announce: (() => void) | undefined;
  const stopped = vi.fn();
  const host = {
    save: async () => ({ status: "saved" as const }),
    imageUrl: () => undefined,
    addImage: async (name: string) => `assets/${name}`,
    deliver: async () => {},
    notify: () => {},
    ...(references
      ? {
          references,
          watchReferences(onChange: () => void) {
            announce = onChange;
            return stopped;
          },
        }
      : {}),
  } satisfies SlidesHost;
  return { host, announce: () => announce?.(), stopped };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the bibliography a session follows", () => {
  it("is given to the page when the editor opens, and again each time the host says it changed", async () => {
    let text = "@article{first, title={One}}";
    const { host, announce } = hostWith(async () => text);
    const session = new EditorSession(await newDeck(), host);
    await settle();
    expect(keys()).toEqual(["first"]);

    text = "@article{first, title={One}}\n@article{second, title={Two}}";
    announce();
    await settle();
    expect(keys()).toEqual(["first", "second"]);

    text = "";
    announce();
    await settle();
    expect(keys()).toEqual([]);
    await session.dispose();
  });

  it("is left alone by a host that has none, and stops being followed when the session ends", async () => {
    setReferences("@article{kept, title={Kept}}");
    const none = hostWith(undefined);
    const plain = new EditorSession(await newDeck(), none.host);
    await settle();
    expect(keys()).toEqual(["kept"]);
    await plain.dispose();

    let text = "@article{a, title={A}}";
    const { host, announce, stopped } = hostWith(async () => text);
    const session = new EditorSession(await newDeck(), host);
    await settle();
    await session.dispose();
    expect(stopped).toHaveBeenCalledTimes(1);
    text = "@article{b, title={B}}";
    announce();
    await settle();
    expect(keys()).toEqual(["a"]);
  });

  it("drops an answer that arrives after a newer question was asked, and tells the person when it cannot be read", async () => {
    const answers: ((text: string) => void)[] = [];
    const told: string[] = [];
    const { host, announce } = hostWith(() => new Promise<string>((resolve) => answers.push(resolve)));
    const session = new EditorSession(await newDeck(), host, { onError: (message) => told.push(message) });
    announce();
    expect(answers).toHaveLength(2);
    answers[1]?.("@article{newer, title={Newer}}");
    await settle();
    answers[0]?.("@article{older, title={Older}}");
    await settle();
    expect(keys()).toEqual(["newer"]);
    await session.dispose();

    const broken = hostWith(async () => {
      throw new Error("the disk is gone");
    });
    const other = new EditorSession(await newDeck(), broken.host, { onError: (message) => told.push(message) });
    await settle();
    expect(told).toEqual(["The references could not be read: the disk is gone"]);
    expect(keys()).toEqual(["newer"]);
    await other.dispose();
  });
});
