import { type JSX, useCallback } from "react";

import type { EditorSession } from "../session/session.ts";
import type { EditorUi } from "../ui-state.ts";
import { useUiState } from "../useUi.ts";
import { BackgroundDialog } from "./BackgroundDialog.tsx";
import { CitationDialog } from "./CitationDialog.tsx";
import { EmbedDialog } from "./EmbedDialog.tsx";
import { FindDialog } from "./FindDialog.tsx";
import { LayoutsDialog } from "./LayoutsDialog.tsx";
import { LinkDialog } from "./LinkDialog.tsx";
import { ExportDialog } from "./ExportDialog.tsx";
import { ImportDialog } from "./ImportDialog.tsx";
import { InsertDialog } from "./InsertDialog.tsx";
import { AboutDialog } from "./Notices.tsx";
import { PngDialog } from "./PngDialog.tsx";
import { ShortcutsDialog } from "./ShortcutsDialog.tsx";
import { TableDialog } from "./TableDialog.tsx";
import { ThemeDialog } from "./ThemeDialog.tsx";
import { TransitionDialog } from "./TransitionDialog.tsx";
import { VideoDialog } from "./VideoDialog.tsx";
import { LintDialog } from "../lint/LintDialog.tsx";

/** The dialog that is open, if any: find and replace, layouts, theme, background, shortcuts. */
export function Dialogs({ session, ui }: { session: EditorSession; ui: EditorUi }): JSX.Element | null {
  const { dialog } = useUiState(ui);
  const onClose = useCallback(() => ui.openDialog(null), [ui]);
  const props = { session, ui, onClose };
  switch (dialog) {
    case "find":
      return <FindDialog session={session} ui={ui} />;
    case "layouts":
      return <LayoutsDialog {...props} />;
    case "theme":
      return <ThemeDialog {...props} />;
    case "background":
      return <BackgroundDialog {...props} />;
    case "shortcuts":
      return <ShortcutsDialog {...props} />;
    case "table":
      return <TableDialog {...props} />;
    case "link":
      return <LinkDialog {...props} />;
    case "transition":
      return <TransitionDialog {...props} />;
    case "insert":
      return <InsertDialog {...props} />;
    case "citation":
      return <CitationDialog {...props} />;
    case "embed":
      return <EmbedDialog {...props} />;
    case "video":
      return <VideoDialog {...props} />;
    case "export":
      return <ExportDialog {...props} />;
    case "png":
      return <PngDialog {...props} />;
    case "import":
      return <ImportDialog {...props} />;
    case "lint":
      return <LintDialog {...props} />;
    case "about":
      return <AboutDialog {...props} />;
    default:
      return null;
  }
}
