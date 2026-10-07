/** The extension lists used by our remark plugins. The processor owns their contents. */
export interface RemarkProcessor {
  data(): {
    micromarkExtensions?: unknown[];
    fromMarkdownExtensions?: unknown[];
    toMarkdownExtensions?: unknown[];
  };
}
