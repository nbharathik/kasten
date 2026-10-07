import type { Arrow, Dash, Element } from "@kasten-slides/wasm";
import type { JSX } from "react";

import { plainItem } from "../menus/build.ts";
import { ArrowPreview, DashPreview, WeightPreview } from "../menus/previews.tsx";
import type { Patch } from "../session/elements.ts";
import type { EditorSession } from "../session/session.ts";
import type { EditorUi } from "../ui-state.ts";
import { Divider } from "../ui/Button.tsx";
import { useEditor } from "../useEditor.ts";
import { ColorButton } from "./ColorButton.tsx";
import { MenuButton } from "./ToolButton.tsx";

const WEIGHTS = [1, 2, 3, 4, 6, 8, 12];

const DASHES: { value: Dash; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dash", label: "Dash" },
  { value: "dot", label: "Dot" },
  { value: "dashDot", label: "Dash-dot" },
  { value: "longDash", label: "Long dash" },
];

const ARROWS: { value: Arrow; label: string }[] = [
  { value: "none", label: "None" },
  { value: "triangle", label: "Triangle" },
  { value: "stealth", label: "Stealth" },
  { value: "open", label: "Open" },
  { value: "oval", label: "Oval" },
  { value: "diamond", label: "Diamond" },
];

/** What has a fill, what has an outline, and what has arrowheads. */
const FILLED = new Set<Element["type"]>(["shape", "text"]);
const OUTLINED = new Set<Element["type"]>(["shape", "text", "line", "connector"]);
const HEADED = new Set<Element["type"]>(["line", "connector"]);

/** The one value they all have, `none` for no elements, or "mixed". */
function agree<T>(values: T[], none: T): T | "mixed" {
  if (values.length === 0) return none;
  return values.every((v) => v === values[0]) ? values[0]! : "mixed";
}

/** Whether the selection has anything the shape tools apply to. */
export function hasShapeTools(session: EditorSession): boolean {
  return session.elements.find().some((e) => OUTLINED.has(e.type));
}

/**
 * Fill, border and arrowheads of the selected shapes, lines, connectors and
 * text boxes; nothing when the selection holds none of them.
 */
export function ShapeTools({ session, ui }: { session: EditorSession; ui: EditorUi }): JSX.Element | null {
  useEditor(session);
  const picked = session.elements.find();
  const outlined = picked.filter((e) => OUTLINED.has(e.type));
  if (outlined.length === 0) return null;
  const filled = outlined.filter((e) => FILLED.has(e.type));
  const headed = outlined.filter((e) => HEADED.has(e.type));
  const { theme } = session.deck;
  const ids = (list: Element[]) => list.map((e) => e.id);

  const fill = agree(filled.map((e) => e.style?.fill?.color ?? null), null);
  const border = agree(outlined.map((e) => e.style?.stroke?.color ?? null), null);
  const weight = agree(outlined.map((e) => e.style?.stroke?.width ?? null), null);
  const dash = agree(outlined.map((e) => e.style?.stroke?.dash ?? "solid"), "solid");
  const start = agree(headed.map((e) => e.style?.startArrow ?? "none"), "none");
  const end = agree(headed.map((e) => e.style?.endArrow ?? "none"), "none");

  /** Changes part of the outline. Where an element has none yet, it gets one in the text colour to hold the change. */
  const setStroke = (part: Patch) => {
    const has = outlined.filter((e) => e.style?.stroke);
    const lacks = outlined.filter((e) => !e.style?.stroke);
    if (has.length > 0) session.elements.style({ stroke: part }, ids(has));
    if (lacks.length > 0) session.elements.style({ stroke: { color: "text1", ...part } }, ids(lacks));
  };

  return (
    <>
      <Divider />
      <ColorButton
        theme={theme}
        icon="paint-bucket"
        label="Fill colour"
        value={fill === "mixed" ? null : fill}
        mixed={fill === "mixed"}
        noneLabel="Transparent"
        disabled={filled.length === 0}
        onPick={(color) => session.elements.style({ fill: color === null ? null : { color } }, ids(filled))}
      />
      <ColorButton
        theme={theme}
        icon="pen-line"
        label="Border colour"
        value={border === "mixed" ? null : border}
        mixed={border === "mixed"}
        noneLabel="Transparent"
        onPick={(color) => (color === null ? session.elements.style({ stroke: null }, ids(outlined)) : setStroke({ color, alpha: null }))}
      />
      <MenuButton
        ui={ui}
        label="Border weight"
        items={() => WEIGHTS.map((w) => plainItem(`weight-${w}`, `${w} px`, () => setStroke({ width: w }), { checked: weight === w, trailing: <WeightPreview width={w} /> }))}
      >
        <WeightPreview width={typeof weight === "number" ? weight : 2} scale={0.6} />
      </MenuButton>
      <MenuButton
        ui={ui}
        label="Border dash"
        items={() => DASHES.map((d) => plainItem(`dash-${d.value}`, d.label, () => setStroke({ dash: d.value === "solid" ? null : d.value }), { checked: dash === d.value, trailing: <DashPreview dash={d.value} /> }))}
      >
        <DashPreview dash={dash === "mixed" ? "solid" : dash} scale={0.6} />
      </MenuButton>
      {headed.length > 0 ? (
        <>
          <MenuButton
            ui={ui}
            label="Arrow start"
            items={() => ARROWS.map((a) => plainItem(`start-${a.value}`, a.label, () => session.elements.style({ startArrow: a.value === "none" ? null : a.value }, ids(headed)), { checked: start === a.value, trailing: <ArrowPreview arrow={a.value} end={false} /> }))}
          >
            <ArrowPreview arrow={start === "mixed" ? "none" : start} end={false} scale={0.6} />
          </MenuButton>
          <MenuButton
            ui={ui}
            label="Arrow end"
            items={() => ARROWS.map((a) => plainItem(`end-${a.value}`, a.label, () => session.elements.style({ endArrow: a.value === "none" ? null : a.value }, ids(headed)), { checked: end === a.value, trailing: <ArrowPreview arrow={a.value} /> }))}
          >
            <ArrowPreview arrow={end === "mixed" ? "none" : end} scale={0.6} />
          </MenuButton>
        </>
      ) : null}
    </>
  );
}
