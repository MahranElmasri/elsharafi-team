import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Local Supabase keys for the test helpers (the app reads the same file itself).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL: "http://localhost:3000",
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    // Playwright's bundled Chromium does not run on macOS 13; use the installed Chrome.
    channel: "chrome",
  },
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true },
});
