import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { startReleaseStorageFixtureServer } from "../src/release-storage-fixture.js";

function runPublisher(repoRoot: string, env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", "tools/release/src/storage/publish-dsh-bootstrap.ts"],
      { cwd: repoRoot, env },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun(stdout);
      } else {
        rejectRun(new Error(`publisher exited ${String(code)}\n${stdout}\n${stderr}`));
      }
    });
  });
}

describe("DeepSeek Harness bootstrap publisher", () => {
  it("publishes immutable cross-platform installers and their checksum manifest", async () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");
    const sourceDir = await mkdtemp(join(tmpdir(), "od-dsh-bootstrap-publish-"));
    const server = await startReleaseStorageFixtureServer();
    const files = {
      "install-dsh.cmd": "@echo off\r\necho cmd\r\n",
      "install-dsh.ps1": "Write-Host 'powershell'\n",
      "install-dsh.sh": "#!/usr/bin/env sh\necho posix\n",
    };
    await Promise.all(Object.entries(files).map(([name, body]) => writeFile(join(sourceDir, name), body, "utf8")));

    const env = {
      ...process.env,
      DSH_BOOTSTRAP_SOURCE_DIR: sourceDir,
      DSH_BOOTSTRAP_VERSION: "v1",
      RELEASE_PUBLIC_ORIGIN: "https://releases.example.test",
      RELEASE_STORAGE_ACCESS_KEY_ID: "ak",
      RELEASE_STORAGE_BUCKET: server.info.bucket,
      RELEASE_STORAGE_ENDPOINT: server.info.endpointUrl,
      RELEASE_STORAGE_REGION: "auto",
      RELEASE_STORAGE_SECRET_ACCESS_KEY: "sk",
    };

    try {
      const output = await runPublisher(repoRoot, env);
      expect(output).toContain("https://releases.example.test/bootstrap/dsh/v1/install-dsh.sh");
      expect(server.listObjectKeys()).toEqual([
        "bootstrap/dsh/v1/SHA256SUMS",
        "bootstrap/dsh/v1/install-dsh.cmd",
        "bootstrap/dsh/v1/install-dsh.ps1",
        "bootstrap/dsh/v1/install-dsh.sh",
      ]);
      for (const [name, body] of Object.entries(files)) {
        expect(server.getObject(`bootstrap/dsh/v1/${name}`)?.toString("utf8")).toBe(body);
      }
      expect(server.getObject("bootstrap/dsh/v1/SHA256SUMS")?.toString("utf8")).toMatch(
        /^[a-f0-9]{64}  install-dsh\.cmd\n[a-f0-9]{64}  install-dsh\.ps1\n[a-f0-9]{64}  install-dsh\.sh\n$/,
      );

      await expect(runPublisher(repoRoot, env)).resolves.toContain("reused identical immutable bootstrap object");

      await writeFile(join(sourceDir, "install-dsh.sh"), "#!/usr/bin/env sh\necho changed\n", "utf8");
      await expect(runPublisher(repoRoot, env)).rejects.toThrow(
        /immutable bootstrap object already exists with different content/,
      );
    } finally {
      await server.close();
      await rm(sourceDir, { force: true, recursive: true });
    }
  });
});
