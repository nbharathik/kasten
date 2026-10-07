import { describe, expect, it, vi } from "vitest";

import { EMBED_SANDBOX, answers, embedSandbox, embedUrl } from "./live-url.ts";

describe("which addresses go in a frame", () => {
  it("are web addresses, as the browser would write them", () => {
    expect(embedUrl("https://example.com/a b")).toBe("https://example.com/a%20b");
    expect(embedUrl("  http://localhost:3000  ")).toBe("http://localhost:3000/");
    expect(embedUrl("http://127.0.0.1:8080/?x=1#y")).toBe("http://127.0.0.1:8080/?x=1#y");
  });

  it("are never a script, a file, a page made of data, a picture in the page, or a relative address", () => {
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "file:///etc/passwd", "data:text/html,<script>1</script>", "blob:http://x/1", "about:blank", "ftp://x/y", "//example.com", "example.com", "/local/page", "", "   ", null, undefined]) {
      expect(embedUrl(bad), String(bad)).toBeNull();
    }
  });

  it("run with scripts and their own storage, and nothing else", () => {
    expect(EMBED_SANDBOX.split(" ").sort()).toEqual(["allow-same-origin", "allow-scripts"]);
    expect(embedSandbox("https://example.com/a", "http://localhost:3000")).toBe(EMBED_SANDBOX);
  });

  it("have no storage of their own when they are from the origin of the page around them: they could take the sandbox off", () => {
    expect(embedSandbox("http://localhost:3000/demo", "http://localhost:3000")).toBe("allow-scripts");
    expect(embedSandbox("http://localhost:3001/demo", "http://localhost:3000")).toBe(EMBED_SANDBOX);
    expect(embedSandbox("not an address", "http://localhost:3000")).toBe("allow-scripts");
    expect(embedSandbox("https://example.com/", "null")).toBe(EMBED_SANDBOX);
  });
});

describe("whether an address answers", () => {
  it("does when the question is answered, whatever the answer", async () => {
    expect(await answers("http://x/", vi.fn().mockResolvedValue({ type: "opaque" }) as unknown as typeof fetch)).toBe(true);
  });

  it("does not when the connection is refused", async () => {
    expect(await answers("http://x/", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch)).toBe(false);
  });

  it("is given the benefit of the doubt when the policy forbids the question", async () => {
    const forbidden = vi.fn().mockImplementation(async () => {
      document.dispatchEvent(new Event("securitypolicyviolation"));
      throw new TypeError("blocked");
    });
    expect(await answers("http://x/", forbidden as unknown as typeof fetch)).toBe(true);
  });

  it("asks without cookies, referrer or a cache", async () => {
    const ask = vi.fn().mockResolvedValue({});
    await answers("http://x/", ask as unknown as typeof fetch);
    expect(ask).toHaveBeenCalledWith("http://x/", { mode: "no-cors", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
  });

  it("does when there is no way to ask", async () => {
    expect(await answers("http://x/", null)).toBe(true);
  });
});
