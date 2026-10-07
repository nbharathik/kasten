// The languages a code block is offered in. The code is coloured by name, so
// the `id` is what the colouring knows the language as; anything else a person
// types is kept too (a file extension does as well), and gets its colours if
// the colouring knows it.

import { rank } from "../../../dialogs/palette-rank.ts";

export interface Language {
  id: string;
  label: string;
  /** Other names and file extensions it goes by, to find it with. */
  aliases: readonly string[];
}

export const PLAIN_TEXT = "text";

export const LANGUAGES: readonly Language[] = [
  { id: PLAIN_TEXT, label: "Plain text", aliases: ["none", "txt", "output", "console", "log"] },
  { id: "python", label: "Python", aliases: ["py", "python3"] },
  { id: "javascript", label: "JavaScript", aliases: ["js", "jsx", "node", "mjs"] },
  { id: "typescript", label: "TypeScript", aliases: ["ts", "tsx"] },
  { id: "rust", label: "Rust", aliases: ["rs"] },
  { id: "go", label: "Go", aliases: ["golang"] },
  { id: "java", label: "Java", aliases: [] },
  { id: "kotlin", label: "Kotlin", aliases: ["kt"] },
  { id: "swift", label: "Swift", aliases: [] },
  { id: "c", label: "C", aliases: ["h"] },
  { id: "cpp", label: "C++", aliases: ["cxx", "cc", "hpp"] },
  { id: "csharp", label: "C#", aliases: ["cs", "dotnet"] },
  { id: "objective-c", label: "Objective-C", aliases: ["objc", "m"] },
  { id: "ruby", label: "Ruby", aliases: ["rb"] },
  { id: "php", label: "PHP", aliases: [] },
  { id: "perl", label: "Perl", aliases: ["pl"] },
  { id: "scala", label: "Scala", aliases: [] },
  { id: "haskell", label: "Haskell", aliases: ["hs"] },
  { id: "ocaml", label: "OCaml", aliases: ["ml"] },
  { id: "erlang", label: "Erlang", aliases: ["erl"] },
  { id: "clojure", label: "Clojure", aliases: ["clj"] },
  { id: "lisp", label: "Lisp", aliases: ["scheme", "elisp"] },
  { id: "lua", label: "Lua", aliases: [] },
  { id: "r", label: "R", aliases: [] },
  { id: "matlab", label: "MATLAB", aliases: ["octave"] },
  { id: "sql", label: "SQL", aliases: ["postgres", "mysql", "sqlite"] },
  { id: "bash", label: "Shell", aliases: ["sh", "shell", "zsh", "terminal"] },
  { id: "batch", label: "Batch file", aliases: ["bat", "cmd"] },
  { id: "html", label: "HTML", aliases: ["htm"] },
  { id: "css", label: "CSS", aliases: ["scss", "less"] },
  { id: "xml", label: "XML", aliases: ["svg", "xsd"] },
  { id: "json", label: "JSON", aliases: ["jsonc"] },
  { id: "yaml", label: "YAML", aliases: ["yml"] },
  { id: "toml", label: "TOML", aliases: [] },
  { id: "markdown", label: "Markdown", aliases: ["md"] },
  { id: "latex", label: "LaTeX", aliases: ["tex"] },
  { id: "diff", label: "Diff", aliases: ["patch"] },
  { id: "make", label: "Makefile", aliases: ["makefile"] },
  { id: "groovy", label: "Groovy", aliases: ["gradle"] },
  { id: "graphviz", label: "Graphviz", aliases: ["dot", "gv"] },
];

const key = (text: string): string => text.trim().toLowerCase();

/** The language whose id, name or alias this is; undefined for one not on the list. */
export function languageOf(text: string): Language | undefined {
  const wanted = key(text);
  return LANGUAGES.find((language) => language.id === wanted || key(language.label) === wanted) ?? LANGUAGES.find((language) => language.aliases.includes(wanted));
}

/** How a language is written in the box: its name if it is on the list, else as it is kept. An empty one is plain text. */
export const nameOfLanguage = (id: string): string => (id.trim() === "" ? (LANGUAGES[0] as Language).label : (languageOf(id)?.label ?? id));

/** The languages that match what was typed, best first; all of them for nothing. */
export function findLanguages(query: string): Language[] {
  return rank(
    query,
    LANGUAGES.map((language) => ({ language, label: language.label, keywords: [language.id, ...language.aliases] })),
  ).map((found) => found.language);
}
