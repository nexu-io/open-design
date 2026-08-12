import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  CLOSURE_ARCHIVE_ENTRY_PATH,
  CLOSURE_ARCHIVE_MEDIA_TYPE,
  CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  CLOSURE_INVENTORY_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  CLOSURE_SCHEMA_VERSION,
  bindClosureCandidateIdentity,
  createClosureComponentTreeDigest,
  createClosureDistributionManifest,
  type ClosureDistributionBlob,
  type ClosureCandidateManifest,
} from "@open-design/closure-proto";
import {
  commitStoredClosureCandidate,
  commitVerifiedClosureDistributionGeneration,
  planClosureDistributionGeneration,
  resolveClosureStorePaths,
  resolveClosureStoreVersionPaths,
  verifyMaterializedClosureDistributionGeneration,
} from "@open-design/closure-store";
import { afterEach, describe, expect, it } from "vitest";

import type { PackagedNamespacePaths } from "../src/paths.js";
import {
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
  minShellVersion?: string;
  releaseVersion?: string;
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
    compatibility: {
      shell: {
        electron: { version: { min: options.minShellVersion ?? "0.18.0-beta.1" } },
      },
    },
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
  const committed = await commitStoredClosureCandidate(
    storePaths,
    binding,
    options.releaseVersion ?? version,
  );
  return { committed, storePaths, versionPaths };
}

async function materializeDistribution(root: string) {
  const storePaths = resolveClosureStorePaths({
    channel: "beta",
    namespace: "release-beta",
    root,
  });
  const sources = {
    body: Buffer.from("body-archive"),
    launcher: Buffer.from("launcher-archive"),
    native: Buffer.from("native-archive"),
    runtime: Buffer.from("runtime-archive"),
  };
  const artifact = (bytes: Buffer): ClosureDistributionBlob => {
    const value = digest(bytes);
    return {
      digest: value,
      mediaType: "application/zip",
      size: bytes.byteLength,
      url: `https://releases.open-design.test/beta/blobs/${value.slice("sha256:".length)}`,
    };
  };
  const artifacts = Object.fromEntries(
    Object.entries(sources).map(([name, bytes]) => [name, artifact(bytes)]),
  ) as Record<keyof typeof sources, ClosureDistributionBlob>;
  const trees = {
    body: [["bootloader.mjs", "body\n"]],
    launcher: [["bootloader.mjs", "handoff\n"], ["launcher.mjs", "launcher\n"]],
    native: [["node_modules/addon/addon.node", "native\n"]],
    runtime: [["bin/node", "node\n"]],
  } as const;
  const treeDigest = (files: readonly (readonly [string, string])[]) => (
    createClosureComponentTreeDigest(files.map(([path, contents]) => ({
      digest: digest(contents),
      path,
      size: Buffer.byteLength(contents),
    })), digest)
  );
  const manifest = createClosureDistributionManifest({
    blobs: Object.fromEntries(Object.values(artifacts).map((value) => [value.digest, value])),
    compatibility: { shell: { electron: { version: { min: "0.18.0-beta.1" } } } },
    identity: {
      channel: "beta",
      protocolVersion: CLOSURE_PROTOCOL_VERSION,
      version: "0.19.0-beta.10",
    },
    required: {
      body: {
        blob: artifacts.body.digest,
        entryPath: "bootloader.mjs",
        treeDigest: treeDigest(trees.body),
      },
      launcher: {
        blob: artifacts.launcher.digest,
        entryPath: "launcher.mjs",
        handoffPath: "bootloader.mjs",
        treeDigest: treeDigest(trees.launcher),
      },
      targets: {
        "darwin-arm64": {
          native: { blob: artifacts.native.digest, treeDigest: treeDigest(trees.native) },
          runtime: {
            blob: artifacts.runtime.digest,
            entryPath: "bin/node",
            treeDigest: treeDigest(trees.runtime),
          },
        },
      },
    },
    resources: [],
    schemaVersion: CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  }, digest);
  const plan = planClosureDistributionGeneration(storePaths, 0, manifest, "darwin-arm64");
  await mkdir(storePaths.blobsRoot, { recursive: true });
  for (const [name, bytes] of Object.entries(sources)) {
    await writeFile(join(
      storePaths.blobsRoot,
      artifacts[name as keyof typeof sources].digest.slice("sha256:".length),
    ), bytes);
  }
  const stageRoot = join(storePaths.stagingRoot, "generation-0");
  for (const [component, files] of Object.entries(trees)) {
    for (const [path, contents] of files) {
      const target = join(stageRoot, component, ...path.split("/"));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents);
    }
  }
  await writeFile(join(stageRoot, "closure.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const verification = await verifyMaterializedClosureDistributionGeneration(
    storePaths,
    plan,
    stageRoot,
  );
  const committed = await commitVerifiedClosureDistributionGeneration(
    storePaths,
    verification,
    "0.19.0-beta.10",
  );
  return { committed, plan, storePaths };
}

function input(root: string) {
  return {
    channel: "beta",
    installerRequiredVersion: null,
    namespace: "release-beta",
    paths: namespacePaths(root),
    shellDigest: `sha256:${"a".repeat(64)}` as const,
    shellVersion: "0.18.0-beta.4",
  };
}

describe("Electron Standalone Store binding", () => {
  it("projects a verified layered generation through its launcher handoff entry", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-electron-layered-binding-"));
    roots.push(root);
    const candidate = await materializeDistribution(root);

    const selected = await resolveElectronStandaloneBinding({
      ...input(root),
      shellVersion: "0.19.0-beta.10",
    }, {
      arch: "arm64",
      platform: "darwin",
    });

    expect(selected.distribution).toEqual(candidate.plan);
    expect(selected.verification).toBeNull();
    expect(selected.binding.bootloaderPath).toBe(
      join(candidate.plan.installationRoot, "launcher", "bootloader.mjs"),
    );
    expect(selected.binding.paths.installationRoot).toBe(candidate.plan.installationRoot);
    expect(selected.binding.paths.resourceRoot).toBe(join(candidate.storePaths.channelRoot, "resources"));
  });

  it("projects verified Store truth into one protocol-only handoff", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-electron-standalone-binding-"));
    roots.push(root);
    const candidate = await materialize(root, "0.18.0-beta.4");

    const selected = await resolveElectronStandaloneBinding(input(root), {
      arch: "arm64",
      platform: "darwin",
    });

    expect(selected.binding).toMatchObject({
      attachment: {
        shell: { type: "electron", version: "0.18.0-beta.4" },
      },
      bootloaderPath: join(candidate.versionPaths.payloadRoot, "bootloader.mjs"),
      descriptor: {
        release: { version: "0.18.0-beta.4" },
        standalone: { digest: candidate.committed.committed.standalone.digest, version: "0.18.0-beta.4" },
      },
      paths: {
        installationRoot: candidate.versionPaths.payloadRoot,
        resourceRoot: join(candidate.versionPaths.payloadRoot, "resources", "open-design"),
      },
      scope: { channel: "beta", generation: 0, namespace: "release-beta" },
    });
    expect(selected.pointer).toEqual(candidate.committed.committed.standalone);
  });

  it("keeps the active Standalone version as release truth when no update was accepted", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-electron-standalone-release-fallback-"));
    roots.push(root);
    await materialize(root, "0.18.0-beta.6", { releaseVersion: "0.19.0-beta.1" });

    const selected = await resolveElectronStandaloneBinding({
      ...input(root),
    }, {
      arch: "arm64",
      platform: "darwin",
    });

    expect(selected.binding.descriptor).toMatchObject({
      release: { version: "0.19.0-beta.1" },
      standalone: { version: "0.18.0-beta.6" },
    });
    expect(selected.binding.attachment.shell.version).toBe("0.18.0-beta.4");
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

  it("fails visibly when the single committed generation is invalid", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-electron-standalone-rollback-"));
    roots.push(root);
    await materialize(root, "0.18.0-beta.3");
    const broken = await materialize(root, "0.18.0-beta.4");
    await writeFile(join(broken.versionPaths.payloadRoot, "bootloader.mjs"), "tampered\n");

    await expect(resolveElectronStandaloneBinding(input(root), {
      arch: "arm64",
      platform: "darwin",
    })).rejects.toMatchObject({ code: "standalone-invalid" });
  });
});
