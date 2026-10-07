import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PageHeader } from "./PageHeader";

afterEach(cleanup);

const header = (icon: string) => render(<PageHeader meta={{ title: "Plans", icon, cover: "" }} onChange={() => {}} onEnterBody={() => {}} />);

describe("PageHeader", () => {
  it("draws one of the app's line icons, not its name", () => {
    header("icon:project");
    const button = screen.getByRole("button", { name: "Change icon" });
    expect(button.querySelector("svg")).toBeTruthy();
    expect(button.textContent).toBe("");
  });

  it("shows an emoji as it is", () => {
    header("🌱");
    expect(screen.getByRole("button", { name: "Change icon" }).textContent).toBe("🌱");
  });
});
