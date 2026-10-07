import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWorkspace } from "../workspace/store";
import { PreviewBackup } from "./PreviewBackup";

const Row = ({ label, detail, children }: { label: string; detail?: ReactNode; children: ReactNode }) => (
  <section aria-label={label}>
    <p>{detail}</p>
    {children}
  </section>
);

afterEach(cleanup);

describe("backup in the browser preview", () => {
  it("shows the ways the desktop app backs up", () => {
    render(<PreviewBackup Row={Row} />);
    expect(screen.getByRole("region", { name: "Back up to GitHub" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Backup remote" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Backup files" }).textContent).toContain("Not encrypted");
  });

  it("says each one needs the desktop app, and does nothing else", () => {
    const toast = vi.fn();
    useWorkspace.setState({ toast });
    render(<PreviewBackup Row={Row} />);
    for (const name of ["Sign in with GitHub", "Set up…", "Choose folder…"]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }
    expect(toast).toHaveBeenCalledTimes(3);
    expect(toast.mock.calls.every(([text]) => /desktop app/.test(text))).toBe(true);
  });
});
