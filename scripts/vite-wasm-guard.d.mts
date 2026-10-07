/** A Vite plugin that rebuilds packages/slides-wasm/pkg when it is out of date (see the .mjs beside this). */
export function wasmGuard(): { name: string; configResolved(): void };
