import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stub the resource-copy primitives so this test exercises only copyResourceTree's
// option wiring, with no real filesystem trees or Playwright Chromium required.
// vi.hoisted keeps the spies defined before the hoisted vi.mock factories run.
const { copyBundledResourceTrees, copyBundledPlaywrightChromium, copyOptionalVelaCliBinary } = vi.hoisted(() => ({
  copyBundledResourceTrees: vi.fn(async () => {}),
  copyBundledPlaywrightChromium: vi.fn(async () => ({ sourceRoots: [], targetRoots: [] })),
  copyOptionalVelaCliBinary: vi.fn(async () => undefined),
}));
vi.mock("../src/resources.js", () => ({
  copyBundledResourceTrees,
  copyBundledPlaywrightChromium,
}));
vi.mock("../src/vela-cli.js", () => ({ copyOptionalVelaCliBinary }));

import { copyResourceTree } from "../src/assemble.js";
import type { ToolPackBuildOnlyConfig } from "../src/config.js";

function makeConfig(workspaceRoot: string): ToolPackBuildOnlyConfig {
  // copyResourceTree only reads workspaceRoot; the rest is structural padding so
  // the cast to the build-only config type stays honest about the surface used.
  return { workspaceRoot, platform: "linux", webOutputMode: "standalone" } as unknown as ToolPackBuildOnlyConfig;
}

describe("copyResourceTree Playwright Chromium bundling", () => {
  let resourceRoot: string;
  let workspaceRoot: string;

  beforeEach(async () => {
    copyBundledResourceTrees.mockClear();
    copyBundledPlaywrightChromium.mockClear();
    copyOptionalVelaCliBinary.mockClear();
    workspaceRoot = await mkdtemp(join(tmpdir(), "od-assemble-ws-"));
    resourceRoot = await mkdtemp(join(tmpdir(), "od-assemble-res-"));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { force: true, recursive: true });
    await rm(resourceRoot, { force: true, recursive: true });
  });

  it("bundles Chromium by default (Linux Electron lane)", async () => {
    await copyResourceTree(makeConfig(workspaceRoot), resourceRoot, { includeNodeBinary: false });
    expect(copyBundledPlaywrightChromium).toHaveBeenCalledTimes(1);
  });

  it("skips Chromium when the WebUI lane opts out", async () => {
    await copyResourceTree(makeConfig(workspaceRoot), resourceRoot, {
      includeNodeBinary: false,
      includePlaywrightChromium: false,
    });
    expect(copyBundledPlaywrightChromium).not.toHaveBeenCalled();
    // The rest of the resource tree is still copied in the thin lane.
    expect(copyBundledResourceTrees).toHaveBeenCalledTimes(1);
  });
});
