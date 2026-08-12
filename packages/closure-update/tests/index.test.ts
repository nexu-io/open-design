import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CLOSURE_ARCHIVE_ENTRY_PATH,
  CLOSURE_ARCHIVE_MEDIA_TYPE,
  CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  CLOSURE_INVENTORY_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  CLOSURE_SCHEMA_VERSION,
  createClosureComponentTreeDigest,
  createClosureDistributionManifest,
  type ClosureCandidateManifest,
  type ClosureDistributionBlob,
} from "@open-design/closure-proto";
import {
  readClosureBindingDescriptor,
  resolveClosureStorePaths,
  verifyStoredClosureCandidate,
  type ClosureStorePaths,
} from "@open-design/closure-store";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ClosureBindingDescriptor,
  ClosureRuntimePointer,
} from "@open-design/closure-store";

import {
  ClosureUpdateError,
  applyClosureDistributionUpdate,
  applyClosureUpdate,
  compareClosureShellVersions,
  decideClosureUpdate,
  discoverClosureDistributionReleaseCandidate,
  discoverClosureReleaseCandidate,
  ensureClosureDistributionBlob,
  readClosureResourceRepositoryConfig,
  selectClosureDistributionReleaseCandidate,
  selectClosureReleaseCandidate,
  updateClosureFromRelease,
  type ClosureReleaseCandidate,
  type ClosureDistributionReleaseCandidate,
} from "../src/index.js";

const DIGEST = `sha256:${"a".repeat(64)}` as const;
const OTHER_DIGEST = `sha256:${"b".repeat(64)}` as const;
const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

function digest(bytes: string | Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

describe("Closure resource repository", () => {
  it("loads and freezes source policy without accepting a version map", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-closure-resource-config-"));
    roots.push(root);
    const configPath = join(root, "repository.json");
    await writeFile(configPath, JSON.stringify({
      localSeeds: [{ root: join(root, "seed") }],
      remoteOrigins: ["https://mirror.example.test/open-design/"],
      schemaVersion: 1,
    }));
    const config = await readClosureResourceRepositoryConfig({
      OD_CLOSURE_RESOURCE_REPOSITORY_V1: configPath,
    });
    expect(config).toEqual({
      localSeeds: [{ root: join(root, "seed") }],
      remoteOrigins: ["https://mirror.example.test/open-design"],
      schemaVersion: 1,
    });
    expect(Object.isFrozen(config)).toBe(true);
    await writeFile(configPath, JSON.stringify({
      localSeeds: [],
      remoteOrigins: [],
      schemaVersion: 1,
      versions: {},
    }));
    await expect(readClosureResourceRepositoryConfig({
      OD_CLOSURE_RESOURCE_REPOSITORY_V1: configPath,
    })).rejects.toThrow(/unsupported fields/u);
  });

  it("prefers a valid local seed and falls through corrupt seed and remote mirror", async () => {
    const paths = await createStore();
    const validRoot = join(paths.root, "valid-seed");
    const corruptRoot = join(paths.root, "corrupt-seed");
    const bytes = Buffer.from("closure-resource-blob");
    const artifact: ClosureDistributionBlob = {
      digest: digest(bytes),
      mediaType: "application/zip",
      size: bytes.byteLength,
      url: "https://default.example.test/beta/blobs/default",
    };
    const name = artifact.digest.slice("sha256:".length);
    await mkdir(join(validRoot, "beta", "blobs"), { recursive: true });
    await mkdir(join(corruptRoot, "beta", "blobs"), { recursive: true });
    await writeFile(join(validRoot, "beta", "blobs", name), bytes);
    await writeFile(join(corruptRoot, "beta", "blobs", name), "corrupt");
    const fetch = vi.fn(async () => new Response("network must not run", { status: 500 })) as typeof globalThis.fetch;

    await expect(ensureClosureDistributionBlob({
      artifact,
      fetch,
      paths,
      repository: {
        localSeeds: [{ root: corruptRoot }, { root: validRoot }],
        remoteOrigins: ["https://mirror.example.test"],
        schemaVersion: 1,
      },
    })).resolves.toBe(join(paths.blobsRoot, name));
    expect(fetch).not.toHaveBeenCalled();
  });
});

async function createStore(): Promise<ClosureStorePaths> {
  const root = await mkdtemp(join(tmpdir(), "od-closure-update-"));
  roots.push(root);
  return resolveClosureStorePaths({ channel: "beta", namespace: "release-beta", root });
}

function metadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const version = "0.18.0-beta.4";
  const archiveUrl = `https://releases.open-design.test/beta/closure/darwin-arm64/versions/${version}/closure.zip`;
  return {
    channel: "beta",
    releaseState: "complete",
    releaseTargets: {
      mac_arm64: {
        closure: {
          assets: {
            archive: { url: archiveUrl },
            inventory: { url: `${archiveUrl}.inventory.json` },
            manifest: { url: `${archiveUrl}.manifest.json` },
            provenance: { url: `${archiveUrl}.provenance.json` },
          },
          manifest: {
            artifact: {
              digest: DIGEST,
              entryPath: CLOSURE_ARCHIVE_ENTRY_PATH,
              inventoryDigest: OTHER_DIGEST,
              mediaType: "application/vnd.open-design.closure.zip-v1",
              size: 123,
              url: archiveUrl,
            },
            compatibility: { shell: { electron: { version: { min: "0.16.2" } } } },
            identity: {
              channel: "beta",
              digest: DIGEST,
              platform: "darwin-arm64",
              protocolVersion: 1,
              version,
            },
            schemaVersion: 1,
          },
        },
        enabled: true,
        status: "published",
      },
    },
    releaseVersion: version,
    ...overrides,
  };
}

function select(value: unknown = metadata()): ClosureReleaseCandidate {
  return selectClosureReleaseCandidate(value, {
    channel: "beta",
    platform: "darwin-arm64",
    releaseTarget: "mac_arm64",
  });
}

function pointer(version: string, digest = DIGEST): ClosureRuntimePointer {
  return {
    channel: "beta",
    digest,
    generation: 0,
    namespace: "release-beta",
    protocolVersion: 1,
    target: "darwin-arm64",
    version,
  };
}

function descriptor(
  standalone: ClosureRuntimePointer | null,
  releaseVersion = standalone?.version ?? "0.18.0-beta.0",
): ClosureBindingDescriptor {
  return {
    channel: "beta",
    committed: standalone == null ? null : { releaseVersion, standalone },
    namespace: "release-beta",
    nextGeneration: standalone == null ? 0 : 1,
    schemaVersion: 2,
    updatedAt: new Date(0).toISOString(),
  };
}

async function downloadableCandidate(): Promise<{
  archive: Buffer;
  candidate: ClosureReleaseCandidate;
  fetch: typeof globalThis.fetch;
}> {
  const runtimeBytes = "export const ready = true;\n";
  const zip = new JSZip();
  zip.file(CLOSURE_ARCHIVE_ENTRY_PATH, runtimeBytes);
  const archive = await zip.generateAsync({ compression: "DEFLATE", type: "nodebuffer" });
  const archiveDigest = digest(archive);
  const version = "0.18.0-beta.4";
  const baseUrl = `https://releases.open-design.test/beta/closure/darwin-arm64/versions/${version}`;
  const inventory = {
    files: [{
      digest: digest(runtimeBytes),
      path: CLOSURE_ARCHIVE_ENTRY_PATH,
      size: Buffer.byteLength(runtimeBytes),
    }],
    schemaVersion: CLOSURE_INVENTORY_SCHEMA_VERSION,
  };
  const manifest: ClosureCandidateManifest = {
    artifact: {
      digest: archiveDigest,
      entryPath: CLOSURE_ARCHIVE_ENTRY_PATH,
      inventoryDigest: digest(JSON.stringify(inventory.files)),
      mediaType: CLOSURE_ARCHIVE_MEDIA_TYPE,
      size: archive.byteLength,
      url: `${baseUrl}/closure.zip`,
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
  const candidate: ClosureReleaseCandidate = {
    assets: {
      archive: manifest.artifact.url,
      inventory: `${baseUrl}/inventory.json`,
      manifest: `${baseUrl}/manifest.json`,
      provenance: null,
    },
    manifest,
    releaseTarget: "mac_arm64",
    releaseVersion: version,
  };
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === candidate.assets.manifest) {
      return new Response(JSON.stringify(manifest), { status: 200 });
    }
    if (url === candidate.assets.inventory) {
      return new Response(JSON.stringify(inventory), { status: 200 });
    }
    if (url === candidate.assets.archive) {
      return new Response(archive, {
        headers: { "content-length": String(archive.byteLength) },
        status: 200,
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof globalThis.fetch;
  return { archive, candidate, fetch };
}

async function downloadableDistribution(): Promise<{
  candidate: ClosureDistributionReleaseCandidate;
  fetch: typeof globalThis.fetch;
  resourceUrl: string;
}> {
  const zip = async (...files: Array<readonly [string, string]>): Promise<Buffer> => {
    const archive = new JSZip();
    for (const [path, contents] of files) archive.file(path, contents, { date: new Date(0) });
    return await archive.generateAsync({ compression: "DEFLATE", type: "nodebuffer" });
  };
  const launcherFiles = [
    ["bootloader.mjs", "export const handoff = true;\n"],
    ["launcher.mjs", "export const launcher = true;\n"],
  ] as const;
  const archives = {
    body: await zip(["bootloader.mjs", "export const body = true;\n"]),
    launcher: await zip(...launcherFiles),
    native: await zip(["addon.node", "native\n"]),
    resource: await zip(["skills/SKILL.md", "# Skill\n"]),
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
    Object.entries(archives).map(([name, bytes]) => [name, artifact(bytes)]),
  ) as Record<keyof typeof archives, ClosureDistributionBlob>;
  const tree = (path: string, contents: string) => createClosureComponentTreeDigest([{
    digest: digest(contents),
    path,
    size: Buffer.byteLength(contents),
  }], digest);
  const trees = {
    body: tree("bootloader.mjs", "export const body = true;\n"),
    launcher: createClosureComponentTreeDigest(launcherFiles.map(([path, contents]) => ({
      digest: digest(contents),
      path,
      size: Buffer.byteLength(contents),
    })), digest),
    native: tree("addon.node", "native\n"),
    resource: tree("skills/SKILL.md", "# Skill\n"),
  };
  const manifest = createClosureDistributionManifest({
    blobs: Object.fromEntries(Object.values(artifacts).map((value) => [value.digest, value])),
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
      title: "Skills",
      treeDigest: trees.resource,
    }],
    schemaVersion: CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  }, digest);
  const bytesByUrl = new Map(Object.entries(archives).map(([name, bytes]) => [
    artifacts[name as keyof typeof archives].url,
    bytes,
  ]));
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    const bytes = bytesByUrl.get(url);
    return bytes == null
      ? new Response("not found", { status: 404 })
      : new Response(bytes, {
          headers: { "content-length": String(bytes.byteLength) },
          status: 200,
        });
  }) as typeof globalThis.fetch;
  return {
    candidate: { manifest, releaseVersion: "0.19.0-beta.10", target: "darwin-arm64" },
    fetch,
    resourceUrl: artifacts.resource.url,
  };
}

describe("Closure release update selection", () => {
  it("selects the platform Closure independently from shell artifacts", () => {
    const candidate = select();

    expect(candidate.releaseTarget).toBe("mac_arm64");
    expect(candidate.releaseVersion).toBe("0.18.0-beta.4");
    expect(candidate.manifest.identity).toMatchObject({
      channel: "beta",
      platform: "darwin-arm64",
      version: "0.18.0-beta.4",
    });
    expect(candidate.assets.archive).toBe(candidate.manifest.artifact.url);
  });

  it("selects a Closure version independently from the shell release version", () => {
    const candidate = select(metadata({ releaseVersion: "0.18.0-beta.3" }));

    expect(candidate.manifest.identity.version).toBe("0.18.0-beta.4");
    expect(candidate.releaseVersion).toBe("0.18.0-beta.3");
  });

  it("discovers the Closure from the combined release metadata endpoint", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(metadata()), { status: 200 })) as typeof globalThis.fetch;

    const candidate = await discoverClosureReleaseCandidate({
      channel: "beta",
      fetch,
      metadataUrl: "https://releases.open-design.test/beta/metadata.json",
      platform: "darwin-arm64",
      releaseTarget: "mac_arm64",
    });

    expect(candidate.releaseTarget).toBe("mac_arm64");
    expect(fetch).toHaveBeenCalledWith(
      "https://releases.open-design.test/beta/metadata.json",
      { headers: { accept: "application/json" } },
    );
  });

  it("rejects incomplete, cross-channel, and cross-platform metadata", () => {
    expect(() => select(metadata({ releaseState: "partial" }))).toThrow(/not complete/u);
    expect(() => select(metadata({ channel: "preview" }))).toThrow(/does not match beta/u);
    expect(() => selectClosureReleaseCandidate(metadata(), {
      channel: "beta",
      platform: "win32-x64",
      releaseTarget: "mac_arm64",
    })).toThrow(/does not match win32-x64/u);
  });

  it("uses shell compatibility and the independent committed release binding", () => {
    const candidate = select();

    expect(decideClosureUpdate({
      candidate,
      descriptor: descriptor(null),
      shellType: "electron",
      shellVersion: "0.16.2",
    })).toMatchObject({ action: "commit", reason: "no-committed-closure" });
    expect(decideClosureUpdate({
      candidate,
      descriptor: descriptor(pointer("0.18.0-beta.3", OTHER_DIGEST)),
      shellType: "electron",
      shellVersion: "0.18.0-beta.4",
    })).toMatchObject({ action: "commit", reason: "newer-release-binding" });
    expect(decideClosureUpdate({
      candidate,
      descriptor: descriptor(pointer("0.18.0-beta.5", OTHER_DIGEST)),
      shellType: "electron",
      shellVersion: "0.18.0-beta.4",
    })).toMatchObject({ action: "retain", reason: "candidate-not-newer" });
    expect(decideClosureUpdate({
      candidate,
      descriptor: descriptor(null),
      shellType: "electron",
      shellVersion: "0.16.1",
    })).toMatchObject({ action: "retain", reason: "shell-incompatible" });
  });

  it("rejects equivocation within one release binding", () => {
    const candidate = select();
    expect(() => decideClosureUpdate({
      candidate,
      descriptor: descriptor(pointer("0.18.0-beta.4", OTHER_DIGEST)),
      shellType: "electron",
      shellVersion: "0.18.0-beta.4",
    })).toThrowError(new ClosureUpdateError(
      "Closure release 0.18.0-beta.4 has conflicting immutable bindings",
    ));
  });

  it("compares release and prerelease shell versions deterministically", () => {
    expect(compareClosureShellVersions("0.16.2", "0.16.2")).toBe(0);
    expect(compareClosureShellVersions("0.18.0-beta.4", "0.16.2")).toBe(1);
    expect(compareClosureShellVersions("0.18.0-beta.4", "0.18.0-beta.3")).toBe(1);
    expect(compareClosureShellVersions("0.18.0-beta-internal.2", "0.18.0-beta-internal.1")).toBe(1);
    expect(compareClosureShellVersions("0.18.0-beta.3", "0.18.0")).toBe(-1);
  });
});

describe("version-wide Closure distribution selection", () => {
  it("selects the sole root graph for the requested target", async () => {
    const fixture = await downloadableDistribution();
    const value = metadata({
      closure: fixture.candidate.manifest,
      releaseVersion: fixture.candidate.releaseVersion,
    });

    expect(selectClosureDistributionReleaseCandidate(value, {
      channel: "beta",
      target: "darwin-arm64",
    })).toEqual(fixture.candidate);
  });

  it("uses absence as the only legacy fallback signal", async () => {
    const fixture = await downloadableDistribution();
    expect(selectClosureDistributionReleaseCandidate(metadata(), {
      channel: "beta",
      target: "darwin-arm64",
    })).toBeNull();

    const invalid = {
      ...fixture.candidate.manifest,
      identity: {
        ...fixture.candidate.manifest.identity,
        version: "0.19.0-beta.11",
      },
    };
    expect(() => selectClosureDistributionReleaseCandidate(metadata({ closure: invalid }), {
      channel: "beta",
      target: "darwin-arm64",
    })).toThrow(/distribution is invalid/u);
    expect(() => selectClosureDistributionReleaseCandidate(metadata({
      closure: fixture.candidate.manifest,
    }), {
      channel: "beta",
      target: "win32-x64",
    })).toThrow(/does not contain target win32-x64/u);
  });

  it("discovers the root graph from the combined metadata endpoint", async () => {
    const fixture = await downloadableDistribution();
    const metadataUrl = "https://releases.open-design.test/beta/metadata.json";
    const fetch = vi.fn(async () => new Response(JSON.stringify(metadata({
      closure: fixture.candidate.manifest,
      releaseVersion: fixture.candidate.releaseVersion,
    })), { status: 200 })) as typeof globalThis.fetch;

    await expect(discoverClosureDistributionReleaseCandidate({
      channel: "beta",
      fetch,
      metadataUrl,
      target: "darwin-arm64",
    })).resolves.toEqual(fixture.candidate);
    expect(fetch).toHaveBeenCalledWith(metadataUrl, { headers: { accept: "application/json" } });
  });
});

describe("Closure release update application", () => {
  it("downloads, verifies, and atomically commits a candidate", async () => {
    const paths = await createStore();
    const fixture = await downloadableCandidate();

    const result = await applyClosureUpdate({
      candidate: fixture.candidate,
      fetch: fixture.fetch,
      paths,
      shellType: "electron",
      shellVersion: "0.16.2",
    });

    expect(result).toMatchObject({ reason: "no-committed-closure", state: "committed" });
    const binding = await readClosureBindingDescriptor(paths);
    expect(binding.committed).toMatchObject({
      releaseVersion: fixture.candidate.releaseVersion,
      standalone: {
        channel: fixture.candidate.manifest.identity.channel,
        digest: fixture.candidate.manifest.identity.digest,
        protocolVersion: fixture.candidate.manifest.identity.protocolVersion,
        target: fixture.candidate.manifest.identity.platform,
        version: fixture.candidate.manifest.identity.version,
      },
    });
    const verified = await verifyStoredClosureCandidate(paths, {
      ...fixture.candidate.manifest.identity,
      namespace: paths.namespace,
    });
    expect(await readFile(verified.paths.archivePath)).toEqual(fixture.archive);

    const fetchCount = vi.mocked(fixture.fetch).mock.calls.length;
    const retained = await applyClosureUpdate({
      candidate: fixture.candidate,
      fetch: fixture.fetch,
      paths,
      shellType: "electron",
      shellVersion: "0.16.2",
    });
    expect(retained).toMatchObject({ reason: "already-committed", state: "retained" });
    expect(vi.mocked(fixture.fetch).mock.calls).toHaveLength(fetchCount);
  });

  it("does not mutate runtime state when the archive fails verification", async () => {
    const paths = await createStore();
    const fixture = await downloadableCandidate();
    const corruptFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === fixture.candidate.assets.archive) {
        return new Response("corrupt archive", {
          headers: { "content-length": "15" },
          status: 200,
        });
      }
      return await fixture.fetch(input, init);
    }) as typeof globalThis.fetch;

    await expect(applyClosureUpdate({
      candidate: fixture.candidate,
      fetch: corruptFetch,
      paths,
      shellType: "electron",
      shellVersion: "0.16.2",
    })).rejects.toThrow(/checksum/u);

    expect((await readClosureBindingDescriptor(paths)).committed).toBeNull();
  });

  it("leaves an active updater lock untouched", async () => {
    const paths = await createStore();
    const fixture = await downloadableCandidate();
    const lockPath = join(paths.stateRoot, "update.lock");
    await mkdir(paths.stateRoot, { recursive: true });
    await writeFile(lockPath, `${JSON.stringify({
      createdAt: new Date().toISOString(),
      pid: process.pid,
      token: "live-updater",
    })}\n`);

    await expect(applyClosureUpdate({
      candidate: fixture.candidate,
      fetch: fixture.fetch,
      paths,
      shellType: "electron",
      shellVersion: "0.16.2",
    })).resolves.toMatchObject({ reason: "another-updater-active", state: "busy" });
    expect(await readFile(lockPath, "utf8")).toContain("live-updater");
    expect(vi.mocked(fixture.fetch)).not.toHaveBeenCalled();
  });
});

describe("layered Closure distribution application", () => {
  it("discovers and commits the root graph without consulting the legacy target", async () => {
    const paths = await createStore();
    const fixture = await downloadableDistribution();
    const metadataUrl = "https://releases.open-design.test/beta/metadata.json";
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === metadataUrl) {
        return new Response(JSON.stringify({
          channel: "beta",
          closure: fixture.candidate.manifest,
          releaseState: "complete",
          releaseVersion: fixture.candidate.releaseVersion,
        }), { status: 200 });
      }
      return await fixture.fetch(input, init);
    }) as typeof globalThis.fetch;

    const result = await updateClosureFromRelease({
      channel: "beta",
      fetch,
      metadataUrl,
      paths,
      platform: "darwin-arm64",
      releaseTarget: "missing-on-purpose",
      shellType: "electron",
      shellVersion: "0.19.0",
    });

    expect(result).toMatchObject({ reason: "no-committed-closure", state: "committed" });
    expect((await readClosureBindingDescriptor(paths)).committed?.standalone).toMatchObject({
      digest: fixture.candidate.manifest.identity.digest,
      target: "darwin-arm64",
      version: "0.19.0-beta.10",
    });
  });

  it("downloads only required blobs, extracts the fixed view, and reuses channel CAS", async () => {
    const paths = await createStore();
    const fixture = await downloadableDistribution();

    const result = await applyClosureDistributionUpdate({
      candidate: fixture.candidate,
      fetch: fixture.fetch,
      paths,
      shellType: "electron",
      shellVersion: "0.19.0",
    });

    expect(result).toMatchObject({ reason: "no-committed-closure", state: "committed" });
    if (result.state !== "committed") throw new Error("distribution was not committed");
    const generationRoot = join(paths.generationsRoot, String(result.pointer.generation));
    expect(await readFile(join(generationRoot, "body", "bootloader.mjs"), "utf8"))
      .toContain("body = true");
    expect(await readFile(join(generationRoot, "launcher", "launcher.mjs"), "utf8"))
      .toContain("launcher = true");
    expect(vi.mocked(fixture.fetch).mock.calls.map(([input]) => String(input)))
      .not.toContain(fixture.resourceUrl);
    expect(vi.mocked(fixture.fetch)).toHaveBeenCalledTimes(3);

    const retained = await applyClosureDistributionUpdate({
      candidate: fixture.candidate,
      fetch: fixture.fetch,
      paths,
      shellType: "electron",
      shellVersion: "0.19.0",
    });
    expect(retained).toMatchObject({ reason: "already-committed", state: "retained" });
    expect(vi.mocked(fixture.fetch)).toHaveBeenCalledTimes(3);
  });

  it("keeps the binding empty when any required blob fails checksum", async () => {
    const paths = await createStore();
    const fixture = await downloadableDistribution();
    const originalFetch = fixture.fetch;
    const corruptFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const call = vi.mocked(originalFetch).mock.calls.length;
      if (call === 0) {
        return new Response("corrupt", {
          headers: { "content-length": "7" },
          status: 200,
        });
      }
      return await originalFetch(input, init);
    }) as typeof globalThis.fetch;

    await expect(applyClosureDistributionUpdate({
      candidate: fixture.candidate,
      fetch: corruptFetch,
      paths,
      shellType: "electron",
      shellVersion: "0.19.0",
    })).rejects.toThrow(/checksum/u);
    expect((await readClosureBindingDescriptor(paths)).committed).toBeNull();
  });

  it("lets independent namespaces converge on the same immutable channel CAS", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-closure-update-shared-cas-"));
    roots.push(root);
    const left = resolveClosureStorePaths({ channel: "beta", namespace: "team-a", root });
    const right = resolveClosureStorePaths({ channel: "beta", namespace: "team-b", root });
    const fixture = await downloadableDistribution();

    const results = await Promise.all([left, right].map(async (paths) => (
      await applyClosureDistributionUpdate({
        candidate: fixture.candidate,
        fetch: fixture.fetch,
        paths,
        shellType: "electron",
        shellVersion: "0.19.0",
      })
    )));

    expect(results.map((result) => result.state)).toEqual(["committed", "committed"]);
    expect(left.blobsRoot).toBe(right.blobsRoot);
    expect((await readClosureBindingDescriptor(left)).committed?.standalone.namespace).toBe("team-a");
    expect((await readClosureBindingDescriptor(right)).committed?.standalone.namespace).toBe("team-b");
  });
});
