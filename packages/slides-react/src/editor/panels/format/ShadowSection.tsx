import type { Shadow } from "@kasten-slides/wasm";

import type { Patch } from "../../session/elements.ts";
import { ColorButton, Row, ShortNumber, Slider, TriToggle } from "./controls.tsx";
import { PanelSection } from "./PanelSection.tsx";
import type { SectionProps } from "./types.ts";
import { agree } from "./values.ts";
import { NEW_SHADOW, shadowPatch, styleEach } from "./write.ts";

/** A soft shadow behind the element: on or off, and how it falls. */
export function ShadowSection({ session, elements, theme }: SectionProps) {
  const shadows = elements.map((e) => e.style?.shadow ?? null);
  const cast = shadows.filter((shadow): shadow is Shadow => shadow !== null);
  const on = agree(shadows.map((shadow) => shadow !== null), false);
  const change = (patch: Patch) => styleEach(session, elements, (element) => shadowPatch(element, patch));
  return (
    <PanelSection id="shadow" title="Drop shadow">
      <TriToggle
        label="Drop shadow"
        on={on}
        onChange={(next) => styleEach(session, elements, (element) => (next ? (element.style?.shadow ? null : { shadow: NEW_SHADOW }) : element.style?.shadow ? { shadow: null } : null))}
      />
      {on !== false ? (
        <>
          <Row label="Colour">
            <ColorButton theme={theme} label="Shadow colour" value={agree(cast.map((s) => s.color), "text1")} noneLabel="Keep colour" onPick={(picked) => {
                if (picked !== null) change({ color: picked });
              }} />
          </Row>
          <div className="ks-sp-grid">
            <ShortNumber short="Blur" label="Shadow blur" unit="px" min={0} max={100} decimals={1} width={56} value={agree(cast.map((s) => s.blur), 0)} onCommit={(blur) => change({ blur })} />
            <ShortNumber short="Right" label="Shadow right" unit="px" min={-200} max={200} decimals={1} width={56} value={agree(cast.map((s) => s.dx), 0)} onCommit={(dx) => change({ dx })} />
            <ShortNumber short="Down" label="Shadow down" unit="px" min={-200} max={200} decimals={1} width={56} value={agree(cast.map((s) => s.dy), 0)} onCommit={(dy) => change({ dy })} />
          </div>
          <Row label="Opacity">
            <Slider
              label="Shadow opacity"
              value={agree(cast.map((s) => Math.round((s.alpha ?? 1) * 100)), 100)}
              onCommit={(percent) => change({ alpha: percent >= 100 ? null : percent / 100 })}
            />
          </Row>
        </>
      ) : null}
    </PanelSection>
  );
}
