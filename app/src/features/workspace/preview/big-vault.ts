// A synthetic vault for checking the app's speed in the browser preview:
// open it with `?big=10000`. Its shape follows `kasten dev-generate`
// (crates/kasten-core/src/generate.rs): 20 projects, a tenth of the notes in
// the inbox, a tenth in the library, the rest as project pages and cards,
// with links, to-dos and headings in every body. Deterministic for a seed.

const WORDS = [
  "model", "layout", "edit", "accuracy", "diff", "graph", "photo", "frame", "folder", "camera", "reading", "paper",
  "draft", "review", "result", "method", "idea", "plan", "trip", "budget", "meeting", "project", "roadmap", "sketch",
  "question", "answer", "note", "chapter", "section", "figure", "table", "dataset", "experiment", "hypothesis",
  "baseline", "metric", "schema", "export", "import", "pixel", "thumbnail", "album", "cache", "index", "search",
  "garden", "coffee", "museum",
];

const TAGS = ["paper", "idea", "task", "travel", "meeting"];
const PROJECTS = 20;

function rng(seed: number) {
  let state = seed >>> 0 || 1;
  const next = () => {
    // xorshift32: fast and good enough for sample text.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const below = (n: number) => Math.floor(next() * n);
  const word = () => WORDS[below(WORDS.length)]!;
  const sentence = (words: number) => {
    const out = Array.from({ length: words }, word).join(" ");
    return `${out.charAt(0).toUpperCase()}${out.slice(1)}.`;
  };
  return { below, word, sentence };
}

/** Files by vault path, like the dev vault's samples. */
export function bigVault(count: number, seed = 42): Record<string, string> {
  const r = rng(seed);
  const files: Record<string, string> = {};
  const titles = Array.from({ length: count }, (_, i) => `${r.word()} ${r.word()} ${i}`);
  for (let p = 0; p < PROJECTS; p++) {
    files[`projects/p${p}/_project.md`] = `---\ntitle: Project ${p}\ntype: project\n---\nProject ${p} overview.\n`;
  }
  for (let i = 0; i < count; i++) {
    const slot = i % 10;
    const dir = slot === 0 ? "inbox" : slot === 1 ? "library" : slot <= 6 ? `projects/p${i % PROJECTS}/pages` : `projects/p${i % PROJECTS}/cards`;
    const kind = slot === 0 || slot >= 7 ? "card" : "page";
    const lines: string[] = [
      "---",
      `id: big${String(i).padStart(6, "0")}`,
      `title: ${titles[i]}`,
      `type: ${kind}`,
      `created: 2026-0${1 + (i % 9)}-1${i % 10}T09:00:00Z`,
      `updated: 2026-09-2${i % 10}T10:00:00Z`,
      `tags: [${TAGS[i % TAGS.length]}]`,
      "---",
    ];
    const body = 5 + r.below(35);
    for (let line = 0; line < body; line++) {
      const k = line % 9;
      if (k === 0) lines.push(`## ${r.sentence(3)}`, "");
      else if (k === 3) lines.push(`- [ ] ${r.sentence(5)} [[${titles[r.below(count)]}]]`);
      else if (k === 5) lines.push(`- ${r.sentence(6)}`);
      else if (k === 7) lines.push(`See [[${titles[r.below(count)]}]] and **${r.word()}**.`, "");
      else lines.push(r.sentence(12), "");
    }
    files[`${dir}/n${i}.md`] = `${lines.join("\n")}\n`;
  }
  for (let d = 0; d < Math.min(60, count); d++) {
    const day = `2026-${String(7 + Math.floor(d / 28)).padStart(2, "0")}-${String(1 + (d % 28)).padStart(2, "0")}`;
    files[`journal/2026/${day}.md`] = `---\ntitle: "${day}"\ntype: journal\n---\n${r.sentence(20)}\n`;
  }
  return files;
}

/** How many notes `?big=N` asks for, if any (at most 50,000). */
export function bigVaultSize(search: string): number {
  const n = Number(new URLSearchParams(search).get("big"));
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 50_000) : 0;
}
