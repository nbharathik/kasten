import type { JSX } from "react";

import { imageItems, lineItems } from "../menus/items-insert.tsx";
import type { EditorSession } from "../session/session.ts";
import type { EditorUi } from "../ui-state.ts";
import { useEditor } from "../useEditor.ts";
import { ShapeMenu } from "./ShapeMenu.tsx";
import { CommandButton, MenuButton } from "./ToolButton.tsx";

/** The corner-to-corner stroke of the line tool. */
function LineGlyph(): JSX.Element {
  return (
    <svg className="ks-icon" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true">
      <path d="M5 19 19 5" />
    </svg>
  );
}

/** Select, text box, image, shape and line: what goes on the slide, and the pointer to go with it. */
export function InsertTools({ session, ui }: { session: EditorSession; ui: EditorUi }): JSX.Element {
  const { tool } = useEditor(session);
  const ctx = { session, ui };
  const lineTool = tool.startsWith("line:") || tool.startsWith("arrow:");
  return (
    <>
      <CommandButton id="insert.select" ctx={ctx} on={tool === "select"} />
      <CommandButton id="insert.text-box" ctx={ctx} on={tool === "text"} />
      <MenuButton ui={ui} label="Image" icon="image" items={() => imageItems(ctx)} />
      <ShapeMenu session={session} tool={tool} />
      <MenuButton ui={ui} label="Line" on={lineTool} items={() => lineItems(ctx)}>
        <LineGlyph />
      </MenuButton>
    </>
  );
}
