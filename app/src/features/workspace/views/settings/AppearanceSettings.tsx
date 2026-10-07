// Settings → Appearance: the theme, the accent colour and motion.

import type { MotionPref } from "../../../../lib/motion";
import { usePrefs } from "../../prefs";
import { ACCENTS, type Accent, type ThemePref } from "../../theme";
import { useKeyLabel } from "../../../shortcuts/store";
import { Group, Row, Segmented } from "./parts";

const THEMES: { id: ThemePref; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const MOTIONS: { id: MotionPref; label: string }[] = [
  { id: "system", label: "System" },
  { id: "on", label: "On" },
  { id: "off", label: "Off" },
];

/** The swatch shown for each accent, as its light-theme colour. */
const SWATCH: Record<Accent, string> = {
  blue: "#2383e2",
  violet: "#6d5dfc",
  green: "#1a9a5f",
  orange: "#e8590c",
  pink: "#d6336c",
  graphite: "#3f3f46",
};

export function AppearanceSettings() {
  const prefs = usePrefs();
  const themeKey = useKeyLabel("theme");
  return (
    <Group title="Appearance">
      <Row label="Theme" detail={themeKey ? `${themeKey} switches between light and dark` : undefined}>
        <Segmented label="Theme" value={prefs.theme} options={THEMES} onChange={(theme) => prefs.setTheme(theme)} />
      </Row>
      <Row label="Accent colour" detail="Buttons, selection and highlights">
        <div role="radiogroup" aria-label="Accent colour" className="flex gap-1.5">
          {ACCENTS.map((accent) => (
            <button
              key={accent}
              type="button"
              role="radio"
              aria-checked={prefs.accent === accent}
              aria-label={accent.charAt(0).toUpperCase() + accent.slice(1)}
              title={accent.charAt(0).toUpperCase() + accent.slice(1)}
              onClick={() => prefs.set({ accent })}
              className={`size-6 rounded-full ring-offset-2 ring-offset-canvas transition ${prefs.accent === accent ? "ring-2 ring-ink/70" : "hover:scale-110"}`}
              style={{ background: SWATCH[accent] }}
            />
          ))}
        </div>
      </Row>
      <Row label="Motion" detail="Menus, dialogs and views ease in as they open. System follows your computer's reduce-motion setting. Typing never moves.">
        <Segmented label="Motion" value={prefs.motion} options={MOTIONS} onChange={(motion) => prefs.set({ motion })} />
      </Row>
    </Group>
  );
}
