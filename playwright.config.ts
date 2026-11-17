import "dotenv/config";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    channel: "chrome",
    headless: true,
    trace: "off",
  },
  workers: 1,
});
