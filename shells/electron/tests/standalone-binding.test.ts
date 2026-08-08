import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  CLOSURE_ARCHIVE_ENTRY_PATH,
  CLOSURE_ARCHIVE_MEDIA_TYPE,
  CLOSURE_INVENTORY_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  CLOSURE_SCHEMA_VERSION,
  bindClosureCandidateIdentity,
  type ClosureCandidateManifest,
} from "@open-design/closure-proto";
import {
  activateStoredClosureCandidate,
  armClosureRuntimeAttempt,
  confirmClosureRuntime,
  readClosureAttemptDescriptor,
  resolveClosureStorePaths,
  resolveClosureStoreVersionPaths,
} from "@open-design/closure-store";
import { afterEach, describe, expect, it } from "vitest";

import type { PackagedNamespacePaths } from "../src/paths.js";
import {
  confirmElectronStandaloneBinding,
  resolveElectronStandaloneBinding,
} from "../src/standalone-binding.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

function digest(value: string | Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function namespacePaths(root: string): PackagedNamespacePaths {
  const namespaceRoot = join(root, "namespaces", "release-beta");
  return {
    cacheRoot: join(namespaceRoot, "cache"),
    dataRoot: join(namespaceRoot, "data"),
    desktopIdentityPath: join(namespaceRoot, "runtime", "desktop-root.json"),
    desktopLogPath: join(namespaceRoot, "logs", "desktop", "latest.log"),
    desktopLogsRoot: join(namespaceRoot, "logs", "desktop"),
    electronSessionDataRoot: join(namespaceRoot, "user-data", "session"),
    electronUserDataRoot: join(namespaceRoot, "user-data"),
    installationRoot: root,
    installerObservationRoot: join(namespaceRoot, "installer"),
    logsRoot: join(namespaceRoot, "logs"),
    namespaceRoot,
    resourceRoot: join(root, "legacy-resources"),
    runtimeRoot: join(namespaceRoot, "runtime"),
    standaloneIdentityPath: join(namespaceRoot, "runtime", "standalone-root.json"),
    updateRoot: join(namespaceRoot, "updates"),
    webIdentityPath: join(namespaceRoot, "runtime", "web-root.json"),
  };
}

async function materialize(root: string, version: string, options: {
  confirm?: boolean;
  minShellVersion?: string;
} = {}) {
  const storePaths = resolveClosureStorePaths({
    channel: "beta",
    namespace: "release-beta",
    root,
  });
  const archive = Buffer.from(`archive:${version}`);
  const archiveDigest = digest(archive);
  const files = new Map<string, string>([
    [CLOSURE_ARCHIVE_ENTRY_PATH, "export async function handoff() {}\n"],
    ["resources/open-design/manifest.txt", "resources\n"],
  ]);
  const inventory = {
    files: [...files].map(([path, contents]) => ({
      digest: digest(contents),
      path,
      size: Buffer.byteLength(contents),
    })).sort((left, right) => left.path.localeCompare(right.path)),
    schemaVersion: CLOSURE_INVENTORY_SCHEMA_VERSION,
  };
  const manifest: ClosureCandidateManifest = {
    artifact: {
      digest: archiveDigest,
      entryPath: CLOSURE_ARCHIVE_ENTRY_PATH,
      inventoryDigest: digest(JSON.stringify(inventory.files)),
      mediaType: CLOSURE_ARCHIVE_MEDIA_TYPE,
      size: archive.byteLength,
      url: `https://releases.open-design.test/beta/closure/darwin-arm64/versions/${version}/closure.zip`,
    },
    compatibility: { shell: { minVersion: options.minShellVersion ?? "0.18.0-beta.1" } },
    identity: {
      channel: "beta",
      digest: archiveDigest,
      platform: "darwin-arm64",
      protocolVersion: CLOSURE_PROTOCOL_VERSION,
      version,
    },
    schemaVersion: CLOSURE_SCHEMA_VERSION,
  };
  const binding = bindClosureCandidateIdentity(manifest.identity, storePaths.namespace);
  const versionPaths = resolveClosureStoreVersionPaths(storePaths, binding);
  await mkdir(versionPaths.payloadRoot, { recursive: true });
  await writeFile(versionPaths.archivePath, archive);
  await writeFile(versionPaths.inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
  await writeFile(versionPaths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [path, contents] of files) {
    const target = join(versionPaths.payloadRoot, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  const activated = await activateStoredClosureCandidate(storePaths, binding);
  if (options.confirm === true) {
    await armClosureRuntimeAttempt(storePaths, activated.pointer);
    await confirmClosureRuntime(storePaths, activated.pointer);
  }
  return { activated, storePaths, versionPaths };
}

function input(root: string) {
  return {
    channel: "beta",
    installerRequiredVersion: null,
    namespace: "release-beta",
    paths: namespacePaths(root),
    releaseVersion: "0.18.0-beta.4",
    shellDigest: `sha256:${"a".repeat(64)}` as const,
    shellVersion: "0.18.0-beta.4",
  };
}

describe("Electron Standalone Store binding", () => {
  it("projects verified Store truth into one protocol-only handoff", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-electron-standalone-binding-"));
    roots.push(root);
    const candidate = await materialize(root, "0.18.0-beta.4");

    const selected = await resolveElectronStandaloneBinding(input(root), {
      arch: "arm64",
      platform: "darwin",
    });

    expect(selected.binding).toMatchObject({
      bootloaderPath: join(candidate.versionPaths.payloadRoot, "bootloader.mjs"),
      descriptor: {
        release: { version: "0.18.0-beta.4" },
        shell: { type: "electron", version: "0.18.0-beta.4" },
        standalone: { digest: candidate.activated.pointer.digest, version: "0.18.0-beta.4" },
      },
      paths: {
        installationRoot: candidate.versionPaths.payloadRoot,
        resourceRoot: join(candidate.versionPaths.payloadRoot, "resources", "open-design"),
      },
      scope: { channel: "beta", generation: 0, namespace: "release-beta" },
    });
    expect(await readClosureAttemptDescriptor(candidate.storePaths)).toMatchObject(candidate.activated.pointer);
    await confirmElectronStandaloneBinding(selected);
    expect(await readClosureAttemptDescriptor(candidate.storePaths)).toBeNull();
  });

  it("keeps the active Standalone version as release truth when no update was accepted", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-electron-standalone-release-fallback-"));
    roots.push(root);
    await materialize(root, "0.18.0-beta.6");

    const selected = await resolveElectronStandaloneBinding({
      ...input(root),
      releaseVersion: null,
    }, {
      arch: "arm64",
      platform: "darwin",
    });

    expect(selected.binding.descriptor).toMatchObject({
      release: { version: "0.18.0-beta.6" },
      shell: { version: "0.18.0-beta.4" },
      standalone: { version: "0.18.0-beta.6" },
    });
  });

  it("maps the min shell floor to installer-required before importing bootloader.mjs", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-electron-standalone-floor-"));
    roots.push(root);
    await materialize(root, "0.18.0-beta.5", { minShellVersion: "0.19.0" });

    await expect(resolveElectronStandaloneBinding(input(root), {
      arch: "arm64",
      platform: "darwin",
    })).rejects.toMatchObject({ code: "installer-required" });
  });

  it("maps a discovered installer floor before an empty Store can degrade to no-standalone", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-electron-standalone-empty-floor-"));
    roots.push(root);

    await expect(resolveElectronStandaloneBinding({
      ...input(root),
      installerRequiredVersion: "0.18.0-beta.7",
    }, {
      arch: "arm64",
      platform: "darwin",
    })).rejects.toMatchObject({
      code: "installer-required",
      message: "Standalone requires Electron Shell 0.18.0-beta.7 or newer",
    });
  });

  it("rolls an invalid active generation back once before creating the handoff", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-electron-standalone-rollback-"));
    roots.push(root);
    const previous = await materialize(root, "0.18.0-beta.3", { confirm: true });
    const broken = await materialize(root, "0.18.0-beta.4");
    await writeFile(join(broken.versionPaths.payloadRoot, "bootloader.mjs"), "tampered\n");

    const selected = await resolveElectronStandaloneBinding(input(root), {
      arch: "arm64",
      platform: "darwin",
    });

    expect(selected.pointer).toEqual(previous.activated.pointer);
    expect(selected.binding.scope.generation).toBe(previous.activated.pointer.generation);
  });
});
