// Sources that changed on disk (another tool, a sync), so an open reader
// and the Highlights view read them again. Called with every batch of
// changed vault paths.

import { useSources } from "./store";

export function sourceFilesChanged(paths: string[]): void {
  const touched = paths.filter((p) => p.startsWith("sources/") && /\.(pdf|highlights\.json)$/i.test(p));
  if (touched.length === 0) return;
  const { highlights, load, loadList } = useSources.getState();
  for (const path of touched) {
    const source = path.replace(/\.highlights\.json$/i, ".pdf");
    if (highlights[source]) void load(source);
  }
  void loadList();
}
