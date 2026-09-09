import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";

import {
  bootstrapSidecarProcess,
  isCurrentSidecarLauncher,
  readCurrentSidecarStamp,
  SidecarFactory,
} from "../../src/index.js";

const attemptPath = process.env.OD_TEST_LAUNCH_ATTEMPT;
if (attemptPath == null) throw new Error("OD_TEST_LAUNCH_ATTEMPT is required");
const stamp = readCurrentSidecarStamp();
const resources = {
  dataRoot: "/tmp/open-design-converging-launcher-data",
  ownerPid: null,
  port: 0,
  runtimeRoot: "/tmp/open-design-converging-launcher-runtime",
};

if (isCurrentSidecarLauncher()) {
  const attempt = Number(readFileSync(attemptPath, "utf8")) + 1;
  writeFileSync(attemptPath, String(attempt));
  if (attempt === 1) process.exit(Number(process.env.OD_TEST_FIRST_LAUNCH_EXIT ?? 0));
  if (await bootstrapSidecarProcess(stamp, resources, {
    args: ["--import", "tsx", fileURLToPath(import.meta.url)],
  })) process.exit(0);
}

const client = SidecarFactory.create({
  lifecycle: {
    async start() { return {}; },
    status() { return { ready: true }; },
    async stop() {},
  },
});
await client.start();
await client.waitUntilStopped();
