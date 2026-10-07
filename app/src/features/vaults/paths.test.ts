import { describe, expect, it } from "vitest";

import { baseName, crumbs } from "./FolderPicker";
import { folderName, inside, parentOf } from "./paths";

describe("vault chooser paths", () => {
  it("makes a folder name from a vault's name", () => {
    expect(folderName("  My notes ")).toBe("My notes");
    expect(folderName("Work: 2026/Q4")).toBe("Work- 2026-Q4");
    expect(folderName("..hidden")).toBe("hidden");
    expect(folderName("  ")).toBe("Kasten");
  });

  it("joins and splits paths in the separator they use", () => {
    expect(inside("~/Documents", "My notes")).toBe("~/Documents/My notes");
    expect(inside("/", "Kasten")).toBe("/Kasten");
    expect(inside("C:\\Users\\a", "Kasten")).toBe("C:\\Users\\a\\Kasten");
    expect(parentOf("~/Documents/Kasten")).toBe("~/Documents");
    expect(parentOf("/home/a/")).toBe("/home");
    expect(parentOf("/notes")).toBe("/");
    expect(parentOf("C:\\Users\\a\\Kasten")).toBe("C:\\Users\\a");
    expect(parentOf("C:\\Kasten")).toBe("C:\\");
  });

  it("breaks a path into steps to click back to", () => {
    expect(crumbs("/home/a/Notes")).toEqual([
      { label: "/", path: "/" },
      { label: "home", path: "/home" },
      { label: "a", path: "/home/a" },
      { label: "Notes", path: "/home/a/Notes" },
    ]);
    expect(crumbs("C:\\Users\\a")).toEqual([
      { label: "C:", path: "C:\\" },
      { label: "Users", path: "C:\\Users" },
      { label: "a", path: "C:\\Users\\a" },
    ]);
    expect(baseName("/home/a/Notes/")).toBe("Notes");
  });
});
