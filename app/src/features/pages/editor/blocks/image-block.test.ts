// Pictures on a line of their own: what the editor writes back once one is
// moved, resized or given a caption.

import { describe, expect, it } from "vitest";

import { useTestEditor } from "../../../../test/editor";

const editor = useTestEditor();

/** Position of the first picture block. */
function pictureAt(): number {
  let at = -1;
  editor.doc.forEach((node, offset) => {
    if (at < 0 && node.type.name === "image-block") at = offset;
  });
  if (at < 0) throw new Error("no picture block");
  return at;
}

function setAttr(key: string, value: unknown) {
  const { view } = editor;
  view.dispatch(view.state.tr.setNodeAttribute(pictureAt(), key, value));
}

/** Moves the first block below the second, so it is written again. */
function moveFirstDown() {
  const { view } = editor;
  const { doc } = view.state;
  const first = doc.child(0);
  const second = doc.child(1);
  view.dispatch(view.state.tr.delete(0, first.nodeSize).insert(second.nodeSize, first));
}

describe("picture blocks", () => {
  it("keep their alt text and caption when moved", () => {
    editor.open('![Pipeline diagram](assets/p.png "The build")\n\nNext.\n');
    moveFirstDown();
    expect(editor.save()).toBe('Next.\n\n![Pipeline diagram](assets/p.png "The build")\n');
  });

  it("keep their alt text when the caption or size changes", () => {
    editor.open("![Pipeline diagram](assets/p.png)\n");
    setAttr("caption", "The build");
    expect(editor.save()).toBe('![Pipeline diagram](assets/p.png "The build")\n');
    setAttr("ratio", 1.5);
    expect(editor.save()).toBe('![Pipeline diagram](assets/p.png "The build")\n');
  });

  it("keep a size in the alt text only when there is none, as Crepe writes it", () => {
    editor.open("![1.50](assets/p.png)\n\nNext.\n");
    expect(editor.doc.child(0).attrs).toMatchObject({ ratio: 1.5, alt: "" });
    moveFirstDown();
    expect(editor.save()).toBe("Next.\n\n![1.50](assets/p.png)\n");
    setAttr("ratio", 1);
    expect(editor.save()).toBe("Next.\n\n![](assets/p.png)\n");
    // A number that is not Crepe's size is alt text.
    editor.open("![2024](assets/chart.png)\n");
    setAttr("caption", "Sales");
    expect(editor.save()).toBe('![2024](assets/chart.png "Sales")\n');
  });
});
