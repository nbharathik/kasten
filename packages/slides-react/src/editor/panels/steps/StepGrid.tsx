import { type FocusEvent, type JSX, type KeyboardEvent, useId, useMemo, useRef, useState } from "react";

import type { EditorSession } from "../../session/session.ts";
import { MOST_STEPS } from "../../session/steps.ts";
import type { EditorUi } from "../../ui-state.ts";
import { Icon } from "../../ui/Icon.tsx";
import { Menu, type MenuItem } from "../../ui/Menu.tsx";
import { type Anchor, anchorOf, pointAnchor } from "../../ui/Popover.tsx";
import { useEditor } from "../../useEditor.ts";
import { useUiState } from "../../useUi.ts";
import { neighbour } from "./grid-keys.ts";
import { STATES, STATE_NAMES, type StepRow, cellName, cellOf, entryOf, nextEntry, rowsOf, stepsNeeded } from "./model.ts";
import "./steps.css";

/** Where the focus is, as a string that stays the same while rows come and go: the column, then the row it is in. */
const keyOf = (row: string, col: number): string => `${col}:${row}`;

interface OpenMenu {
  row: StepRow;
  step: number;
  anchor: Anchor;
  /** Where the focus goes back to. */
  back: string;
}

/**
 * The Steps grid: a row for each element of the slide in reading order and a column for each
 * step. A cell is what the element looks like at that step; pressing it changes the state.
 * A column heading shows that step on the slide. It is a grid to the keyboard: arrows move
 * between cells, Space changes one, and the focus is one stop for Tab.
 */
export function StepGrid({ session, ui }: { session: EditorSession; ui: EditorUi }): JSX.Element {
  const state = useEditor(session);
  const { previewStep } = useUiState(ui);
  const slide = state.deck.slides.find((s) => s.id === state.slideId);
  const steps = slide?.steps ?? 0;
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const rows = useMemo(() => (slide ? rowsOf(slide, state.deck.theme, open) : []), [slide, state.deck.theme, open]);
  const grid = useRef<HTMLTableElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const hint = useId();
  const selected = new Set(state.selection);
  const columns = Array.from({ length: steps + 1 }, (_, step) => step);
  // A code block walks through its lines a step at a time, so the last step it needs cannot be taken away.
  const needed = slide ? stepsNeeded(slide.elements) : 0;

  // The one stop for Tab: where the focus was last, if that is still there, else the first cell.
  const firstKey = rows[0] ? keyOf(rows[0].key, 0) : keyOf("head", 1);
  const exists = (key: string): boolean => {
    const cut = key.indexOf(":");
    const col = Number(key.slice(0, cut));
    const name = key.slice(cut + 1);
    if (name === "head") return (col >= 1 && col <= steps + 1) || (steps > 0 && col === steps + 1.5) || col === steps + 2;
    const row = rows.find((r) => r.key === name);
    return row !== undefined && (col === 0 || (col >= 1 && col <= steps + 1) || (col === -0.5 && row.kind === "element" && row.group));
  };
  const stop = active !== null && exists(active) ? active : firstKey;
  const tabIndex = (key: string): 0 | -1 => (key === stop ? 0 : -1);
  const focusKey = (key: string) => [...(grid.current?.querySelectorAll<HTMLElement>("[data-cell]") ?? [])].find((el) => el.dataset.cell === key)?.focus();

  const activate = (row: StepRow, step: number, direction: 1 | -1) => {
    if (row.kind === "item") session.steps.setParagraphStep(row.element.id, row.index, step === 0 || row.step === step ? null : step);
    else session.steps.setState(row.element.id, step, nextEntry(entryOf(row, step), direction));
  };
  const restore = (row: StepRow, step: number) => {
    if (row.kind === "item") session.steps.setParagraphStep(row.element.id, row.index, null);
    else session.steps.setState(row.element.id, step, null);
  };
  // A press on a heading moves the focus to it before the click, and the focus moves the preview (see `onFocus`):
  // whether the heading was already the one shown is what it was when the press began.
  const pressed = useRef<number | null | undefined>(undefined);
  const preview = (step: number) => {
    const before = pressed.current === undefined ? previewStep : pressed.current;
    pressed.current = undefined;
    ui.setPreviewStep(before === step ? null : step);
  };

  const menuItems = ({ row, step }: OpenMenu): MenuItem[] => {
    if (row.kind === "item") {
      return [
        { id: "here", label: "Appears at this step", checked: row.step === step, disabled: step === 0, run: () => session.steps.setParagraphStep(row.element.id, row.index, step) },
        { id: "start", label: "There from the start", checked: row.step === null, run: () => restore(row, step) },
      ];
    }
    const entry = entryOf(row, step);
    return [
      ...STATES.map((s): MenuItem => ({ id: s, label: STATE_NAMES[s], checked: entry === s, run: () => session.steps.setState(row.element.id, step, s) })),
      { kind: "separator" },
      { id: "same", label: "Same as before", disabled: entry === undefined, run: () => restore(row, step) },
    ];
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !grid.current) return;
    if (event.key === "Escape" && previewStep !== null) {
      event.preventDefault();
      event.stopPropagation();
      ui.setPreviewStep(null);
      return;
    }
    const place = target.closest<HTMLElement>("[data-cell]");
    if (!place) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      neighbour(grid.current, place, event.key, event.ctrlKey || event.metaKey)?.focus();
      return;
    }
    const row = rows.find((r) => r.key === place.dataset.rowKey);
    const step = place.dataset.step === undefined ? undefined : Number(place.dataset.step);
    if (!row || step === undefined || place.dataset.kind !== "cell") return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      restore(row, step);
    } else if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      setMenu({ row, step, anchor: anchorOf(place), back: place.dataset.cell ?? "" });
    }
  };

  // The focus moving to a step's cell or heading is the preview following it, when one is showing.
  const onFocus = (event: FocusEvent<HTMLTableElement>) => {
    const place = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-cell]") : null;
    if (!place) return;
    setActive(place.dataset.cell ?? null);
    const step = place.dataset.step === undefined ? undefined : Number(place.dataset.step);
    if (previewStep !== null && step !== undefined && step !== previewStep) ui.setPreviewStep(step);
  };

  if (rows.length === 0) return <p className="ks-steps-empty">Nothing on this slide to build in steps yet.</p>;

  return (
    <>
      <div className="ks-steps-scroll">
        <table ref={grid} className="ks-steps-grid" role="grid" aria-label="Steps of this slide" aria-describedby={hint} onKeyDown={onKeyDown} onFocus={onFocus}>
          <thead>
            <tr>
              <th scope="col" className="ks-steps-name">
                <span className="ks-steps-corner">Layers</span>
              </th>
              {columns.map((step) => (
                <th key={step} scope="col" className={previewStep === step ? "is-previewed" : undefined}>
                  <button
                    type="button"
                    className="ks-step-head"
                    data-cell={keyOf("head", step + 1)}
                    data-row={-1}
                    data-col={step + 1}
                    data-step={step}
                    tabIndex={tabIndex(keyOf("head", step + 1))}
                    aria-pressed={previewStep === step}
                    aria-label={`Show step ${step}${step === 0 ? ", as the slide appears" : ""}`}
                    title={step === 0 ? "Step 0: how the slide appears" : `Step ${step}`}
                    onMouseDown={() => {
                      pressed.current = previewStep;
                    }}
                    onClick={() => preview(step)}
                  >
                    {step}
                  </button>
                  {step === steps && steps > 0 ? (
                    <button
                      type="button"
                      className="ks-step-remove"
                      data-cell={keyOf("head", steps + 1.5)}
                      data-row={-1}
                      data-col={steps + 1.5}
                      tabIndex={tabIndex(keyOf("head", steps + 1.5))}
                      disabled={steps <= needed}
                      aria-label={`Remove step ${steps}`}
                      title={steps <= needed ? `A code block on this slide needs its ${needed} steps` : `Remove step ${steps}`}
                      onClick={() => session.steps.removeStep()}
                    >
                      <Icon name="x" size={9} />
                    </button>
                  ) : null}
                </th>
              ))}
              <th scope="col">
                <button
                  type="button"
                  className="ks-step-head ks-step-add"
                  data-cell={keyOf("head", steps + 2)}
                  data-row={-1}
                  data-col={steps + 2}
                  tabIndex={tabIndex(keyOf("head", steps + 2))}
                  disabled={steps >= MOST_STEPS}
                  aria-label="Add a step"
                  title="Add a step"
                  onClick={() => session.steps.addStep()}
                >
                  <Icon name="plus" size={13} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const picked = selected.has(row.top);
              return (
                <tr key={row.key} className={picked ? "is-selected" : undefined} aria-selected={picked}>
                  <th scope="row" className="ks-steps-name" data-kind={row.kind}>
                    <div className="ks-steps-layer" style={{ paddingInlineStart: row.depth * 14 }}>
                      {row.kind === "element" && row.group ? (
                        <button
                          type="button"
                          className="ks-steps-fold"
                          data-cell={keyOf(row.key, -0.5)}
                          data-row={r}
                          data-col={-0.5}
                          tabIndex={tabIndex(keyOf(row.key, -0.5))}
                          aria-expanded={row.open}
                          aria-label={`${row.open ? "Hide" : "Show"} what ${row.label} holds`}
                          onClick={() => setOpen((now) => new Set(row.open ? [...now].filter((id) => id !== row.key) : [...now, row.key]))}
                        >
                          <Icon name={row.open ? "chevron-down" : "chevron-right"} size={12} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="ks-steps-label"
                        data-cell={keyOf(row.key, 0)}
                        data-row={r}
                        data-col={0}
                        tabIndex={tabIndex(keyOf(row.key, 0))}
                        title={row.label}
                        onClick={(event) => session.select([row.top], event.shiftKey || event.metaKey || event.ctrlKey ? "toggle" : "replace")}
                      >
                        {row.kind === "item" ? <span aria-hidden="true">• </span> : null}
                        {row.label}
                      </button>
                    </div>
                  </th>
                  {columns.map((step) => {
                    const cell = cellOf(row, step);
                    const key = keyOf(row.key, step + 1);
                    return (
                      <td key={step} role="gridcell" className={previewStep === step ? "is-previewed" : undefined}>
                        <button
                          type="button"
                          className={`ks-step-cell is-${cell.state}${cell.set ? " is-set" : ""}`}
                          data-cell={key}
                          data-kind="cell"
                          data-row={r}
                          data-col={step + 1}
                          data-step={step}
                          data-row-key={row.key}
                          tabIndex={tabIndex(key)}
                          aria-label={cellName(row, step, cell)}
                          title={cellName(row, step, cell)}
                          onClick={(event) => activate(row, step, event.shiftKey ? -1 : 1)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setMenu({ row, step, anchor: pointAnchor(event.clientX, event.clientY), back: key });
                          }}
                        >
                          <span className="ks-step-swatch" aria-hidden="true" />
                        </button>
                      </td>
                    );
                  })}
                  <td />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p id={hint} className="ks-steps-hint">
        Arrow keys move. Space changes a state, Shift+Space goes back, Delete restores the state from before, and Shift+F10 lists all four. A heading shows its step on the slide.
      </p>
      {menu ? (
        <Menu
          items={menuItems(menu)}
          anchor={menu.anchor}
          label={`State of ${menu.row.label}`}
          onClose={() => {
            setMenu(null);
            focusKey(menu.back);
          }}
        />
      ) : null}
    </>
  );
}
