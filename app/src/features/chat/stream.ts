// Streamed text arrives a few letters at a time, far faster than a screen
// draws. Pieces wait here and reach the store together, once per frame, so
// an answer costs one render per frame however fast it comes.

type Cancel = () => void;

function nextFrame(run: () => void): Cancel {
  if (typeof requestAnimationFrame === "function") {
    const id = requestAnimationFrame(run);
    return () => cancelAnimationFrame(id);
  }
  const id = setTimeout(run, 16);
  return () => clearTimeout(id);
}

export class FrameQueue<T> {
  private items: T[] = [];
  private cancel: Cancel | null = null;

  constructor(private readonly apply: (items: T[]) => void) {}

  push(item: T): void {
    this.items.push(item);
    this.cancel ??= nextFrame(() => {
      this.cancel = null;
      this.flush();
    });
  }

  /** Hands over what waits now; other events call this first, so the order holds. */
  flush(): void {
    this.cancel?.();
    this.cancel = null;
    if (this.items.length === 0) return;
    const items = this.items;
    this.items = [];
    this.apply(items);
  }
}
