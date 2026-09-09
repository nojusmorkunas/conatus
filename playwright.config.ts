import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const externalServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // A genuine regression fails every attempt, so a retry that passes marks the
  // test flaky in the report rather than failing the whole run on contention.
  retries: process.env.CI ? 2 : 0,
  // A server-component refresh that lands in milliseconds locally can take
  // seconds on a two-core runner with workers competing for it. Give assertions
  // more room there, but keep the tighter default locally so a genuine
  // regression in responsiveness still shows up as a failure.
  expect: { timeout: process.env.CI ? 20_000 : 5_000 },
  use: {
    baseURL,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: externalServer
    ? undefined
    : {
        command: "npm run dev",
        // Browser feature tests create isolated disposable users. Production
        // and normal development default to invite-only registration.
        env: { REGISTRATION_MODE: "open" },
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
