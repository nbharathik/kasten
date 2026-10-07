// Settings → Vault, and History and backup: where the notes live, bringing
// notes in, switching to another folder, and keeping it all safe.

import { showInFolder } from "../../page/page-file";
import { useWorkspace } from "../../store";
import { VaultSafety } from "../VaultSafety";
import { Group, Row } from "./parts";

export function VaultSettings({ onSwitch }: { onSwitch: () => void }) {
  const client = useWorkspace((s) => s.client);
  return (
    <Group title="Vault">
      <Row label="Notes live in" detail={client?.kind === "preview" ? "Edits are kept in this browser only. Run the desktop app to work on a folder." : "Every page is a Markdown file in this folder."}>
        <code className="max-w-[260px] truncate rounded-md bg-panel px-1.5 py-0.5 text-12 ring-1 ring-line" title={client?.label}>
          {client?.label ?? "No vault"}
        </code>
        {client?.kind !== "preview" && (
          <button type="button" className="ml-2 rounded-md px-2.5 py-1 text-13 ring-1 ring-line hover:bg-hover" onClick={() => void showInFolder()}>
            Show in folder
          </button>
        )}
      </Row>
      <Row label="Import notes" detail="From Obsidian, Notion, Heptabase or a folder of Markdown, as a project you can undo">
        <button type="button" className="rounded-md px-2.5 py-1 text-13 ring-1 ring-line hover:bg-hover" onClick={() => useWorkspace.getState().go({ view: "import" })}>
          Import…
        </button>
      </Row>
      {client?.kind !== "preview" && (
        <Row label="Switch vault" detail="Open another folder, or make a new vault; the window restarts on it">
          <button type="button" className="rounded-md px-2.5 py-1 text-13 ring-1 ring-line hover:bg-hover" onClick={onSwitch}>
            Switch…
          </button>
        </Row>
      )}
    </Group>
  );
}

export function HistorySettings() {
  return (
    <Group title="History and backup" detail="Kasten is desktop-first: backup keeps your notes safe and moves them to a new computer. It isn't live sync.">
      <VaultSafety Row={Row} />
    </Group>
  );
}
