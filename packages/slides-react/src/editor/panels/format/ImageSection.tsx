import type { Crop, Mask } from "@kasten-slides/wasm";

import { DEFAULT_MASK_RADIUS } from "../../../render/elements/ImageView.tsx";
import { TextButton } from "../../ui/Button.tsx";
import { NumberField, Segmented } from "../../ui/Fields.tsx";
import { AltText } from "./AccessSection.tsx";
import { Row, ShortNumber } from "./controls.tsx";
import { PanelSection } from "./PanelSection.tsx";
import type { SectionProps } from "./types.ts";
import { agree, json, only, round1 } from "./values.ts";
import { patchEach, styleEach } from "./write.ts";

type Side = keyof Crop;
const SIDES: { side: Side; label: string; opposite: Side }[] = [
  { side: "left", label: "Left", opposite: "right" },
  { side: "top", label: "Top", opposite: "bottom" },
  { side: "right", label: "Right", opposite: "left" },
  { side: "bottom", label: "Bottom", opposite: "top" },
];

const MASKS: { value: Mask | "none"; label: string; title: string }[] = [
  { value: "none", label: "None", title: "No mask" },
  { value: "rect", label: "Rect", title: "Rectangle" },
  { value: "roundRect", label: "Round", title: "Rounded rectangle" },
  { value: "ellipse", label: "Oval", title: "Oval" },
];

/** The most of a picture a crop may cut across: some of it always shows. */
const MOST_CUT = 0.95;

const percent = (crop: Crop | null | undefined, side: Side): number => round1((crop?.[side] ?? 0) * 100);

/** The crop with one edge changed to `cut`, a fraction of the picture; null when nothing is cut. */
function cropWith(crop: Crop | null | undefined, side: Side, opposite: Side, cut: number): Crop | null {
  const now: Crop = { left: 0, top: 0, right: 0, bottom: 0, ...crop };
  const next: Crop = { ...now, [side]: Math.round(Math.min(Math.max(cut, 0), MOST_CUT - now[opposite]) * 10000) / 10000 };
  return next.left || next.top || next.right || next.bottom ? next : null;
}

/** How a picture is cut: the shape it shows through, and how much is cropped from each edge. */
export function ImageSection({ session, elements }: SectionProps) {
  const images = only(elements, "image");
  const mask = agree(images.map((i) => i.mask ?? "none"), "none");
  const rounded = images.filter((i) => i.mask === "roundRect");
  const cropped = images.some((i) => i.crop);
  return (
    <PanelSection id="image" title="Image">
      <Row label="Mask">
        <Segmented<Mask | "none">
          label="Mask"
          value={mask}
          options={MASKS.map(({ value, label, title }) => ({ value, label, title }))}
          onPick={(picked) => patchEach(session, images, (image) => ((image.mask ?? "none") === picked ? null : { mask: picked === "none" ? null : picked }))}
        />
      </Row>
      {rounded.length > 0 ? (
        <Row label="Radius">
          <span className="ks-sp-plain">
            <NumberField
              label="Corner radius"
              unit="px"
              min={0}
              max={400}
              decimals={1}
              width={64}
              value={agree(rounded.map((i) => i.style?.radius ?? DEFAULT_MASK_RADIUS), DEFAULT_MASK_RADIUS)}
              onCommit={(radius) => styleEach(session, rounded, () => ({ radius }))}
            />
          </span>
        </Row>
      ) : null}
      <div className="ks-sp-field" role="group" aria-label="Crop, as a share of the picture">
        <span className="ks-sp-label">Crop, as a share of the picture</span>
        <div className="ks-sp-grid">
          {SIDES.map(({ side, label, opposite }) => (
            <ShortNumber
              key={side}
              short={label}
              label={`Crop ${side}`}
              unit="%"
              min={0}
              max={95}
              decimals={1}
              width={52}
              value={agree(images.map((i) => percent(i.crop, side)), 0)}
              onCommit={(value) => patchEach(session, images, (image) => ({ crop: json(cropWith(image.crop, side, opposite, value / 100)) }))}
            />
          ))}
        </div>
      </div>
      <div>
        <TextButton disabled={!cropped} onClick={() => patchEach(session, images, (image) => (image.crop ? { crop: null } : null))}>
          Reset crop
        </TextButton>
      </div>
      <AltText session={session} elements={images} />
    </PanelSection>
  );
}
