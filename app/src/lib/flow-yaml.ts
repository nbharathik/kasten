// A small reader and writer for the YAML Kasten writes in one line: plain
// or quoted scalars, [flow, lists] and {flow: maps}. Enough for tag schemas,
// properties and highlight cards' sources in the window; the core reads full YAML.

export type Flow = string | number | boolean | null | Flow[] | { [key: string]: Flow };

function scalar(raw: string): Flow {
  const t = raw.trim();
  if (t === "" || t === "~" || t === "null") return null;
  if (t === "true" || t === "false") return t === "true";
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    try {
      return t.startsWith('"') ? (JSON.parse(t) as string) : t.slice(1, -1).replace(/''/g, "'");
    } catch {
      return t.slice(1, -1);
    }
  }
  return t;
}

/** Splits at top-level commas, outside brackets and quotes. */
function parts(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]!;
    if (quote) {
      if (c === quote && inner[i - 1] !== "\\") quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      out.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  if (inner.slice(start).trim()) out.push(inner.slice(start));
  return out;
}

/** One flow value: a scalar, `[a, b]` or `{k: v}`. */
export function readFlow(raw: string): Flow {
  const t = raw.trim();
  if (t.startsWith("[") && t.endsWith("]")) return parts(t.slice(1, -1)).map(readFlow);
  if (t.startsWith("{") && t.endsWith("}")) {
    const map: { [key: string]: Flow } = {};
    for (const part of parts(t.slice(1, -1))) {
      const at = part.indexOf(":");
      if (at < 0) continue;
      map[String(scalar(part.slice(0, at)))] = readFlow(part.slice(at + 1));
    }
    return map;
  }
  return scalar(t);
}

/** Written plain: no quote needed to read it back, in a flow list or map
 * too, where a comma or bracket ends a plain value. */
const PLAIN = /^[^\s\-?:,[\]{}#&*!|>'"%@`][^:#\n,[\]{}]*$/;

/** A value as one line of YAML. */
export function writeFlow(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return `[${value.map(writeFlow).join(", ")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${writeFlow(k)}: ${writeFlow(v)}`)
      .join(", ")}}`;
  }
  const s = String(value);
  const reserved = /^(true|false|yes|no|on|off|null|~)$/i.test(s) || /^-?\d+(\.\d+)?$/.test(s);
  return PLAIN.test(s) && s === s.trim() && !reserved ? s : JSON.stringify(s);
}

/** A block mapping's `key: value` lines under `key:` in a YAML prefix, as values. */
export function readBlock(yaml: string, key: string): Record<string, Flow> | null {
  const lines = yaml.split(/\r?\n/);
  const at = lines.findIndex((l) => l === `${key}:` || l.startsWith(`${key}: `) || l.startsWith(`${key}:\t`));
  if (at < 0) return null;
  const rest = lines[at]!.slice(key.length + 1).trim();
  if (rest.startsWith("{")) {
    const flow = readFlow(rest);
    return flow && typeof flow === "object" && !Array.isArray(flow) ? flow : {};
  }
  const out: Record<string, Flow> = {};
  for (const line of lines.slice(at + 1)) {
    if (!/^\s+\S/.test(line)) break;
    const m = /^\s+([^:#]+):\s*(.*)$/.exec(line);
    if (m) out[m[1]!.trim()] = readFlow(m[2]!.replace(/\s+#.*$/, ""));
  }
  return out;
}
