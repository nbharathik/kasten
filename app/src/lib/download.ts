import type { DeliveredFile } from "@kasten-slides/react";

/** Hands a file to the person as a browser download. */
export async function browserDownload(file: DeliveredFile): Promise<void> {
  const url = URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: file.type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
