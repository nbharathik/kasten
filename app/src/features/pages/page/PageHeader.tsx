import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { lineIconName } from "../../../ui/glyph";
import { Icon } from "../../../ui/Icon";
import { CoverPicker } from "./CoverPicker";
import { coverBackground, randomCover } from "./covers";
import { EmojiPicker } from "./EmojiPicker";
import { iconGlyph, randomEmoji } from "./emoji";
import type { MetaKey, PageMeta } from "./page-meta";

export interface PageHeaderProps {
  meta: PageMeta;
  /** Sets a frontmatter field; `null` removes it. */
  onChange: (key: MetaKey, value: string | null) => void;
  /** Enter in the title moves into the page, as in Notion. */
  onEnterBody: () => void;
  /** The title field lost focus or took Enter: time to commit a new title. */
  onTitleDone?: () => void;
  /** Journal days are named by their date. */
  titleReadOnly?: boolean;
  /** Puts the caret in the title, for a page just created. */
  autoFocusTitle?: boolean;
  /** Offers to put the page somewhere else (a project, under a page), with
   * where it is now, e.g. "Library": only on an empty page. */
  place?: { label: string; onMove: () => void };
  /** Offers to add a property, when the page shows none under its title. */
  onAddProperty?: () => void;
  /** A page with nothing in it yet: its controls show without a hover. */
  fresh?: boolean;
  /** Keeps a picture with the vault for a cover, and shows kept pictures. */
  files?: { save: (file: File) => Promise<string>; url: (src: string) => string };
}

/** Notion's page header: cover, icon, and a big title, all from the frontmatter. */
export function PageHeader({ meta, onChange, onEnterBody, onTitleDone, titleReadOnly, autoFocusTitle, place, onAddProperty, fresh, files }: PageHeaderProps) {
  const [picker, setPicker] = useState<"icon" | "cover" | null>(null);
  const background = coverBackground(meta.cover, files?.url);
  const glyph = iconGlyph(meta.icon);
  // One of the app's line icons ("icon:project"), drawn; else the emoji.
  const line = lineIconName(glyph);
  const classes = ["kasten-page-header", background ? "has-cover" : "", glyph ? "has-icon" : "", fresh ? "is-fresh" : ""].filter(Boolean);

  return (
    <header className={classes.join(" ")}>
      {background && (
        <div className="kasten-page-cover" style={{ background }}>
          <div className="kasten-page-cover-actions">
            <button type="button" onClick={() => setPicker("cover")}>
              Change cover
            </button>
            <button type="button" onClick={() => onChange("cover", null)}>
              Remove
            </button>
          </div>
          {picker === "cover" && (
            <CoverPicker
              onPick={(cover) => {
                onChange("cover", cover);
                setPicker(null);
              }}
              onRemove={() => {
                onChange("cover", null);
                setPicker(null);
              }}
              onClose={() => setPicker(null)}
              onUpload={files?.save}
            />
          )}
        </div>
      )}
      <div className="kasten-page-column kasten-page-heading">
        {glyph && (
          <div className="kasten-page-icon-wrap">
            <button type="button" className="kasten-page-icon" aria-label="Change icon" title={line ? undefined : meta.icon} onClick={() => setPicker("icon")}>
              {line ? <Icon name={line} className="size-[60px] text-muted" strokeWidth={1.25} /> : glyph}
            </button>
            {picker === "icon" && (
              <EmojiPicker
                onPick={(emoji) => {
                  onChange("icon", emoji);
                  setPicker(null);
                }}
                onRemove={() => {
                  onChange("icon", null);
                  setPicker(null);
                }}
                onClose={() => setPicker(null)}
              />
            )}
          </div>
        )}
        <div className="kasten-page-controls">
          {!glyph && (
            <button type="button" onClick={() => onChange("icon", randomEmoji())}>
              <Icon name="smile" className="size-4" /> Add icon
            </button>
          )}
          {!background && (
            <button type="button" onClick={() => onChange("cover", randomCover())}>
              <Icon name="image" className="size-4" /> Add cover
            </button>
          )}
          {onAddProperty && (
            <button type="button" onClick={onAddProperty}>
              <Icon name="list-plus" className="size-4" /> Add property
            </button>
          )}
          {place && (
            <button type="button" onClick={place.onMove} title="Put this page in another project or in Pages">
              <Icon name="folder" className="size-4" /> In {place.label} · Move
            </button>
          )}
        </div>
        <TitleField
          value={meta.title}
          onChange={(title) => onChange("title", title)}
          onEnter={onEnterBody}
          onDone={onTitleDone}
          readOnly={titleReadOnly}
          autoFocus={autoFocusTitle}
        />
      </div>
    </header>
  );
}

/** The title: one paragraph of plain text that wraps and grows. */
interface TitleFieldProps {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  onDone?: () => void;
  readOnly?: boolean;
  autoFocus?: boolean;
}

/** Webviews that size a text area to its text themselves (CSS
 * `field-sizing: content`), with no layout forced from script. */
const SIZES_ITSELF = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content");

function TitleField({ value, onChange, onEnter, onDone, readOnly, autoFocus }: TitleFieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  useLayoutEffect(() => {
    const field = ref.current;
    // Reading scrollHeight lays out the whole new page before it paints.
    if (!field || SIZES_ITSELF) return;
    const fit = () => {
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight}px`;
    };
    fit();
    // The column narrows when a panel opens, and fonts load late: refit then.
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    observer?.observe(field.parentElement ?? field);
    void document.fonts?.ready.then(fit);
    return () => observer?.disconnect();
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      className="kasten-page-title"
      placeholder="Untitled"
      aria-label="Page title"
      spellCheck
      readOnly={readOnly}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\s*[\r\n]+\s*/g, " "))}
      onBlur={() => onDone?.()}
      onKeyDown={(event) => {
        const field = event.currentTarget;
        const atEnd = field.selectionStart === field.value.length;
        if (event.key === "Enter" || (event.key === "ArrowDown" && atEnd)) {
          event.preventDefault();
          onDone?.();
          onEnter();
        }
      }}
    />
  );
}
