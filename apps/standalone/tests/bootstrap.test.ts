import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  createClosureComponentTreeDigest,
  createClosureDistributionManifest,
  type ClosureDistributionBlob,
} from "@open-design/closure-proto";
import { readClosureBindingDescriptor, resolveClosureStorePaths } from "@open-design/closure-store";
import { STANDALONE_BOOTSTRAP_SCHEMA_VERSION } from "@open-design/standalone-proto";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveStandaloneBootstrap } from "../src/bootstrap.js";

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

function digest(value: string | Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "od-standalone-bootstrap-"));
  roots.push(root);
  const zip = async (files: Array<readonly [string, string]>): Promise<Buffer> => {
    const archive = new JSZip();
    for (const [path, contents] of files) archive.file(path, contents, { date: new Date(0) });
    return await archive.generateAsync({ compression: "DEFLATE", type: "nodebuffer" });
  };
  const source = {
    body: [["bootloader.mjs", "export const body = true;\n"]],
    launcher: [
      ["bootloader.mjs", "export const handoff = true;\n"],
      ["launcher.mjs", "export const launcher = true;\n"],
    ],
    native: [["addon.node", "native\n"]],
  } satisfies Record<string, Array<readonly [string, string]>>;
  const bytes = {
    body: await zip(source.body),
    launcher: await zip(source.launcher),
    native: await zip(source.native),
  };
  const artifact = (value: Buffer): ClosureDistributionBlob => ({
    digest: digest(value),
    mediaType: "application/zip",
    size: value.byteLength,
    url: `https://default.example.test/beta/blobs/${digest(value).slice("sha256:".length)}`,
  });
  const artifacts = {
    body: artifact(bytes.body),
    launcher: artifact(bytes.launcher),
    native: artifact(bytes.native),
  };
  const tree = (files: Array<readonly [string, string]>) => createClosureComponentTreeDigest(
    files.map(([path, contents]) => ({ digest: digest(contents), path, size: Buffer.byteLength(contents) })),
    digest,
  );
  const manifest = createClosureDistributionManifest({
    blobs: Object.fromEntries(Object.values(artifacts).map((entry) => [entry.digest, entry])),
    compatibility: { shell: { electron: { version: { min: "0.19.0-beta.1" } } } },
    identity: { channel: "beta", protocolVersion: CLOSURE_PROTOCOL_VERSION, version: "0.19.0-beta.1" },
    required: {
      body: { blob: artifacts.body.digest, entryPath: "bootloader.mjs", treeDigest: tree(source.body) },
      launcher: {
        blob: artifacts.launcher.digest,
        entryPath: "launcher.mjs",
        handoffPath: "bootloader.mjs",
        treeDigest: tree(source.launcher),
      },
      targets: { "darwin-arm64": { native: { blob: artifacts.native.digest, treeDigest: tree(source.native) } } },
    },
    resources: [],
    schemaVersion: CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  }, digest);
  const metadataUrl = "https://releases.example.test/beta/latest/metadata.json";
  const byUrl = new Map(Object.entries(bytes).map(([name, value]) => [artifacts[name as keyof typeof artifacts].url, value]));
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === metadataUrl) return new Response(JSON.stringify({
      channel: "beta",
      closure: manifest,
      releaseState: "complete",
      releaseVersion: "0.19.0-beta.1",
    }), { status: 200 });
    const body = byUrl.get(url);
    return body == null
      ? new Response("not found", { status: 404 })
      : new Response(body, { headers: { "content-length": String(body.byteLength) }, status: 200 });
  }) as typeof globalThis.fetch;
  const repositoryConfigPath = join(root, "repository.json");
  await writeFile(repositoryConfigPath, JSON.stringify({ localSeeds: [], remoteOrigins: [], schemaVersion: 1 }));
  const paths = {
    cacheRoot: join(root, "cache"),
    dataRoot: join(root, "data"),
    installationRoot: join(root, "installation"),
    logsRoot: join(root, "logs"),
    resourceRoot: join(root, "legacy-resource-projection"),
    runtimeRoot: join(root, "runtime"),
  };
  await mkdir(paths.installationRoot, { recursive: true });
  return { fetch, metadataUrl, paths, repositoryConfigPath, root };
}

describe("Standalone unresolved bootstrap", () => {
  it("discovers, commits, and resolves one immutable generation before handoff", async () => {
    const value = await fixture();
    const resolution = await resolveStandaloneBootstrap({
      attachment: {
        id: "electron-shell",
        shell: { digest: `sha256:${"f".repeat(64)}`, type: "electron", version: "0.19.0-beta.1" },
      },
      discovery: { metadataUrl: value.metadataUrl, target: "darwin-arm64" },
      paths: value.paths,
      repositoryConfigPath: value.repositoryConfigPath,
      schemaVersion: STANDALONE_BOOTSTRAP_SCHEMA_VERSION,
      scope: { channel: "beta", namespace: "release-beta" },
    }, { fetch: value.fetch });

    expect(resolution.bootloaderPath).toMatch(/generations\/0\/launcher\/bootloader\.mjs$/u);
    expect(resolution.handoff.handoff.scope).toEqual({ channel: "beta", generation: 0, namespace: "release-beta" });
    expect(resolution.handoff.paths.resourceRoot).toMatch(/channels\/beta\/resources$/u);
    const store = resolveClosureStorePaths({ channel: "beta", namespace: "release-beta", root: value.paths.installationRoot });
    expect((await readClosureBindingDescriptor(store)).committed?.standalone.generation).toBe(0);

    const callCount = vi.mocked(value.fetch).mock.calls.length;
    await resolveStandaloneBootstrap({
      attachment: {
        id: "electron-shell",
        shell: { digest: `sha256:${"f".repeat(64)}`, type: "electron", version: "0.19.0-beta.1" },
      },
      discovery: { metadataUrl: null, target: "darwin-arm64" },
      paths: value.paths,
      repositoryConfigPath: value.repositoryConfigPath,
      schemaVersion: STANDALONE_BOOTSTRAP_SCHEMA_VERSION,
      scope: { channel: "beta", namespace: "release-beta" },
    }, { fetch: value.fetch });
    expect(vi.mocked(value.fetch).mock.calls).toHaveLength(callCount);
  });
});
