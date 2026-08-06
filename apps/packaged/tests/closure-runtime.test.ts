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
  readClosureRuntimeDescriptor,
  resolveClosureStorePaths,
  resolveClosureStoreVersionPaths,
  type ClosureStorePaths,
} from "@open-design/closure-store";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PackagedConfig } from "../src/config.js";
import {
  confirmPackagedClosureRuntime,
  createPackagedRuntimeIdentity,
  resolvePackagedClosureRuntime,
  startPackagedClosureRuntime,
  type PackagedClosureLayout,
} from "../src/closure-runtime.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

function digest(value: string | Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function legacyConfig(namespace: string): PackagedConfig {
  return {
    amrProfile: "test",
    appVersion: "0.18.0-beta.4",
    daemonCliEntry: "/legacy/daemon-cli.mjs",
    daemonSidecarEntry: "/legacy/daemon-sidecar.mjs",
    namespace,
    namespaceBaseRoot: "/legacy/namespaces",
    nodeCommand: "/legacy/node",
    posthogHost: null,
    posthogKey: null,
    resourceRoot: "/legacy/resources",
    telemetryRelayUrl: null,
    updateMetadataUrl: null,
    velaWebUrl: null,
    webOutputMode: "server",
    webSidecarEntry: "/legacy/web-sidecar.mjs",
    webStandaloneRoot: null,
  };
}

async function createStore(): Promise<ClosureStorePaths> {
  const root = await mkdtemp(join(tmpdir(), "od-packaged-closure-"));
  roots.push(root);
  return resolveClosureStorePaths({ channel: "beta", namespace: "release-beta", root });
}

async function writePayloadFile(root: string, path: string, contents: string): Promise<void> {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents);
}

async function materializeCandidate(
  paths: ClosureStorePaths,
  version: string,
  options: { confirm?: boolean; minShellVersion?: string } = {},
) {
  const archive = Buffer.from(`archive:${version}`);
  const archiveDigest = digest(archive);
  const files = new Map<string, string>([
    ["daemon/daemon-cli.mjs", "export const cli = true;\n"],
    ["daemon/daemon-sidecar.mjs", "export const sidecar = true;\n"],
    ["resources/open-design/manifest.txt", "resources\n"],
    [CLOSURE_ARCHIVE_ENTRY_PATH, "export const closure = true;\n"],
    ["web/standalone/apps/web/server.js", "console.log('server');\n"],
    ["web/web-sidecar.mjs", "export const web = true;\n"],
  ]);
  const inventory = {
    files: [...files.entries()]
      .map(([path, contents]) => ({ digest: digest(contents), path, size: Buffer.byteLength(contents) }))
      .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
    schemaVersion: CLOSURE_INVENTORY_SCHEMA_VERSION,
  };
  const manifest: ClosureCandidateManifest = {
    artifact: {
      digest: archiveDigest,
      entryPath: CLOSURE_ARCHIVE_ENTRY_PATH,
      inventoryDigest: digest(JSON.stringify(inventory.files)),
      mediaType: CLOSURE_ARCHIVE_MEDIA_TYPE,
      size: archive.byteLength,
      url: `https://releases.open-design.ai/beta/closure/darwin-arm64/versions/${version}/closure.zip`,
    },
    compatibility: { shell: { minVersion: options.minShellVersion ?? "0.16.2" } },
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
  await mkdir(versionPaths.payloadRoot, { recursive: true });
  await writeFile(versionPaths.archivePath, archive);
  await writeFile(versionPaths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(versionPaths.inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
  for (const [path, contents] of files) await writePayloadFile(versionPaths.payloadRoot, path, contents);
  const activated = await activateStoredClosureCandidate(paths, binding);
  if (options.confirm !== false) {
    await armClosureRuntimeAttempt(paths, activated.pointer);
    await confirmClosureRuntime(paths, activated.pointer);
  }
  const layout: PackagedClosureLayout = {
    daemonCliEntry: join(versionPaths.payloadRoot, "daemon", "daemon-cli.mjs"),
    daemonSidecarEntry: join(versionPaths.payloadRoot, "daemon", "daemon-sidecar.mjs"),
    resourceRoot: join(versionPaths.payloadRoot, "resources", "open-design"),
    webServerEntry: join(versionPaths.payloadRoot, "web", "standalone", "apps", "web", "server.js"),
    webSidecarEntry: join(versionPaths.payloadRoot, "web", "web-sidecar.mjs"),
    webStandaloneRoot: join(versionPaths.payloadRoot, "web", "standalone"),
  };
  return { activated, binding, layout, versionPaths };
}

function resolverInput(paths: ClosureStorePaths, config = legacyConfig(paths.namespace)) {
  return {
    channel: paths.channel,
    installationRoot: paths.root,
    legacyConfig: config,
    namespace: paths.namespace,
    shellVersion: config.appVersion,
  };
}

const resolverOptions = { platformTarget: "darwin-arm64" } as const;

describe("packaged Closure selection", () => {
  it("attaches the active Closure and keeps shell-owned settings independent", async () => {
    const paths = await createStore();
    const candidate = await materializeCandidate(paths, "0.18.0-beta.5");
    const config = legacyConfig(paths.namespace);

    const runtime = await resolvePackagedClosureRuntime(resolverInput(paths, config), {
      ...resolverOptions,
      importRuntime: vi.fn(async () => ({
        resolveOpenDesignClosureLayout: () => candidate.layout,
      })),
    });

    expect(runtime.source).toBe("closure");
    expect(runtime.runtimeConfig).toMatchObject({
      appVersion: "0.18.0-beta.5",
      daemonSidecarEntry: candidate.layout.daemonSidecarEntry,
      nodeCommand: config.nodeCommand,
      updateMetadataUrl: config.updateMetadataUrl,
      webOutputMode: "standalone",
    });
    expect(await readClosureAttemptDescriptor(paths)).toMatchObject(candidate.activated.pointer);
    await confirmPackagedClosureRuntime(runtime);
    expect(await readClosureAttemptDescriptor(paths)).toBeNull();
  });

  it("uses the legacy combination when no active Closure exists", async () => {
    const paths = await createStore();
    const config = legacyConfig(paths.namespace);

    const runtime = await resolvePackagedClosureRuntime(resolverInput(paths, config), resolverOptions);

    expect(runtime).toMatchObject({
      reason: "no-active-closure",
      runtimeConfig: config,
      source: "legacy",
    });
  });

  it("defers an incompatible Closure without mutating its active pointer", async () => {
    const paths = await createStore();
    const candidate = await materializeCandidate(paths, "0.18.0-beta.5", {
      minShellVersion: "0.19.0",
    });

    const runtime = await resolvePackagedClosureRuntime(resolverInput(paths), resolverOptions);

    expect(runtime).toMatchObject({ reason: "shell-incompatible", source: "legacy" });
    expect((await readClosureRuntimeDescriptor(paths)).active).toEqual(candidate.activated.pointer);
    expect(await readClosureAttemptDescriptor(paths)).toBeNull();
  });

  it("refuses a Closure built for a different shell platform", async () => {
    const paths = await createStore();
    await materializeCandidate(paths, "0.18.0-beta.5");

    const runtime = await resolvePackagedClosureRuntime(resolverInput(paths), {
      platformTarget: "win32-x64",
    });

    expect(runtime).toMatchObject({ reason: "platform-mismatch", source: "legacy" });
    expect(await readClosureAttemptDescriptor(paths)).toBeNull();
  });

  it("rolls an invalid new candidate back to last-successful and falls back for the current boot", async () => {
    const paths = await createStore();
    const first = await materializeCandidate(paths, "0.18.0-beta.5");
    const second = await materializeCandidate(paths, "0.18.0-beta.6", { confirm: false });
    await writeFile(join(second.versionPaths.payloadRoot, CLOSURE_ARCHIVE_ENTRY_PATH), "corrupt\n");

    const runtime = await resolvePackagedClosureRuntime(resolverInput(paths), resolverOptions);

    expect(runtime).toMatchObject({ reason: "candidate-invalid", source: "legacy" });
    expect((await readClosureRuntimeDescriptor(paths)).active).toEqual(first.activated.pointer);
    expect(await readClosureAttemptDescriptor(paths)).toBeNull();
  });

  it("recovers a failed active startup and retries the legacy runtime once", async () => {
    const paths = await createStore();
    const first = await materializeCandidate(paths, "0.18.0-beta.5");
    const second = await materializeCandidate(paths, "0.18.0-beta.6", { confirm: false });
    const selected = await resolvePackagedClosureRuntime(resolverInput(paths), {
      ...resolverOptions,
      importRuntime: async () => ({ resolveOpenDesignClosureLayout: () => second.layout }),
    });
    const start = vi.fn(async (config: PackagedConfig) => {
      if (config.appVersion === second.binding.version) throw new Error("Closure boot failed");
      return "legacy-ready";
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const started = await startPackagedClosureRuntime(selected, start);

    expect(started.value).toBe("legacy-ready");
    expect(started.runtime).toMatchObject({ reason: "closure-start-failed", source: "legacy" });
    expect(start).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      "[open-design packaged] active Closure failed to start; retrying the legacy combined runtime",
      {
        closureVersion: second.binding.version,
        error: "Closure boot failed",
      },
    );
    expect((await readClosureRuntimeDescriptor(paths)).active).toEqual(first.activated.pointer);
  });

  it("reports shell and Closure identities as separate dimensions", async () => {
    const paths = await createStore();
    const candidate = await materializeCandidate(paths, "0.18.0-beta.5");
    const runtime = await resolvePackagedClosureRuntime(resolverInput(paths), {
      ...resolverOptions,
      importRuntime: async () => ({ resolveOpenDesignClosureLayout: () => candidate.layout }),
    });

    expect(createPackagedRuntimeIdentity({
      closure: runtime,
      shellSource: "current-package",
      shellVersion: "0.18.0-beta.4",
    })).toEqual({
      closure: {
        channel: "beta",
        digest: candidate.binding.digest,
        generation: candidate.activated.pointer.generation,
        namespace: "release-beta",
        platform: "darwin-arm64",
        protocolVersion: CLOSURE_PROTOCOL_VERSION,
        source: "closure",
        version: "0.18.0-beta.5",
      },
      shell: { source: "current-package", version: "0.18.0-beta.4" },
    });
  });
});
