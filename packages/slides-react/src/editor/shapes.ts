// The shapes and lines the Insert menu offers. Each preset is a PowerPoint
// preset name, which the renderer draws and the PPTX export writes as is.

import type { Route } from "@kasten-slides/wasm";

export interface ShapeEntry {
  preset: string;
  label: string;
}

export const SHAPE_GROUPS: { title: string; shapes: ShapeEntry[] }[] = [
  {
    title: "Shapes",
    shapes: [
      { preset: "rect", label: "Rectangle" },
      { preset: "roundRect", label: "Rounded rectangle" },
      { preset: "ellipse", label: "Oval" },
      { preset: "triangle", label: "Triangle" },
      { preset: "rtTriangle", label: "Right triangle" },
      { preset: "diamond", label: "Diamond" },
      { preset: "parallelogram", label: "Parallelogram" },
      { preset: "trapezoid", label: "Trapezoid" },
      { preset: "pentagon", label: "Pentagon" },
      { preset: "hexagon", label: "Hexagon" },
      { preset: "octagon", label: "Octagon" },
      { preset: "plus", label: "Cross" },
      { preset: "star5", label: "5-point star" },
      { preset: "can", label: "Cylinder" },
    ],
  },
  {
    title: "Arrows",
    shapes: [
      { preset: "rightArrow", label: "Right arrow" },
      { preset: "leftArrow", label: "Left arrow" },
      { preset: "upArrow", label: "Up arrow" },
      { preset: "downArrow", label: "Down arrow" },
      { preset: "leftRightArrow", label: "Left-right arrow" },
      { preset: "chevron", label: "Chevron" },
      { preset: "homePlate", label: "Pentagon arrow" },
    ],
  },
  {
    title: "Callouts",
    shapes: [
      { preset: "wedgeRectCallout", label: "Rectangle callout" },
      { preset: "wedgeRoundRectCallout", label: "Rounded callout" },
    ],
  },
  {
    title: "Flowchart",
    shapes: [
      { preset: "flowChartProcess", label: "Process" },
      { preset: "flowChartDecision", label: "Decision" },
      { preset: "flowChartTerminator", label: "Terminator" },
    ],
  },
];

export interface LineEntry {
  tool: `line:${Route}` | `arrow:${Route}`;
  label: string;
}

export const LINES: LineEntry[] = [
  { tool: "line:straight", label: "Line" },
  { tool: "arrow:straight", label: "Arrow" },
  { tool: "line:elbow", label: "Elbow connector" },
  { tool: "arrow:elbow", label: "Elbow arrow connector" },
  { tool: "line:curved", label: "Curved connector" },
  { tool: "arrow:curved", label: "Curved arrow connector" },
];

/** How big a shape or text box is when it is placed by a click instead of a drag. */
export const CLICK_SIZE = { shape: { w: 160, h: 120 }, text: { w: 300, h: 56 } } as const;
