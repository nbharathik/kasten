// Lint through the engine: what a page is asked to measure, and how it hands the sizes back.

import type { Measures } from "./generated/index.ts";

/** What a host can tell lint besides the deck. */
export interface LintOptions {
  /** The sizes of laid-out text, taken for the slide's `lintProbes`. Left out, whether text fits its box is not checked, and the report says so. */
  measures?: Measures;
  /** The keys of the bibliography. Left out, citation keys are not checked, and the report says so. */
  refs?: readonly string[];
}

/** The two optional arguments the WebAssembly call takes, as JSON text. */
export function lintArguments(options: LintOptions): [string | undefined, string | undefined] {
  return [options.measures ? JSON.stringify(options.measures) : undefined, options.refs ? JSON.stringify(options.refs) : undefined];
}
