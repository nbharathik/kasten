import type { Theme } from "@kasten-slides/wasm";
import type { JSX } from "react";

import { chooseImage } from "../panels/format/background.ts";
import type { EditorSession } from "../session/session.ts";
import { TextButton } from "../ui/Button.tsx";
import { logoOf, setLogo } from "./theme-edit.ts";

/** The deck's logo, for themes that have a place for one: the picture now, and buttons to change or take it away. */
export function ThemeLogo({ session, theme }: { session: EditorSession; theme: Theme }): JSX.Element {
  const logo = logoOf(theme);
  const url = logo ? session.host.imageUrl(logo) : undefined;
  const choose = async () => {
    const path = await chooseImage(session);
    if (path) setLogo(session, path);
  };
  return (
    <div className="ks-dg-logo">
      <span className="ks-dg-logo-pic" aria-hidden="true">
        {url ? <img src={url} alt="" /> : null}
      </span>
      <span className="ks-dg-file">{logo ?? "No logo"}</span>
      <TextButton onClick={() => void choose()}>Choose image…</TextButton>
      {/* Taking away a logo that is not there would add an empty one, so the button waits for a logo. */}
      <TextButton disabled={logo === null} onClick={() => setLogo(session, "")}>
        Remove logo
      </TextButton>
    </div>
  );
}
