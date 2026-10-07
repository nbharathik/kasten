// A file dropped where nothing takes it would make the window open that
// file in place of the app. Places that take files (a page, a board) handle
// the drop first; anywhere else Markdown files or a folder open in Import,
// a PDF is imported into sources/ and opens in a reader, and other files
// are refused.

import { useEffect } from "react";

import { carriesNotes, importDrop } from "../features/import/drop";
import { carriesPdf, importPdfs, isPdfFile } from "../features/sources/import";

const carriesFiles = (event: DragEvent) => Boolean(event.dataTransfer?.types.includes("Files"));

export function refuseStrayDrop(event: DragEvent): void {
  if (!carriesFiles(event) || event.defaultPrevented) return;
  event.preventDefault();
  const data = event.dataTransfer;
  if (event.type === "drop" && data && carriesNotes(data)) return importDrop(data);
  const pdfs = event.type === "drop" ? [...(data?.files ?? [])].filter(isPdfFile) : [];
  if (pdfs.length > 0) void importPdfs(pdfs);
  // While dragging, a file's name is hidden: a folder or Markdown file shows
  // no type or a text one.
  if (event.type === "dragover" && data) data.dropEffect = carriesPdf(data) || [...(data.items ?? [])].some((item) => item.kind === "file" && /^(|text\/markdown|text\/plain|text\/x-markdown)$/.test(item.type)) ? "copy" : "none";
}

export function useFileDropGuard(): void {
  useEffect(() => {
    window.addEventListener("dragover", refuseStrayDrop);
    window.addEventListener("drop", refuseStrayDrop);
    return () => {
      window.removeEventListener("dragover", refuseStrayDrop);
      window.removeEventListener("drop", refuseStrayDrop);
    };
  }, []);
}
