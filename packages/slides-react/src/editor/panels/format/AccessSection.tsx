import { useEffect, useState } from "react";

import { linkFromInput } from "../../../text/links.ts";
import { Row, TextField, TriToggle } from "./controls.tsx";
import { PanelSection } from "./PanelSection.tsx";
import type { SectionProps } from "./types.ts";
import { agree, shared } from "./values.ts";

/** What a screen reader is told about the elements. An empty box takes the setting off. */
export function AltText({ session, elements }: Pick<SectionProps, "session" | "elements">) {
  const alt = shared(elements.map((e) => e.alt ?? ""), "");
  return (
    <div className="ks-sp-field">
      <span className="ks-sp-label">Alt text</span>
      <TextField
        label="Alt text"
        value={alt.value}
        mixed={alt.mixed}
        multiline
        placeholder="Describe it in a few words"
        onCommit={(value) =>
          session.elements.patch(
            { alt: value.trim() === "" ? null : value },
            elements.map((e) => e.id),
          )
        }
      />
    </div>
  );
}

/** The layer's name, where the element links to, whether it is locked, and alt text for what is not a picture (a picture has its own beside its other settings). */
export function AccessSection({ session, elements }: SectionProps) {
  const ids = elements.map((e) => e.id);
  const name = shared(elements.map((e) => e.name ?? ""), "");
  const link = shared(elements.map((e) => e.link ?? ""), "");
  const locked = agree(elements.map((e) => Boolean(e.locked)), false);
  const [bad, setBad] = useState(false);
  const key = ids.join(",");
  useEffect(() => setBad(false), [key]);

  // An empty box takes the setting off.
  const setName = (value: string) => session.elements.patch({ name: value.trim() === "" ? null : value }, ids);
  const setLink = (value: string) => {
    if (value.trim() === "") {
      setBad(false);
      session.elements.patch({ link: null }, ids);
      return;
    }
    // Only ordinary addresses and links to slides are kept.
    const address = linkFromInput(value);
    setBad(address === null);
    if (address !== null) session.elements.patch({ link: address }, ids);
  };

  return (
    <PanelSection id="access" title="Accessibility and layers">
      {elements.every((e) => e.type === "image") ? null : <AltText session={session} elements={elements} />}
      <Row label="Layer name" wide>
        <TextField label="Layer name" value={name.value} mixed={name.mixed} placeholder="Name" onCommit={setName} />
      </Row>
      <Row label="Link" wide>
        <TextField label="Link" value={link.value} mixed={link.mixed} placeholder="https://" invalid={bad} onCommit={setLink} />
      </Row>
      {bad ? (
        <p className="ks-sp-hint is-error" role="alert">
          Use a web address such as https://example.com, or a mail or phone link.
        </p>
      ) : null}
      <TriToggle label="Locked" on={locked} onChange={(next) => session.elements.lock(next, ids)} />
    </PanelSection>
  );
}
