import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CLOSURE_ARCHIVE_ENTRY_PATH,
  CLOSURE_ARCHIVE_MEDIA_TYPE,
  CLOSURE_INVENTORY_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  CLOSURE_SCHEMA_VERSION,
  type ClosureCandidateManifest,
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
  applyClosureUpdate,
  compareClosureShellVersions,
  decideClosureUpdate,
  discoverClosureReleaseCandidate,
  selectClosureReleaseCandidate,
  type ClosureReleaseCandidate,
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
