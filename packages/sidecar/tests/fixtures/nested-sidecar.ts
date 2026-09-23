import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { spawnSidecar, type SidecarStamp } from "../../src/index.js";

const serializedStamp = process.env.OD_TEST_NESTED_SIDECAR_STAMP;
const readyPath = process.env.OD_TEST_NESTED_SIDECAR_READY;
if (serializedStamp == null || readyPath == null) {
  throw new Error("nested sidecar fixture configuration is required");
}

const childStamp = JSON.parse(serializedStamp) as SidecarStamp;
const child = await spawnSidecar({
  args: [fileURLToPath(new URL("./stamped-child.ts", import.meta.url))],
  command: process.execPath,
  // Windows isolation is a sidecar invariant even when a caller attempts to
  // opt out. On POSIX this remains a normal attached child.
  detached: false,
  resources: {
    dataRoot: "/tmp/open-design-nested-child",
    ownerPid: null,
    port: 0,
    runtimeRoot: "/tmp/open-design-nested-child-runtime",
  },
  stamp: childStamp,
});
await writeFile(readyPath, JSON.stringify({ pid: child.process.pid }));

setInterval(() => undefined, 60_000);
