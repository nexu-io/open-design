import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  STANDALONE_HANDOFF_SCHEMA_VERSION,
  STANDALONE_PROTOCOL_VERSION,
  createStandaloneHandoffEnvelope,
  type StandaloneHandoffRequest,
} from "@open-design/standalone/protocol";

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
  it("reuses the Shell-owned official Node and derives native resolution from the generation root", () => {
    const generationRoot = request().paths.installationRoot;
    expect(resolveStandaloneGenerationLaunch(request(), "/shell/node")).toMatchObject({
      cwd: join(generationRoot, "body"),
      env: {
        NODE_OPTIONS: `--import=${pathToFileURL(join(generationRoot, "launcher", "native-loader.mjs")).href}`,
        NODE_PATH: join(generationRoot, "native", "node_modules"),
        OD_STANDALONE_NATIVE_ROOT: join(generationRoot, "native"),
      },
      executable: "/shell/node",
      launcherPath: join(generationRoot, "launcher", "launcher.mjs"),
      output: "inherit",
    });
  });

  it("projects target-native Vela and OpenCode binaries without replacing explicit overrides", async () => {
    const generationRoot = await mkdtemp(join(tmpdir(), "od-generation-tools-"));
    const resourceRoot = join(generationRoot, "shell-resources");
    const velaPath = join(resourceRoot, "bin", process.platform === "win32" ? "vela.exe" : "vela");
    const openCodePath = join(
      resourceRoot,
      "bin",
      "libexec",
      "opencode",
      process.platform === "win32" ? "opencode.exe" : "opencode",
    );
    await mkdir(join(resourceRoot, "bin", "libexec", "opencode"), { recursive: true });
    await writeFile(velaPath, "vela");
    await writeFile(openCodePath, "opencode");
    const input = {
      ...request(),
      paths: { ...request().paths, installationRoot: generationRoot, resourceRoot },
    };
    try {
      expect(resolveStandaloneGenerationLaunch(input).env).toMatchObject({
        VELA_BIN: velaPath,
        VELA_OPENCODE_BIN: openCodePath,
      });
      const previous = process.env.VELA_BIN;
      process.env.VELA_BIN = "/user/vela";
      try {
        expect(resolveStandaloneGenerationLaunch(input).env?.VELA_BIN).toBe("/user/vela");
      } finally {
        if (previous == null) delete process.env.VELA_BIN;
        else process.env.VELA_BIN = previous;
      }
    } finally {
      await rm(generationRoot, { force: true, recursive: true });
    }
  });

  it("defaults to the Node process executing the fossil bootloader", () => {
    expect(resolveStandaloneGenerationLaunch(request()).executable).toBe(process.execPath);
  });

  it("consumes the Shell-projected official Node without learning Shell layout", () => {
    const previous = process.env.OD_NODE_BIN;
    process.env.OD_NODE_BIN = "/shell/resources/bin/node";
    try {
      expect(resolveStandaloneGenerationLaunch(request()).executable).toBe("/shell/resources/bin/node");
    } finally {
      if (previous == null) delete process.env.OD_NODE_BIN;
      else process.env.OD_NODE_BIN = previous;
    }
  });
});
