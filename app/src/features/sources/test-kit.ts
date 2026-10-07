// For the sources' tests: the dev vault's sample sidecar in a preview vault,
// with a PDF source to go with it.

import SIDECAR from "../../../../fixtures/dev-vault/sources/zettelkasten-primer.highlights.json?raw";
import { MemoryVault } from "../workspace/preview/memory-vault";
import { useWorkspace } from "../workspace/store";
import { useSources } from "./store";

export const PRIMER = "sources/zettelkasten-primer.pdf";
/** The sample's highlights, by the order they were made. */
export const FIRST = "01K5ZK00000000000000000001";
export const SECOND = "01K5ZK00000000000000000002";
export const THIRD = "01K5ZK00000000000000000003";

export const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");

/** A preview vault with the sample source, opened in the workspace. */
export async function sampleVault(seed: Record<string, string> = {}): Promise<MemoryVault> {
  const vault = new MemoryVault({ "sources/zettelkasten-primer.highlights.json": SIDECAR, ...seed });
  vault.addSampleSource(PRIMER, async () => PDF_BYTES);
  useSources.setState({ list: null, highlights: {} });
  useWorkspace.setState({ toasts: [], stack: [], stackOpen: false });
  await useWorkspace.getState().connect({ client: vault });
  return vault;
}

/** A drag's data, as the tests' drag events carry it. */
export function transfer() {
  const data = new Map<string, string>();
  return {
    effectAllowed: "all",
    dropEffect: "none",
    get types() {
      return [...data.keys()];
    },
    setData: (type: string, value: string) => void data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
    clearData: () => data.clear(),
    setDragImage: () => {},
  };
}
