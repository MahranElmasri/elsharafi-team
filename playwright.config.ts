import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Local Supabase keys for the test helpers (the app reads the same file itself).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  testDir: "e2e",
  // The dev server compiles each page on first use; 5 s is too tight under parallel load.
  expect: { timeout: 15_000 },
  // One dev server serves every browser; more than two at once makes logins time out.
  workers: 2,
  use: {
    baseURL: "http://localhost:3000",
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    // Playwright's bundled Chromium does not run on macOS 13; use the installed Chrome.
    channel: "chrome",
  },
  projects: [
    { name: "app", testIgnore: /settings\.spec\.ts/ },
    // Practice-wide switches would disturb tests running at the same time, so this goes last.
    { name: "settings", testMatch: /settings\.spec\.ts/, dependencies: ["app"] },
  ],
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true },
});
