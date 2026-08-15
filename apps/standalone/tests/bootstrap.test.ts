import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  createClosureComponentTreeDigest,
  createClosureDistributionControl,
  createClosureDistributionManifest,
  type ClosureDistributionBlob,
} from "@open-design/closure/protocol";
import {
  confirmClosureBindingAttempt,
  readClosureBindingDescriptor,
  resolveClosureStorePaths,
} from "@open-design/closure/store";
import { bootstrapSidecarLifecycle } from "@open-design/sidecar/lifecycle";
import {
  STANDALONE_BOOTSTRAP_SCHEMA_VERSION,
  type StandaloneBootstrapProgress,
} from "../src/protocol/index.js";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveStandaloneBootstrap } from "../src/bootstrap.js";
import { discardUnreferencedClosureResources } from "../src/resource-garbage.js";
import { prepareStandaloneResourceEnv } from "../src/resource-runtime.js";
import { STANDALONE_RESOURCE_ROOTS_ENV } from "../src/tool-env.js";
import { prepareStandaloneUpdate } from "../src/update-runtime.js";

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
    plugins: [
      ["plugins/_official/sample/open-design.json", "{}\n"],
      ["plugins/registry/index.json", "{}\n"],
    ],
    skills: [["skills/sample/SKILL.md", "# Sample\n"]],
    vela: [
      [`bin/libexec/opencode/${process.platform === "win32" ? "opencode.exe" : "opencode"}`, "opencode\n"],
      [`bin/${process.platform === "win32" ? "vela.exe" : "vela"}`, "vela\n"],
    ],
  } satisfies Record<string, Array<readonly [string, string]>>;
  const bytes = {
    body: await zip(source.body),
    launcher: await zip(source.launcher),
    native: await zip(source.native),
    plugins: await zip(source.plugins),
    skills: await zip(source.skills),
    vela: await zip(source.vela),
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
    plugins: artifact(bytes.plugins),
    skills: artifact(bytes.skills),
    vela: artifact(bytes.vela),
  };
  const tree = (files: Array<readonly [string, string]>) => createClosureComponentTreeDigest(
    files.map(([path, contents]) => ({ digest: digest(contents), path, size: Buffer.byteLength(contents) })),
    digest,
  );
  const manifestFor = (version: string, minimumShellVersion = "0.19.0-beta.1") => (
    createClosureDistributionManifest({
      blobs: Object.fromEntries(Object.values(artifacts).map((entry) => [entry.digest, entry])),
      compatibility: { shell: { electron: { version: { min: minimumShellVersion } } } },
      identity: { channel: "beta", protocolVersion: CLOSURE_PROTOCOL_VERSION, version },
      required: {
        body: { blob: artifacts.body.digest, entryPath: "bootloader.mjs", treeDigest: tree(source.body) },
        launcher: {
          blob: artifacts.launcher.digest,
          entryPath: "launcher.mjs",
          handoffPath: "bootloader.mjs",
          treeDigest: tree(source.launcher),
        },
        targets: {
          "darwin-arm64": {
            native: { blob: artifacts.native.digest, treeDigest: tree(source.native) },
            resources: [{
              blob: artifacts.vela.digest,
              id: "vela-runtime",
              startup: "blocking",
              title: "Vela runtime",
              treeDigest: tree(source.vela),
            }],
          },
        },
      },
      resources: [
        {
          blob: artifacts.plugins.digest,
          id: "plugins",
          startup: "blocking",
          title: "Plugin registry",
          treeDigest: tree(source.plugins),
        },
        {
          blob: artifacts.skills.digest,
          id: "skills",
          startup: "lazy",
          title: "Skills",
          treeDigest: tree(source.skills),
        },
      ],
      schemaVersion: CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
    }, digest)
  );
  const manifests = {
    "0.19.0-beta.1": manifestFor("0.19.0-beta.1"),
    "0.19.0-beta.2": manifestFor("0.19.0-beta.2"),
    "0.19.0-beta.3": manifestFor("0.19.0-beta.3", "0.19.0-beta.3"),
  };
  const manifest = manifests["0.19.0-beta.1"];
  const metadataUrl = "https://releases.example.test/beta/latest/metadata.json";
  const byUrl = new Map(Object.entries(bytes).map(([name, value]) => [artifacts[name as keyof typeof artifacts].url, value]));
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    const versionMatch = /\/beta\/versions\/(0\.19\.0-beta\.[123])\/metadata\.json$/u.exec(url);
    const selectedVersion = versionMatch?.[1] as keyof typeof manifests | undefined;
    if (url === metadataUrl || selectedVersion != null) {
      const version = selectedVersion ?? "0.19.0-beta.1";
      return new Response(JSON.stringify({
        channel: "beta",
        closure: manifests[version],
        closureControl: createClosureDistributionControl(manifests[version]),
        releaseState: "complete",
        releaseVersion: version,
      }), { status: 200 });
    }
    const body = byUrl.get(url);
    return body == null
      ? new Response("not found", { status: 404 })
      : new Response(body, { headers: { "content-length": String(body.byteLength) }, status: 200 });
  }) as typeof globalThis.fetch;
  const seedRoot = join(root, "seed");
  await mkdir(join(seedRoot, "beta", "blobs"), { recursive: true });
  const repositoryConfigPath = join(root, "repository.json");
  await writeFile(repositoryConfigPath, JSON.stringify({ localSeeds: [{ root: seedRoot }], remoteOrigins: [], schemaVersion: 1 }));
  const paths = {
    cacheRoot: join(root, "cache"),
    dataRoot: join(root, "data"),
    installationRoot: join(root, "installation"),
    logsRoot: join(root, "logs"),
    resourceRoot: join(root, "legacy-resource-projection"),
    runtimeRoot: join(root, "runtime"),
  };
  await mkdir(paths.installationRoot, { recursive: true });
  return { artifacts, bytes, fetch, manifest, manifests, metadataUrl, paths, repositoryConfigPath, root, seedRoot };
}

function request(
  value: Awaited<ReturnType<typeof fixture>>,
  shellVersion: string,
  metadataUrl: string | null = value.metadataUrl,
  releaseIntent: { kind: "exact"; releaseVersion: string } | { kind: "resume-or-bootstrap" }
    = { kind: "exact", releaseVersion: shellVersion },
) {
  return {
    attachment: {
      id: "electron-shell",
      shell: { digest: `sha256:${"f".repeat(64)}` as const, type: "electron", version: shellVersion },
    },
    discovery: { metadataUrl, target: "darwin-arm64" },
    paths: value.paths,
    releaseIntent,
    repositoryConfigPath: value.repositoryConfigPath,
    schemaVersion: STANDALONE_BOOTSTRAP_SCHEMA_VERSION,
    scope: { channel: "beta" as const, namespace: "release-beta" },
  };
}

async function consumeTransition(
  value: Awaited<ReturnType<typeof fixture>>,
  resolution: Awaited<ReturnType<typeof resolveStandaloneBootstrap>>,
): Promise<void> {
  const transition = resolution.handoff.transition;
  if (transition == null) return;
  const lifecycle = bootstrapSidecarLifecycle({
    controlRoot: value.paths.dataRoot,
    scope: { channel: "beta", namespace: "release-beta" },
  });
  const attached = await lifecycle.attach({
    leaseMs: 60_000,
    owner: {
      generation: resolution.handoff.handoff.scope.generation,
      incarnation: resolution.handoff.attachment.id,
      key: `electron:${resolution.handoff.attachment.id}`,
    },
    transition,
  });
  if (attached.state !== "attached") throw new Error("fixture transition attachment was blocked");
  const completed = await lifecycle.completeTransition({
    lease: attached.credential,
    transition,
  });
  if (completed.state !== "completed") throw new Error("fixture transition completion was rejected");
  const paths = resolveClosureStorePaths({
    channel: "beta",
    namespace: "release-beta",
    root: value.paths.installationRoot,
  });
  const descriptor = await readClosureBindingDescriptor(paths);
  if (descriptor.attempt != null) await confirmClosureBindingAttempt(paths, descriptor.attempt);
  await lifecycle.detach(attached.credential);
}

describe("Standalone unresolved bootstrap", () => {
  it("discovers mutable latest only for an empty Store and revalidates immutable metadata", async () => {
    const value = await fixture();
    const resolution = await resolveStandaloneBootstrap(request(
      value,
      "0.19.0-beta.1",
      value.metadataUrl,
      { kind: "resume-or-bootstrap" },
    ), { fetch: value.fetch });

    expect(resolution.handoff.handoff.descriptor.release.version).toBe("0.19.0-beta.1");
    expect(vi.mocked(value.fetch).mock.calls.slice(0, 2).map(([url]) => String(url))).toEqual([
      value.metadataUrl,
      "https://releases.example.test/beta/versions/0.19.0-beta.1/metadata.json",
    ]);
  });

  it("fails closed when mutable discovery and immutable metadata disagree", async () => {
    const value = await fixture();
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith("/versions/0.19.0-beta.1/metadata.json")) {
        return Response.json({
          channel: "beta",
          closure: value.manifests["0.19.0-beta.2"],
          closureControl: createClosureDistributionControl(value.manifests["0.19.0-beta.2"]),
          releaseState: "complete",
          releaseVersion: "0.19.0-beta.2",
        });
      }
      return await value.fetch(input, init);
    }) as typeof globalThis.fetch;

    await expect(resolveStandaloneBootstrap(request(
      value,
      "0.19.0-beta.1",
      value.metadataUrl,
      { kind: "resume-or-bootstrap" },
    ), { fetch })).rejects.toThrow(/exact version 0\.19\.0-beta\.1/u);
    const store = resolveClosureStorePaths({
      channel: "beta",
      namespace: "release-beta",
      root: value.paths.installationRoot,
    });
    expect((await readClosureBindingDescriptor(store)).active).toBeNull();
  });

  it("discovers, commits, and resolves one immutable generation before handoff", async () => {
    const value = await fixture();
    const progress: StandaloneBootstrapProgress[] = [];
    const resolution = await resolveStandaloneBootstrap(request(value, "0.19.0-beta.1"), {
      fetch: value.fetch,
      onProgress: (entry) => progress.push(entry),
    });
    await consumeTransition(value, resolution);

    expect(resolution.bootloaderPath).toMatch(/installations[\\/].+[\\/]darwin-arm64[\\/]launcher[\\/]bootloader\.mjs$/u);
    expect(resolution.handoff.handoff.scope).toEqual({ channel: "beta", generation: 0, namespace: "release-beta" });
    expect(resolution.handoff.paths.resourceRoot).toMatch(/channels[\\/]beta[\\/]resources$/u);
    expect(resolution.handoff.closure).toEqual({
      repositoryConfigPath: value.repositoryConfigPath,
      storeRoot: value.paths.installationRoot,
      target: "darwin-arm64",
    });
    const store = resolveClosureStorePaths({ channel: "beta", namespace: "release-beta", root: value.paths.installationRoot });
    expect((await readClosureBindingDescriptor(store)).active?.standalone.generation).toBe(0);
    expect((await stat(join(store.blobsRoot, value.artifacts.plugins.digest.slice("sha256:".length)))).isFile())
      .toBe(true);
    expect(await stat(join(store.blobsRoot, value.artifacts.skills.digest.slice("sha256:".length))).catch(() => null))
      .toBeNull();
    expect(progress.map((entry) => entry.stage)).toEqual(expect.arrayContaining([
      "checking", "discovering", "downloading", "materializing", "verifying", "ready",
    ]));
    expect(progress.every((entry) => entry.initialLoad)).toBe(true);
    expect(progress.filter((entry) => entry.stage === "downloading").at(-1)?.progress)
      .toMatchObject({ completed: expect.any(Number), unit: "bytes" });
    expect(progress.filter((entry) => entry.subject.id === "vela-runtime").map((entry) => entry.stage))
      .toEqual(["checking", "downloading", "downloading", "verifying", "materializing", "verifying", "ready"]);
    expect(progress.filter((entry) => entry.subject.id === "plugins").map((entry) => entry.stage))
      .toEqual(["checking", "downloading", "downloading", "verifying", "materializing", "verifying", "ready"]);
    expect(progress.some((entry) => entry.subject.id === "skills")).toBe(false);

    const callCount = vi.mocked(value.fetch).mock.calls.length;
    const warmProgress: StandaloneBootstrapProgress[] = [];
    await resolveStandaloneBootstrap(request(value, "0.19.0-beta.1", null), {
      fetch: value.fetch,
      onProgress: (entry) => warmProgress.push(entry),
    });
    expect(vi.mocked(value.fetch).mock.calls).toHaveLength(callCount);
    expect(warmProgress.map((entry) => [entry.subject.id, entry.stage])).toEqual([
      ["standalone", "checking"],
      ["standalone", "verifying"],
      ["plugins", "checking"],
      ["plugins", "ready"],
      ["vela-runtime", "checking"],
      ["vela-runtime", "ready"],
      ["standalone", "ready"],
    ]);
  });

  it("publishes readiness only after the target Vela resource is materialized", async () => {
    const value = await fixture();
    const resolution = await resolveStandaloneBootstrap(
      request(value, "0.19.0-beta.1"),
      { fetch: value.fetch },
    );
    const env = await prepareStandaloneResourceEnv({
      ...resolution.handoff,
      capabilities: {
        async invoke(exchange) {
          return { ...exchange, outcome: "unsupported" as const };
        },
      },
    });

    expect(env.OD_VELA_RUNTIME_LAZY).toBe("1");
    expect(env.VELA_BIN).toMatch(new RegExp(
      `resources[\\\\/][0-9a-f]{64}[\\\\/]bin[\\\\/]vela${process.platform === "win32" ? "\\.exe" : ""}$`,
      "u",
    ));
    const resourceRoots = JSON.parse(env[STANDALONE_RESOURCE_ROOTS_ENV]!) as Record<string, string>;
    expect(resourceRoots.plugins).toMatch(/resources[\\/][0-9a-f]{64}$/u);
    expect(resourceRoots.skills).toBeUndefined();
    await vi.waitFor(async () => {
      const materialized = await stat(env.VELA_BIN!).then((entry) => entry.isFile()).catch(() => false);
      expect(materialized).toBe(true);
      expect((await stat(join(resourceRoots.plugins!, "plugins", "_official", "sample", "open-design.json"))).isFile())
        .toBe(true);
    });
  });

  it("discards only unreferenced channel resources after committed graphs are readable", async () => {
    const value = await fixture();
    await resolveStandaloneBootstrap(request(value, "0.19.0-beta.1"), { fetch: value.fetch });
    const store = resolveClosureStorePaths({
      channel: "beta",
      namespace: "release-beta",
      root: value.paths.installationRoot,
    });
    const obsoleteResource = "a".repeat(64);
    const obsoleteBlob = "b".repeat(64);
    await mkdir(join(store.resourcesRoot, obsoleteResource), { recursive: true });
    await writeFile(join(store.resourcesRoot, obsoleteResource, "stale"), "stale");
    await mkdir(store.blobsRoot, { recursive: true });
    await writeFile(join(store.blobsRoot, obsoleteBlob), "stale");

    const result = await discardUnreferencedClosureResources(store);

    expect(result).toEqual({ discardedBlobs: 1, discardedResources: 1 });
    expect(await stat(join(store.resourcesRoot, obsoleteResource)).catch(() => null)).toBeNull();
    expect(await stat(join(store.blobsRoot, obsoleteBlob)).catch(() => null)).toBeNull();
    expect(await readdir(store.garbageRoot)).toHaveLength(2);
    expect((await stat(join(store.blobsRoot, value.artifacts.vela.digest.slice("sha256:".length)))).isFile())
      .toBe(true);
  });

  it("rejects readiness with an actionable resource error when Vela is unavailable", async () => {
    const value = await fixture();
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === value.artifacts.vela.url) return new Response("offline", { status: 503 });
      return await value.fetch(input, init);
    }) as typeof globalThis.fetch;
    const progress: StandaloneBootstrapProgress[] = [];

    await expect(resolveStandaloneBootstrap(request(value, "0.19.0-beta.1"), {
      fetch,
      onProgress: (entry) => progress.push(entry),
    })).rejects.toMatchObject({ code: "resource-unavailable" });
    expect(progress.some((entry) => entry.subject.id === "standalone" && entry.stage === "ready"))
      .toBe(false);
    expect(progress.some((entry) => entry.subject.id === "vela-runtime" && entry.stage === "downloading"))
      .toBe(true);
  });

  it("rejects readiness before daemon handoff when the plugin registry is unavailable", async () => {
    const value = await fixture();
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === value.artifacts.plugins.url) return new Response("offline", { status: 503 });
      return await value.fetch(input, init);
    }) as typeof globalThis.fetch;
    const progress: StandaloneBootstrapProgress[] = [];

    await expect(resolveStandaloneBootstrap(request(value, "0.19.0-beta.1"), {
      fetch,
      onProgress: (entry) => progress.push(entry),
    })).rejects.toMatchObject({ code: "resource-unavailable" });
    expect(progress.some((entry) => entry.subject.id === "plugins" && entry.stage === "downloading"))
      .toBe(true);
    expect(progress.some((entry) => entry.subject.id === "standalone" && entry.stage === "ready"))
      .toBe(false);
  });

  it("cold-starts offline from a version index and required local blobs", async () => {
    const value = await fixture();
    await mkdir(join(value.seedRoot, "beta", "blobs"), { recursive: true });
    await writeFile(join(value.seedRoot, "beta", "baseline.json"), JSON.stringify({
      channel: "beta",
      closure: value.manifest,
      releaseState: "complete",
      releaseVersion: "0.19.0-beta.1",
    }));
    for (const [name, bytes] of Object.entries(value.bytes)) {
      const artifact = value.artifacts[name as keyof typeof value.artifacts];
      await writeFile(join(value.seedRoot, "beta", "blobs", artifact.digest.slice("sha256:".length)), bytes);
    }
    const fetch = vi.fn(async () => new Response("offline", { status: 503 })) as typeof globalThis.fetch;
    const resolution = await resolveStandaloneBootstrap(request(
      value,
      "0.19.0-beta.1",
      value.metadataUrl,
      { kind: "resume-or-bootstrap" },
    ), { fetch });
    expect(resolution.handoff.handoff.scope.generation).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not reinterpret a newer Shell release binding as a Standalone update", async () => {
    const value = await fixture();
    await consumeTransition(
      value,
      await resolveStandaloneBootstrap(request(value, "0.19.0-beta.1"), { fetch: value.fetch }),
    );
    const resolution = await resolveStandaloneBootstrap(request(value, "0.19.0-beta.2"), { fetch: value.fetch });
    await consumeTransition(value, resolution);

    expect(resolution.handoff.handoff.descriptor.standalone.version).toBe("0.19.0-beta.1");
    expect(resolution.handoff.handoff.scope.generation).toBe(0);
  });

  it("keeps prepared bytes inactive until silent activation is authorized", async () => {
    const value = await fixture();
    await consumeTransition(
      value,
      await resolveStandaloneBootstrap(request(value, "0.19.0-beta.1"), { fetch: value.fetch }),
    );
    const metadata = {
      channel: "beta",
      closure: value.manifests["0.19.0-beta.2"],
      closureControl: createClosureDistributionControl(value.manifests["0.19.0-beta.2"]),
      releaseState: "complete",
      releaseVersion: "0.19.0-beta.2",
    };
    const updateInput = {
      channel: "beta",
      fetch: value.fetch,
      metadata,
      namespace: "release-beta",
      repositoryConfigPath: value.repositoryConfigPath,
      shellType: "electron",
      shellVersion: "0.19.0-beta.1",
      storeRoot: value.paths.installationRoot,
      target: "darwin-arm64",
    } as const;

    await prepareStandaloneUpdate({ ...updateInput, activateOnRestart: false });
    const current = await resolveStandaloneBootstrap(
      request(value, "0.19.0-beta.1", null),
      { fetch: value.fetch },
    );
    expect(current.handoff.handoff.descriptor.standalone.version).toBe("0.19.0-beta.1");

    await prepareStandaloneUpdate({ ...updateInput, activateOnRestart: true });
    const activated = await resolveStandaloneBootstrap(
      request(value, "0.19.0-beta.1", null),
      { fetch: value.fetch },
    );
    expect(activated.handoff.handoff.descriptor.standalone.version).toBe("0.19.0-beta.2");
    await consumeTransition(value, activated);
  });

  it("does not recover an attempt while its lifecycle transition is still owned", async () => {
    const value = await fixture();
    const first = await resolveStandaloneBootstrap(
      request(value, "0.19.0-beta.1"),
      { fetch: value.fetch },
    );

    await expect(resolveStandaloneBootstrap(
      request(value, "0.19.0-beta.1"),
      { fetch: value.fetch },
    )).rejects.toMatchObject({ code: "standalone-occupied" });

    const store = resolveClosureStorePaths({
      channel: "beta",
      namespace: "release-beta",
      root: value.paths.installationRoot,
    });
    expect((await readClosureBindingDescriptor(store)).attempt?.standalone.generation).toBe(0);
    const transition = first.handoff.transition;
    if (transition != null) {
      const lifecycle = bootstrapSidecarLifecycle({
        controlRoot: value.paths.dataRoot,
        scope: { channel: "beta", namespace: "release-beta" },
      });
      await lifecycle.abortTransition(transition);
    }
  });

  it("keeps Shell identity independent from Standalone update discovery", async () => {
    const value = await fixture();
    await consumeTransition(
      value,
      await resolveStandaloneBootstrap(request(value, "0.19.0-beta.1"), { fetch: value.fetch }),
    );
    const resolution = await resolveStandaloneBootstrap(
      request(value, "0.19.0-beta.1", value.metadataUrl, {
        kind: "exact",
        releaseVersion: "0.19.0-beta.2",
      }),
      { fetch: value.fetch },
    );
    await consumeTransition(value, resolution);

    expect(resolution.handoff.attachment.shell.version).toBe("0.19.0-beta.1");
    expect(resolution.handoff.handoff.descriptor.release.version).toBe("0.19.0-beta.1");
    expect(resolution.handoff.handoff.descriptor.standalone.version).toBe("0.19.0-beta.1");
  });

  it("keeps a newer compatible Standalone when an older Shell attaches", async () => {
    const value = await fixture();
    await consumeTransition(
      value,
      await resolveStandaloneBootstrap(request(value, "0.19.0-beta.2"), { fetch: value.fetch }),
    );
    const fetchCount = vi.mocked(value.fetch).mock.calls.length;
    const resolution = await resolveStandaloneBootstrap(request(value, "0.19.0-beta.1", null), { fetch: value.fetch });

    expect(resolution.handoff.handoff.descriptor.standalone.version).toBe("0.19.0-beta.2");
    expect(resolution.handoff.handoff.scope.generation).toBe(0);
    expect(vi.mocked(value.fetch).mock.calls).toHaveLength(fetchCount);
  });

  it("quick-fails when a newer Standalone raises the Shell minimum", async () => {
    const value = await fixture();
    await consumeTransition(
      value,
      await resolveStandaloneBootstrap(request(value, "0.19.0-beta.3"), { fetch: value.fetch }),
    );

    await expect(resolveStandaloneBootstrap(
      request(value, "0.19.0-beta.2", null),
      { fetch: value.fetch },
    )).rejects.toMatchObject({ code: "installer-required" });
  });

  it("maps shallow metadata incompatibility to installer-required before graph consumption", async () => {
    const value = await fixture();
    await expect(resolveStandaloneBootstrap(
      request(value, "0.19.0-beta.2", value.metadataUrl, {
        kind: "exact",
        releaseVersion: "0.19.0-beta.3",
      }),
      { fetch: value.fetch },
    )).rejects.toMatchObject({ code: "installer-required" });
  });

  it("quick-fails a new Shell combination while another attachment owns the namespace", async () => {
    const value = await fixture();
    await consumeTransition(
      value,
      await resolveStandaloneBootstrap(request(value, "0.19.0-beta.1"), { fetch: value.fetch }),
    );
    const lifecycle = bootstrapSidecarLifecycle({
      controlRoot: value.paths.dataRoot,
      scope: { channel: "beta", namespace: "release-beta" },
    });
    const occupant = await lifecycle.attach({
      leaseMs: 60_000,
      owner: {
        generation: 0,
        incarnation: "codex-plugin-a",
        key: "codex-plugin:codex-plugin-a",
      },
    });
    if (occupant.state !== "attached") throw new Error("occupant fixture was blocked");

    await expect(resolveStandaloneBootstrap(
      request(value, "0.19.0-beta.2"),
      { fetch: value.fetch },
    )).rejects.toMatchObject({
      code: "standalone-occupied",
      message: expect.stringContaining("codex-plugin:codex-plugin-a"),
    });
    await expect(lifecycle.snapshot()).resolves.toMatchObject({
      leases: [{ owner: { key: "codex-plugin:codex-plugin-a" } }],
      transition: null,
    });
  });

  it("repairs the exact committed version into a fresh generation without downgrade", async () => {
    const value = await fixture();
    const first = await resolveStandaloneBootstrap(request(value, "0.19.0-beta.2"), { fetch: value.fetch });
    await consumeTransition(value, first);
    await writeFile(first.bootloaderPath, "corrupt\n", "utf8");

    const repaired = await resolveStandaloneBootstrap(request(value, "0.19.0-beta.1"), { fetch: value.fetch });
    await consumeTransition(value, repaired);
    expect(repaired.handoff.handoff.descriptor.standalone.version).toBe("0.19.0-beta.2");
    expect(repaired.handoff.handoff.scope.generation).toBe(1);
    expect(await readFile(repaired.bootloaderPath, "utf8")).toContain("handoff = true");
  });

  it("repairs damaged materialized bytes offline from the committed manifest and blob Store", async () => {
    const value = await fixture();
    const first = await resolveStandaloneBootstrap(request(value, "0.19.0-beta.2"), { fetch: value.fetch });
    await consumeTransition(value, first);
    await writeFile(first.bootloaderPath, "corrupt\n", "utf8");
    const fetchCount = vi.mocked(value.fetch).mock.calls.length;

    const repaired = await resolveStandaloneBootstrap(
      request(value, "0.19.0-beta.1", null),
      { fetch: value.fetch },
    );
    await consumeTransition(value, repaired);

    expect(repaired.handoff.handoff.descriptor.standalone.version).toBe("0.19.0-beta.2");
    expect(repaired.handoff.handoff.scope.generation).toBe(1);
    expect(await readFile(repaired.bootloaderPath, "utf8")).toContain("handoff = true");
    expect(vi.mocked(value.fetch).mock.calls).toHaveLength(fetchCount);
  });
});
