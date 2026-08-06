import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CLOSURE_ARCHIVE_ENTRY_PATH,
  CLOSURE_ARCHIVE_MEDIA_TYPE,
  CLOSURE_INVENTORY_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  CLOSURE_SCHEMA_VERSION,
  bindClosureCandidateIdentity,
  type ClosureBindingIdentity,
  type ClosureCandidateManifest,
} from "@open-design/closure-proto";
import { afterEach, describe, expect, it } from "vitest";

import {
  activateStoredClosureCandidate,
  armClosureRuntimeAttempt,
  confirmClosureRuntime,
  readClosureAttemptDescriptor,
  readClosureRuntimeDescriptor,
  recoverClosureRuntime,
  resolveClosureStorePaths,
  resolveClosureStoreVersionPaths,
  verifyMaterializedClosureCandidate,
  verifyStoredClosureCandidate,
  type ClosureStorePaths,
} from "../src/index.js";

const roots: string[] = [];

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
    compatibility: { shell: { minVersion: "0.16.2" } },
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

describe("Closure store paths", () => {
  it("isolates state by channel and namespace without transport identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-closure-store-paths-"));
    roots.push(root);
    const beta = resolveClosureStorePaths({ channel: "beta", namespace: "release-beta", root });
    const preview = resolveClosureStorePaths({ channel: "preview", namespace: "release-preview", root });

    expect(beta.namespaceRoot).toBe(join(root, "closure", "channels", "beta", "namespaces", "release-beta"));
    expect(preview.namespaceRoot).not.toBe(beta.namespaceRoot);
    expect(JSON.stringify(beta)).not.toMatch(/port/iu);
  });

  it("rejects relative roots and unsafe namespaces", () => {
    expect(() => resolveClosureStorePaths({ channel: "beta", namespace: "release-beta", root: ".tmp" }))
      .toThrow(/absolute path/u);
    expect(() => resolveClosureStorePaths({ channel: "beta", namespace: "../beta", root: "/tmp/od" }))
      .toThrow();
  });
});

describe("stored Closure verification", () => {
  it("verifies archive identity and every materialized payload file", async () => {
    const paths = await createStore();
    const { binding } = await materializeCandidate(paths, "0.18.0-beta.1");

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
    await expect(activateStoredClosureCandidate(paths, binding)).rejects.toThrow(/archive does not match/u);

    await writeFile(versionPaths.archivePath, "archive:0.18.0-beta.1");
    await writeFile(join(versionPaths.payloadRoot, CLOSURE_ARCHIVE_ENTRY_PATH), "mutated");
    await expect(activateStoredClosureCandidate(paths, binding)).rejects.toThrow(/payload does not match/u);
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

    await expect(activateStoredClosureCandidate(paths, binding)).rejects.toThrow(/inventory does not match/u);
  });
});

describe("Closure activation lifecycle", () => {
  it("atomically activates, arms, and confirms the first candidate", async () => {
    const paths = await createStore();
    const { binding } = await materializeCandidate(paths, "0.18.0-beta.1");

    const activated = await activateStoredClosureCandidate(paths, binding);
    expect(activated.pointer.generation).toBe(0);
    expect(activated.descriptor.lastSuccessful).toBeNull();

    await armClosureRuntimeAttempt(paths, activated.pointer);
    expect(await readClosureAttemptDescriptor(paths)).toMatchObject(activated.pointer);

    const confirmed = await confirmClosureRuntime(paths, activated.pointer);
    expect(confirmed.active).toEqual(activated.pointer);
    expect(confirmed.lastSuccessful).toEqual(activated.pointer);
    expect(await readClosureAttemptDescriptor(paths)).toBeNull();
  });

  it("rolls a failed new generation back to the last successful candidate", async () => {
    const paths = await createStore();
    const first = await materializeCandidate(paths, "0.18.0-beta.1");
    const firstActivation = await activateStoredClosureCandidate(paths, first.binding);
    await armClosureRuntimeAttempt(paths, firstActivation.pointer);
    await confirmClosureRuntime(paths, firstActivation.pointer);

    const second = await materializeCandidate(paths, "0.18.0-beta.2");
    const secondActivation = await activateStoredClosureCandidate(paths, second.binding);
    await armClosureRuntimeAttempt(paths, secondActivation.pointer);

    const recovered = await recoverClosureRuntime(paths);
    expect(recovered.recovered).toBe(true);
    expect(recovered.selection).toEqual({
      pointer: firstActivation.pointer,
      reason: "last-successful",
      selected: true,
    });
    expect(recovered.descriptor.active).toEqual(firstActivation.pointer);
    expect(await readClosureAttemptDescriptor(paths)).toBeNull();
  });

  it("refuses to replace an unresolved runtime attempt", async () => {
    const paths = await createStore();
    const first = await materializeCandidate(paths, "0.18.0-beta.1");
    const firstActivation = await activateStoredClosureCandidate(paths, first.binding);
    await armClosureRuntimeAttempt(paths, firstActivation.pointer);
    const second = await materializeCandidate(paths, "0.18.0-beta.2");

    await expect(activateStoredClosureCandidate(paths, second.binding)).rejects.toThrow(/attempt is unresolved/u);
    expect((await readClosureRuntimeDescriptor(paths)).active).toEqual(firstActivation.pointer);
    expect(await readClosureAttemptDescriptor(paths)).toMatchObject(firstActivation.pointer);
  });

  it("settles a confirm that crashed after persisting success", async () => {
    const paths = await createStore();
    const candidate = await materializeCandidate(paths, "0.18.0-beta.1");
    const activated = await activateStoredClosureCandidate(paths, candidate.binding);
    const attempt = await armClosureRuntimeAttempt(paths, activated.pointer);
    await writeFile(paths.runtimePath, `${JSON.stringify({
      ...activated.descriptor,
      lastSuccessful: activated.pointer,
      updatedAt: new Date().toISOString(),
    })}\n`);

    const recovered = await recoverClosureRuntime(paths);
    expect(recovered.selection).toEqual({
      pointer: activated.pointer,
      reason: "last-successful",
      selected: true,
    });
    expect(recovered.descriptor.lastSuccessful).toEqual(activated.pointer);
    expect(await readClosureAttemptDescriptor(paths)).toBeNull();
    expect(attempt).toMatchObject(activated.pointer);
  });

  it("clears a failed first generation so a shell can use its legacy fallback", async () => {
    const paths = await createStore();
    const candidate = await materializeCandidate(paths, "0.18.0-beta.1");
    const activated = await activateStoredClosureCandidate(paths, candidate.binding);
    await armClosureRuntimeAttempt(paths, activated.pointer);

    const recovered = await recoverClosureRuntime(paths);
    expect(recovered.selection).toEqual({ reason: "no-runtime-target", selected: false });
    expect(recovered.descriptor.active).toBeNull();
    expect(recovered.descriptor.lastSuccessful).toBeNull();
  });

  it("removes a stale attempt without rolling back a different active generation", async () => {
    const paths = await createStore();
    const first = await materializeCandidate(paths, "0.18.0-beta.1");
    const firstActivation = await activateStoredClosureCandidate(paths, first.binding);

    const second = await materializeCandidate(paths, "0.18.0-beta.2");
    const secondActivation = await activateStoredClosureCandidate(paths, second.binding);
    await writeFile(paths.attemptsPath, `${JSON.stringify({
      ...firstActivation.pointer,
      schemaVersion: 1,
      startedAt: new Date().toISOString(),
    })}\n`);

    const recovered = await recoverClosureRuntime(paths);
    expect(recovered.selection).toEqual({
      pointer: secondActivation.pointer,
      reason: "active",
      selected: true,
    });
    expect(await readClosureAttemptDescriptor(paths)).toBeNull();
  });

  it("fails closed on transport fields or corrupt persisted state", async () => {
    const paths = await createStore();
    await mkdir(paths.stateRoot, { recursive: true });
    await writeFile(paths.runtimePath, `${JSON.stringify({
      active: null,
      channel: paths.channel,
      lastSuccessful: null,
      namespace: paths.namespace,
      nextGeneration: 0,
      port: 7456,
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
    })}\n`);

    await expect(readClosureRuntimeDescriptor(paths)).rejects.toThrow(/unsupported fields: port/u);

    await writeFile(paths.runtimePath, "{not-json");
    await expect(readClosureRuntimeDescriptor(paths)).rejects.toThrow(/unreadable/u);
  });

  it("keeps namespaces independent under one product root", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-closure-store-shared-"));
    roots.push(root);
    const left = resolveClosureStorePaths({ channel: "beta", namespace: "team-a", root });
    const right = resolveClosureStorePaths({ channel: "beta", namespace: "team-b", root });
    const leftCandidate = await materializeCandidate(left, "0.18.0-beta.1");
    const rightCandidate = await materializeCandidate(right, "0.18.0-beta.2");

    await activateStoredClosureCandidate(left, leftCandidate.binding);
    await activateStoredClosureCandidate(right, rightCandidate.binding);

    expect((await readClosureRuntimeDescriptor(left)).active?.version).toBe("0.18.0-beta.1");
    expect((await readClosureRuntimeDescriptor(right)).active?.version).toBe("0.18.0-beta.2");
    expect(await readFile(left.runtimePath, "utf8")).not.toContain("team-b");
  });

  it("does not reuse a failed generation after rollback", async () => {
    const paths = await createStore();
    const first = await materializeCandidate(paths, "0.18.0-beta.1");
    const firstActivation = await activateStoredClosureCandidate(paths, first.binding);
    await armClosureRuntimeAttempt(paths, firstActivation.pointer);
    await confirmClosureRuntime(paths, firstActivation.pointer);

    const second = await materializeCandidate(paths, "0.18.0-beta.2");
    const secondActivation = await activateStoredClosureCandidate(paths, second.binding);
    await armClosureRuntimeAttempt(paths, secondActivation.pointer);
    await recoverClosureRuntime(paths);

    const third = await materializeCandidate(paths, "0.18.0-beta.3");
    const thirdActivation = await activateStoredClosureCandidate(paths, third.binding);
    expect(firstActivation.pointer.generation).toBe(0);
    expect(secondActivation.pointer.generation).toBe(1);
    expect(thirdActivation.pointer.generation).toBe(2);
  });
});
