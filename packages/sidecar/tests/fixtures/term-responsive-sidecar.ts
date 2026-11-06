import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createServer } from "node:net";

const endpoint = process.env.OD_TEST_STALE_ENDPOINT;
const marker = process.env.OD_TEST_TERM_MARKER;
if (endpoint == null || marker == null) throw new Error("term-responsive fixture configuration is required");

mkdirSync(dirname(endpoint), { recursive: true });
const server = createServer(() => {
  // Accept connections without speaking sidecar IPC so graceful stop is not accepted.
});
server.listen(endpoint);

process.on("SIGTERM", () => {
  writeFileSync(marker, "SIGTERM");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
});
