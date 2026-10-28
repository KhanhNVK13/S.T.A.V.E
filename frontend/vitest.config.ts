import path from "node:path";
import { defineConfig } from "vitest/config";

// Sheets FE-LIB-14/15/16 run in UTC+7: force the timezone before test workers start.
process.env.TZ = "Asia/Ho_Chi_Minh";

export default defineConfig({
  resolve: {
    // Match frontend/tsconfig.json: "@/*" -> "./*"
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "jsdom",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
