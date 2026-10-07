// The page menu's style choices: font, small text and full width, for this
// page. Each is kept in the page's frontmatter when it differs from the
// defaults in Settings → Pages (workspace/page/page-layout.ts).

import { pageFor } from "../features/workspace/page/open-page";
import { layoutValue, setLayout, shownLayout, usePageLayouts, type LayoutKey, type ShownLayout } from "../features/workspace/page/page-layout";
import { usePrefs, type PageFont } from "../features/workspace/prefs";

const FONTS: { id: PageFont; label: string; family: string }[] = [
  { id: "default", label: "Default", family: "var(--notion-font)" },
  { id: "serif", label: "Serif", family: "var(--notion-font-serif)" },
  { id: "mono", label: "Mono", family: "var(--notion-font-mono)" },
];

export function PageStyle({ path }: { path: string }) {
  const prefs = usePrefs();
  const session = pageFor(path);
  const own = usePageLayouts((s) => (session ? s.of.get(session) : undefined));
  if (!session || !own) return null;
  const shown = shownLayout(own, prefs);
  const change = (key: LayoutKey, next: Partial<ShownLayout>) => setLayout(session, key, layoutValue(key, { ...shown, ...next }, prefs));
  const custom = Object.keys(own).length > 0;

  return (
    <div className="mb-1 border-b border-line px-1 pb-2 pt-1" role="group" aria-label="Style of this page">
      <div className="flex gap-1">
        {FONTS.map((font) => (
          <button
            key={font.id}
            type="button"
            aria-pressed={shown.font === font.id}
            onClick={() => change("font", { font: font.id })}
            className={`flex flex-1 flex-col items-center rounded-md py-1.5 hover:bg-line/50 ${shown.font === font.id ? "text-accent" : "text-muted"}`}
          >
            <span className="text-24 leading-tight" style={{ fontFamily: font.family }}>
              Ag
            </span>
            <span className="text-12">{font.label}</span>
          </button>
        ))}
      </div>
      <label className="mt-1 flex cursor-pointer items-center justify-between rounded px-2 py-1 text-13 hover:bg-line/50">
        Small text
        <input type="checkbox" checked={shown.small} onChange={() => change("text", { small: !shown.small })} />
      </label>
      <label className="flex cursor-pointer items-center justify-between rounded px-2 py-1 text-13 hover:bg-line/50">
        Full width
        <input type="checkbox" checked={shown.full} onChange={() => change("width", { full: !shown.full })} />
      </label>
      {custom && (
        <button
          type="button"
          onClick={() => (Object.keys(own) as LayoutKey[]).forEach((key) => setLayout(session, key, null))}
          className="mt-0.5 w-full rounded px-2 py-1 text-left text-12 text-muted hover:bg-line/50 hover:text-ink"
        >
          Use the default style
        </button>
      )}
    </div>
  );
}
