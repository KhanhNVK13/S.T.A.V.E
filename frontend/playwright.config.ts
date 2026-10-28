import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { loadE2eEnv } from "./e2e/support/env";

const env = loadE2eEnv();

const FRONTEND_PORT = 3100;
const BACKEND_PORT = 3101;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: "e2e-results/results.json" }]],
  outputDir: "e2e-results/artifacts",
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run start",
      cwd: path.resolve(__dirname, "../backend"),
      url: `http://localhost:${BACKEND_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { ...env.backend, PORT: String(BACKEND_PORT) },
    },
    {
      command: `npm run dev -- --port ${FRONTEND_PORT}`,
      cwd: __dirname,
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...env.frontend,
        NEXT_PUBLIC_API_URL: `http://localhost:${BACKEND_PORT}`,
      },
    },
  ],
});
