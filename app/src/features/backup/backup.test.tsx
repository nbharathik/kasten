import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

let signedIn: ((end: import("./api").SignInEnd) => void) | null = null;
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  canBackUp: () => true,
  githubAccount: vi.fn(async () => ({ login: null, signedIn: false, canSignIn: true, suggested: "notes" })),
  githubSignInStart: vi.fn(async () => ({ userCode: "ABCD-1234", verificationUri: "https://github.com/login/device", expiresIn: 900 })),
  githubSignInCancel: vi.fn(async () => {}),
  onSignIn: (then: (end: import("./api").SignInEnd) => void) => {
    signedIn = then;
    return () => (signedIn = null);
  },
}));

import * as api from "./api";
import { GitHubRow, signInProblem } from "./GitHubRow";
import { describeLatest } from "./latest";
import { useWorkspace } from "../workspace/store";

const Row = ({ label, children }: { label: string; children: ReactNode }) => <section aria-label={label}>{children}</section>;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Get latest in words", () => {
  const latest = (outcome: api.Latest["outcome"], changed: string[] = [], copies: string[] = []): api.Latest => ({ outcome, head: "abc", changed, copies, setAside: [] });
  it("says what came in and what was kept beside", () => {
    expect(describeLatest(latest("upToDate"))).toBe("Already up to date");
    expect(describeLatest(latest("fastForward", ["a.md", "b.md"]))).toBe("Got the latest: 2 files changed");
    expect(describeLatest(latest("merged"))).toBe("Got the latest, joined with your changes");
    expect(describeLatest(latest("merged", ["a.md"], ["a (from other computer).md"]))).toContain("1 page changed on both computers");
  });
});

describe("signing in to GitHub", () => {
  it("says why a sign-in ended without signing in", () => {
    expect(signInProblem({ state: "signed", login: "ada" })).toBeNull();
    expect(signInProblem({ state: "expired" })).toContain("ran out");
    expect(signInProblem({ state: "failed", message: "No network" })).toBe("No network");
  });

  it("shows the code to type, and closes once GitHub says it was typed", async () => {
    const toast = vi.fn();
    useWorkspace.setState({ toast });
    render(<GitHubRow Row={Row} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign in with GitHub" }));
    expect(await screen.findByRole("dialog", { name: "Sign in with GitHub" })).toBeTruthy();
    expect(screen.getByLabelText("Sign-in code").textContent).toBe("ABCD-1234");
    vi.mocked(api.githubAccount).mockResolvedValueOnce({ login: "ada", signedIn: true, canSignIn: true, suggested: "notes" });
    await act(async () => signedIn?.({ state: "signed", login: "ada" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(toast).toHaveBeenCalledWith("Signed in to GitHub as ada");
    expect(await screen.findByRole("textbox", { name: "Repository name" })).toHaveProperty("value", "notes");
  });

  it("stops waiting when cancelled", async () => {
    render(<GitHubRow Row={Row} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign in with GitHub" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(api.githubSignInCancel).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
