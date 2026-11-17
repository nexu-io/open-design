import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildMacSpeechHelper, type NativeSpeechExec } from "../src/mac/native-speech.js";

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const roots: string[] = [];

async function makeResourceRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "od-native-speech-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("buildMacSpeechHelper", () => {
  it("compiles the helper into resources/bin when the toolchain is present", async () => {
    const resourceRoot = await makeResourceRoot();
    const calls: string[][] = [];
    const exec: NativeSpeechExec = async (_file, args) => {
      calls.push([...args]);
      const out = args.indexOf("-o");
      if (out !== -1) await writeFile(args[out + 1]!, "binary");
    };

    await expect(buildMacSpeechHelper({ resourceRoot, workspaceRoot, exec })).resolves.toBe(true);
    expect(calls[0]).toEqual(["--find", "swiftc"]);
    expect(calls[1]).toContain("-O");
    expect(calls[1]).toContain(join(resourceRoot, "bin", "od-speech"));
  });

  it("skips with a warning when there is no Swift toolchain", async () => {
    const resourceRoot = await makeResourceRoot();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const exec: NativeSpeechExec = async (_file, args) => {
      if (args[0] === "--find") throw new Error('xcrun: error: unable to find utility "swiftc"');
    };

    await expect(buildMacSpeechHelper({ resourceRoot, workspaceRoot, exec })).resolves.toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("Swift toolchain not found");
  });

  it("rethrows a compile failure instead of silently dropping the helper", async () => {
    const resourceRoot = await makeResourceRoot();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const exec: NativeSpeechExec = async (_file, args) => {
      if (args[0] === "swiftc") throw new Error("main.swift:10:5: error: cannot find 'x' in scope");
    };

    await expect(buildMacSpeechHelper({ resourceRoot, workspaceRoot, exec })).rejects.toThrow(
      /failed to compile the od-speech helper.*cannot find 'x'/s,
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
