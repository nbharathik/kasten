import { type ClipboardEvent, type DragEvent, type JSX, type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";

import { pickFiles } from "../files.ts";
import type { HostImage } from "../host.ts";
import { FALLBACK_HEIGHT, useScrollWindow } from "../filmstrip/useScrollWindow.ts";
import type { EditorSession } from "../session/session.ts";
import { IconButton, TextButton } from "../ui/Button.tsx";
import { Icon } from "../ui/Icon.tsx";
import type { EditorUi } from "../ui-state.ts";
import { useEditorValue } from "../useEditor.ts";
import { Details } from "./Details.tsx";
import { hasFileDrag, hasImageDrag, pictureFiles } from "./drag.ts";
import { keepFiles } from "./files.ts";
import { FILTERS, type FilterId, narrow, usedIn, usesInDeck } from "./model.ts";
import { insertInFreeArea } from "./place.ts";
import { Tile } from "./Tile.tsx";
import { useImages } from "./useImages.ts";
import "./gallery.css";

/** The grid has this many columns and each row is this tall (the tile and the gap), which is what the windowing counts in. */
export const COLUMNS = 2;
export const ROW_HEIGHT = 136;
/** A list this long is drawn a window at a time. */
export const WINDOW_FROM = 200;
/** Rows are drawn this far (in pixels) beyond the window on either side. */
const AHEAD = 480;

/** Every image of the vault or folder in a drawer beside the slides: search, filters, drag onto the slide, and where each is used. */
export function GalleryDrawer({ session, ui }: { session: EditorSession; ui: EditorUi }): JSX.Element {
  const host = session.host;
  const deck = useEditorValue(session, (state) => state.deck);
  const { images, usage, loading, failed, refresh, replace } = useImages(host);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [picked, setPicked] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const viewport = useScrollWindow(scroller, ROW_HEIGHT);
  const uid = useId();

  const deckUses = useMemo(() => usesInDeck(deck), [deck]);
  const usageKnown = !host.imageUsage || usage !== null;
  const shown = useMemo(
    () => narrow(images, { query, filter, deck: deckUses, usage, deckPath: host.deckPath, now: Date.now() }),
    [images, query, filter, deckUses, usage, host.deckPath],
  );
  const filters = FILTERS.filter((f) => f.id !== "unused" || host.imageUsage);
  const at = shown.findIndex((image) => image.path === picked);
  const current = at >= 0 ? shown[at] : undefined;
  const optionId = (index: number) => `${uid}-${index}`;

  const rows = Math.ceil(shown.length / COLUMNS);
  const windowed = shown.length > WINDOW_FROM;
  const firstRow = windowed ? Math.max(0, Math.floor((viewport.top - AHEAD) / ROW_HEIGHT)) : 0;
  const lastRow = windowed ? Math.min(rows - 1, Math.ceil((viewport.top + (viewport.height || FALLBACK_HEIGHT) + AHEAD) / ROW_HEIGHT)) : rows - 1;
  const first = firstRow * COLUMNS;
  const visible = shown.slice(first, (lastRow + 1) * COLUMNS);

  // Focus goes to the search box when the drawer opens, so typing narrows the list at once.
  useEffect(() => search.current?.focus({ preventScroll: true }), []);

  const add = (image: HostImage) => {
    void insertInFreeArea(session, image).catch((error: unknown) => host.notify?.(error instanceof Error ? error.message : String(error)));
  };

  /** Keeps files with the host and shows the first one that is new. */
  const keep = async (files: File[], source: "pasted" | "file") => {
    const done = await keepFiles(host, files, source);
    if (done.refused.length > 0) host.notify?.(done.refused[0] ?? "");
    refresh();
    if (done.paths[0]) {
      setQuery("");
      setFilter("all");
      setPicked(done.paths[0]);
    }
  };

  const go = (index: number) => {
    const next = shown[Math.min(Math.max(index, 0), shown.length - 1)];
    if (!next) return;
    setPicked(next.path);
    const top = Math.floor(shown.indexOf(next) / COLUMNS) * ROW_HEIGHT;
    const box = scroller.current;
    if (box && top < box.scrollTop) box.scrollTop = top;
    else if (box && box.clientHeight > 0 && top + ROW_HEIGHT > box.scrollTop + box.clientHeight) box.scrollTop = top + ROW_HEIGHT - box.clientHeight;
  };

  const onListKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLUMNS, ArrowDown: COLUMNS, PageUp: -COLUMNS * 3, PageDown: COLUMNS * 3 };
    const move = moves[event.key];
    if (move !== undefined && !event.altKey && !event.ctrlKey && !event.metaKey) go(at < 0 ? 0 : at + move);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(shown.length - 1);
    else if (event.key === "Enter" && current) add(current);
    else return;
    event.preventDefault();
  };

  // The slide's keys are not the drawer's: Delete here must not delete what is selected on the slide, nor Ctrl+V paste onto it.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (query !== "" && event.target === search.current) setQuery("");
      else ui.toggleGallery(false);
      return;
    }
    const undoing = (event.ctrlKey || event.metaKey) && /^[zy]$/i.test(event.key) && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement);
    if (!undoing) event.stopPropagation();
  };

  const onPaste = (event: ClipboardEvent<HTMLElement>) => {
    const files = pictureFiles(event.clipboardData?.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    void keep(files, "pasted");
  };

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    if (!hasFileDrag(event) || hasImageDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setOver(true);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    setOver(false);
    const files = pictureFiles(event.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    void keep(files, "file");
  };

  const choose = async () => {
    const files = pictureFiles(await pickFiles("image/*", true));
    if (files.length > 0) await keep(files, "file");
  };

  const narrowed = query.trim() !== "" || filter !== "all";
  return (
    <aside
      className={`ks-gallery${over ? " is-over" : ""}`}
      aria-label="Images"
      // A press on its words leaves the focus in the drawer, so its keys (Ctrl+A) still reach it.
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onDragOver={onDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <header className="ks-gal-bar">
        <h2>
          Images <span className="ks-gal-count">{images.length}</span>
        </h2>
        <IconButton icon="plus" label="Add images" onClick={() => void choose()} />
        <IconButton icon="x" label="Close images" keys="Esc" onClick={() => ui.toggleGallery(false)} />
      </header>
      <div className="ks-gal-search">
        <Icon name="search" size={14} />
        <input
          ref={search}
          type="search"
          className="ks-input"
          aria-label="Search images"
          placeholder="Name, tag, caption or paper"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="ks-gal-filters" role="radiogroup" aria-label="Show">
        {filters.map((f) => (
          <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} className={`ks-gal-chip${filter === f.id ? " is-on" : ""}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="ks-gal-scroll" ref={scroller}>
        {loading ? <p className="ks-gal-note">Loading images…</p> : null}
        {failed ? (
          <div className="ks-gal-note" role="alert">
            <p>The images could not be listed: {failed}</p>
            <TextButton onClick={refresh}>Try again</TextButton>
          </div>
        ) : null}
        {!loading && !failed && images.length === 0 ? (
          <div className="ks-gal-note">
            <p>
              <strong>No images yet.</strong>
            </p>
            <p>Paste a picture here, drop files on this panel, or add them.</p>
            <TextButton primary onClick={() => void choose()}>
              Add images…
            </TextButton>
          </div>
        ) : null}
        {!loading && images.length > 0 && shown.length === 0 ? (
          <div className="ks-gal-note">
            <p>No images match.</p>
            {narrowed ? (
              <TextButton
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Show all
              </TextButton>
            ) : null}
          </div>
        ) : null}
        {shown.length > 0 ? (
          <div
            className="ks-gal-list"
            role="listbox"
            aria-label="Images"
            aria-activedescendant={at >= first && at < first + visible.length ? optionId(at) : undefined}
            tabIndex={0}
            onKeyDown={onListKeys}
            style={windowed ? { paddingTop: firstRow * ROW_HEIGHT, paddingBottom: Math.max(0, rows - 1 - lastRow) * ROW_HEIGHT } : undefined}
          >
            {visible.map((image, i) => (
              <Tile key={image.path} host={host} image={image} id={optionId(first + i)} selected={image.path === picked} onPick={() => setPicked(image.path)} onAdd={() => add(image)} />
            ))}
          </div>
        ) : null}
        <p className="ks-gal-sr" role="status">
          {loading ? "" : `${shown.length} ${shown.length === 1 ? "image" : "images"}`}
        </p>
      </div>

      {current ? <Details session={session} image={current} uses={usedIn(current, { deck: deckUses, usage, deckPath: host.deckPath })} known={usageKnown} onChange={replace} onAdd={() => add(current)} /> : null}
    </aside>
  );
}
