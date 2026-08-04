import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ServerBuildResult } from "../src/server/build.js";
import { writeServerBuildResultJson } from "../src/server/build-result.js";

const temporaryRoots: string[] = [];

async function makeTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "od-server-build-result-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { force: true, recursive: true }),
    ),
  );
});

describe("server build result output", () => {
  it("writes pure parseable JSON independently from stdout build logs", async () => {
    const root = await makeTemporaryRoot();
    const outputPath = join(root, "nested", "server-build.json");
    const result: ServerBuildResult = {
      appVersion: "1.2.3",
      arch: "arm64",
      archivePath: "/tmp/open-design-server-1.2.3-darwin-arm64.tar.gz",
      manifestPath: "/tmp/server-manifest.json",
      platform: "darwin",
      releaseRoot: "/tmp/open-design-server-1.2.3-darwin-arm64",
      sha256: "a".repeat(64),
      sha256Path:
        "/tmp/open-design-server-1.2.3-darwin-arm64.tar.gz.sha256",
      sha256SumsPath: "/tmp/SHA256SUMS",
    };
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    process.stdout.write("next build emitted an ordinary log line\n");
    await writeServerBuildResultJson(outputPath, result);
    process.stdout.write(`${JSON.stringify(result)}\n`);

    const raw = await readFile(outputPath, "utf8");
    expect(JSON.parse(raw)).toEqual(result);
    expect(raw).toBe(`${JSON.stringify(result, null, 2)}\n`);
    expect(stdout).toHaveBeenCalledWith(
      "next build emitted an ordinary log line\n",
    );
    expect(await readdir(join(root, "nested"))).toEqual(["server-build.json"]);
  });
});
