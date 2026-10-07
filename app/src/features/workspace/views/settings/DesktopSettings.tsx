// Settings → Desktop: closing the window keeps Kasten running in the tray,
// the quick capture shortcut, and notifications while in the background.

import { useEffect, useState } from "react";

import { inTauri } from "../../../../lib/api";
import { useWorkspace } from "../../store";
import { captureShortcut, desktopPrefs, setCaptureShortcut, setDesktopPrefs, shortcutFrom, type CaptureShortcut, type DesktopPrefs } from "./desktop";
import { Group, Row, Switch } from "./parts";

const BUTTON = "ui-btn";
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function DesktopSettings() {
  const [prefs, setPrefs] = useState<DesktopPrefs | null>(null);
  const [shortcut, setShortcut] = useState<CaptureShortcut | null>(null);
  const [recording, setRecording] = useState(false);
  const desktop = inTauri();
  const { toast } = useWorkspace.getState();

  useEffect(() => {
    if (!desktop) return;
    desktopPrefs().then(setPrefs, () => {});
    captureShortcut().then(setShortcut, () => {});
  }, [desktop]);

  if (!desktop) {
    return (
      <Group title="Desktop">
        <Row label="Quick capture and the tray" detail="Capture from any app with a shortcut, keep Kasten in the tray and hear when a backup fails: these come with the desktop app.">
          <span />
        </Row>
      </Group>
    );
  }

  const change = (next: { keepRunning?: boolean; notifications?: boolean }) =>
    setDesktopPrefs(next).then(setPrefs, (err: unknown) => toast(message(err)));
  const record = (value: string | null) => {
    setRecording(false);
    setCaptureShortcut(value).then(
      (now) => {
        setShortcut(now);
        toast(`Quick capture is now ${now.label}`);
      },
      (err: unknown) => toast(message(err)),
    );
  };

  return (
    <Group title="Desktop" detail="How Kasten behaves on this computer beside its window.">
      {prefs && !prefs.mac && (
        <Switch
          label="Keep running when the window closes"
          detail="Kasten stays in the tray, so quick capture and backups carry on. Quit from the tray icon."
          checked={prefs.keepRunning}
          onChange={(keepRunning) => void change({ keepRunning })}
        />
      )}
      {shortcut && (
        <Row
          label="Quick capture"
          detail={
            shortcut.wayland ? (
              <>
                This desktop doesn't let apps take a shortcut everywhere. Add one in your desktop's keyboard settings that runs <code className="font-mono text-12">{shortcut.command}</code>.
              </>
            ) : (
              "A small box over any app: type, Tab to choose where it goes, Enter to save."
            )
          }
        >
          {!shortcut.wayland && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className={`${BUTTON} min-w-[120px] font-mono`}
                aria-label={recording ? "Press the new shortcut" : `Change the quick capture shortcut, now ${shortcut.label}`}
                onClick={() => setRecording(true)}
                onBlur={() => setRecording(false)}
                onKeyDown={(event) => {
                  if (!recording) return;
                  event.preventDefault();
                  if (event.key === "Escape") return setRecording(false);
                  const next = shortcutFrom(event, Boolean(prefs?.mac));
                  if (next) record(next);
                }}
              >
                {recording ? "Press keys…" : shortcut.label}
              </button>
              <button type="button" className={BUTTON} onClick={() => record(null)}>
                Default
              </button>
            </div>
          )}
        </Row>
      )}
      {prefs && (
        <Switch
          label="Notifications"
          detail="Only while Kasten is in the background: when a backup starts failing, or a new version is ready. Never a note's words."
          checked={prefs.notifications}
          onChange={(notifications) => void change({ notifications })}
        />
      )}
    </Group>
  );
}
