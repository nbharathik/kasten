// Where each PDF was left: its page, kept in this browser so a PDF opens
// again where the reader stopped. The newest 200 are kept.

const KEY = "kasten.readerPages";
const MOST = 200;

function all(): Record<string, number> {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    return kept && typeof kept === "object" ? (kept as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** The page the PDF at `path` was left on, if any. */
export function lastPage(path: string): number | null {
  const page = all()[path];
  return typeof page === "number" && page >= 1 ? page : null;
}

/** Remembers the page the PDF at `path` is on. */
export function keepPage(path: string, page: number): void {
  const rest = Object.entries(all()).filter(([p]) => p !== path);
  const kept = Object.fromEntries([...rest.slice(-(MOST - 1)), [path, page]]);
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Storage full or blocked: the PDF opens at the top next time.
  }
}
