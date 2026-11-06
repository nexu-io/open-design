import { fileURLToPath } from "node:url";

import { handoffCurrentSidecarGeneration } from "../../src/index.js";

await handoffCurrentSidecarGeneration({
  args: ["--import", "tsx", fileURLToPath(new URL("./handoff-successor.ts", import.meta.url))],
  command: process.execPath,
  env: process.env,
});
process.exit(0);
