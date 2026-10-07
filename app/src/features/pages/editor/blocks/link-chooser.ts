// Asks which page a link means when several share its title and nothing
// picks one: the pages, each with where it lives. Choosing one
// opens it; "Always link to…" makes the link name it.

import type { PageLink } from "../links";
import { Popover, type MenuItem } from "../ui/popover";

export function chooseLink(anchor: HTMLElement, choices: readonly PageLink[], open: (page: PageLink) => void, link: ((page: PageLink) => void) | null): Popover {
  const item = (page: PageLink, i: number, act: (page: PageLink) => void): MenuItem => ({
    key: `${page.path ?? page.title}:${i}`,
    label: page.title,
    hint: page.where,
    icon: page.icon ?? "icon:page",
    onPick: () => act(page),
  });
  const always: MenuItem[] = link
    ? [{ key: "always", label: "Always link to…", icon: "icon:link", submenu: () => [{ items: choices.map((page, i) => item(page, i, link)) }] }]
    : [];
  return new Popover([{ title: `${choices.length} pages have this title`, items: choices.map((page, i) => item(page, i, open)) }, { items: always }], {
    anchor: () => anchor.getBoundingClientRect(),
    ownKeys: true,
    label: "Which page?",
  });
}
