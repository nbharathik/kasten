// The backup remote is saved into the vault's config as it is now, so a
// setting changed elsewhere since the settings were drawn is kept.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import type { VaultStatus } from "../../../lib/vault/types";
import { afterEach, describe, expect, it } from "vitest";

import { MemoryVault } from "../preview/memory-vault";
import { useWorkspace } from "../store";
import { VaultSafety } from "./VaultSafety";

/** The preview vault, standing in for the desktop app's: Settings shows
 * the backup remote only for a real vault. */
class DesktopVault extends MemoryVault {
  override readonly kind = "vault" as unknown as "preview";
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <section aria-label={label}>{children}</section>
);

afterEach(cleanup);

describe("the backup remote", () => {
  it("changes only the remote, keeping what changed elsewhere meanwhile", async () => {
    const vault = new DesktopVault({});
    await useWorkspace.getState().connect({ client: vault });
    render(<VaultSafety Row={Row} />);
    const field = await screen.findByRole("textbox", { name: "Backup remote" });
    await act(async () => {});
    // Another part of Settings changes the config after this was drawn.
    const config = await vault.getConfig();
    await vault.setConfig({ ...config, name: "Renamed meanwhile" });
    fireEvent.change(field, { target: { value: "git@example.com:me/notes.git" } });
    await act(async () => fireEvent.submit(field.closest("form")!));
    const saved = await vault.getConfig();
    expect(saved.git.remote).toBe("git@example.com:me/notes.git");
    expect(saved.name).toBe("Renamed meanwhile");
  });
});

describe("a vault in a synced folder", () => {
  it("says so, and how to move it", async () => {
    class InDropbox extends DesktopVault {
      override async status(): Promise<VaultStatus> {
        return { ...(await super.status()), synced: "Dropbox" };
      }
    }
    await useWorkspace.getState().connect({ client: new InDropbox({}) });
    render(<VaultSafety Row={Row} />);
    const row = await screen.findByRole("region", { name: "Vault folder" });
    expect(row.textContent).toContain("In Dropbox");
    await useWorkspace.getState().connect({ client: new DesktopVault({}) });
  });
});
