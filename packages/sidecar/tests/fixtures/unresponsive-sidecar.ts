import { createServer } from "node:net";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const endpoint = process.env.OD_TEST_STALE_ENDPOINT;
if (endpoint == null) throw new Error("OD_TEST_STALE_ENDPOINT is required");
mkdirSync(dirname(endpoint), { recursive: true });
const server = createServer(() => {
  // Deliberately accept the connection without speaking the sidecar protocol.
});
server.listen(endpoint);

process.on("SIGTERM", () => {
  // Exercise the force-stop and stale-endpoint recovery path.
});
