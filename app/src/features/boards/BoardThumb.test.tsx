import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { BoardView } from "../../lib/vault/types";
import { BoardThumb } from "./BoardThumb";

afterEach(cleanup);

const board = (nodes: BoardView["nodes"]): BoardView => ({ path: "Boards/Plan.canvas", title: "Plan", nodes, edges: [] }) as unknown as BoardView;

describe("BoardThumb", () => {
  it("draws a shape by its outline and a drawing as its line", () => {
    const { container } = render(
      <BoardThumb
        board={board([
          { id: "a", kind: "text", x: 0, y: 0, width: 160, height: 80, text: "Start", shape: "ellipse" },
          { id: "b", kind: "text", x: 200, y: 0, width: 60, height: 30, draw: { points: "4,4 30,20 56,6", size: 4 } },
          { id: "c", kind: "text", x: 0, y: 120, width: 200, height: 120, text: "A sticky" },
        ])}
      />,
    );
    const outline = container.querySelector("path[transform='translate(0 0)']");
    expect(outline?.getAttribute("d")).toMatch(/A/); // the ellipse's arcs
    const stroke = container.querySelector("svg svg path");
    expect(stroke?.getAttribute("d")).toMatch(/^M4 4/);
    expect(container.querySelectorAll("rect")).toHaveLength(1);
  });
});
