import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const externalServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
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
