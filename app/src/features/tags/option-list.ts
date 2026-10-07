// A select's options typed on one line, as the schema editor shows them:
// separated by commas, with an option that holds a comma or a quote in
// double quotes ("Done, verified"), a quote inside doubled.

/** The options as one line. */
export function joinOptions(options: readonly string[]): string {
  return options.map((o) => (/[",]/.test(o) ? `"${o.replaceAll('"', '""')}"` : o)).join(", ");
}

/** The options typed on one line, trimmed, each once. */
export function splitOptions(text: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c !== '"') current += c;
      else if (text[i + 1] === '"') {
        current += '"';
        i++;
      } else quoted = false;
    } else if (c === '"' && current.trim() === "") {
      quoted = true;
      current = "";
    } else if (c === ",") {
      out.push(current.trim());
      current = "";
    } else current += c;
  }
  out.push(current.trim());
  return [...new Set(out.filter(Boolean))];
}
