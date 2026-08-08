import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  STANDALONE_HANDOFF_SCHEMA_VERSION,
  STANDALONE_PROTOCOL_VERSION,
  createStandaloneHandoffEnvelope,
  type StandaloneHandoffRequest,
} from "@open-design/standalone-proto";
import { startSidecarStandalone } from "../../../apps/standalone/src/sidecars.js";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("Standalone normalized product sidecars", () => {
  it("closes Web + daemon through real directory adapters and packages/sidecar", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-standalone-sidecars-"));
    cleanups.push(async () => await rm(root, { force: true, recursive: true }));
    const handoff = createStandaloneHandoffEnvelope({
      channel: "beta",
      digest: `sha256:${"c".repeat(64)}`,
      generation: 9,
      namespace: "release-beta",
      platform: "darwin-arm64",
      protocolVersion: STANDALONE_PROTOCOL_VERSION,
      version: "0.18.0-beta.4",
    });
    const request: StandaloneHandoffRequest = {
      capabilities: {
        async invoke(value) {
          return {
            handoff: value.handoff,
            outcome: "unsupported",
            requestId: value.requestId,
            schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
          };
        },
      },
      handoff,
      paths: {
        cacheRoot: join(root, "cache"),
        dataRoot: join(root, "data"),
        installationRoot: join(root, "install"),
        logsRoot: join(root, "logs"),
        resourceRoot: join(root, "resources"),
        runtimeRoot: join(root, "runtime"),
      },
      shell: { type: "standalone-launcher", version: "0.18.0-beta.4" },
    };
    const childEntry = join(
      import.meta.dirname,
      "..",
      "..",
      "lib",
      "standalone-closure",
      "normalized-product-sidecar.ts",
    );
    const handle = await startSidecarStandalone(request, {
      daemon: {
        args: ["--import", "tsx", childEntry, "daemon"],
        executable: process.execPath,
        readyTimeoutMs: 5_000,
      },
      web: {
        args: ["--import", "tsx", childEntry, "web"],
        executable: process.execPath,
        readyTimeoutMs: 5_000,
      },
    });
    cleanups.push(async () => {
      await handle.close().catch(() => undefined);
    });

    await expect(handle.readStatus()).resolves.toMatchObject({
      handoff,
      state: "running",
      webUrl: "http://127.0.0.1:43234",
    });
    await expect(readFile(join(root, "data", "registered-web-url.txt"), "utf8"))
      .resolves.toBe("http://127.0.0.1:43234");

    await expect(handle.close()).resolves.toMatchObject({ handoff, state: "stopped" });
    await expect(handle.waitForTerminal()).resolves.toMatchObject({ state: "stopped" });
  });
});
