// What the clip form needs from the vault besides the picture: the works of
// the bibliography to choose a key from, and the pictures kept so far, which
// say what key the paper's earlier clips were given.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AssetInfo } from "../../../../lib/vault/asset-types";
import type { VaultClient } from "../../../../lib/vault/types";
import { readWorks, type Work } from "./bib";
import { suggestKey } from "./clip-file";

const NONE: never[] = [];

export interface ClipContext {
  works: readonly Work[];
  /** The key to start a form with: empty when nothing points to one. */
  suggested: string;
  /** Reads the vault again, after a clip was kept. */
  reload(): Promise<void>;
}

export function useClipContext(client: VaultClient | null, pdf: string, title: string): ClipContext {
  const [held, setHeld] = useState<{ works: readonly Work[]; assets: readonly AssetInfo[] }>({ works: NONE, assets: NONE });
  const live = useRef(true);

  const reload = useCallback(async () => {
    if (!client) return;
    const [text, assets] = await Promise.all([client.references().catch(() => ""), client.assets().catch(() => [] as AssetInfo[])]);
    if (live.current) setHeld({ works: readWorks(text), assets });
  }, [client]);

  useEffect(() => {
    live.current = true;
    void reload();
    return () => {
      live.current = false;
    };
  }, [reload]);

  const suggested = useMemo(() => suggestKey(pdf, title, held.assets, held.works), [pdf, title, held]);
  return { works: held.works, suggested, reload };
}
