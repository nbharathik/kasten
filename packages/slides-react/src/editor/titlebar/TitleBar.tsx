import { type JSX, useEffect, useMemo, useRef, useState } from "react";

import { keysOf, runCommand } from "../commands/index.ts";
import { commandItem } from "../menus/build.ts";
import { DropMenu } from "../menus/DropMenu.tsx";
import { useDropdown } from "../menus/useDropdown.ts";
import type { EditorSession } from "../session/session.ts";
import type { EditorUi } from "../ui-state.ts";
import { IconButton } from "../ui/Button.tsx";
import { Icon } from "../ui/Icon.tsx";
import { useEditorValue } from "../useEditor.ts";
import { useElementSize } from "../useElementSize.ts";
import { useUiState } from "../useUi.ts";
import { DeckTitle } from "./DeckTitle.tsx";
import { SaveStatus } from "./SaveStatus.tsx";
import "./titlebar.css";

/** Below this width the conflict banner does not fit beside the name and the buttons. */
const STACK_BELOW = 1000;

/** Present, with a caret that opens the choice of where to start. */
function PresentButton({ session, ui }: { session: EditorSession; ui: EditorUi }): JSX.Element {
  const dd = useDropdown();
  const ctx = useMemo(() => ({ session, ui }), [session, ui]);
  const can = ui.actions.present !== undefined;
  return (
    <div className="ks-present">
      <button
        type="button"
        className="ks-btn ks-text-btn is-primary ks-present-main"
        disabled={!can}
        data-tip={can ? `Present (${keysOf("view.present") ?? "Ctrl+Enter"})` : "Presenting is not available here"}
        onClick={() => void runCommand("view.present", ctx)}
      >
        <Icon name="play" size={14} />
        Present
      </button>
      <button type="button" className="ks-btn ks-text-btn is-primary ks-present-caret" aria-label="Present options" data-tip="Present options" disabled={!can} {...dd.trigger}>
        <Icon name="chevron-down" size={14} />
      </button>
      <DropMenu
        dd={dd}
        ui={ui}
        label="Present options"
        items={() => [commandItem("view.present-start", ctx, { label: "Present from beginning" }), commandItem("view.present", ctx, { label: "Present from current slide" })]}
      />
    </div>
  );
}

/**
 * The deck's name, where saving stands, and the buttons for the assistant and
 * for presenting. A way back to the library is on the left when the host gives one.
 */
export function TitleBar({ session, ui }: { session: EditorSession; ui: EditorUi }): JSX.Element {
  const conflict = useEditorValue(session, (state) => state.saving.status === "conflict");
  const { panel, fullScreen } = useUiState(ui);
  const ctx = useMemo(() => ({ session, ui }), [session, ui]);

  // The host gives its actions to the editor after the first draw, and has no way to say when it changes them:
  // read them once more when the drawing is done, and again at every draw.
  const [, again] = useState(0);
  useEffect(() => {
    queueMicrotask(() => again((n) => n + 1));
  }, []);

  // In a narrow window the conflict banner gets a row of its own.
  const bar = useRef<HTMLDivElement>(null);
  const { w } = useElementSize(bar);
  const stacked = conflict && w > 0 && w < STACK_BELOW;

  const { close } = ui.actions;
  return (
    <div ref={bar} className={`ks-titlebar${conflict ? " is-conflict" : ""}${stacked ? " is-stacked" : ""}`}>
      {/* Full screen is left first, so the window is given back before the deck is closed. */}
      {close ? (
        <IconButton
          icon="arrow-left"
          label="Back"
          onClick={() => {
            ui.setFullScreen(false);
            close();
          }}
        />
      ) : null}
      <DeckTitle session={session} ui={ui} />
      <SaveStatus session={session} />
      <span className="ks-title-spacer" />
      <IconButton icon="sparkles" label="Assistant" on={panel === "ai"} onClick={() => void runCommand("view.ai-panel", ctx)} />
      {/* On, it says in words how to get out; the tooltip has the keys either way. */}
      <IconButton
        icon={fullScreen ? "minimize" : "maximize"}
        label={fullScreen ? "Exit full screen" : "Full screen"}
        keys={keysOf("view.full-screen")}
        on={fullScreen}
        {...(fullScreen ? { text: "Exit full screen" } : {})}
        onClick={() => void runCommand("view.full-screen", ctx)}
      />
      <PresentButton session={session} ui={ui} />
    </div>
  );
}
