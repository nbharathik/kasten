/** What went wrong in slides-core, with the details it reported. */
export class SlidesError extends Error {
  /** `noSuchSlide`, `badInput`, `refused`, `unknownOp`, `malformed`, `tooNew` or `invalid`. */
  readonly kind: string;
  readonly details: Record<string, unknown>;

  constructor(kind: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "SlidesError";
    this.kind = kind;
    this.details = details;
  }

  /** From what the WebAssembly build throws: JSON text, or something else. */
  static from(thrown: unknown): SlidesError {
    if (thrown instanceof SlidesError) return thrown;
    if (typeof thrown === "string") {
      try {
        const { kind, message, ...details } = JSON.parse(thrown) as { kind?: string; message?: string } & Record<string, unknown>;
        return new SlidesError(kind ?? "unknown", message ?? thrown, details);
      } catch {
        return new SlidesError("unknown", thrown);
      }
    }
    return new SlidesError("unknown", thrown instanceof Error ? thrown.message : String(thrown));
  }
}
