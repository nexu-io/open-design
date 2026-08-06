import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const workspaceRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const publishPlatformPath = join(workspaceRoot, "tools", "release", "src", "storage", "publish-platform.ts");
const publishMetadataPath = join(workspaceRoot, "tools", "release", "src", "storage", "publish-metadata.ts");
const temporaryRoots: string[] = [];

function digest(bytes: string | Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function writeFixture(root: string, options: { closureVersion?: string } = {}): Promise<{
  assetsRoot: string;
  closureVersion: string;
  manifestRoot: string;
  metadataRoot: string;
}> {
  const assetsRoot = join(root, "assets");
  const manifestRoot = join(root, "manifests");
  const metadataRoot = join(root, "metadata");
  await mkdir(assetsRoot, { recursive: true });

  const version = "0.18.0-beta.4";
  const closureVersion = options.closureVersion ?? version;
  const assetBase = `open-design-${version}-mac-arm64`;
  const closureBase = `open-design-${closureVersion}-mac-arm64-closure`;
  const archive = Buffer.from("headless Closure archive fixture");
  const archiveDigest = digest(archive);
  const files = [{
    digest: digest("runtime fixture"),
    path: "runtime.mjs",
    size: Buffer.byteLength("runtime fixture"),
  }];
  const inventoryDigest = digest(JSON.stringify(files));
  const archiveUrl = `https://releases.open-design.test/beta/closure/darwin-arm64/versions/${closureVersion}/${closureBase}.zip`;

  await Promise.all([
    writeFile(join(assetsRoot, `${assetBase}.dmg`), "dmg"),
    writeFile(join(assetsRoot, `${assetBase}.dmg.sha256`), "fixture  dmg\n"),
    writeFile(join(assetsRoot, `${assetBase}-payload.zip`), "legacy payload"),
    writeFile(join(assetsRoot, `${assetBase}-payload.zip.sha256`), "fixture  payload\n"),
    writeFile(join(assetsRoot, `${closureBase}.zip`), archive),
    writeFile(join(assetsRoot, `${closureBase}.zip.sha256`), `${archiveDigest.slice("sha256:".length)}  ${closureBase}.zip\n`),
    writeFile(join(assetsRoot, `${closureBase}-inventory.json`), `${JSON.stringify({ files, schemaVersion: 1 }, null, 2)}\n`),
    writeFile(join(assetsRoot, `${closureBase}-manifest.json`), `${JSON.stringify({
      artifact: {
        digest: archiveDigest,
        entryPath: "runtime.mjs",
        inventoryDigest,
        mediaType: "application/vnd.open-design.closure.zip-v1",
        size: archive.byteLength,
        url: archiveUrl,
      },
      compatibility: { shell: { minVersion: "0.16.2" } },
      identity: {
        channel: "beta",
        digest: archiveDigest,
        platform: "darwin-arm64",
        protocolVersion: 1,
        version: closureVersion,
      },
      schemaVersion: 1,
    }, null, 2)}\n`),
    writeFile(join(assetsRoot, `${closureBase}-provenance.json`), `${JSON.stringify({
      artifact: { digest: archiveDigest, inventoryDigest, size: archive.byteLength },
      build: { nodeVersion: process.version, sourceRevision: "fixture", workspaceDirty: false },
      channel: "beta",
      content: { fileCount: files.length, inventoryDigest, inventoryPath: "inventory.json" },
      generatedAt: new Date(0).toISOString(),
      platform: "darwin-arm64",
      schemaVersion: 1,
      version: closureVersion,
    }, null, 2)}\n`),
  ]);

  return { assetsRoot, closureVersion, manifestRoot, metadataRoot };
}

function platformEnv(
  fixture: Awaited<ReturnType<typeof writeFixture>>,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    RELEASE_ARTIFACT_MODE: "dmg-and-payload",
    RELEASE_ASSETS_DIR: fixture.assetsRoot,
    RELEASE_CHANNEL: "beta",
    RELEASE_CLOSURE_ENABLED: "true",
    RELEASE_CLOSURE_VERSION: fixture.closureVersion,
    RELEASE_MANIFEST_DIR: fixture.manifestRoot,
    RELEASE_OUTPUTS_PATH: join(fixture.manifestRoot, "outputs.json"),
    RELEASE_PUBLIC_ORIGIN: "https://releases.open-design.test",
    RELEASE_PUBLISH_SIDE_EFFECTS: "false",
    RELEASE_SIGNED: "false",
    RELEASE_TARGET: "mac_arm64",
    RELEASE_VERSION: "0.18.0-beta.4",
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

describe("Headless Closure release publication", () => {
  it("publishes Closure and legacy payload identities on the same platform metadata surface", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-closure-release-"));
    temporaryRoots.push(root);
    const fixture = await writeFixture(root);

    await execFileAsync(process.execPath, ["--experimental-strip-types", publishPlatformPath], {
      cwd: workspaceRoot,
      env: platformEnv(fixture),
    });
    const platform = JSON.parse(await readFile(join(fixture.manifestRoot, "mac_arm64.json"), "utf8"));
    expect(platform.artifacts.payload.url).toContain("mac-arm64-payload.zip");
    expect(platform.closure.manifest.identity).toMatchObject({
      channel: "beta",
      platform: "darwin-arm64",
      version: "0.18.0-beta.4",
    });
    expect(Object.keys(platform.closure.assets).sort()).toEqual(["archive", "inventory", "manifest", "provenance"]);

    await execFileAsync(process.execPath, ["--experimental-strip-types", publishMetadataPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        BASE_VERSION: "0.18.0",
        ENABLE_LINUX_X64: "false",
        ENABLE_MAC_ARM64: "true",
        ENABLE_MAC_X64: "false",
        ENABLE_WIN_X64: "false",
        MAC_ARM64_RESULT: "success",
        RELEASE_CHANNEL: "beta",
        RELEASE_CLOSURE_REQUIRED: "true",
        RELEASE_MANIFEST_DIR: fixture.manifestRoot,
        RELEASE_METADATA_DIR: fixture.metadataRoot,
        RELEASE_OUTPUTS_PATH: join(fixture.metadataRoot, "outputs.json"),
        RELEASE_PUBLIC_ORIGIN: "https://releases.open-design.test",
        RELEASE_PUBLISH_SIDE_EFFECTS: "false",
        RELEASE_SIGNED: "false",
        RELEASE_VERSION: "0.18.0-beta.4",
        STATE_SOURCE: "test",
      },
    });
    const metadata = JSON.parse(await readFile(join(fixture.metadataRoot, "metadata.json"), "utf8"));
    const outputs = JSON.parse(await readFile(join(fixture.metadataRoot, "outputs.json"), "utf8"));
    expect(metadata.releaseTargets.mac_arm64.artifacts.payload.url).toBe(platform.artifacts.payload.url);
    expect(metadata.releaseTargets.mac_arm64.closure).toEqual(platform.closure);
    expect(outputs.mac_arm64_closure_archive_url).toBe(platform.closure.assets.archive.url);
    expect(outputs.mac_arm64_payload_url).toBe(platform.artifacts.payload.url);
  });

  it("publishes a Closure version independently from the shell release version", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-closure-release-independent-"));
    temporaryRoots.push(root);
    const fixture = await writeFixture(root, { closureVersion: "0.18.0-beta.5" });

    await execFileAsync(process.execPath, ["--experimental-strip-types", publishPlatformPath], {
      cwd: workspaceRoot,
      env: platformEnv(fixture),
    });
    const platform = JSON.parse(await readFile(join(fixture.manifestRoot, "mac_arm64.json"), "utf8"));
    expect(platform.releaseVersion).toBe("0.18.0-beta.4");
    expect(platform.closure.manifest.identity.version).toBe("0.18.0-beta.5");
    expect(platform.closure.assets.archive.url).toContain(
      "/beta/closure/darwin-arm64/versions/0.18.0-beta.5/",
    );

    await execFileAsync(process.execPath, ["--experimental-strip-types", publishMetadataPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        BASE_VERSION: "0.18.0",
        ENABLE_LINUX_X64: "false",
        ENABLE_MAC_ARM64: "true",
        ENABLE_MAC_X64: "false",
        ENABLE_WIN_X64: "false",
        MAC_ARM64_RESULT: "success",
        RELEASE_CHANNEL: "beta",
        RELEASE_CLOSURE_REQUIRED: "true",
        RELEASE_MANIFEST_DIR: fixture.manifestRoot,
        RELEASE_METADATA_DIR: fixture.metadataRoot,
        RELEASE_OUTPUTS_PATH: join(fixture.metadataRoot, "outputs.json"),
        RELEASE_PUBLIC_ORIGIN: "https://releases.open-design.test",
        RELEASE_PUBLISH_SIDE_EFFECTS: "false",
        RELEASE_SIGNED: "false",
        RELEASE_VERSION: "0.18.0-beta.4",
        STATE_SOURCE: "test",
      },
    });
    const metadata = JSON.parse(await readFile(join(fixture.metadataRoot, "metadata.json"), "utf8"));
    expect(metadata.releaseVersion).toBe("0.18.0-beta.4");
    expect(metadata.releaseTargets.mac_arm64.closure.manifest.identity.version).toBe("0.18.0-beta.5");
  });

  it("rejects a Closure archive that does not match its candidate manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-closure-release-tamper-"));
    temporaryRoots.push(root);
    const fixture = await writeFixture(root);
    await writeFile(
      join(fixture.assetsRoot, "open-design-0.18.0-beta.4-mac-arm64-closure.zip"),
      "tampered closure archive",
    );

    await expect(execFileAsync(process.execPath, ["--experimental-strip-types", publishPlatformPath], {
      cwd: workspaceRoot,
      env: platformEnv(fixture),
    })).rejects.toMatchObject({
      stderr: expect.stringContaining("Closure archive size"),
    });
  });

  it("rejects a successful G2 platform manifest when Closure publication is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-closure-release-missing-"));
    temporaryRoots.push(root);
    const fixture = await writeFixture(root);
    await execFileAsync(process.execPath, ["--experimental-strip-types", publishPlatformPath], {
      cwd: workspaceRoot,
      env: { ...platformEnv(fixture), RELEASE_CLOSURE_ENABLED: "false" },
    });

    await expect(execFileAsync(process.execPath, ["--experimental-strip-types", publishMetadataPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        BASE_VERSION: "0.18.0",
        ENABLE_LINUX_X64: "false",
        ENABLE_MAC_ARM64: "true",
        ENABLE_MAC_X64: "false",
        ENABLE_WIN_X64: "false",
        MAC_ARM64_RESULT: "success",
        RELEASE_CHANNEL: "beta",
        RELEASE_CLOSURE_REQUIRED: "true",
        RELEASE_MANIFEST_DIR: fixture.manifestRoot,
        RELEASE_METADATA_DIR: fixture.metadataRoot,
        RELEASE_OUTPUTS_PATH: join(fixture.metadataRoot, "outputs.json"),
        RELEASE_PUBLIC_ORIGIN: "https://releases.open-design.test",
        RELEASE_PUBLISH_SIDE_EFFECTS: "false",
        RELEASE_SIGNED: "false",
        RELEASE_VERSION: "0.18.0-beta.4",
        STATE_SOURCE: "test",
      },
    })).rejects.toMatchObject({
      stderr: expect.stringContaining("closure=missing"),
    });
  });
});
