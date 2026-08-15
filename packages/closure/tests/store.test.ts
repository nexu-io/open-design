import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  type ClosureBindingIdentity,
  type ClosureCandidateManifest,
  type ClosureDistributionBlob,
} from "@open-design/closure/protocol";
import { afterEach, describe, expect, it } from "vitest";

import {
  CLOSURE_BINDING_SCHEMA_VERSION,
  activatePreparedClosureBinding,
  authorizePreparedClosureActivation,
  beginActiveClosureBindingAttempt,
  confirmClosureBindingAttempt,
  prepareStoredClosureCandidate,
  prepareVerifiedClosureDistributionGeneration,
  prepareVerifiedStoredClosureCandidate,
  recoverInterruptedClosureBinding,
  cleanupClosureChannelGarbage,
  consumeClosureDistributionTarget,
  discardObsoleteClosureNamespaceEpochs,
  discardClosureStoreEntry,
  hasStoredClosureDistributionGeneration,
  planClosureDistributionGeneration,
  readClosureBindingDescriptor,
  revokePreparedClosureActivation,
  resolveClosureStorePaths,
  resolveClosureStoreVersionPaths,
  verifyMaterializedClosureCandidate,
  verifyMaterializedClosureDistributionGeneration,
  verifyStoredClosureCandidate,
  verifyStoredClosureDistributionGeneration,
  type ClosureStorePaths,
} from "../src/store/index.js";

const roots: string[] = [];
const shellBinding = {
  digest: `sha256:${"f".repeat(64)}` as const,
  type: "electron",
  version: "0.19.0-beta.1",
};
const distributionFixturePath = fileURLToPath(
  new URL("../fixtures/distribution-v4.json", import.meta.url),
);

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

function digest(bytes: string | Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function createStore(namespace = "release-beta"): Promise<ClosureStorePaths> {
  const root = await mkdtemp(join(tmpdir(), "od-closure-store-"));
  roots.push(root);
  return resolveClosureStorePaths({ channel: "beta", namespace, root });
}

async function materializeCandidate(
  paths: ClosureStorePaths,
  version: string,
): Promise<{ binding: ClosureBindingIdentity; manifest: ClosureCandidateManifest }> {
  const archive = Buffer.from(`archive:${version}`, "utf8");
  const archiveDigest = digest(archive);
  const runtime = "export const ready = true;\n";
  const web = "console.log('web');\n";
  const inventory = {
    files: [
      { digest: digest(runtime), path: CLOSURE_ARCHIVE_ENTRY_PATH, size: Buffer.byteLength(runtime) },
      { digest: digest(web), path: "web/server.js", size: Buffer.byteLength(web) },
    ],
    schemaVersion: CLOSURE_INVENTORY_SCHEMA_VERSION,
  };
  const inventoryDigest = digest(JSON.stringify(inventory.files));
  const manifest: ClosureCandidateManifest = {
    artifact: {
      digest: archiveDigest,
      entryPath: CLOSURE_ARCHIVE_ENTRY_PATH,
      inventoryDigest,
      mediaType: CLOSURE_ARCHIVE_MEDIA_TYPE,
      size: archive.byteLength,
      url: `https://releases.open-design.ai/beta/closure/darwin-arm64/versions/${version}/closure.zip`,
    },
    compatibility: { shell: { electron: { version: { min: "0.16.2" } } } },
    identity: {
      channel: "beta",
      digest: archiveDigest,
      platform: "darwin-arm64",
      protocolVersion: CLOSURE_PROTOCOL_VERSION,
      version,
    },
    schemaVersion: CLOSURE_SCHEMA_VERSION,
  };
  const binding = bindClosureCandidateIdentity(manifest.identity, paths.namespace);
  const versionPaths = resolveClosureStoreVersionPaths(paths, binding);
  await mkdir(join(versionPaths.payloadRoot, "web"), { recursive: true });
  await writeFile(versionPaths.archivePath, archive);
  await writeFile(versionPaths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(versionPaths.payloadRoot, CLOSURE_ARCHIVE_ENTRY_PATH), runtime);
  await writeFile(join(versionPaths.payloadRoot, "web", "server.js"), web);
  await writeFile(versionPaths.inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
  return { binding, manifest };
}

async function materializeDistributionGeneration(
  paths: ClosureStorePaths,
  generation: number,
) {
  const sources = {
    body: Buffer.from("body-archive"),
    launcher: Buffer.from("launcher-archive"),
    native: Buffer.from("native-archive"),
    resource: Buffer.from("resource-archive"),
  };
  const blob = (bytes: Buffer): ClosureDistributionBlob => {
    const value = digest(bytes);
    return {
      digest: value,
      mediaType: "application/zip",
      size: bytes.byteLength,
      url: `https://releases.open-design.test/beta/blobs/${value.slice("sha256:".length)}`,
    };
  };
  const artifacts = Object.fromEntries(
    Object.entries(sources).map(([name, bytes]) => [name, blob(bytes)]),
  ) as Record<keyof typeof sources, ClosureDistributionBlob>;
  const tree = (path: string, contents: string) => createClosureComponentTreeDigest([{
    digest: digest(contents),
    path,
    size: Buffer.byteLength(contents),
  }], digest);
  const launcherFiles = [
    ["bootloader.mjs", "export const handoff = true;\n"],
    ["launcher.mjs", "export const launcher = true;\n"],
  ] as const;
  const trees = {
    body: tree("bootloader.mjs", "export const body = true;\n"),
    launcher: createClosureComponentTreeDigest(launcherFiles.map(([path, contents]) => ({
      digest: digest(contents),
      path,
      size: Buffer.byteLength(contents),
    })), digest),
    native: tree("addon.node", "native\n"),
    resource: tree("skills/sample/SKILL.md", "resource\n"),
  };
  const manifest = createClosureDistributionManifest({
    blobs: Object.fromEntries(Object.values(artifacts).map((artifact) => [artifact.digest, artifact])),
    compatibility: { shell: { electron: { version: { min: "0.19.0" } } } },
    identity: {
      channel: "beta",
      protocolVersion: CLOSURE_PROTOCOL_VERSION,
      version: "0.19.0-beta.10",
    },
    required: {
      body: { blob: artifacts.body.digest, entryPath: "bootloader.mjs", treeDigest: trees.body },
      launcher: {
        blob: artifacts.launcher.digest,
        entryPath: "launcher.mjs",
        handoffPath: "bootloader.mjs",
        treeDigest: trees.launcher,
      },
      targets: {
        "darwin-arm64": {
          native: { blob: artifacts.native.digest, treeDigest: trees.native },
        },
      },
    },
    resources: [{
      blob: artifacts.resource.digest,
      id: "skills",
      startup: "lazy",
      title: "Skills",
      treeDigest: trees.resource,
    }],
    schemaVersion: CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  }, digest);
  const plan = planClosureDistributionGeneration(paths, generation, manifest, "darwin-arm64");
  await mkdir(paths.blobsRoot, { recursive: true });
  for (const [name, bytes] of Object.entries(sources)) {
    if (name === "resource") continue;
    await writeFile(join(paths.blobsRoot, artifacts[name as keyof typeof sources].digest.slice("sha256:".length)), bytes);
  }
  const stageRoot = join(paths.stagingRoot, `generation-${generation}`);
  await mkdir(join(stageRoot, "body"), { recursive: true });
  await mkdir(join(stageRoot, "launcher"), { recursive: true });
  await mkdir(join(stageRoot, "native"), { recursive: true });
  await writeFile(join(stageRoot, "body", "bootloader.mjs"), "export const body = true;\n");
  await writeFile(join(stageRoot, "launcher", "launcher.mjs"), "export const launcher = true;\n");
  await writeFile(join(stageRoot, "launcher", "bootloader.mjs"), "export const handoff = true;\n");
  await writeFile(join(stageRoot, "native", "addon.node"), "native\n");
  await writeFile(join(stageRoot, "closure.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { artifacts, manifest, plan, stageRoot };
}

describe("Closure store paths", () => {
  it("isolates state by channel and namespace without transport identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-closure-store-paths-"));
    roots.push(root);
    const beta = resolveClosureStorePaths({ channel: "beta", namespace: "release-beta", root });
    const preview = resolveClosureStorePaths({ channel: "preview", namespace: "release-preview", root });

    expect(beta.namespaceRoot).toBe(join(root, "closure", "channels", "beta", "epochs", "4", "namespaces", "release-beta"));
    expect(preview.namespaceRoot).not.toBe(beta.namespaceRoot);
    expect(JSON.stringify(beta)).not.toMatch(/port/iu);
  });

  it("isolates the reserved local coordination domain from public channels", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-closure-store-local-paths-"));
    roots.push(root);
    const local = resolveClosureStorePaths({ channel: "local", namespace: "local-transactional", root });
    const beta = resolveClosureStorePaths({ channel: "beta", namespace: "local-transactional", root });

    expect(local.channelRoot).toBe(join(root, "closure", "channels", "local"));
    expect(local.namespaceRoot).not.toBe(beta.namespaceRoot);
  });

  it("rejects relative roots and unsafe namespaces", () => {
    expect(() => resolveClosureStorePaths({ channel: "beta", namespace: "release-beta", root: ".tmp" }))
      .toThrow(/absolute path/u);
    expect(() => resolveClosureStorePaths({ channel: "beta", namespace: "../beta", root: "/tmp/od" }))
      .toThrow();
  });
});

describe("Closure channel garbage black hole", () => {
  it("atomically transfers an arbitrary channel entry without preserving its structure", async () => {
    const paths = await createStore();
    const sourcePath = join(paths.resourcesRoot, "resource-key", "nested");
    await mkdir(sourcePath, { recursive: true });
    await writeFile(join(sourcePath, "payload.bin"), "garbage");

    const discarded = await discardClosureStoreEntry({ paths, sourcePath });

    expect(discarded.state).toBe("discarded");
    await expect(stat(sourcePath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(discarded.garbagePath, "payload.bin"), "utf8")).resolves.toBe("garbage");
    expect(dirname(discarded.garbagePath)).toBe(paths.garbageRoot);
    expect(discarded.garbagePath).not.toContain("resource-key");
    await expect(discardClosureStoreEntry({ paths, sourcePath: discarded.garbagePath }))
      .rejects.toThrow(/already inside/u);
  });

  it("drains opaque files and directories within a bounded number of entries", async () => {
    const paths = await createStore();
    await mkdir(join(paths.garbageRoot, "directory"), { recursive: true });
    await writeFile(join(paths.garbageRoot, "directory", "nested"), "nested");
    await writeFile(join(paths.garbageRoot, "file"), "file");

    const first = await cleanupClosureChannelGarbage({
      maxDurationMs: 10_000,
      maxEntries: 1,
      paths,
    });
    expect(first).toMatchObject({ attempted: 1, busy: false, remaining: 1, removed: 1 });

    const second = await cleanupClosureChannelGarbage({
      maxDurationMs: 10_000,
      maxEntries: 16,
      paths,
    });
    expect(second).toMatchObject({ attempted: 1, busy: false, remaining: 0, removed: 1 });
  });

  it("discards obsolete namespace epochs only after the current binding is confirmed", async () => {
    const paths = await createStore();
    const obsoleteNamespaceRoot = join(paths.channelRoot, "epochs", "3", "namespaces", paths.namespace);
    await mkdir(obsoleteNamespaceRoot, { recursive: true });
    await writeFile(join(obsoleteNamespaceRoot, "obsolete.bin"), "obsolete");

    expect(await discardObsoleteClosureNamespaceEpochs(paths)).toEqual({
      discarded: 0,
      state: "deferred",
    });
    const candidate = await materializeCandidate(paths, "0.19.0-beta.1");
    const prepared = await prepareStoredClosureCandidate(paths, candidate.binding, "0.19.0-beta.1");
    await authorizePreparedClosureActivation(paths, prepared.prepared, "user-restart");
    await activatePreparedClosureBinding(paths, prepared.prepared, shellBinding);
    await confirmClosureBindingAttempt(paths, prepared.prepared);

    expect(await discardObsoleteClosureNamespaceEpochs(paths)).toEqual({
      discarded: 1,
      state: "discarded",
    });
    await expect(stat(obsoleteNamespaceRoot)).rejects.toMatchObject({ code: "ENOENT" });
    const garbageEntries = await readdir(paths.garbageRoot);
    expect(garbageEntries).toHaveLength(1);
    await expect(readFile(join(paths.garbageRoot, garbageEntries[0]!, "obsolete.bin"), "utf8"))
      .resolves.toBe("obsolete");
  });
});

describe("layered Closure distribution consumer", () => {
  it("accepts the producer fixture and resolves only one target's cold-start set", async () => {
    const fixture = JSON.parse(await readFile(distributionFixturePath, "utf8")) as unknown;
    const consumed = consumeClosureDistributionTarget(fixture, "win32-x64");

    expect(consumed.manifest.identity).toMatchObject({
      channel: "beta",
      version: "0.19.0-beta.10",
    });
    expect(consumed.target.required.native).toEqual(
      consumed.manifest.required.targets["win32-x64"]?.native,
    );
    expect(consumed.target.resources).toEqual([
      expect.objectContaining({ id: "design-system-core", title: "Open Design Core" }),
    ]);
    expect(consumed.target.requiredBlobs).toHaveLength(3);
    expect(consumed.target.requiredBlobs.map((blob) => blob.digest)).not.toContain(
      consumed.target.resources[0]?.blob,
    );
  });

  it("rejects a valid-looking graph whose sealed identity was mutated", async () => {
    const fixture = JSON.parse(await readFile(distributionFixturePath, "utf8")) as {
      identity: Record<string, unknown>;
    };

    expect(() => consumeClosureDistributionTarget({
      ...fixture,
      identity: { ...fixture.identity, version: "0.19.0-beta.11" },
    }, "win32-x64")).toThrow(/canonical digest/u);
  });

  it("plans one active generation view while resources remain lazy channel blobs", async () => {
    const fixture = JSON.parse(await readFile(distributionFixturePath, "utf8")) as unknown;
    const root = await mkdtemp(join(tmpdir(), "od-closure-store-plan-"));
    roots.push(root);
    const left = resolveClosureStorePaths({ channel: "beta", namespace: "team-a", root });
    const right = resolveClosureStorePaths({ channel: "beta", namespace: "team-b", root });

    const leftPlan = planClosureDistributionGeneration(left, 7, fixture, "darwin-arm64");
    const rightPlan = planClosureDistributionGeneration(right, 2, fixture, "darwin-arm64");

    expect(leftPlan.installationRoot).toBe(join(
      left.installationsRoot,
      leftPlan.identity.version,
      leftPlan.identity.digest.slice("sha256:".length),
      leftPlan.target,
    ));
    expect(leftPlan.required.body.resolvedEntryPath).toBe(
      join(leftPlan.installationRoot, "body", "bootloader.mjs"),
    );
    expect(leftPlan.required.launcher.resolvedEntryPath).toBe(
      join(leftPlan.installationRoot, "launcher", "launcher.mjs"),
    );
    expect(leftPlan.required.native.componentRoot).toBe(join(leftPlan.installationRoot, "native"));
    expect(leftPlan.requiredBlobPaths).toHaveLength(3);
    expect(leftPlan.resources).toEqual([
      expect.objectContaining({ id: "design-system-core", title: "Open Design Core" }),
    ]);
    expect(leftPlan.requiredBlobPaths).not.toContain(leftPlan.resources[0]?.blobPath);
    expect(leftPlan.resources[0]?.blobPath).toBe(rightPlan.resources[0]?.blobPath);
    expect(leftPlan.required.body.blobPath).toBe(rightPlan.required.body.blobPath);
    expect(leftPlan.installationRoot).not.toBe(rightPlan.installationRoot);
  });

  it("rejects a distribution from another channel before planning local paths", async () => {
    const fixture = JSON.parse(await readFile(distributionFixturePath, "utf8")) as unknown;
    const paths = resolveClosureStorePaths({
      channel: "preview",
      namespace: "release-preview",
      root: "/tmp/open-design-closure-plan",
    });

    expect(() => planClosureDistributionGeneration(paths, 0, fixture, "darwin-arm64"))
      .toThrow(/channel does not match/u);
    expect(() => planClosureDistributionGeneration(paths, -1, fixture, "darwin-arm64"))
      .toThrow(/non-negative safe integer/u);
  });
});

describe("layered Closure generation preparation", () => {
  it("publishes exactly one verified generation while lazy resources stay outside the cold view", async () => {
    const paths = await createStore();
    const staged = await materializeDistributionGeneration(paths, 0);

    const verification = await verifyMaterializedClosureDistributionGeneration(
      paths,
      staged.plan,
      staged.stageRoot,
    );
    const result = await prepareVerifiedClosureDistributionGeneration(
      paths,
      verification,
      "0.19.0-beta.10",
    );

    expect(result.prepared.standalone).toEqual({
      channel: "beta",
      digest: staged.manifest.identity.digest,
      generation: 0,
      namespace: "release-beta",
      protocolVersion: CLOSURE_PROTOCOL_VERSION,
      target: "darwin-arm64",
      version: "0.19.0-beta.10",
    });
    expect(result.descriptor.schemaVersion).toBe(CLOSURE_BINDING_SCHEMA_VERSION);
    expect((await stat(staged.plan.required.body.resolvedEntryPath)).isFile()).toBe(true);
    expect(await stat(staged.stageRoot).catch(() => null)).toBeNull();
    expect(await stat(staged.plan.resources[0]!.blobPath).catch(() => null)).toBeNull();
    expect(await readClosureBindingDescriptor(paths)).toEqual(result.descriptor);

    const stored = await verifyStoredClosureDistributionGeneration(
      paths,
      result.prepared.standalone,
    );
    expect(stored.materializedRoot).toBe(staged.plan.storeRoot);
    expect(stored.plan.required.native.componentRoot).toBe(
      join(staged.plan.storeRoot, "native"),
    );
    await expect(hasStoredClosureDistributionGeneration(
      paths,
      result.prepared.standalone,
    )).resolves.toBe(true);
  });

  it("rejects a prepared pointer whose content-addressed installation drifted", async () => {
    const paths = await createStore();
    const staged = await materializeDistributionGeneration(paths, 0);
    const verification = await verifyMaterializedClosureDistributionGeneration(
      paths,
      staged.plan,
      staged.stageRoot,
    );
    const result = await prepareVerifiedClosureDistributionGeneration(
      paths,
      verification,
      "0.19.0-beta.10",
    );
    await writeFile(join(staged.plan.required.native.componentRoot, "addon.node"), "tampered-native");

    await expect(verifyStoredClosureDistributionGeneration(
      paths,
      result.prepared.standalone,
    )).rejects.toThrow(/native/u);
  });

  it("fails closed before rename when a required CAS blob or view shape drifts", async () => {
    const paths = await createStore();
    const staged = await materializeDistributionGeneration(paths, 0);
    await writeFile(staged.plan.required.native.blobPath, "corrupt-native");

    await expect(verifyMaterializedClosureDistributionGeneration(
      paths,
      staged.plan,
      staged.stageRoot,
    )).rejects.toThrow(/native blob does not match/u);
    expect((await readClosureBindingDescriptor(paths)).prepared).toBeNull();

    await writeFile(staged.plan.required.native.blobPath, Buffer.from("native-archive"));
    await mkdir(join(staged.stageRoot, "resources"));
    await expect(verifyMaterializedClosureDistributionGeneration(
      paths,
      staged.plan,
      staged.stageRoot,
    )).rejects.toThrow(/top-level shape/u);
    expect((await readClosureBindingDescriptor(paths)).prepared).toBeNull();
  });
});

describe("stored Closure verification", () => {
  it("verifies archive identity and every materialized payload file", async () => {
    const paths = await createStore();
    const { binding } = await materializeCandidate(paths, "0.18.0-beta.1");
    const { platform, ...pointerIdentity } = binding;
    await expect(hasStoredClosureDistributionGeneration(paths, {
      ...pointerIdentity,
      generation: 0,
      target: platform,
    })).resolves.toBe(false);

    const verified = await verifyStoredClosureCandidate(paths, binding);

    expect(verified.binding).toEqual(binding);
    expect(verified.inventory.files.map((file) => file.path)).toEqual([
      CLOSURE_ARCHIVE_ENTRY_PATH,
      "web/server.js",
    ]);
    expect(verified.inventoryDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it("verifies an isolated staging tree before it becomes a version root", async () => {
    const paths = await createStore();
    const { binding } = await materializeCandidate(paths, "0.18.0-beta.1");
    const finalPaths = resolveClosureStoreVersionPaths(paths, binding);
    const stageRoot = join(paths.stagingRoot, "candidate");
    const stagedPaths = {
      ...finalPaths,
      archivePath: join(stageRoot, "closure.zip"),
      inventoryPath: join(stageRoot, "inventory.json"),
      manifestPath: join(stageRoot, "manifest.json"),
      payloadRoot: join(stageRoot, "payload"),
      versionRoot: stageRoot,
    };
    await mkdir(paths.stagingRoot, { recursive: true });
    await cp(finalPaths.versionRoot, stageRoot, { recursive: true });

    const verified = await verifyMaterializedClosureCandidate(paths, binding, stagedPaths);

    expect(verified.paths.versionRoot).toBe(stageRoot);
    expect(verified.binding).toEqual(binding);
  });

  it("refuses archive or payload drift before activation", async () => {
    const paths = await createStore();
    const { binding } = await materializeCandidate(paths, "0.18.0-beta.1");
    const versionPaths = resolveClosureStoreVersionPaths(paths, binding);

    await writeFile(versionPaths.archivePath, "corrupt");
    await expect(prepareStoredClosureCandidate(paths, binding, "0.18.0-beta.1")).rejects.toThrow(/archive does not match/u);

    await writeFile(versionPaths.archivePath, "archive:0.18.0-beta.1");
    await writeFile(join(versionPaths.payloadRoot, CLOSURE_ARCHIVE_ENTRY_PATH), "mutated");
    await expect(prepareStoredClosureCandidate(paths, binding, "0.18.0-beta.1")).rejects.toThrow(/payload does not match/u);
  });

  it("refuses a self-consistent replacement inventory not bound by the manifest", async () => {
    const paths = await createStore();
    const { binding } = await materializeCandidate(paths, "0.18.0-beta.1");
    const versionPaths = resolveClosureStoreVersionPaths(paths, binding);
    const replacement = "replacement payload\n";
    await writeFile(join(versionPaths.payloadRoot, CLOSURE_ARCHIVE_ENTRY_PATH), replacement);
    const inventory = JSON.parse(await readFile(versionPaths.inventoryPath, "utf8")) as {
      files: Array<{ digest: string; path: string; size: number }>;
      schemaVersion: number;
    };
    const entry = inventory.files.find((file) => file.path === CLOSURE_ARCHIVE_ENTRY_PATH);
    if (entry == null) throw new Error("test inventory entry missing");
    entry.digest = digest(replacement);
    entry.size = Buffer.byteLength(replacement);
    await writeFile(versionPaths.inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);

    await expect(prepareStoredClosureCandidate(paths, binding, "0.18.0-beta.1")).rejects.toThrow(/inventory does not match/u);
  });
});

describe("Closure prepared binding", () => {
  it("ignores legacy boolean authorization and binds new intent to the prepared candidate", async () => {
    const paths = await createStore();
    await mkdir(paths.stateRoot, { recursive: true });
    await writeFile(paths.bindingPath, `${JSON.stringify({
      active: null,
      activationAuthorized: true,
      attempt: null,
      channel: paths.channel,
      lastSuccessful: null,
      namespace: paths.namespace,
      nextGeneration: 0,
      prepared: null,
      schemaVersion: 4,
      updatedAt: new Date().toISOString(),
    })}\n`);

    const legacy = await readClosureBindingDescriptor(paths);
    expect(legacy.activationIntent).toBeNull();
    expect(JSON.parse(await readFile(paths.bindingPath, "utf8"))).toMatchObject({
      activationAuthorized: false,
      schemaVersion: 4,
    });

    const candidate = await materializeCandidate(paths, "0.18.0-beta.1");
    const prepared = await prepareStoredClosureCandidate(paths, candidate.binding, "0.19.0-beta.1");
    await authorizePreparedClosureActivation(paths, prepared.prepared, "silent-policy");
    expect((await readClosureBindingDescriptor(paths)).activationIntent).toEqual({
      ...prepared.prepared,
      source: "silent-policy",
    });
    expect(JSON.parse(await readFile(paths.bindingPath, "utf8"))).toMatchObject({
      activationAuthorized: true,
      schemaVersion: 4,
    });
    expect(await readFile(paths.bindingPath, "utf8")).not.toContain("activationIntent");
    expect(JSON.parse(await readFile(paths.activationIntentPath, "utf8"))).toMatchObject({
      intent: { ...prepared.prepared, source: "silent-policy" },
      schemaVersion: 1,
    });
    await revokePreparedClosureActivation(paths, "silent-policy");
    expect((await readClosureBindingDescriptor(paths)).activationIntent).toBeNull();
    await expect(readFile(paths.activationIntentPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("repairs the transitional schema before an immutable schema-4 launcher reads it", async () => {
    const paths = await createStore();
    const candidate = await materializeCandidate(paths, "0.18.0-beta.1");
    const prepared = await prepareStoredClosureCandidate(paths, candidate.binding, "0.19.0-beta.10");
    const intent = { ...prepared.prepared, source: "user-restart" as const };
    await writeFile(paths.bindingPath, `${JSON.stringify({
      ...prepared.descriptor,
      activationIntent: intent,
      schemaVersion: 5,
    })}\n`);

    expect((await readClosureBindingDescriptor(paths)).activationIntent).toEqual(intent);

    const repaired = JSON.parse(await readFile(paths.bindingPath, "utf8")) as Record<string, unknown>;
    expect(repaired).toMatchObject({ activationAuthorized: true, schemaVersion: 4 });
    expect(repaired).not.toHaveProperty("activationIntent");
    expect(Object.keys(repaired).sort()).toEqual([
      "activationAuthorized",
      "active",
      "attempt",
      "channel",
      "lastSuccessful",
      "namespace",
      "nextGeneration",
      "prepared",
      "schemaVersion",
      "updatedAt",
    ]);
    expect(JSON.parse(await readFile(paths.activationIntentPath, "utf8"))).toMatchObject({
      intent,
      schemaVersion: 1,
    });
  });

  it("confirms a healthy attempt and rolls an interrupted attempt back to it", async () => {
    const paths = await createStore();
    const first = await materializeCandidate(paths, "0.18.0-beta.1");
    const second = await materializeCandidate(paths, "0.18.0-beta.2");
    const initial = await prepareStoredClosureCandidate(paths, first.binding, "0.19.0-beta.1");

    await authorizePreparedClosureActivation(paths, initial.prepared, "user-restart");
    await activatePreparedClosureBinding(paths, initial.prepared, shellBinding);
    await confirmClosureBindingAttempt(paths, initial.prepared);

    await beginActiveClosureBindingAttempt(paths, initial.prepared, {
      ...shellBinding,
      version: "0.19.0-beta.2",
    });
    await recoverInterruptedClosureBinding(paths);

    const update = await prepareStoredClosureCandidate(paths, second.binding, "0.19.0-beta.2");
    await authorizePreparedClosureActivation(paths, update.prepared, "silent-policy");
    await activatePreparedClosureBinding(paths, update.prepared, shellBinding);
    await recoverInterruptedClosureBinding(paths);

    const descriptor = await readClosureBindingDescriptor(paths);
    expect(descriptor.active).toEqual({ ...initial.prepared, shell: shellBinding });
    expect(descriptor.lastSuccessful).toEqual({ ...initial.prepared, shell: shellBinding });
    expect(descriptor.attempt).toBeNull();
    expect(descriptor.prepared).toBeNull();
    expect(descriptor.activationIntent).toBeNull();
  });

  it("atomically prepares one release-to-Standalone binding", async () => {
    const paths = await createStore();
    const { binding } = await materializeCandidate(paths, "0.18.0-beta.1");

    const result = await prepareStoredClosureCandidate(paths, binding, "0.19.0-beta.1");

    expect(result.prepared).toEqual({
      releaseVersion: "0.19.0-beta.1",
      standalone: {
        channel: binding.channel,
        digest: binding.digest,
        generation: 0,
        namespace: binding.namespace,
        protocolVersion: binding.protocolVersion,
        target: binding.platform,
        version: binding.version,
      },
    });
    expect(await readClosureBindingDescriptor(paths)).toEqual(result.descriptor);
    expect(paths.bindingPath).toMatch(/binding\.json$/u);
  });

  it("prepares an atomically promoted candidate from its existing verification proof", async () => {
    const paths = await createStore();
    const { binding } = await materializeCandidate(paths, "0.18.0-beta.1");
    const verification = await verifyStoredClosureCandidate(paths, binding);

    const result = await prepareVerifiedStoredClosureCandidate(paths, verification, "0.19.0-beta.1");

    expect(result.prepared.standalone).toEqual({
      channel: binding.channel,
      digest: binding.digest,
      generation: 0,
      namespace: binding.namespace,
      protocolVersion: binding.protocolVersion,
      target: binding.platform,
      version: binding.version,
    });
    await expect(prepareVerifiedStoredClosureCandidate(paths, {
      ...verification,
      paths: { ...verification.paths, versionRoot: join(paths.stagingRoot, "candidate") },
    }, "0.19.0-beta.1")).rejects.toThrow(/verified Closure paths/u);
  });

  it("replaces the prepared binding without changing launch history", async () => {
    const paths = await createStore();
    const first = await materializeCandidate(paths, "0.18.0-beta.1");
    const second = await materializeCandidate(paths, "0.18.0-beta.2");

    const firstCommit = await prepareStoredClosureCandidate(paths, first.binding, "0.19.0-beta.1");
    const secondCommit = await prepareStoredClosureCandidate(paths, second.binding, "0.19.0-beta.2");

    expect(firstCommit.prepared.standalone.generation).toBe(0);
    expect(secondCommit.prepared.standalone.generation).toBe(1);
    expect(secondCommit.descriptor.active).toBeNull();
    expect(secondCommit.descriptor.lastSuccessful).toBeNull();
  });

  it("fails closed on transport fields or corrupt persisted state", async () => {
    const paths = await createStore();
    await mkdir(paths.stateRoot, { recursive: true });
    await writeFile(paths.bindingPath, `${JSON.stringify({
      channel: paths.channel,
      active: null,
      attempt: null,
      activationAuthorized: false,
      lastSuccessful: null,
      namespace: paths.namespace,
      nextGeneration: 0,
      port: 7456,
      prepared: null,
      schemaVersion: 4,
      updatedAt: new Date().toISOString(),
    })}\n`);

    await expect(readClosureBindingDescriptor(paths)).rejects.toThrow(/unsupported fields: port/u);

    await writeFile(paths.bindingPath, "{not-json");
    await expect(readClosureBindingDescriptor(paths)).rejects.toThrow(/unreadable/u);
  });

  it("keeps namespaces independent under one product root", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-closure-store-shared-"));
    roots.push(root);
    const left = resolveClosureStorePaths({ channel: "beta", namespace: "team-a", root });
    const right = resolveClosureStorePaths({ channel: "beta", namespace: "team-b", root });
    const leftCandidate = await materializeCandidate(left, "0.18.0-beta.1");
    const rightCandidate = await materializeCandidate(right, "0.18.0-beta.2");

    await prepareStoredClosureCandidate(left, leftCandidate.binding, "0.19.0-beta.1");
    await prepareStoredClosureCandidate(right, rightCandidate.binding, "0.19.0-beta.2");

    expect((await readClosureBindingDescriptor(left)).prepared?.standalone.version).toBe("0.18.0-beta.1");
    expect((await readClosureBindingDescriptor(right)).prepared?.standalone.version).toBe("0.18.0-beta.2");
    expect(await readFile(left.bindingPath, "utf8")).not.toContain("team-b");
  });
});
