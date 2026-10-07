import type { DeliveredFile } from "@kasten-slides/react";

/** Hands a finished file to the person as a browser download. */
export function download(file: DeliveredFile): void {
  const url = URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: file.type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
