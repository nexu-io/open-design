import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const workspaceRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const scriptPath = join(workspaceRoot, ".github", "scripts", "release", "smoke-artifacts.ts");

const VERSION = "0.21.1-prerelease.3";
const DMG_BYTES = Buffer.from("a fake but byte-stable dmg\n");
const EXE_BYTES = Buffer.from("a fake but byte-stable setup.exe\n");

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * The shape `tools-release publish-metadata` writes. The important part for
 * this script is that a target which did not build carries no `artifacts` key
 * at all — only a status — so anything that reaches for `artifacts` without
 * checking status first crashes on a perfectly normal Intel-less build.
 */
function metadataBody(origin: string): Record<string, unknown> {
  const versionUrl = `${origin}/prerelease/versions/${VERSION}`;
  const asset = (name: string, bytes: Buffer) => ({
    contentType: "application/octet-stream",
    name,
    sha256Url: `${versionUrl}/${name}.sha256`,
    size: bytes.byteLength,
    url: `${versionUrl}/${name}`,
  });
  return {
    channel: "prerelease",
    releaseVersion: VERSION,
    releaseTargets: {
      mac_arm64: {
        status: "published",
        artifacts: { dmg: asset(`open-design-${VERSION}-mac-arm64.dmg`, DMG_BYTES) },
      },
      mac_x64: { status: "missing", enabled: false, reason: "not requested", result: "skipped" },
      win_x64: {
        status: "published",
        artifacts: { installer: asset(`open-design-${VERSION}-win-x64-setup.exe`, EXE_BYTES) },
      },
    },
  };
}

let server: Server;
let origin = "";
let workDir = "";
/** Flipped by a test to prove the checksum guard actually fires. */
let corruptDmg = false;

beforeAll(async () => {
  server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const send = (body: Buffer | string, contentType: string) => {
      response.setHeader("content-type", contentType);
      response.statusCode = 200;
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      response.end(body);
    };
    if (path.endsWith("/metadata.json")) {
      send(JSON.stringify(metadataBody(origin)), "application/json");
      return;
    }
    if (path.endsWith("-mac-arm64.dmg.sha256")) {
      send(`${sha256(DMG_BYTES)}  open-design-${VERSION}-mac-arm64.dmg\n`, "text/plain");
      return;
    }
    if (path.endsWith("-win-x64-setup.exe.sha256")) {
      send(`${sha256(EXE_BYTES)}  open-design-${VERSION}-win-x64-setup.exe\n`, "text/plain");
      return;
    }
    if (path.endsWith("-mac-arm64.dmg")) {
      send(corruptDmg ? Buffer.from("tampered\n") : DMG_BYTES, "application/octet-stream");
      return;
    }
    if (path.endsWith("-win-x64-setup.exe")) {
      send(EXE_BYTES, "application/octet-stream");
      return;
    }
    response.statusCode = 404;
    response.end("not found");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("fixture server did not bind");
  origin = `http://127.0.0.1:${address.port}`;
  workDir = await mkdtemp(join(tmpdir(), "od-smoke-artifacts-"));
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error == null ? resolve() : reject(error))));
  if (workDir.length > 0) await rm(workDir, { force: true, recursive: true });
});

async function run(mode: "plan" | "stage", env: Record<string, string>): Promise<{ stdout: string }> {
  return execFileAsync(
    process.execPath,
    ["--experimental-strip-types", scriptPath, mode],
    { cwd: workspaceRoot, env: { ...process.env, ...env } },
  );
}

describe("smoke-artifacts", () => {
  it("plans only the targets that actually published", async () => {
    const { stdout } = await run("plan", {
      EXPECTED_VERSION: VERSION,
      VERSION_METADATA_URL: `${origin}/prerelease/versions/${VERSION}/metadata.json`,
    });
    // mac_x64 is present in the metadata but was never built, and it carries no
    // `artifacts` key — the gate has to read `status`, not "is the key there".
    expect(stdout).toContain("mac_arm64=true");
    expect(stdout).toContain("mac_x64=false");
    expect(stdout).toContain("win_x64=true");
    expect(stdout).toContain("release_version=0.21.1-prerelease.3");
  });

  it("refuses metadata for a different version than the one dispatched", async () => {
    // A stale metadata URL would silently smoke last week's package and report
    // it as this build's result.
    await expect(
      run("plan", {
        EXPECTED_VERSION: "0.21.1-prerelease.4",
        VERSION_METADATA_URL: `${origin}/prerelease/versions/${VERSION}/metadata.json`,
      }),
    ).rejects.toThrow(/is for 0\.21\.1-prerelease\.3, not the dispatched 0\.21\.1-prerelease\.4/);
  });

  it("stages the mac dmg exactly where tools-pack mac install looks for it", async () => {
    const toolsPackDir = join(workDir, "mac");
    const buildJsonPath = join(workDir, "mac-build.json");
    await run("stage", {
      BUILD_JSON_PATH: buildJsonPath,
      RELEASE_NAMESPACE: "release-prerelease",
      RELEASE_TARGET: "mac_arm64",
      TOOLS_PACK_DIR: toolsPackDir,
      VERSION_METADATA_URL: `${origin}/prerelease/versions/${VERSION}/metadata.json`,
    });

    // resolveMacPaths().dmgPath. A drift here surfaces only as
    // "no mac dmg found at ..." halfway through a release smoke.
    const staged = join(
      toolsPackDir,
      "out",
      "mac",
      "namespaces",
      "release-prerelease",
      "dmg",
      "Open Design-release-prerelease.dmg",
    );
    expect(existsSync(staged)).toBe(true);
    expect(await readFile(staged)).toEqual(DMG_BYTES);

    // release-smoke.ts refuses to start without a readable build json, and
    // tools-release write-report throws on a zero-byte one.
    const build = JSON.parse(await readFile(buildJsonPath, "utf8")) as Record<string, unknown>;
    expect(build.source).toBe("published-artifact");
    expect(build.dmgPath).toBe(staged);
    expect(build.releaseVersion).toBe(VERSION);
    expect((build.publishedArtifact as { sha256: string }).sha256).toBe(sha256(DMG_BYTES));
  });

  it("stages the windows installer exactly where tools-pack win install looks for it", async () => {
    const toolsPackDir = join(workDir, "win");
    const buildJsonPath = join(workDir, "win-build.json");
    await run("stage", {
      BUILD_JSON_PATH: buildJsonPath,
      RELEASE_NAMESPACE: "release-prerelease-win",
      RELEASE_TARGET: "win_x64",
      TOOLS_PACK_DIR: toolsPackDir,
      VERSION_METADATA_URL: `${origin}/prerelease/versions/${VERSION}/metadata.json`,
    });

    // resolveWinPaths().setupPath.
    const staged = join(
      toolsPackDir,
      "out",
      "win",
      "namespaces",
      "release-prerelease-win",
      "builder",
      "Open Design-release-prerelease-win-setup.exe",
    );
    expect(existsSync(staged)).toBe(true);
    expect(await readFile(staged)).toEqual(EXE_BYTES);
    const build = JSON.parse(await readFile(buildJsonPath, "utf8")) as Record<string, unknown>;
    expect(build.installerPath).toBe(staged);
  });

  it("fails loudly when the download does not match its published checksum", async () => {
    corruptDmg = true;
    try {
      await expect(
        run("stage", {
          BUILD_JSON_PATH: join(workDir, "corrupt-build.json"),
          RELEASE_NAMESPACE: "release-prerelease",
          RELEASE_TARGET: "mac_arm64",
          TOOLS_PACK_DIR: join(workDir, "corrupt"),
          VERSION_METADATA_URL: `${origin}/prerelease/versions/${VERSION}/metadata.json`,
        }),
      ).rejects.toThrow(/does not match published/);
    } finally {
      corruptDmg = false;
    }
  });

  it("refuses to stage a target that never published", async () => {
    await expect(
      run("stage", {
        BUILD_JSON_PATH: join(workDir, "intel-build.json"),
        RELEASE_NAMESPACE: "release-prerelease-intel",
        RELEASE_TARGET: "mac_x64",
        TOOLS_PACK_DIR: join(workDir, "intel"),
        VERSION_METADATA_URL: `${origin}/prerelease/versions/${VERSION}/metadata.json`,
      }),
    ).rejects.toThrow(/mac_x64 is not published/);
  });
});
