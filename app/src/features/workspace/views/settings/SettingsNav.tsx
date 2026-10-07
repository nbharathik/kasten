// The list of Settings groups beside the page: a click scrolls to the group,
// and the group in view is marked as the page scrolls.

import { useEffect, useState } from "react";

import { takeSettingsJump } from "./jump";
import { SECTIONS, sectionId } from "./sections";

export function SettingsNav() {
  const [current, setCurrent] = useState<string>(SECTIONS[0]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target.id, entry.isIntersecting);
        const first = SECTIONS.find((title) => seen.get(sectionId(title)));
        if (first) setCurrent(first);
      },
      { rootMargin: "0px 0px -60% 0px" },
    );
    for (const title of SECTIONS) {
      const element = document.getElementById(sectionId(title));
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  const go = (title: string) => {
    setCurrent(title);
    document.getElementById(sectionId(title))?.scrollIntoView?.({ block: "start" });
  };

  // Opened at a group, as the palette does.
  useEffect(() => {
    const wanted = takeSettingsJump();
    if (wanted) go(wanted);
  }, []);

  return (
    <nav aria-label="Settings sections" className="kasten-settings-nav">
      <ul>
        {SECTIONS.map((title) => (
          <li key={title}>
            <a
              href={`#${sectionId(title)}`}
              aria-current={current === title ? "true" : undefined}
              onClick={(event) => {
                event.preventDefault();
                go(title);
              }}
            >
              {title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
