// Tiny DOM helpers for the editor's node views and menus.

import { glyphElement } from "../../../../ui/icon-dom";

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  props: Partial<HTMLElementTagNameMap[K]> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  Object.assign(node, props);
  return node;
}

/** The part of a DOMRect that menus position against. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** `host` with an icon string drawn in it (ui/glyph.ts), then `text` if any. */
export function withGlyph<T extends HTMLElement>(host: T, icon: string, size: number, text?: string): T {
  host.append(glyphElement(icon, size));
  if (text) host.append(text);
  return host;
}
