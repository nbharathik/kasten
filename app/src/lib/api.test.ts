import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  isTauri: () => (globalThis as { isTauri?: boolean }).isTauri === true,
}));

const { appInfo, reportStartup } = await import("./api");

afterEach(() => {
  delete (globalThis as { isTauri?: boolean }).isTauri;
  invoke.mockReset();
});

describe("appInfo", () => {
  it("returns null in a plain browser without calling Tauri", async () => {
    expect(await appInfo()).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("calls the app_info command inside Tauri", async () => {
    (globalThis as { isTauri?: boolean }).isTauri = true;
    const info = { coreVersion: "0.1.0", appVersion: "0.1.0", vault: null };
    invoke.mockResolvedValue(info);
    expect(await appInfo()).toEqual(info);
    expect(invoke).toHaveBeenCalledWith("app_info");
  });
});

describe("reportStartup", () => {
  it("sends the page's marks once, and nothing in a plain browser", () => {
    reportStartup();
    expect(invoke).not.toHaveBeenCalled();
    (globalThis as { isTauri?: boolean }).isTauri = true;
    invoke.mockResolvedValue(undefined);
    performance.mark("kasten:connected");
    performance.mark("other");
    reportStartup();
    reportStartup();
    expect(invoke).toHaveBeenCalledTimes(1);
    const [command, args] = invoke.mock.calls[0]! as [string, { now: number; marks: [string, number][] }];
    expect(command).toBe("startup_marks");
    expect(args.marks.map(([name]) => name)).toEqual(["page:connected"]);
    expect(args.now).toBeGreaterThanOrEqual(args.marks[0]![1]);
  });
});
