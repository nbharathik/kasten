// Writing the deck to the host: after a pause in the changes, one save at a
// time, never over a file that changed underneath (that is a conflict for
// the person to settle).

import type { SlidesHost } from "../host.ts";
import type { SaveState } from "./types.ts";

interface Deps {
  host: Pick<SlidesHost, "save">;
  /** The deck's text as it is now. */
  text(): string;
  report(state: SaveState): void;
  delay: number;
}

export class SaveQueue {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;
  private again: { overwrite: boolean } | null = null;
  /** The text last written to the host, or read from it. */
  private written: string | null = null;
  private conflicted = false;

  constructor(private readonly deps: Deps) {}

  /** Whether `text` is what this queue itself last wrote (the echo of our own save). */
  isOwn(text: string): boolean {
    return text === this.written;
  }

  /** The host holds `text` and nothing is waiting: after a load. */
  markClean(text: string): void {
    clearTimeout(this.timer);
    this.written = text;
    this.conflicted = false;
  }

  /** A change was made: save once the changes pause. */
  schedule(): void {
    clearTimeout(this.timer);
    if (this.conflicted) return;
    this.timer = setTimeout(() => void this.flush(), this.deps.delay);
  }

  async flush(options: { overwrite?: boolean } = {}): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) {
      this.again = { overwrite: Boolean(options.overwrite || this.again?.overwrite) };
      return this.running;
    }
    if (this.conflicted && !options.overwrite) return;
    const text = this.deps.text();
    if (!options.overwrite && text === this.written) {
      this.deps.report({ status: "saved" });
      return;
    }
    this.deps.report({ status: "saving" });
    this.running = this.write(text, options.overwrite ?? false);
    try {
      await this.running;
    } finally {
      this.running = null;
    }
    const next = this.again;
    this.again = null;
    if (next && !this.conflicted && this.deps.text() !== this.written) await this.flush(next);
  }

  private async write(text: string, overwrite: boolean): Promise<void> {
    try {
      const outcome = await this.deps.host.save(text, overwrite ? { overwrite } : undefined);
      if (outcome.status === "conflict") {
        this.conflicted = true;
        this.deps.report({ status: "conflict", theirs: outcome.theirs, copy: outcome.copy });
        return;
      }
      this.conflicted = false;
      this.written = text;
      // Changes made while it was being written are still to be saved.
      this.deps.report(this.deps.text() === text ? { status: "saved" } : { status: "unsaved" });
    } catch (thrown) {
      this.deps.report({ status: "error", message: thrown instanceof Error ? thrown.message : String(thrown) });
    }
  }
}
