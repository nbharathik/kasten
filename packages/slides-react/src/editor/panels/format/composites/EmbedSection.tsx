import { useEffect, useState } from "react";

import { pageAddress } from "../../../dialogs/source-address.ts";
import { Row, TextField } from "../controls.tsx";
import type { SectionProps } from "../types.ts";
import { agree, only, shared } from "../values.ts";
import { patchEach } from "../write.ts";
import { CompositeSection } from "./CompositeSection.tsx";
import { PosterField } from "./PosterField.tsx";

/** A web page: its address, the still that shows where it cannot be live, and its title. */
export function EmbedSection({ session, ui, elements }: SectionProps) {
  const pages = only(elements, "embed");
  const url = shared(pages.map((p) => p.url), "");
  const title = shared(pages.map((p) => p.title ?? ""), "");
  const poster = agree<string | null>(pages.map((p) => p.poster ?? null), null);
  const ids = pages.map((p) => p.id);
  const [bad, setBad] = useState(false);
  const key = ids.join(",");
  useEffect(() => setBad(false), [key]);

  return (
    <CompositeSection id="embed" title="Embedded page" ui={ui} ids={ids}>
      <Row label="Address" wide>
        <div data-primary="">
          <TextField
            label="Web address"
            value={url.value}
            mixed={url.mixed}
            placeholder="https://example.com"
            invalid={bad}
            onCommit={(typed) => {
              const address = pageAddress(typed);
              setBad(address === null);
              if (address !== null) patchEach(session, pages, () => ({ url: address }));
            }}
          />
        </div>
      </Row>
      {bad ? (
        <p className="ks-sp-hint is-error" role="alert">
          Use a web address such as https://example.com.
        </p>
      ) : null}
      <PosterField session={session} value={poster} onPick={(path) => patchEach(session, pages, () => ({ poster: path }))} />
      <Row label="Title" wide>
        <TextField label="Page title" value={title.value} mixed={title.mixed} placeholder="What the page is called" onCommit={(text) => patchEach(session, pages, () => ({ title: text.trim() === "" ? null : text }))} />
      </Row>
      <p className="ks-sp-hint">The page is live when you present. Elsewhere the poster shows, with a link to the page; without one, a panel with its title and address.</p>
    </CompositeSection>
  );
}
