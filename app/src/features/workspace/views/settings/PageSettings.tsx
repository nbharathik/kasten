// Settings → Pages: how pages look and open in this window.

import { usePrefs, type PageFont, type PeekMode } from "../../prefs";
import { Group, Row, Segmented, Switch } from "./parts";

const PEEKS: { id: PeekMode; label: string }[] = [
  { id: "center", label: "Center peek" },
  { id: "side", label: "Side peek" },
  { id: "full", label: "Full page" },
];

const FONTS: { id: PageFont; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
];

export function PageSettings() {
  const prefs = usePrefs();
  return (
    <Group title="Pages">
      <Row label="Font" detail="For every page; a page can pick its own in its ••• menu">
        <Segmented label="Font" value={prefs.font} options={FONTS} onChange={(font) => prefs.set({ font })} />
      </Row>
      <Switch label="Small text" checked={prefs.smallText} onChange={(v) => prefs.set({ smallText: v })} />
      <Switch label="Full width" detail="Use the whole window for page text" checked={prefs.fullWidth} onChange={(v) => prefs.set({ fullWidth: v })} />
      <Switch label="Check spelling" checked={prefs.spellcheck} onChange={(v) => prefs.set({ spellcheck: v })} />
      <Switch label="Open pages in a new tab" detail="What you click opens in its own tab, so the page you are on stays open, Home included" checked={prefs.newTabs} onChange={(v) => prefs.set({ newTabs: v })} />
      <Row label="Open pages from views in" detail="A page picked in the calendar, a table, a board of cards or Tasks">
        <Segmented label="Open pages from views in" value={prefs.peekMode} options={PEEKS} onChange={(peekMode) => prefs.set({ peekMode })} />
      </Row>
    </Group>
  );
}
