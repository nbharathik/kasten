// The starter kits, each with what it adds and a button to add it (or to
// open it, once added). Shown in the template gallery and in Settings.

import { useEffect, useState } from "react";

import type { KitInfo } from "../../lib/vault/types";
import { useWorkspace } from "../workspace/store";
import { addKit, hasKit, kitContents } from "./kits";

export function KitList({ onOpened }: { onOpened?: () => void }) {
  const client = useWorkspace((s) => s.client);
  const notes = useWorkspace((s) => s.notes);
  const [kits, setKits] = useState<KitInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    client?.kits().then(setKits, () => {});
  }, [client]);

  const add = async (kit: KitInfo) => {
    setBusy(kit.id);
    const added = await addKit(kit);
    setBusy(null);
    if (added) onOpened?.();
  };

  return (
    <ul className="kasten-kits" aria-label="Starter kits">
      {kits.map((kit) => {
        const added = hasKit(kit, notes);
        return (
          <li key={kit.id} className="kasten-kit">
            <span className="kasten-kit-icon" aria-hidden="true">
              {kit.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="kasten-kit-name">
                {kit.name}
                {kit.recommended && <span className="kasten-kit-badge">Recommended</span>}
              </p>
              <p className="kasten-kit-summary">{kit.summary}</p>
              <p className="kasten-kit-adds">Adds {kitContents(kit)}.</p>
            </div>
            {added ? (
              <button
                type="button"
                className="ui-btn is-sm"
                aria-label={`Open ${kit.name}`}
                onClick={() => {
                  useWorkspace.getState().openPath(kit.home);
                  onOpened?.();
                }}
              >
                Open
              </button>
            ) : (
              <button type="button" className="ui-btn is-sm is-primary" aria-label={`Add ${kit.name}`} disabled={busy !== null} onClick={() => void add(kit)}>
                {busy === kit.id ? "Adding…" : "Add"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
