import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["line"]] : "list",
  expect: { toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.015 } },
  use: {
    baseURL: process.env.PMP_E2E_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "phone", use: { ...devices["iPhone 13"], browserName: "chromium" } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 }, browserName: "chromium" } },
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 }, browserName: "chromium" } },
  ],
  webServer: process.env.PMP_E2E_BASE_URL ? undefined : {
    command: "npm run build && mkdir -p .next/standalone/.next/static && cp -R .next/static/. .next/standalone/.next/static/ && PORT=3100 HOSTNAME=127.0.0.1 node .next/standalone/server.js",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
