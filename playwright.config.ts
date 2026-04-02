import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "t1000-repro.spec.ts",
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
  timeout: 15_000,
  retries: 0,
  reporter: "line",
});
