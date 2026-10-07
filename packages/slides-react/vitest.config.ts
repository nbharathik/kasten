import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    // Style sheets are left empty in tests, except the ones a test reads as text (`?raw`): the exported page carries them.
    css: { include: [/\?raw/] },
  },
});
