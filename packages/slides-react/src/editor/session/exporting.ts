// What leaves the editor: the deck as a file. The bytes are made by the
// WebAssembly engine; the pictures a deck names are read from the host.

import { type ExportOptions, type ExportWarning, picturePaths } from "@kasten-slides/wasm";

import { mathPictures } from "../../export/math-png.ts";
import { DEFAULT_PNG, type PngOptions, slidePictures } from "../../export/png.ts";
import { posterPaths } from "../../export/posters.ts";
import { DEFAULT_PRINT, type PrintOptions, mountPrintLayout, printDeck } from "../../export/print.tsx";
import { zipStored } from "../../export/zip.ts";
import type { DeliveredFile } from "../host.ts";
import type { EditorSession } from "./session.ts";

export interface Exported {
  file: DeliveredFile;
  /** What could not be written exactly, in words for a person. */
  warnings: ExportWarning[];
}

/** A name for a file from a deck's title: no characters a file system refuses. */
export function fileNameOf(title: string, extension: string): string {
  const printable = [...title].map((c) => (c.charCodeAt(0) < 32 ? " " : c)).join("");
  const clean = printable.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  return `${clean.slice(0, 80).trim() || "Untitled deck"}.${extension}`;
}

export class Exports {
  constructor(private readonly s: EditorSession) {}

  /** Pictures of the deck's formulas, put in `found` under the names the exporter gives them. One the browser cannot draw is left out, and is written as its LaTeX. */
  private async formulas(found: Map<string, Uint8Array>): Promise<void> {
    try {
      for (const [name, bytes] of await mathPictures(this.s.deck)) found.set(name, bytes);
    } catch {
      // A formula that cannot be drawn is text in the file.
    }
  }

  /** Puts in `found` the pictures the deck names that the host can give. */
  private async images(found: Map<string, Uint8Array>): Promise<void> {
    const { host } = this.s;
    await Promise.all(
      [...new Set([...picturePaths(this.s.deck), ...posterPaths(this.s.deck)])].map(async (path) => {
        try {
          if (host.readImage) {
            const bytes = await host.readImage(path);
            if (bytes) found.set(path, bytes);
            return;
          }
          const url = host.imageUrl(path);
          if (!url) return;
          const response = await fetch(url);
          if (response.ok) found.set(path, new Uint8Array(await response.arrayBuffer()));
        } catch {
          // A picture that cannot be read is a grey box in the file, and a warning.
        }
      }),
    );
  }

  /** The pictures a PowerPoint file needs: those the deck names, and its formulas drawn. */
  private async pictures(): Promise<Map<string, Uint8Array>> {
    const found = new Map<string, Uint8Array>();
    await Promise.all([this.images(found), this.formulas(found)]);
    return found;
  }

  /** The deck as an editable PowerPoint file. */
  async pptx(options: ExportOptions = {}): Promise<Exported> {
    const pictures = await this.pictures();
    const { bytes, warnings } = this.s.core.exportPptx(pictures, options);
    return {
      file: { name: fileNameOf(this.s.deck.title, "pptx"), bytes, type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
      warnings,
    };
  }

  /** Slides as PNG pictures: one file when there is one picture, else a zip file of them. */
  async png(options: PngOptions = DEFAULT_PNG): Promise<Exported> {
    const images = new Map<string, Uint8Array>();
    await this.images(images);
    const { pictures, warnings } = await slidePictures(this.s.deck, options, { images, current: this.s.slide.id });
    const told = warnings.map((message) => ({ slide: null, element: null, message }));
    const [only] = pictures;
    if (pictures.length === 1 && only) {
      const title = options.scope === "current" ? `${this.s.deck.title} - slide ${only.number}` : this.s.deck.title;
      return { file: { name: fileNameOf(title, "png"), bytes: only.bytes, type: "image/png" }, warnings: told };
    }
    return { file: { name: fileNameOf(this.s.deck.title, "zip"), bytes: zipStored(pictures), type: "application/zip" }, warnings: told };
  }

  /** The pictures of the deck as the printout asks for them. */
  private imageUrl = (path: string): string | undefined => this.s.host.imageUrl(path);

  /** Opens the print dialog on the deck ("Save as PDF" is a destination there). */
  print(options: PrintOptions = DEFAULT_PRINT): Promise<void> {
    return printDeck(this.s.deck, this.imageUrl, options);
  }

  /** The printout in the page, without printing it (for checks); the returned function takes it out. */
  mountPrint(options: PrintOptions = DEFAULT_PRINT): Promise<() => void> {
    return mountPrintLayout(this.s.deck, this.imageUrl, options);
  }

  /** The deck as one web page that shows it offline. It is loaded when first wanted: it carries reveal.js. */
  async html(): Promise<Exported> {
    const { exportHtml } = await import("../../export/html.ts");
    return exportHtml(this.s.deck, this.s.host, { name: fileNameOf(this.s.deck.title, "html") });
  }

  /** The deck as a Markdown outline. */
  markdown(): Exported {
    const bytes = new TextEncoder().encode(this.s.core.outline());
    return { file: { name: fileNameOf(this.s.deck.title, "md"), bytes, type: "text/markdown" }, warnings: [] };
  }
}
