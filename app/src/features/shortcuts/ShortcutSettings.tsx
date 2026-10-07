// Settings → Keyboard shortcuts: every command with its keys. Click a key to
// record another; Backspace removes it and Escape cancels. A key another
// command had moves here, and the row says which.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { useShell } from "../../lib/store";
import { Group, Row } from "../workspace/views/settings/parts";
import { KEY_SECTIONS, commandLabel } from "./catalog";
import { bindingOf, canBind, formatBinding, isMac } from "./keymap";
import { keyLabel, useKeys } from "./store";

export function ShortcutSettings() {
  const keymap = useKeys((s) => s.keymap);
  const overrides = useKeys((s) => s.overrides);
  const [recording, setRecording] = useState<string | null>(null);
  const [note, setNote] = useState<{ id: string; text: string } | null>(null);
  const [filter, setFilter] = useState("");
  const top = useRef<HTMLDivElement>(null);

  // "Change keys…" on the shortcut sheet opens Settings here.
  useEffect(() => {
    if (!useKeys.getState().jump) return;
    useKeys.setState({ jump: false });
    top.current?.scrollIntoView?.({ block: "start" });
  }, []);

  const sections = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const shown = (id: string) => !q || commandLabel(id).toLowerCase().includes(q) || keyLabel(keymap, id).toLowerCase().includes(q);
    return KEY_SECTIONS.map((s) => ({ ...s, ids: s.ids.filter(shown) })).filter((s) => s.ids.length > 0);
  }, [filter, keymap]);

  const changed = Object.keys(overrides).length;
  return (
    <div ref={top} className="scroll-mt-6">
      <Group title="Keyboard shortcuts" detail="Click a key to change it. Keys need Ctrl, ⌘ or Alt, so typing never runs a command.">
        <Row label="All shortcuts on one sheet" detail={keyLabel(keymap, "shortcuts") ? `Also ${keyLabel(keymap, "shortcuts")}` : undefined}>
          <button type="button" className="rounded-md px-2.5 py-1 text-13 ring-1 ring-line hover:bg-hover" onClick={() => useShell.getState().setShortcuts(true)}>
            Show
          </button>
        </Row>
        <div className="flex items-center gap-3 py-3">
          <input
            type="search"
            aria-label="Find a command"
            placeholder="Find a command or key"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="min-w-0 flex-1 rounded-md bg-panel px-2.5 py-1 text-13 outline-none ring-1 ring-line placeholder:text-muted focus:ring-accent/60"
          />
          {changed > 0 && (
            <button
              type="button"
              className="rounded-md px-2.5 py-1 text-13 ring-1 ring-line hover:bg-hover"
              onClick={() => {
                useKeys.getState().resetAll();
                setNote(null);
              }}
            >
              Reset all ({changed})
            </button>
          )}
        </div>
        {sections.map((section) => (
          <div key={section.title} role="group" aria-label={section.title}>
            <div className="pb-1 pt-4 text-12 font-medium tracking-[0.06em] text-muted">{section.title}</div>
            {section.ids.map((id) => (
              <KeyRow
                key={id}
                id={id}
                keys={keymap[id] ?? []}
                changed={id in overrides}
                recording={recording === id}
                note={note?.id === id ? note.text : null}
                onRecord={(on) => {
                  setRecording(on ? id : null);
                  if (on) setNote(null);
                }}
                onNote={(text) => setNote(text ? { id, text } : null)}
              />
            ))}
          </div>
        ))}
        {sections.length === 0 && <p className="py-4 text-13 text-muted">No command matches “{filter.trim()}”.</p>}
      </Group>
    </div>
  );
}

interface KeyRowProps {
  id: string;
  keys: readonly string[];
  changed: boolean;
  recording: boolean;
  note: string | null;
  onRecord(on: boolean): void;
  onNote(text: string | null): void;
}

function KeyRow({ id, keys, changed, recording, note, onRecord, onNote }: KeyRowProps) {
  const mac = isMac();
  const label = commandLabel(id);
  const record = (event: KeyboardEvent<HTMLButtonElement>) => {
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
    // Tab still moves on, which ends recording.
    if (plain && event.key === "Tab") return;
    event.preventDefault();
    event.stopPropagation();
    if (plain && event.key === "Escape") return onRecord(false);
    if (plain && (event.key === "Backspace" || event.key === "Delete")) {
      useKeys.getState().set(id, null);
      return onRecord(false);
    }
    const binding = bindingOf(event.nativeEvent, mac);
    if (!binding) return;
    if (!canBind(binding)) return onNote(`${formatBinding(binding, mac)} would run while typing; add ${mac ? "⌘, ⌃ or ⌥" : "Ctrl or Alt"}`);
    const took = useKeys.getState().set(id, binding);
    onRecord(false);
    onNote(took.length ? `Taken from ${took.map(commandLabel).join(", ")}` : null);
  };
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-13">{label}</div>
        {note && (
          <div role="status" className="text-12 text-muted">
            {note}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label={`Change the key for ${label}`}
        aria-pressed={recording}
        ref={(el) => {
          if (recording) el?.focus();
        }}
        onClick={() => onRecord(!recording)}
        onKeyDown={recording ? record : undefined}
        onBlur={() => recording && onRecord(false)}
        className={`flex min-h-7 min-w-[92px] flex-wrap items-center justify-end gap-1 rounded-md px-1.5 py-0.5 text-12 transition-colors ${recording ? "bg-accent/10 text-accent ring-1 ring-accent/60" : "hover:bg-hover"}`}
      >
        {recording ? (
          "Press keys…"
        ) : keys.length ? (
          keys.map((k) => (
            <kbd key={k} className="rounded border border-line bg-panel px-1.5 py-px font-sans text-12 text-ink">
              {formatBinding(k, mac)}
            </kbd>
          ))
        ) : (
          <span className="text-muted">Add key</span>
        )}
      </button>
      <span className="flex w-12 justify-end gap-0.5">
        {keys.length > 0 && !recording && (
          <button type="button" aria-label={`Remove the key for ${label}`} title="Remove" className="rounded px-1 text-muted hover:bg-hover hover:text-ink" onClick={() => useKeys.getState().set(id, null)}>
            ×
          </button>
        )}
        {changed && !recording && (
          <button
            type="button"
            aria-label={`Reset ${label}`}
            title="Back to the default"
            className="rounded px-1 text-muted hover:bg-hover hover:text-ink"
            onClick={() => {
              const took = useKeys.getState().set(id, undefined);
              onNote(took.length ? `Taken from ${took.map(commandLabel).join(", ")}` : null);
            }}
          >
            ↺
          </button>
        )}
      </span>
    </div>
  );
}
