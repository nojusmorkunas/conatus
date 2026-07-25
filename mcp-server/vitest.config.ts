import { defineConfig } from "vitest/config";

// Without a config here, vitest walks up and loads the application's
// ../vitest.config.ts, which imports from the root node_modules. The MCP server
// installs from its own lockfile and is built and shipped as a separate image,
// so its checks must not depend on the application's dependencies being present.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
