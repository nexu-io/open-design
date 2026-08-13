import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  CLOSURE_ARCHIVE_ENTRY_PATH,
  CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  createClosureDistributionManifest,
} from "@open-design/closure/protocol";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const workspaceRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const publishPlatformPath = join(workspaceRoot, "tools", "release", "src", "storage", "publish-platform.ts");
const publishMetadataPath = join(workspaceRoot, "tools", "release", "src", "storage", "publish-metadata.ts");
const verifyMetadataPath = join(workspaceRoot, "tools", "release", "src", "storage", "verify-metadata.ts");
const temporaryRoots: string[] = [];

function digest(bytes: string | Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function writeFixture(root: string, options: { closureVersion?: string; minShellVersion?: string } = {}): Promise<{
  assetsRoot: string;
  closureVersion: string;
  manifestRoot: string;
  metadataRoot: string;
  shellBuildJsonPath: string;
}> {
  const assetsRoot = join(root, "assets");
  const manifestRoot = join(root, "manifests");
  const metadataRoot = join(root, "metadata");
  const shellBuildJsonPath = join(root, "shell-build.json");
  await mkdir(assetsRoot, { recursive: true });

  const version = "0.18.0-beta.4";
  const closureVersion = options.closureVersion ?? version;
  const assetBase = `open-design-${version}-mac-arm64`;
  const closureBase = `open-design-${closureVersion}-mac-arm64-closure`;
  const archive = Buffer.from("headless Closure archive fixture");
  const archiveDigest = digest(archive);
  const files = [{
    digest: digest("runtime fixture"),
    path: CLOSURE_ARCHIVE_ENTRY_PATH,
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
        entryPath: CLOSURE_ARCHIVE_ENTRY_PATH,
        inventoryDigest,
        mediaType: "application/vnd.open-design.closure.zip-v1",
        size: archive.byteLength,
        url: archiveUrl,
      },
      compatibility: { shell: { electron: { version: { min: options.minShellVersion ?? "0.18.0-beta.3" } } } },
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
      build: {
        nodeVersion: process.version,
        shellDepsDigest: digest("electron shell deps"),
        sourceRevision: "fixture",
        workspaceDirty: false,
      },
      channel: "beta",
      content: { fileCount: files.length, inventoryDigest, inventoryPath: "inventory.json" },
      generatedAt: new Date(0).toISOString(),
      platform: "darwin-arm64",
      schemaVersion: 1,
      version: closureVersion,
    }, null, 2)}\n`),
  ]);

  await writeFile(shellBuildJsonPath, `${JSON.stringify({
    artifacts: {
      dmg: { digest: digest("dmg"), path: "/fixture/Open Design.dmg", size: Buffer.byteLength("dmg") },
      payload: { digest: digest("legacy payload"), path: "/fixture/payload.zip", size: Buffer.byteLength("legacy payload") },
      zip: null,
    },
    releaseVersion: version,
    resolution: {
      artifacts: {
        dmg: {
          contentType: "application/x-apple-diskimage",
          digest: digest("dmg"),
          name: "Open Design-release-beta.dmg",
          objectKey: "beta/shells/electron/versions/0.18.0-beta.3/darwin-arm64/Open Design-release-beta.dmg",
          size: Buffer.byteLength("dmg"),
          url: "https://releases.open-design.test/beta/shells/electron/versions/0.18.0-beta.3/darwin-arm64/Open%20Design-release-beta.dmg",
        },
        payload: {
          contentType: "application/zip",
          digest: digest("legacy payload"),
          name: "Open Design-release-beta-payload.zip",
          objectKey: "beta/shells/electron/versions/0.18.0-beta.3/darwin-arm64/Open Design-release-beta-payload.zip",
          size: Buffer.byteLength("legacy payload"),
          url: "https://releases.open-design.test/beta/shells/electron/versions/0.18.0-beta.3/darwin-arm64/Open%20Design-release-beta-payload.zip",
        },
      },
      createdAt: "2026-08-01T02:03:04.000Z",
      recordUrl: "https://releases.open-design.test/beta/shells/electron/builds/source/artifacts/darwin-arm64.json",
      state: "reused",
    },
    shell: {
      buildDigest: digest("electron shell build"),
      capabilityDigest: digest("standalone capability"),
      carrierDigest: digest("darwin arm64 carrier"),
      depsDigest: digest("electron shell deps"),
      sourceDigest: digest("electron shell source"),
      type: "electron",
      version: "0.18.0-beta.3",
    },
  }, null, 2)}\n`);

  return { assetsRoot, closureVersion, manifestRoot, metadataRoot, shellBuildJsonPath };
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
    RELEASE_TARGET: "mac_arm64",
    RELEASE_VERSION: "0.18.0-beta.4",
  };
}

async function writeResolvedWindowsShellFixture(root: string): Promise<{
  assetsRoot: string;
  manifestRoot: string;
  shellBuildJsonPath: string;
}> {
  const assetsRoot = join(root, "assets");
  const manifestRoot = join(root, "manifests");
  const shellBuildJsonPath = join(root, "shell-build.json");
  const releaseVersion = "0.18.0-beta.4";
  const shellVersion = "0.18.0-beta.3";
  const suffix = ".unsigned";
  const installerName = `open-design-${releaseVersion}${suffix}-win-x64-setup.exe`;
  const payloadName = `open-design-${releaseVersion}${suffix}-win-x64-payload.7z`;
  const portableZipName = `open-design-${releaseVersion}${suffix}-win-x64-portable.zip`;
  const bytes = {
    installer: Buffer.from("immutable installer"),
    payload: Buffer.from("immutable payload"),
    portableZip: Buffer.from("immutable portable zip"),
  };
  const prefix = `beta/shells/electron/versions/${shellVersion}/win32-x64`;
  const remote = (kind: keyof typeof bytes, name: string, contentType: string) => ({
    contentType,
    digest: digest(bytes[kind]),
    name,
    objectKey: `${prefix}/${name}`,
    size: bytes[kind].byteLength,
    url: `https://releases.open-design.test/${prefix}/${name}`,
  });
  await mkdir(assetsRoot, { recursive: true });
  await Promise.all([
    writeFile(join(assetsRoot, installerName), bytes.installer),
    writeFile(join(assetsRoot, `${installerName}.sha256`), "fixture\n"),
    writeFile(join(assetsRoot, payloadName), bytes.payload),
    writeFile(join(assetsRoot, `${payloadName}.sha256`), "fixture\n"),
    writeFile(join(assetsRoot, portableZipName), bytes.portableZip),
    writeFile(join(assetsRoot, `${portableZipName}.sha256`), "fixture\n"),
    writeFile(join(assetsRoot, "latest.yml"), "stale release-scoped updater feed\n"),
  ]);
  await writeFile(shellBuildJsonPath, `${JSON.stringify({
    artifacts: {
      installer: { digest: digest(bytes.installer), path: "/fixture/setup.exe", size: bytes.installer.byteLength },
      payload: { digest: digest(bytes.payload), path: "/fixture/payload.7z", size: bytes.payload.byteLength },
      portableZip: { digest: digest(bytes.portableZip), path: "/fixture/portable.zip", size: bytes.portableZip.byteLength },
    },
    releaseVersion,
    resolution: {
      artifacts: {
        installer: remote("installer", "Open Design-release-beta-win-setup.exe", "application/vnd.microsoft.portable-executable"),
        payload: remote("payload", "Open Design-release-beta-win-payload.7z", "application/x-7z-compressed"),
        portableZip: remote("portableZip", "Open Design-release-beta-win-portable.zip", "application/zip"),
      },
      createdAt: "2026-08-01T02:03:04.000Z",
      recordUrl: "https://releases.open-design.test/beta/shells/electron/builds/source/artifacts/win32-x64.json",
      state: "reused",
    },
    shell: {
      buildDigest: digest("electron shell build"),
      capabilityDigest: digest("standalone capability"),
      carrierDigest: digest("win32 x64 carrier"),
      depsDigest: digest("electron shell deps"),
      sourceDigest: digest("electron shell source"),
      type: "electron",
      version: shellVersion,
    },
  }, null, 2)}\n`);
  return { assetsRoot, manifestRoot, shellBuildJsonPath };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

describe("Standalone Closure release publication", () => {
  it("accepts a selected immutable Shell above the Closure capability floor", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-shell-floor-proof-"));
    temporaryRoots.push(root);
    const fixture = await writeFixture(root, { minShellVersion: "0.18.0-beta.2" });

    await expect(execFileAsync(process.execPath, ["--experimental-strip-types", publishPlatformPath], {
      cwd: workspaceRoot,
      env: {
        ...platformEnv(fixture),
        RELEASE_SHELL_BUILD_JSON_PATH: fixture.shellBuildJsonPath,
        RELEASE_SHELL_ENABLED: "true",
      },
    })).resolves.toMatchObject({ stdout: expect.stringContaining("planned") });
  });

  it("publishes and verifies the sole version-wide Closure graph at release root", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-closure-distribution-release-"));
    temporaryRoots.push(root);
    const fixture = await writeFixture(root);
    await execFileAsync(process.execPath, ["--experimental-strip-types", publishPlatformPath], {
      cwd: workspaceRoot,
      env: platformEnv(fixture),
    });
    const distributionPath = join(root, "closure-distribution.json");
    const launcher = digest("launcher");
    const body = digest("body");
    const native = digest("native");
    const artifact = (value: string) => ({
      digest: value as `sha256:${string}`,
      mediaType: "application/zip",
      size: 1,
      url: `https://releases.open-design.test/beta/versions/0.18.0-beta.4/closure/blobs/${value.slice("sha256:".length)}`,
    });
    const distribution = createClosureDistributionManifest({
      blobs: Object.fromEntries([launcher, body, native].map((value) => [value, artifact(value)])),
      compatibility: { shell: { electron: { version: { min: "0.18.0-beta.3" } } } },
      identity: {
        channel: "beta",
        protocolVersion: CLOSURE_PROTOCOL_VERSION,
        version: "0.18.0-beta.4",
      },
      required: {
        body: { blob: body, entryPath: "bootloader.mjs", treeDigest: digest("body-tree") },
        launcher: {
          blob: launcher,
          entryPath: "launcher.mjs",
          handoffPath: "bootloader.mjs",
          treeDigest: digest("launcher-tree"),
        },
        targets: {
          "darwin-arm64": {
            native: { blob: native, treeDigest: digest("native-tree") },
          },
        },
      },
      resources: [],
      schemaVersion: CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
    }, digest);
    await writeFile(distributionPath, `${JSON.stringify(distribution, null, 2)}\n`);

    const common = {
      ...process.env,
      BASE_VERSION: "0.18.0",
      ENABLE_MAC_ARM64: "true",
      ENABLE_MAC_X64: "false",
      ENABLE_WIN_X64: "false",
      MAC_ARM64_RESULT: "success",
      RELEASE_CHANNEL: "beta",
      RELEASE_CLOSURE_DISTRIBUTION_REQUIRED: "true",
      RELEASE_MANIFEST_DIR: fixture.manifestRoot,
      RELEASE_METADATA_DIR: fixture.metadataRoot,
      RELEASE_OUTPUTS_PATH: join(fixture.metadataRoot, "outputs.json"),
      RELEASE_PUBLIC_ORIGIN: "https://releases.open-design.test",
      RELEASE_PUBLISH_SIDE_EFFECTS: "false",
      RELEASE_VERSION: "0.18.0-beta.4",
      STATE_SOURCE: "test",
    };
    await execFileAsync(process.execPath, ["--experimental-strip-types", publishMetadataPath], {
      cwd: workspaceRoot,
      env: { ...common, RELEASE_CLOSURE_DISTRIBUTION_MANIFEST_PATH: distributionPath },
    });
    const metadataPath = join(fixture.metadataRoot, "metadata.json");
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    expect(metadata.closure).toEqual(distribution);
    expect(metadata.r2.closureManifestUrl).toBe(
      "https://releases.open-design.test/beta/versions/0.18.0-beta.4/closure/manifest.json",
    );

    await expect(execFileAsync(process.execPath, ["--experimental-strip-types", verifyMetadataPath], {
      cwd: workspaceRoot,
      env: {
        ...common,
        RELEASE_CLOSURE_DISTRIBUTION_MANIFEST_PATH: distributionPath,
        RELEASE_METADATA_PATH: metadataPath,
      },
    })).resolves.toMatchObject({ stdout: expect.stringContaining("verified beta metadata") });
  });

  it("publishes a resolved Windows Shell feed against the immutable Shell identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-shell-feed-independent-"));
    temporaryRoots.push(root);
    const fixture = await writeResolvedWindowsShellFixture(root);

    const publication = await execFileAsync(process.execPath, ["--experimental-strip-types", publishPlatformPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        RELEASE_ASSET_SUFFIX: ".unsigned",
        RELEASE_ASSETS_DIR: fixture.assetsRoot,
        RELEASE_CHANNEL: "beta",
        RELEASE_CLOSURE_ENABLED: "false",
        RELEASE_MANIFEST_DIR: fixture.manifestRoot,
        RELEASE_OUTPUTS_PATH: join(fixture.manifestRoot, "outputs.json"),
        RELEASE_PUBLIC_ORIGIN: "https://releases.open-design.test",
        RELEASE_PUBLISH_SIDE_EFFECTS: "false",
        RELEASE_SHELL_BUILD_JSON_PATH: fixture.shellBuildJsonPath,
        RELEASE_SHELL_ENABLED: "true",
        RELEASE_TARGET: "win_x64",
        RELEASE_VERSION: "0.18.0-beta.4",
        WIN_INCLUDE_ZIP: "true",
      },
    });

    expect(publication.stdout).toContain("would upload immutable");
    expect(publication.stdout).toContain("/latest.yml");
    expect(publication.stdout).not.toContain("open-design-0.18.0-beta.4.unsigned-win-x64-setup.exe to");
    const feed = await readFile(join(fixture.assetsRoot, "latest.yml"), "utf8");
    expect(feed).toContain('version: "0.18.0-beta.3"');
    expect(feed).toContain("/beta/versions/0.18.0-beta.4/shells/electron/win_x64/setup.exe");
    expect(feed).toContain('releaseDate: "2026-08-01T02:03:04.000Z"');

    const platform = JSON.parse(await readFile(join(fixture.manifestRoot, "win_x64.json"), "utf8"));
    expect(platform.releaseVersion).toBe("0.18.0-beta.4");
    expect(platform.shell.version).toBe("0.18.0-beta.3");
    expect(platform.artifacts.installer.url).toContain("/beta/versions/0.18.0-beta.4/shells/electron/win_x64/");
    expect(platform.feed.url).toBe(
      "https://releases.open-design.test/beta/versions/0.18.0-beta.4/shells/electron/win_x64/latest.yml",
    );
  });

  it("binds an independently versioned Shell artifact and its two digests to the release", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-shell-release-independent-"));
    temporaryRoots.push(root);
    const fixture = await writeFixture(root);

    const publication = await execFileAsync(process.execPath, ["--experimental-strip-types", publishPlatformPath], {
      cwd: workspaceRoot,
      env: {
        ...platformEnv(fixture),
        RELEASE_SHELL_BUILD_JSON_PATH: fixture.shellBuildJsonPath,
        RELEASE_SHELL_ENABLED: "true",
      },
    });
    expect(publication.stdout).not.toContain("open-design-0.18.0-beta.4-mac-arm64.dmg");
    const platform = JSON.parse(await readFile(join(fixture.manifestRoot, "mac_arm64.json"), "utf8"));
    expect(platform.releaseVersion).toBe("0.18.0-beta.4");
    expect(platform.shell).toMatchObject({
      capabilityDigest: digest("standalone capability"),
      carrierDigest: digest("darwin arm64 carrier"),
      sourceDigest: digest("electron shell source"),
      type: "electron",
      version: "0.18.0-beta.3",
    });
    expect(platform.artifacts.dmg.digest).toBe(digest("dmg"));
    expect(platform.artifacts.dmg.url).toContain(
      "/beta/versions/0.18.0-beta.4/shells/electron/mac_arm64/",
    );
    expect(platform.artifacts.dmg.name).toBe("Open Design.dmg");
    expect(platform.shell.artifacts).toEqual(platform.artifacts);
    expect(platform.shell).toMatchObject({
      buildRecordUrl: "https://releases.open-design.test/beta/shells/electron/builds/source/artifacts/darwin-arm64.json",
      resolution: "reused",
    });

    await execFileAsync(process.execPath, ["--experimental-strip-types", publishMetadataPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        BASE_VERSION: "0.18.0",
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
        RELEASE_SHELL_REQUIRED: "true",
        RELEASE_VERSION: "0.18.0-beta.4",
        STATE_SOURCE: "test",
      },
    });
    const metadata = JSON.parse(await readFile(join(fixture.metadataRoot, "metadata.json"), "utf8"));
    expect(metadata.releaseTargets.mac_arm64.shell).toEqual(platform.shell);

    await expect(execFileAsync(process.execPath, ["--experimental-strip-types", verifyMetadataPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        ENABLE_MAC_ARM64: "true",
        ENABLE_MAC_X64: "false",
        ENABLE_WIN_X64: "false",
        MAC_ARM64_RESULT: "success",
        RELEASE_CHANNEL: "beta",
        RELEASE_CLOSURE_REQUIRED: "true",
        RELEASE_METADATA_PATH: join(fixture.metadataRoot, "metadata.json"),
        RELEASE_SHELL_REQUIRED: "true",
        RELEASE_VERSION: "0.18.0-beta.4",
      },
    })).resolves.toMatchObject({
      stdout: expect.stringContaining("verified beta metadata"),
    });
  });

});
