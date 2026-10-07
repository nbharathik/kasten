import { describe, expect, it } from "vitest";

import { refuseStrayDrop } from "./file-drops";

function drag(type: string, types: string[], taken = false): DragEvent {
  const event = new Event(type, { cancelable: true }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", { value: { types, dropEffect: "copy" } });
  if (taken) event.preventDefault();
  return event;
}

describe("stray file drops", () => {
  it("are refused, so the window never opens the file in place of the app", () => {
    const over = drag("dragover", ["Files"]);
    refuseStrayDrop(over);
    expect(over.defaultPrevented).toBe(true);
    expect(over.dataTransfer!.dropEffect).toBe("none");
    const drop = drag("drop", ["Files"]);
    refuseStrayDrop(drop);
    expect(drop.defaultPrevented).toBe(true);
  });

  it("leave drops something took, and drags without files, alone", () => {
    const taken = drag("dragover", ["Files"], true);
    refuseStrayDrop(taken);
    expect(taken.dataTransfer!.dropEffect).toBe("copy");
    const text = drag("drop", ["text/plain"]);
    refuseStrayDrop(text);
    expect(text.defaultPrevented).toBe(false);
  });

  it("take Markdown and folders to import, and PDFs to read, but no other files", () => {
    const over = (type: string) => {
      const event = new Event("dragover", { cancelable: true }) as DragEvent;
      Object.defineProperty(event, "dataTransfer", { value: { types: ["Files"], items: [{ kind: "file", type }], dropEffect: "copy" } });
      refuseStrayDrop(event);
      return event.dataTransfer!.dropEffect;
    };
    expect(over("")).toBe("copy");
    expect(over("text/markdown")).toBe("copy");
    expect(over("application/pdf")).toBe("copy");
    expect(over("image/png")).toBe("none");
  });
});
