import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    // .claude/worktrees holds concurrent agent checkouts; sweeping them
    // double-runs their suites against in-progress code.
    exclude: ["**/node_modules/**", "e2e/**", ".claude/**", "mcp-server/**"],
  },
});
