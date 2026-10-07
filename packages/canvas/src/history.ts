// A small undo history for anything that can be kept as a state: push each state
// as it is reached, starting with the first, and step back and forward through them.

export class History<T> {
  /** The most undo steps kept; when there are more, the oldest states are forgotten. */
  readonly cap: number;
  private states: T[] = [];
  private at = -1;

  constructor(cap = 100) {
    this.cap = Number.isNaN(cap) ? 100 : Math.max(1, Math.floor(cap));
  }

  /** The state now; undefined before the first push. */
  get current(): T | undefined {
    return this.states[this.at];
  }

  get canUndo(): boolean {
    return this.at > 0;
  }

  get canRedo(): boolean {
    return this.at < this.states.length - 1;
  }

  /** Records a new state after the current one. Anything that could have been redone is lost. */
  push(state: T): void {
    this.states.length = this.at + 1;
    this.states.push(state);
    if (this.states.length > this.cap + 1) this.states.shift();
    this.at = this.states.length - 1;
  }

  /** Steps back and returns the state reached; undefined when there is nothing to go back to. */
  undo(): T | undefined {
    if (!this.canUndo) return undefined;
    this.at -= 1;
    return this.states[this.at];
  }

  /** Steps forward again and returns the state reached; undefined when there is nothing to go forward to. */
  redo(): T | undefined {
    if (!this.canRedo) return undefined;
    this.at += 1;
    return this.states[this.at];
  }

  /** Forgets every state, the current one too: the next push starts afresh. */
  clear(): void {
    this.states = [];
    this.at = -1;
  }
}
