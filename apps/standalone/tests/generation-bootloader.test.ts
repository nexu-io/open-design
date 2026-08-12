import { describe, expect, it } from "vitest";

import {
  STANDALONE_HANDOFF_SCHEMA_VERSION,
  STANDALONE_PROTOCOL_VERSION,
  createStandaloneHandoffEnvelope,
  type StandaloneHandoffRequest,
} from "@open-design/standalone-proto";

import { resolveStandaloneGenerationLaunch } from "../src/generation-bootloader.js";

function request(): StandaloneHandoffRequest {
  return {
    attachment: {
      id: "electron-a",
      shell: {
        digest: `sha256:${"b".repeat(64)}`,
        type: "electron",
        version: "0.19.0-beta.10",
      },
    },
    capabilities: {
      async invoke(value) {
        return {
          attachmentId: value.attachmentId,
          handoff: value.handoff,
          outcome: "unsupported",
          requestId: value.requestId,
          schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
        };
      },
    },
    handoff: createStandaloneHandoffEnvelope({
      descriptor: {
        release: { version: "0.19.0-beta.10" },
        standalone: {
          digest: `sha256:${"a".repeat(64)}`,
          protocolVersion: STANDALONE_PROTOCOL_VERSION,
          version: "0.19.0-beta.10",
        },
      },
      scope: { channel: "beta", generation: 3, namespace: "release-beta" },
    }),
    paths: {
      cacheRoot: "/open-design/cache",
      dataRoot: "/open-design/data",
      installationRoot: "/open-design/generation-3",
      logsRoot: "/open-design/logs",
      resourceRoot: "/open-design/resources",
      runtimeRoot: "/open-design/runtime",
    },
  };
}

describe("Standalone generation bootloader", () => {
  it("derives mac official Node and native resolution from the fixed generation root", () => {
    expect(resolveStandaloneGenerationLaunch(request(), "darwin")).toMatchObject({
      cwd: "/open-design/generation-3/body",
      env: { NODE_PATH: "/open-design/generation-3/native/node_modules" },
      executable: "/open-design/generation-3/runtime/bin/node",
      launcherPath: "/open-design/generation-3/launcher/launcher.mjs",
      output: "inherit",
    });
  });

  it("changes only the official Node entry for a Windows generation", () => {
    expect(resolveStandaloneGenerationLaunch(request(), "win32")).toMatchObject({
      cwd: "/open-design/generation-3/body",
      env: { NODE_PATH: "/open-design/generation-3/native/node_modules" },
      executable: "/open-design/generation-3/runtime/node.exe",
      launcherPath: "/open-design/generation-3/launcher/launcher.mjs",
    });
  });

  it("fails closed instead of guessing an unshipped Linux layout", () => {
    expect(() => resolveStandaloneGenerationLaunch(request(), "linux"))
      .toThrow(/unsupported/u);
  });
});
