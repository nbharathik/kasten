import type { Theme } from "@kasten-slides/wasm";
import type { JSX } from "react";

import { TextField } from "../panels/format/controls.tsx";
import type { EditorSession } from "../session/session.ts";
import { editTheme } from "./theme-edit.ts";

/** Typefaces that suit slides and travel well: the ones the editor bundles, the ones PowerPoint has, and a few open ones. */
export const COMMON_FAMILIES = [
  "Inter",
  "Roboto",
  "Lato",
  "Open Sans",
  "Source Sans 3",
  "Montserrat",
  "Georgia",
  "Cambria",
  "Calibri",
  "Arial",
  "Helvetica Neue",
  "Times New Roman",
  "Roboto Mono",
  "Courier New",
  "Consolas",
];

const ROLES = [
  ["heading", "Heading"],
  ["body", "Body"],
  ["code", "Code"],
] as const;

/** The three typefaces of the theme, each as a name that can be typed and a menu of common ones. */
export function ThemeFonts({ session, theme }: { session: EditorSession; theme: Theme }): JSX.Element {
  const set = (role: (typeof ROLES)[number][0], family: string) => {
    const name = family.trim();
    if (name !== "" && name !== theme.fonts[role].family) editTheme(session, { fonts: { [role]: { family: name } } });
  };
  return (
    <div className="ks-dg-fonts">
      {ROLES.map(([role, label]) => {
        const family = theme.fonts[role].family;
        return (
          <div key={role} className="ks-dg-font">
            <span className="ks-sp-label">{label}</span>
            <TextField label={`${label} font`} value={family} onCommit={(value) => set(role, value)} />
            {/* It shows which of the common ones the typeface is, and "Choose…" when it is some other. */}
            <select className="ks-select" aria-label={`${label} font, common families`} value={COMMON_FAMILIES.includes(family) ? family : ""} onChange={(event) => set(role, event.target.value)}>
              <option value="" disabled>
                Choose…
              </option>
              {COMMON_FAMILIES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
