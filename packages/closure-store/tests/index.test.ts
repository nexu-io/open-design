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
  commitStoredClosureCandidate,
  commitVerifiedStoredClosureCandidate,
  readClosureBindingDescriptor,
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
    await expect(commitStoredClosureCandidate(paths, binding, "0.18.0-beta.1")).rejects.toThrow(/archive does not match/u);

    await writeFile(versionPaths.archivePath, "archive:0.18.0-beta.1");
    await writeFile(join(versionPaths.payloadRoot, CLOSURE_ARCHIVE_ENTRY_PATH), "mutated");
    await expect(commitStoredClosureCandidate(paths, binding, "0.18.0-beta.1")).rejects.toThrow(/payload does not match/u);
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

    await expect(commitStoredClosureCandidate(paths, binding, "0.18.0-beta.1")).rejects.toThrow(/inventory does not match/u);
  });
});

describe("Closure committed binding", () => {
  it("atomically commits one release-to-Standalone binding", async () => {
    const paths = await createStore();
    const { binding } = await materializeCandidate(paths, "0.18.0-beta.1");

    const result = await commitStoredClosureCandidate(paths, binding, "0.19.0-beta.1");

    expect(result.committed).toEqual({
      releaseVersion: "0.19.0-beta.1",
      standalone: { ...binding, generation: 0 },
    });
    expect(await readClosureBindingDescriptor(paths)).toEqual(result.descriptor);
    expect(paths.bindingPath).toMatch(/binding\.json$/u);
  });

  it("commits an atomically promoted candidate from its existing verification proof", async () => {
    const paths = await createStore();
    const { binding } = await materializeCandidate(paths, "0.18.0-beta.1");
    const verification = await verifyStoredClosureCandidate(paths, binding);

    const result = await commitVerifiedStoredClosureCandidate(paths, verification, "0.19.0-beta.1");

    expect(result.committed.standalone).toEqual({ ...binding, generation: 0 });
    await expect(commitVerifiedStoredClosureCandidate(paths, {
      ...verification,
      paths: { ...verification.paths, versionRoot: join(paths.stagingRoot, "candidate") },
    }, "0.19.0-beta.1")).rejects.toThrow(/verified Closure paths/u);
  });

  it("replaces the committed binding without retaining launch history", async () => {
    const paths = await createStore();
    const first = await materializeCandidate(paths, "0.18.0-beta.1");
    const second = await materializeCandidate(paths, "0.18.0-beta.2");

    const firstCommit = await commitStoredClosureCandidate(paths, first.binding, "0.19.0-beta.1");
    const secondCommit = await commitStoredClosureCandidate(paths, second.binding, "0.19.0-beta.2");

    expect(firstCommit.committed.standalone.generation).toBe(0);
    expect(secondCommit.committed.standalone.generation).toBe(1);
    expect(secondCommit.descriptor).not.toHaveProperty("active");
    expect(secondCommit.descriptor).not.toHaveProperty("attempt");
    expect(secondCommit.descriptor).not.toHaveProperty("lastSuccessful");
  });

  it("fails closed on transport fields or corrupt persisted state", async () => {
    const paths = await createStore();
    await mkdir(paths.stateRoot, { recursive: true });
    await writeFile(paths.bindingPath, `${JSON.stringify({
      channel: paths.channel,
      committed: null,
      namespace: paths.namespace,
      nextGeneration: 0,
      port: 7456,
      schemaVersion: 1,
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

    await commitStoredClosureCandidate(left, leftCandidate.binding, "0.19.0-beta.1");
    await commitStoredClosureCandidate(right, rightCandidate.binding, "0.19.0-beta.2");

    expect((await readClosureBindingDescriptor(left)).committed?.standalone.version).toBe("0.18.0-beta.1");
    expect((await readClosureBindingDescriptor(right)).committed?.standalone.version).toBe("0.18.0-beta.2");
    expect(await readFile(left.bindingPath, "utf8")).not.toContain("team-b");
  });
});
