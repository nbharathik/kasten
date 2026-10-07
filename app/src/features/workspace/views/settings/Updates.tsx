// Settings → About → Updates: whether a newer Kasten is out and what is new
// in it, the daily check, off until turned on, and whether what it finds
// downloads by itself where the app installs in place (features/updates).

import { useState } from "react";

import { checkUpdate, type UpdateInfo } from "../../../../lib/api";
import { loadUpdates, updatePrefs } from "../../../updates/prefs";
import { outText, useUpdates } from "../../../updates/store";
import { Row, Switch } from "./parts";

const BUTTON = "ui-btn";

/** How long ago a check answered, in words. */
export function agoText(then: number, now = Date.now()): string {
  const minutes = Math.round((now - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

export function Updates({ check = checkUpdate }: { check?: () => Promise<UpdateInfo | null> }) {
  const { info, checking, error, checkedAt, skipped, canInstall } = useUpdates();
  const [ran, setRan] = useState(false);
  const [auto, setAuto] = useState(() => loadUpdates().auto);
  const [fetch, setFetch] = useState(() => loadUpdates().download);

  const run = async () => {
    setRan(true);
    await useUpdates.getState().check(check);
  };

  let said = "See whether a newer Kasten is out";
  if (checking) said = "Checking…";
  else if (error && ran) said = error;
  else if (info) said = info.newer ? `${outText(info)}${info.latest === skipped ? ", skipped" : ""}` : `You have the latest version (${info.current})`;
  else if (ran) said = "Updates are checked in the desktop app";
  if (!checking && info && checkedAt) said += ` · checked ${agoText(checkedAt)}`;

  return (
    <>
      <Row label="Updates" detail={said}>
        <div className="flex gap-2">
          {info?.newer && (
            <button type="button" className={BUTTON} onClick={() => useUpdates.getState().show()}>
              What’s new
            </button>
          )}
          <button type="button" className={BUTTON} disabled={checking} onClick={() => void run()}>
            Check now
          </button>
        </div>
      </Row>
      <Switch
        label="Check for new versions"
        detail="Once a day, and when Kasten starts, asks GitHub for the latest release. Off until you turn it on."
        checked={auto}
        onChange={(value) => {
          setAuto(value);
          updatePrefs({ auto: value, asked: true });
        }}
      />
      {canInstall && (
        <Switch
          label="Download new versions automatically"
          detail="A new version the check finds downloads in the background. It installs only when you choose Restart to update."
          checked={fetch}
          onChange={(value) => {
            setFetch(value);
            updatePrefs({ download: value });
          }}
        />
      )}
    </>
  );
}
