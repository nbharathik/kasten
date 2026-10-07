// A synthetic whiteboard for checking the canvas's speed in the browser
// preview: open it with `?board=500`. Sections in a grid, each holding
// cards for notes (some expanded to their whole note, some showing only
// their title), stickies and link cards, with edges inside and between
// sections. Deterministic, kept in memory only.

const WORDS = [
  "model", "layout", "edit", "accuracy", "diff", "graph", "photo", "frame", "folder", "camera", "paper", "draft",
  "review", "result", "method", "idea", "plan", "budget", "meeting", "roadmap", "sketch", "question", "answer",
  "chapter", "figure", "dataset", "experiment", "baseline", "metric", "schema", "export", "album", "cache", "index",
];
const TAGS = ["paper", "idea", "task", "meeting", "reading"];

/** The synthetic board's path. */
export const BIG_BOARD = "library/perf-board.canvas";

function rng(seed: number) {
  let state = seed >>> 0 || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const below = (n: number) => Math.floor(next() * n);
  const words = (n: number) => Array.from({ length: n }, () => WORDS[below(WORDS.length)]!).join(" ");
  return { below, words, next };
}

type Node = Record<string, unknown>;

/** Files by vault path: the board and the notes its cards show. `count`
 * is the number of nodes on the board, sections included. */
export function bigBoard(count: number, seed = 7): Record<string, string> {
  const r = rng(seed);
  const files: Record<string, string> = {};
  const nodes: Node[] = [];
  const edges: Node[] = [];
  const perSection = 12;
  const sections = Math.max(1, Math.ceil(count / (perSection + 1)));
  const columns = Math.ceil(Math.sqrt(sections));
  let made = 0;
  let noteCount = 0;
  for (let s = 0; s < sections && made < count; s++) {
    const left = (s % columns) * 1500;
    const top = Math.floor(s / columns) * 1100;
    nodes.push({ id: `s${s}`, type: "group", label: `${r.words(2)} ${s}`, x: left, y: top, width: 1400, height: 1000, ...(s % 4 === 0 ? { color: String(1 + (s % 6)) } : {}) });
    made++;
    const inside: string[] = [];
    for (let k = 0; k < perSection && made < count; k++, made++) {
      const x = left + 40 + (k % 4) * 340;
      const y = top + 80 + Math.floor(k / 4) * 300;
      const id = `n${made}`;
      inside.push(id);
      if (k === 5 || k === 10) {
        nodes.push({ id, type: "text", text: `## ${r.words(2)}\n- ${r.words(4)}\n- [ ] ${r.words(3)}`, x, y, width: 300, height: 200, ...(k === 5 ? { color: "3" } : {}) });
      } else if (k === 11 && s % 3 === 0) {
        nodes.push({ id, type: "link", url: `https://example.com/${r.words(1)}/${s}`, x, y, width: 300, height: 140 });
      } else {
        const path = `library/perf/n${noteCount}.md`;
        const title = `${r.words(2)} ${noteCount}`;
        const body = Array.from({ length: 3 + r.below(6) }, () => `${r.words(8 + r.below(10))}.`).join("\n\n");
        files[path] = `---\ntitle: ${title}\ntype: card\ntags: [${TAGS[noteCount % TAGS.length]}]\n---\n${body}\n`;
        noteCount++;
        nodes.push({ id, type: "file", file: path, x, y, width: 300, height: 220 });
      }
    }
    // A chain through the section and a few crossings.
    for (let k = 1; k < inside.length; k += 2) edges.push({ id: `e${edges.length}`, fromNode: inside[k - 1], fromSide: "right", toNode: inside[k], toSide: "left" });
    if (s > 0) edges.push({ id: `e${edges.length}`, fromNode: `s${s - 1}`, fromSide: "right", toNode: `s${s}`, toSide: "left", label: r.words(1) });
  }
  const sizes: Record<string, string> = {};
  for (let i = 0; i < nodes.length; i += 40) if (nodes[i]!.type === "file") sizes[String(nodes[i]!.id)] = i % 2 ? "title" : "expanded";
  files[BIG_BOARD] = JSON.stringify({ nodes, edges, "x-kasten": { title: `Perf board (${nodes.length} nodes)`, cardSize: sizes } });
  return files;
}

/** How many nodes `?board=N` asks for, if any (at most 5,000). */
export function bigBoardSize(search: string): number {
  const n = Number(new URLSearchParams(search).get("board"));
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 5000) : 0;
}
