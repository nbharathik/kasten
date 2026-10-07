import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}` }));

import { fileUrl, setFileRoot } from "./file-url";

afterEach(() => setFileRoot(null));

describe("fileUrl", () => {
  it("is null in the preview, where there is no folder", () => {
    expect(fileUrl("images/map.png")).toBeNull();
  });

  it("points into the vault's folder", () => {
    setFileRoot("/home/me/Kasten/");
    expect(fileUrl("images/map.png")).toBe(`asset://localhost/${encodeURIComponent("/home/me/Kasten/images/map.png")}`);
    setFileRoot("C:\\Users\\me\\Kasten");
    expect(fileUrl("images/map.png")).toBe(`asset://localhost/${encodeURIComponent("C:\\Users\\me\\Kasten\\images\\map.png")}`);
  });

  it("will not leave the vault", () => {
    setFileRoot("/home/me/Kasten");
    for (const bad of ["../secret.png", "/etc/passwd", "a//b.png", "a/./b.png", ""]) expect(fileUrl(bad)).toBeNull();
  });
});
