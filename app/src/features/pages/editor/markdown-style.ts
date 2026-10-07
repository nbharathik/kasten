// How the editor spells the blocks it writes. Untouched blocks keep their own
// bytes; new and edited ones follow Notion's Markdown export: `- [ ] text`
// to-dos, `-` bullets and `---` dividers, instead of remark's `*` defaults.

import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";

/** Call from `editor.config`. */
export function configureMarkdownStyle(ctx: Ctx): void {
  ctx.update(remarkStringifyOptionsCtx, (prev) => ({ ...prev, bullet: "-" as const, bulletOther: "*" as const, rule: "-" as const }));
}
