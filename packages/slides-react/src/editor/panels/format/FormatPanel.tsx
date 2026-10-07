import { useEditor } from "../../useEditor.ts";
import { ElementOptions } from "./ElementOptions.tsx";
import { SlideOptions } from "./SlideOptions.tsx";
import type { PanelProps } from "./types.ts";

/** Format options: for the slide when nothing is selected, else for what is. */
export function FormatPanel({ session, ui }: PanelProps) {
  const state = useEditor(session);
  const elements = session.elements.find(state.selection);
  if (elements.length === 0) return <SlideOptions session={session} ui={ui} />;
  return <ElementOptions session={session} ui={ui} elements={elements} theme={state.deck.theme} />;
}
