import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:1435",
    viewport: { width: 1440, height: 1080 },
    launchOptions: {
      executablePath:
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:1435",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
