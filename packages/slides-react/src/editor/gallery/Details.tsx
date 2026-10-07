import { type JSX, useEffect, useState } from "react";

import type { HostImage, ImageEdit } from "../host.ts";
import type { EditorSession } from "../session/session.ts";
import { TextButton } from "../ui/Button.tsx";
import { Icon } from "../ui/Icon.tsx";
import { type UsedIn, sizeLabel, sourceLine } from "./model.ts";
import { useThumb } from "./useThumb.ts";

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((item, i) => item === b[i]);

/** Tags as typed, one line with commas: the list they make. */
const tagsOf = (text: string): string[] => text.split(",").map((tag) => tag.trim()).filter(Boolean);

/** What is known of the picked image, its notes to edit, and where it is used. */
export function Details({
  session,
  image,
  uses,
  known,
  onChange,
  onAdd,
}: {
  session: EditorSession;
  image: HostImage;
  uses: UsedIn;
  /** Whether the host has said where images are used; without it only the open deck's uses are listed. */
  known: boolean;
  onChange(image: HostImage): void;
  onAdd(): void;
}): JSX.Element {
  const host = session.host;
  const editable = Boolean(host.setImageMeta);
  const [caption, setCaption] = useState(image.caption ?? "");
  const [tags, setTags] = useState((image.tags ?? []).join(", "));
  const [key, setKey] = useState(image.citationKey ?? "");
  // A different image, or the same one changed elsewhere, starts that field again, and the others are left as they are being typed.
  useEffect(() => setCaption(image.caption ?? ""), [image.path, image.caption]);
  const savedTags = (image.tags ?? []).join(", ");
  useEffect(() => setTags(savedTags), [image.path, savedTags]);
  useEffect(() => setKey(image.citationKey ?? ""), [image.path, image.citationKey]);
  const preview = useThumb(host, image.path, 256);
  const open = host.openPath ? (path: string) => host.openPath?.(path) : undefined;

  const commit = async (edit: ImageEdit) => {
    try {
      const changed = await host.setImageMeta?.(image.path, edit);
      if (changed) onChange(changed);
    } catch (error) {
      host.notify?.(error instanceof Error ? error.message : String(error));
      setCaption(image.caption ?? "");
      setTags((image.tags ?? []).join(", "));
      setKey(image.citationKey ?? "");
    }
  };

  const facts = [image.width && image.height ? `${image.width} × ${image.height}` : "", sizeLabel(image.bytes)].filter(Boolean).join(" · ");
  const origin = sourceLine(image);

  return (
    <section className="ks-gal-details" aria-label={`Details of ${image.name}`}>
      <div className="ks-gal-head">
        <span className="ks-gal-preview" aria-hidden="true">
          {preview ? <img src={preview} alt="" draggable={false} /> : null}
        </span>
        <div className="ks-gal-facts">
          <strong title={image.path}>{image.name}</strong>
          {facts ? <span>{facts}</span> : null}
          {origin ? <span>{origin}</span> : null}
          {image.createdBy?.startsWith("agent:") ? <span>By an agent</span> : null}
        </div>
      </div>
      <TextButton primary onClick={onAdd}>
        Add to slide
      </TextButton>

      <div className="ks-gal-used" role="group" aria-label="Used in">
        <h3>
          Used in <span className="ks-gal-count">{uses.count}</span>
        </h3>
        {uses.count === 0 ? (
          <p>{known ? "Not used anywhere." : "Checking where it is used…"}</p>
        ) : (
          <ul>
            {uses.slides.length > 0 ? (
              <li>
                <Icon name="presentation" size={14} />
                <span>This deck, slide</span>
                {uses.slides.map((slide) => (
                  <button key={slide.id} type="button" className="ks-gal-jump" aria-label={`Go to slide ${slide.number}`} onClick={() => session.goTo(slide.id)}>
                    {slide.number}
                  </button>
                ))}
              </li>
            ) : null}
            {uses.theme ? (
              <li>
                <Icon name="palette" size={14} />
                <span>This deck’s theme, on every slide</span>
              </li>
            ) : null}
            {uses.decks.map((deck) => (
              <li key={deck.path}>
                <Icon name="presentation" size={14} />
                <Place path={deck.path} title={deck.title} open={open} />
                <span className="ks-gal-where">{deck.slides.length > 0 ? `slide ${deck.slides.map((s) => s.number).join(", ")}` : "theme"}</span>
              </li>
            ))}
            {uses.notes.map((note) => (
              <li key={note.path}>
                <Icon name="file-text" size={14} />
                <Place path={note.path} title={note.title} open={open} />
              </li>
            ))}
            {uses.boards.map((board) => (
              <li key={board.path}>
                <Icon name="layout-dashboard" size={14} />
                <Place path={board.path} title={board.title} open={open} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="ks-gal-field">
        <span>Caption</span>
        {editable ? (
          <textarea
            className="ks-input"
            rows={2}
            value={caption}
            placeholder="What the picture shows"
            onChange={(event) => setCaption(event.target.value)}
            onBlur={() => caption.trim() !== (image.caption ?? "") && void commit({ caption })}
          />
        ) : (
          <p>{image.caption || "None"}</p>
        )}
      </label>
      <label className="ks-gal-field">
        <span>Tags</span>
        {editable ? (
          <input
            className="ks-input"
            value={tags}
            placeholder="figure, attention"
            onChange={(event) => setTags(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            onBlur={() => !sameList(tagsOf(tags), image.tags ?? []) && void commit({ tags: tagsOf(tags) })}
          />
        ) : (
          <p>{(image.tags ?? []).join(", ") || "None"}</p>
        )}
      </label>
      {editable || image.citationKey ? (
        <label className="ks-gal-field">
          <span>Citation key</span>
          {editable ? (
            <input
              className="ks-input"
              value={key}
              placeholder="vaswani2017attention"
              onChange={(event) => setKey(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              onBlur={() => key.trim() !== (image.citationKey ?? "") && void commit({ citationKey: key })}
            />
          ) : (
            <p>{image.citationKey}</p>
          )}
        </label>
      ) : null}
    </section>
  );
}

/** A note, board or deck by its title: a button that opens it when the host can. */
function Place({ path, title, open }: { path: string; title: string; open?: ((path: string) => void) | undefined }): JSX.Element {
  return open ? (
    <button type="button" className="ks-gal-place" title={path} onClick={() => open(path)}>
      {title}
    </button>
  ) : (
    <span className="ks-gal-place" title={path}>
      {title}
    </span>
  );
}
