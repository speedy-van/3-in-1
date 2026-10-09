import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", fullyParallel: true, workers: 2, retries: 0,
  timeout: 45_000, expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:3000", browserName: "chromium", serviceWorkers: "block", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1", url: "http://127.0.0.1:3000/admin/screens", reuseExistingServer: !process.env.CI, timeout: 120_000,
    env: {
      DATABASE_URL: "postgresql://test:test@example.invalid/test",
      APP_ORIGIN: "http://127.0.0.1:3000",
      ADMIN_PASSWORD_HASH: `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`
    }
  }
});
