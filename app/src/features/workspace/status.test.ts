import { describe, expect, it } from "vitest";

import type { BackupState, VaultStatus } from "../../lib/vault/types";
import { describeBackup } from "./status";

const NOW = Date.UTC(2026, 8, 25, 12);

function status(state: BackupState, extra: Partial<VaultStatus["backup"]> = {}): VaultStatus {
  return {
    name: "Notes",
    root: "/notes",
    history: true,
    remote: "git@example.com:notes.git",
    backup: { state, lastPush: null, failures: 0, lastError: null, ...extra },
    pending: 0,
  };
}

describe("the backup as the status bar says it", () => {
  it("names a remote that waits to be confirmed on this computer", () => {
    const said = describeBackup(status("unconfirmed"), NOW);
    expect(said.tone).toBe("stale");
    expect(said.label).toBe("Backup waiting for you");
    expect(said.detail).toContain("git@example.com:notes.git");
  });

  it("takes the freshest copy off this computer, a remote or a backup file", () => {
    const file = (state: BackupState, lastWritten: number | null) => ({ state, lastWritten, path: "/Dropbox/Kasten backup - Notes/kasten-notes-desk.bundle", current: true, failures: 0, lastError: null });
    const fileOnly = { ...status("off"), remote: null, backupFile: file("ok", NOW - 60_000) };
    expect(describeBackup(fileOnly, NOW)).toMatchObject({ tone: "ok", label: "Backed up to a file 1 minute ago" });
    const failingRemote = { ...status("failing", { lastError: "No route" }), backupFile: file("ok", NOW - 60_000) };
    expect(describeBackup(failingRemote, NOW).tone).toBe("ok");
    const failingFile = { ...status("ok", { lastPush: NOW - 60_000 }), backupFile: file("failing", null) };
    expect(describeBackup(failingFile, NOW).tone).toBe("ok");
    expect(describeBackup({ ...status("off"), backupFile: file("failing", null) }, NOW).label).toBe("Backup file failing");
  });

  it("says when the backup has changes this computer lacks", () => {
    const said = describeBackup(status("ok", { lastPush: NOW - 60_000, behind: true }), NOW);
    expect(said).toMatchObject({ tone: "stale", label: "Newer changes in the backup" });
    expect(said.detail).toContain("Get latest");
  });

  it("says each other state in its own words", () => {
    expect(describeBackup(status("off"), NOW).label).toBe("Backup off");
    expect(describeBackup(status("ok", { lastPush: NOW - 60_000 }), NOW).tone).toBe("ok");
    expect(describeBackup(status("failing", { lastError: "No route" }), NOW).detail).toBe("No route");
    expect(describeBackup({ ...status("ok"), history: false }, NOW).label).toBe("No history");
  });
});
