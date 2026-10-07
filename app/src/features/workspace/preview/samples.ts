// What the browser preview starts with: what a new vault has,
// the core's starter templates and tags, plus its Welcome page and the
// example project in fixtures/preview-vault. `?samples=dev` loads the dev
// vault's fuller samples instead, kept in memory only, for demos and
// screenshots. Loaded only when the preview is used.

const PREVIEW = import.meta.glob<string>(
  ["../../../../../fixtures/preview-vault/**/*.md", "../../../../../crates/kasten-core/defaults/templates/*.md", "../../../../../crates/kasten-core/defaults/tags/*.yaml"],
  { query: "?raw", import: "default" },
);

const DEV = import.meta.glob<string>(
  [
    "../../../../../fixtures/dev-vault/**/*.md",
    "../../../../../fixtures/dev-vault/**/*.canvas",
    "../../../../../fixtures/dev-vault/**/*.deck",
    "../../../../../fixtures/dev-vault/**/*.bib",
    "../../../../../fixtures/dev-vault/tags/*.yaml",
    "../../../../../fixtures/dev-vault/sources/*.highlights.json",
  ],
  { query: "?raw", import: "default" },
);

/** The dev vault's sample PDFs, as URLs: read only when a reader opens one. */
const DEV_PDFS = import.meta.glob<string>("../../../../../fixtures/dev-vault/sources/*.pdf", { query: "?url", import: "default", eager: true });

/** Where a bundled file sits in the vault. */
function inVault(key: string): string {
  for (const root of ["preview-vault/", "dev-vault/", "defaults/"]) {
    const at = key.indexOf(root);
    if (at >= 0) return key.slice(at + root.length);
  }
  return key;
}

async function read(files: Record<string, () => Promise<string>>): Promise<Record<string, string>> {
  const entries = await Promise.all(Object.entries(files).map(async ([key, load]) => [inVault(key), await load()] as const));
  return Object.fromEntries(entries);
}

/** The preview's first notes: a new vault's templates and tags, the Welcome page and an example project. */
export async function loadSamples(): Promise<Record<string, string>> {
  const [files, welcome] = await Promise.all([read(PREVIEW), import("../../../../../crates/kasten-core/defaults/welcome.md?raw").then((m) => m.default)]);
  return { ...files, "library/welcome-to-kasten.md": welcome };
}

/** The dev vault's samples: pages, projects, a board, a PDF and its highlights. */
export function loadDevSamples(): Promise<Record<string, string>> {
  return read(DEV);
}

/** The dev vault's sample PDFs by vault path, each with how to read its bytes. */
export function devSources(): [string, () => Promise<Uint8Array>][] {
  return Object.entries(DEV_PDFS).map(([key, url]) => [inVault(key), async () => new Uint8Array(await (await fetch(url)).arrayBuffer())]);
}
