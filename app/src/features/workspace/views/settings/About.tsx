// Settings → About: the version, updates, and the open-source licences
// the app ships (scripts/notices.mjs writes them for builds that are
// released).

import { useEffect, useState } from "react";

import { appInfo } from "../../../../lib/api";
import { Group, Row } from "./parts";
import { Updates } from "./Updates";

/** Beside the app, wherever it is served from: the demo lives in a folder. */
const noticesUrl = () => `${import.meta.env.BASE_URL}third-party-notices.txt`;

export function About() {
  const [version, setVersion] = useState<string | null>(null);
  const [core, setCore] = useState<string | null>(null);
  const [notices, setNotices] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    appInfo().then(
      (info) => {
        setVersion(info?.appVersion ?? null);
        setCore(info?.coreVersion ?? null);
      },
      () => {},
    );
  }, []);

  const show = async () => {
    setOpen(true);
    if (notices !== null) return;
    try {
      const response = await fetch(noticesUrl());
      const text = response.ok ? await response.text() : "";
      setNotices(text.startsWith("Kasten is MIT-licensed") ? text : "");
    } catch {
      setNotices("");
    }
  };

  return (
    <Group title="About">
      <Row label="Kasten" detail={version ? `Version ${version}${core ? ` · core ${core}` : ""} · MIT licence` : "MIT licence"}>
        <span />
      </Row>
      <Updates />
      <Row label="Open-source licences" detail="The libraries Kasten is built on, and their licences">
        <button type="button" className="ui-btn" onClick={() => (open ? setOpen(false) : void show())}>
          {open ? "Hide" : "Show"}
        </button>
      </Row>
      {open && (
        <div className="py-3">
          {notices === null ? (
            <p className="text-13 text-muted">Loading…</p>
          ) : notices === "" ? (
            <p className="text-13 text-muted">This build has no licence list. Release builds carry one; `node scripts/notices.mjs` writes it.</p>
          ) : (
            <pre aria-label="Open-source licences" className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-panel p-3 font-mono text-12 leading-relaxed ring-1 ring-line">
              {notices}
            </pre>
          )}
        </div>
      )}
    </Group>
  );
}
