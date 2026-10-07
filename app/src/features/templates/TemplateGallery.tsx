import "./templates.css";

import { useEffect, useMemo, useRef, useState } from "react";

import { useShell } from "../../lib/store";
import { useWorkspace } from "../workspace/store";
import { CATEGORIES, catalog, filterCatalog, type TemplateInfo } from "./catalog";
import { KitList } from "./KitList";
import { saveAsTemplate } from "./kits";
import { TemplatePreview } from "./TemplatePreview";
import { Segmented } from "../../ui/Segmented";
import { isDraft } from "../workspace/drafts";
import { titleOf } from "../workspace/names";
import { noteAt } from "../workspace/tree";
import { Modal } from "../../ui/Modal";
import { IconOrEmoji } from "../../ui/IconOrEmoji";

/** Every template, grouped, with a live preview: pick one to start a page
 * (or, from an empty page, to fill it). */
export function TemplateGallery() {
  const gallery = useShell((s) => s.gallery);
  const close = () => useShell.getState().openGallery(null);
  const notes = useWorkspace((s) => s.notes);
  const client = useWorkspace((s) => s.client);
  const list = useMemo(() => catalog(notes), [notes]);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => filterCatalog(list, query), [list, query]);
  const [selected, setSelected] = useState(gallery?.select ?? null);
  const current = shown.find((t) => t.name === selected) ?? shown[0];
  const [text, setText] = useState<{ path: string; text: string } | null>(null);
  const [title, setTitle] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const filling = Boolean(gallery?.onPick);
  const [kits, setKits] = useState(Boolean(gallery?.kits));
  // The page in front, which can be saved as a template.
  const place = useWorkspace((s) => s.place);
  const page = place.view === "page" && !isDraft(place.path) ? noteAt(notes, place.path ?? "") : undefined;
  const savable = page && page.kind !== "template" && page.kind !== "journal" && !filling ? page : undefined;

  useEffect(() => {
    setKits(Boolean(gallery?.kits));
  }, [gallery]);

  useEffect(() => {
    if (!client || !current) return;
    let cancelled = false;
    client.read(current.note.path).then(
      (note) => !cancelled && setText({ path: current.note.path, text: note.text }),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [client, current]);

  useEffect(() => {
    client?.missingTemplates().then(setMissing, () => {});
  }, [client, notes]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [current]);

  if (!gallery) return null;

  const use = (template: TemplateInfo | undefined) => {
    if (!template) return;
    const name = title.trim();
    close();
    if (gallery.onPick) return gallery.onPick(template.name);
    const { create } = useWorkspace.getState();
    if (template.name === "project") void create({ kind: "project", title: name || "New project", template: "project" });
    else void create({ kind: template.name === "card" ? "card" : "page", title: name, template: template.name === "page" ? null : template.name });
  };

  const move = (step: number) => {
    const at = Math.max(0, shown.findIndex((t) => t.name === current?.name));
    const next = shown[Math.min(shown.length - 1, Math.max(0, at + step))];
    if (next) setSelected(next.name);
  };

  const addStarters = async () => {
    if (!client) return;
    try {
      const added = await client.addStarterTemplates();
      await useWorkspace.getState().refresh();
      setMissing([]);
      useWorkspace.getState().toast(`Added ${added.length} template${added.length === 1 ? "" : "s"}`);
    } catch (err) {
      useWorkspace.getState().toast(err instanceof Error ? err.message : String(err));
    }
  };

  const groups = CATEGORIES.map((category) => ({ category, items: shown.filter((t) => t.category === category) })).filter((g) => g.items.length);

  return (
    <Modal plain label="Templates" onClose={close} className="kasten-gallery">
      <div className="kasten-gallery-side">
        {!filling && (
          <Segmented
            label="Show"
            className="kasten-gallery-tabs"
            value={kits ? "kits" : "templates"}
            choices={[
              { value: "templates", label: "Templates" },
              { value: "kits", label: "Starter kits" },
            ]}
            onChange={(value) => setKits(value === "kits")}
          />
        )}
        {kits && <p className="kasten-gallery-note">A kit is a way of working, ready to go: a home page that explains it, templates and tag databases. Add one in a step; Undo takes it back.</p>}
        <input
          hidden={kits}
          autoFocus
          className="kasten-gallery-search"
          placeholder="Search templates…"
          aria-label="Search templates"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") move(1);
            else if (e.key === "ArrowUp") move(-1);
            else if (e.key === "Enter") use(current);
            else return;
            e.preventDefault();
          }}
        />
        <div ref={listRef} className="kasten-gallery-list" role="listbox" aria-label="Templates" hidden={kits}>
          {groups.map(({ category, items }) => (
            <section key={category} aria-label={category}>
              <h3>{category}</h3>
              {items.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  role="option"
                  aria-selected={t.name === current?.name}
                  className="kasten-gallery-item"
                  onClick={() => setSelected(t.name)}
                  onDoubleClick={() => use(t)}
                >
                  <span className="kasten-gallery-icon" aria-hidden="true">
                    <IconOrEmoji icon={t.icon} />
                  </span>
                  <span className="min-w-0">
                    <span className="kasten-gallery-label">{t.label}</span>
                    <span className="kasten-gallery-desc">{t.description}</span>
                  </span>
                </button>
              ))}
            </section>
          ))}
          {shown.length === 0 && <p className="kasten-gallery-empty">No template matches “{query}”.</p>}
        </div>
        {missing.length > 0 && !filling && !kits && (
          <div className="kasten-gallery-more">
            <span>
              {missing.length} new template{missing.length === 1 ? "" : "s"} for this vault
            </span>
            <button type="button" onClick={() => void addStarters()}>
              Add
            </button>
          </div>
        )}
        {savable && !kits && (
          <div className="kasten-gallery-more">
            <span className="truncate">“{titleOf(savable)}” as a new template</span>
            <button type="button" onClick={() => void saveAsTemplate(savable.path, titleOf(savable)).then((name) => name && setSelected(name))}>
              Save
            </button>
          </div>
        )}
      </div>
      <div className="kasten-gallery-main">
        {kits ? (
          <div className="kasten-gallery-kits">
            <header className="kasten-gallery-head">
              <div className="min-w-0 flex-1">
                <h2>Starter kits</h2>
                <p>Plain pages and templates, yours to change or delete.</p>
              </div>
              <button type="button" className="kasten-gallery-close" aria-label="Close" onClick={close}>
                ×
              </button>
            </header>
            <KitList onOpened={close} />
          </div>
        ) : current ? (
          <>
            <header className="kasten-gallery-head">
              <div className="min-w-0 flex-1">
                <h2>
                  <IconOrEmoji icon={current.icon} /> {current.label}
                </h2>
                <p>{current.description}</p>
              </div>
              {!filling && (
                <input
                  className="kasten-gallery-title"
                  placeholder={current.name === "project" ? "Project name" : "Title (optional)"}
                  aria-label="Title for the new page"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && use(current)}
                />
              )}
              <button type="button" className="kasten-gallery-use" onClick={() => use(current)}>
                {filling ? "Use on this page" : "Use template"}
              </button>
              <button
                type="button"
                className="kasten-gallery-edit"
                title="Open the template's own page to change it"
                onClick={() => {
                  close();
                  useWorkspace.getState().openPath(current.note.path, "tab");
                }}
              >
                Edit template
              </button>
              <button type="button" className="kasten-gallery-close" aria-label="Close" onClick={close}>
                ×
              </button>
            </header>
            <div className="kasten-gallery-preview">
              {text?.path === current.note.path ? (
                <TemplatePreview markdown={text.text} title={title.trim() || (current.name === "page" ? "Untitled" : current.label)} icon={current.icon} />
              ) : (
                <p className="kasten-gallery-empty">Loading…</p>
              )}
            </div>
          </>
        ) : (
          <p className="kasten-gallery-empty">Pick a template on the left.</p>
        )}
      </div>
    </Modal>
  );
}
