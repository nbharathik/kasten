import { type JSX, useState } from "react";

import { colorOf, fontStack } from "../../theme/index.ts";
import type { RenderCx, ViewProps } from "../context.ts";

/** A grey box that says what is there, for what cannot be drawn. */
export function RawBox({ cx, label }: { cx: RenderCx; label: string }): JSX.Element {
  const { theme } = cx;
  return (
    <div
      className="ks-raw"
      style={{ background: colorOf(theme, "text2", 0.15), borderColor: colorOf(theme, "text2", 0.5), color: colorOf(theme, "text2"), fontFamily: fontStack(theme, "body") }}
    >
      <span>{label}</span>
    </div>
  );
}

/** What an import could not understand: the picture it kept of it, or failing that a labelled grey box. */
export function RawView({ element, cx }: ViewProps<"raw">): JSX.Element {
  const [failed, setFailed] = useState<string | null>(null);
  const preview = element.preview ? (cx.imageUrl ? cx.imageUrl(element.preview) : element.preview) : undefined;
  if (preview && failed !== preview) {
    return (
      <img
        className="ks-image-pic"
        src={preview}
        alt={element.alt ?? ""}
        draggable={false}
        style={{ left: 0, top: 0, width: "100%", height: "100%" }}
        onError={() => setFailed(preview)}
      />
    );
  }
  return <RawBox cx={cx} label={element.original ?? "Unsupported content"} />;
}
