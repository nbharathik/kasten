// Moving notes in (kasten-core `import`): what importing a folder would
// write, the import itself as one commit, and undoing one commit.

import type { Undone } from "./types";

export type ImportKind = "obsidian" | "markdown" | "notion" | "heptabase";

export interface ImportOptions {
  /** What the folder is; found from its files when left out. */
  kind?: ImportKind;
  /** The new project's title; the folder's name when left out. */
  project?: string;
}

/** What an import writes, before or after. */
export interface ImportSummary {
  kind: ImportKind;
  project: string;
  projectPath: string;
  /** Pages and cards. */
  notes: number;
  /** Journal days made, and days already here that get imported ones added. */
  days: number;
  daysAppended: number;
  boards: number;
  /** Attachments and PDFs. */
  files: number;
  /** Tag schemas, from Notion databases. */
  tags: number;
  /** What did not come across as it was, in sentences. */
  warnings: string[];
}

export interface Imported {
  summary: ImportSummary;
  /** The import's commit, to undo it by; null in a vault without history. */
  commit: string | null;
}

export interface ImportOps {
  /** What importing the folder at `source` would write, writing nothing. */
  planImport(source: string, options: ImportOptions): Promise<ImportSummary>;
  /** Imports the folder into a new project, as one commit. */
  importNotes(source: string, options: ImportOptions): Promise<Imported>;
  /** Reverts one commit, such as an import, as a new commit. */
  undoCommit(commit: string): Promise<Undone>;
}
