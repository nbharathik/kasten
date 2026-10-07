import { useState } from "react";

import { EMOJI, randomEmoji, searchEmoji } from "./emoji";
import { Popup } from "./Popup";

interface EmojiPickerProps {
  onPick: (emoji: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Notion's icon picker: search, random, remove, and a grid by group. */
export function EmojiPicker({ onPick, onRemove, onClose }: EmojiPickerProps) {
  const [query, setQuery] = useState("");
  const found = query.trim() === "" ? null : searchEmoji(query);
  const button = (emoji: string) => (
    <button key={emoji} type="button" className="kasten-emoji" onClick={() => onPick(emoji)} aria-label={emoji}>
      {emoji}
    </button>
  );

  return (
    <Popup label="Page icon" className="kasten-emoji-picker" onClose={onClose}>
      <div className="kasten-popup-bar">
        <input
          autoFocus
          className="kasten-popup-search"
          placeholder="Filter…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Filter emoji"
        />
        <button type="button" className="kasten-popup-button" onClick={() => onPick(randomEmoji())}>
          Random
        </button>
        <button type="button" className="kasten-popup-button" onClick={onRemove}>
          Remove
        </button>
      </div>
      <div className="kasten-emoji-scroll">
        {found ? (
          found.length > 0 ? (
            <div className="kasten-emoji-grid">{found.map(button)}</div>
          ) : (
            <p className="kasten-popup-empty">No emoji found</p>
          )
        ) : (
          EMOJI.map((group) => (
            <section key={group.title}>
              <h3 className="kasten-popup-heading">{group.title}</h3>
              <div className="kasten-emoji-grid">{group.items.map(([emoji]) => button(emoji))}</div>
            </section>
          ))
        )}
      </div>
    </Popup>
  );
}
