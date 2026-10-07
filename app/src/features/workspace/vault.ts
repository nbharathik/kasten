// Which vault the window works on: the folder from KASTEN_VAULT through the
// Rust core inside the app, or the in-browser preview everywhere else.

import { appInfo, inTauri, vaultReady } from "../../lib/api";
import { setFileRoot } from "../../lib/vault/file-url";
import { tauriVault } from "../../lib/vault/tauri";
import type { VaultClient } from "../../lib/vault/types";

// A browser starts fetching the preview's vault with the rest of the window;
// the desktop app never loads it.
const preview = inTauri() ? null : import("./preview/connect-preview");

export interface Connection {
  client: VaultClient | null;
  /** Why no vault is open, when `client` is null. */
  problem?: string;
  /** No vault yet, or it went missing: offer to create or open one. */
  choose?: boolean;
}

export async function connectVault(): Promise<Connection> {
  const info = await appInfo();
  // Only the browser preview loads its own vault's code.
  if (!info) return (await (preview ?? import("./preview/connect-preview"))).connectPreview();
  if (!info.vault) return { client: null, choose: true };
  if (!info.vault.exists) return { client: null, choose: true, problem: `The vault folder ${info.vault.resolved} is not there any more. Open it from where it moved, or choose another.` };
  setFileRoot(info.vault.resolved);
  try {
    await vaultReady();
  } catch (err) {
    // The folder is there but could not be opened: say why, and offer another.
    return { client: null, choose: true, problem: err instanceof Error ? err.message : String(err) };
  }
  return { client: tauriVault(info.vault.resolved) };
}
