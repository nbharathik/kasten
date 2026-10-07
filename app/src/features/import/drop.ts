// Markdown files or a folder dropped on the window, where no page or board
// takes them: the desktop app copies them into its cache (the webview
// gives no path to read them from) and opens Import on the copy, which
// shows what would come in before anything does.

import { create } from "zustand";

import { inTauri, stageDrop } from "../../lib/api";
import { useWorkspace } from "../workspace/store";

/** A folder Import should look at as soon as it shows. */
export const useImportRequest = create<{ source: string | null }>(() => ({ source: null }));

const NOTE = /\.(md|markdown)$/i;

/** Whether a drop holds notes to import: a folder, or Markdown files. */
export function carriesNotes(data: DataTransfer): boolean {
  if ([...(data.files ?? [])].some((file) => NOTE.test(file.name))) return true;
  return [...(data.items ?? [])].some((item) => item.kind === "file" && item.webkitGetAsEntry?.()?.isDirectory);
}

interface Picked {
  rel: string;
  file: File;
}

const fileOf = (entry: FileSystemFileEntry) => new Promise<File>((done, fail) => entry.file(done, fail));

/** Every file below `entry`, hidden ones left out, with paths from `prefix`. */
async function walk(entry: FileSystemEntry, prefix: string, out: Picked[]): Promise<void> {
  if (entry.name.startsWith(".")) return;
  if (entry.isFile) {
    out.push({ rel: `${prefix}${entry.name}`, file: await fileOf(entry as FileSystemFileEntry) });
    return;
  }
  if (!entry.isDirectory) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((done, fail) => reader.readEntries(done, fail));
    if (batch.length === 0) return;
    for (const child of batch) await walk(child, `${prefix}${entry.name}/`, out);
  }
}

/** What was dropped as a name and files: one folder is its own name, with
 * paths inside it; loose files are "Dropped notes". */
export async function readDrop(entries: FileSystemEntry[]): Promise<{ name: string; files: Picked[] }> {
  const files: Picked[] = [];
  for (const entry of entries) await walk(entry, "", files);
  const only = entries.length === 1 && entries[0]!.isDirectory ? entries[0]!.name : null;
  if (!only) return { name: "", files };
  return { name: only, files: files.map((f) => ({ ...f, rel: f.rel.slice(only.length + 1) })) };
}

/** Takes the entries now, while the drop event lets them be read, then
 * copies them and opens Import. */
export function importDrop(data: DataTransfer): void {
  const { toast, go } = useWorkspace.getState();
  if (!inTauri()) {
    toast("Drop a folder of notes on the desktop app to import it");
    return;
  }
  const entries = [...data.items].map((item) => item.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => Boolean(e));
  void (async () => {
    try {
      const { name, files } = await readDrop(entries);
      const staged = await Promise.all(files.map(async ({ rel, file }) => ({ rel, data: [...new Uint8Array(await file.arrayBuffer())] })));
      const source = await stageDrop(name, staged);
      useImportRequest.setState({ source });
      go({ view: "import" });
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err));
    }
  })();
}
