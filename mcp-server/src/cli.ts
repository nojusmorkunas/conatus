#!/usr/bin/env node

import { runStdio } from "./stdio.js";
import { runSetup } from "./setup.js";

const command = process.argv[2];

if (command === "setup" || command === "install") {
  runSetup().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
} else if (command === "--help" || command === "-h") {
  console.log("Usage: conatus-mcp [setup|install]\n\nRun setup to configure a supported MCP client interactively.");
} else if (command) {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
} else {
  runStdio().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
