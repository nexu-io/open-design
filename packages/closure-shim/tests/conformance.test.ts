import {
  createHash,
  generateKeyPairSync,
  sign as signPayload,
} from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CLOSURE_ARCHIVE_ENTRY_PATH,
  CLOSURE_ARCHIVE_MEDIA_TYPE,
  CLOSURE_HANDOFF_SCHEMA_VERSION,
  CLOSURE_INVENTORY_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  CLOSURE_SCHEMA_VERSION,
  CLOSURE_SHIM_SCHEMA_VERSION,
  CLOSURE_SIGNATURE_ALGORITHM,
  CLOSURE_SIGNATURE_SCHEMA_VERSION,
  serializeClosureCandidateManifestForSigning,
  type ClosureCandidateManifest,
  type ClosureCandidateSignature,
  type ClosureShellCapabilityPort,
  type ClosureShellCapabilityRequest,
  type ClosureShimRequest,
} from "@open-design/closure-proto";
import {
  readClosureAttemptDescriptor,
  readClosureRuntimeDescriptor,
  resolveClosureStorePaths,
} from "@open-design/closure-store";
import type { ClosureReleaseCandidate } from "@open-design/closure-update";
import type { StandalonePaths } from "@open-design/standalone-runtime";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ensureAndHandoffClosure,
  type ClosureShimOutcome,
  type ClosureShimTraceEvent,
  type SignedClosureReleaseCandidate,
} from "../src/index.js";
import {
  createFakeStandalone,
  createFakeClosureShimRequest,
  createFakeStandalonePaths,
} from "../src/testing.js";

const roots: string[] = [];
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const trustedPublicKey = publicKey.export({ format: "pem", type: "spki" }).toString();

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, {
    force: true,
    recursive: true,
  })));
});

function digest(bytes: string | Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function bodyRuntimeSource(mode: "healthy" | "unexpected-exit" | "unhealthy"): string {
  return `import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export async function handoffOpenDesignStandalone(input) {
  const child = spawn(process.execPath, [
    fileURLToPath(new URL("./body-worker.mjs", import.meta.url)),
    JSON.stringify(input.handoff),
    "${mode}",
  ], { stdio: ["ignore", "pipe", "inherit"] });
  const lines = createInterface({ input: child.stdout });
  const [line] = await once(lines, "line");
  let status = JSON.parse(String(line));
  let settleTerminal;
  const terminal = new Promise((resolve) => {
    settleTerminal = resolve;
  });
  let unexpectedExitTriggered = false;
  lines.on("line", (nextLine) => {
    const next = JSON.parse(String(nextLine));
    status = next;
    if (next.state !== "running") settleTerminal(next);
  });
  child.once("close", () => {
    if (status.state === "running") {
      status = {
        error: { code: "process-exited" },
        handoff: input.handoff,
        pid: child.pid,
        schemaVersion: 1,
        state: "failed",
      };
    }
    settleTerminal(status);
  });
  return {
    async close() {
      if (child.exitCode === null) child.kill("SIGTERM");
      await terminal;
      lines.close();
    },
    async readStatus() {
      return status;
    },
    async waitForTerminal() {
      if (
        "${mode}" === "unexpected-exit"
        && !unexpectedExitTriggered
        && child.exitCode === null
      ) {
        unexpectedExitTriggered = true;
        child.kill("SIGKILL");
      }
      return await terminal;
    },
  };
}
`;
}

const bodyWorkerSource = `const handoff = JSON.parse(process.argv[2]);
const mode = process.argv[3];
process.stdout.write(JSON.stringify({
  handoff,
  pid: process.pid,
  schemaVersion: 1,
  state: mode === "unhealthy" ? "failed" : "running",
}) + "\\n");
process.on("SIGTERM", () => {
  process.stdout.write(JSON.stringify({
    handoff,
    pid: process.pid,
    schemaVersion: 1,
    state: "stopped",
  }) + "\\n", () => process.exit(0));
});
setInterval(() => undefined, 1000);
`;

type CandidateFixture = SignedClosureReleaseCandidate & {
  archive: Buffer;
  fetch: typeof globalThis.fetch;
  inventory: {
    files: Array<{ digest: `sha256:${string}`; path: string; size: number }>;
    schemaVersion: typeof CLOSURE_INVENTORY_SCHEMA_VERSION;
  };
};

async function candidateFixture(input: {
  minShellVersion?: string;
  mode?: "healthy" | "unexpected-exit" | "unhealthy";
  version: string;
}): Promise<CandidateFixture> {
  const runtimeSource = bodyRuntimeSource(input.mode ?? "healthy");
  const zip = new JSZip();
  zip.file("body-worker.mjs", bodyWorkerSource);
  zip.file(CLOSURE_ARCHIVE_ENTRY_PATH, runtimeSource);
  const archive = await zip.generateAsync({ compression: "DEFLATE", type: "nodebuffer" });
  const files = [
    {
      digest: digest(bodyWorkerSource),
      path: "body-worker.mjs",
      size: Buffer.byteLength(bodyWorkerSource),
    },
    {
      digest: digest(runtimeSource),
      path: CLOSURE_ARCHIVE_ENTRY_PATH,
      size: Buffer.byteLength(runtimeSource),
    },
  ];
  const inventory = {
    files,
    schemaVersion: CLOSURE_INVENTORY_SCHEMA_VERSION,
  };
  const baseUrl = `https://closure.demo.test/beta/darwin-arm64/${input.version}`;
  const manifest: ClosureCandidateManifest = {
    artifact: {
      digest: digest(archive),
      entryPath: CLOSURE_ARCHIVE_ENTRY_PATH,
      inventoryDigest: digest(JSON.stringify(files)),
      mediaType: CLOSURE_ARCHIVE_MEDIA_TYPE,
      size: archive.byteLength,
      url: `${baseUrl}/closure.zip`,
    },
    compatibility: {
      shell: { minVersion: input.minShellVersion ?? "0.19.0-beta.1" },
    },
    identity: {
      channel: "beta",
      digest: digest(archive),
      platform: "darwin-arm64",
      protocolVersion: CLOSURE_PROTOCOL_VERSION,
      version: input.version,
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
  };
  const signature: ClosureCandidateSignature = {
    algorithm: CLOSURE_SIGNATURE_ALGORITHM,
    keyId: "demo-root-2026",
    schemaVersion: CLOSURE_SIGNATURE_SCHEMA_VERSION,
    value: signPayload(
      null,
      Buffer.from(serializeClosureCandidateManifestForSigning(manifest), "utf8"),
      privateKey,
    ).toString("base64url"),
  };
  const fetch = vi.fn(async (resource: string | URL | Request) => {
    const url = resource instanceof Request ? resource.url : String(resource);
    if (url === candidate.assets.archive) {
      return new Response(archive, {
        headers: { "content-length": String(archive.byteLength) },
        status: 200,
      });
    }
    if (url === candidate.assets.inventory) {
      return new Response(JSON.stringify(inventory), { status: 200 });
    }
    if (url === candidate.assets.manifest) {
      return new Response(JSON.stringify(manifest), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as typeof globalThis.fetch;
  return { archive, candidate, fetch, inventory, signature };
}

async function demoContext(): Promise<{
  paths: StandalonePaths;
  request: ClosureShimRequest;
  traces: ClosureShimTraceEvent[];
}> {
  const root = await mkdtemp(join(tmpdir(), "od-closure-shim-"));
  roots.push(root);
  return {
    paths: createFakeStandalonePaths(root),
    request: createFakeClosureShimRequest(),
    traces: [],
  };
}

function expectReady(outcome: ClosureShimOutcome): asserts outcome is Extract<ClosureShimOutcome, { handle: object }> {
  expect(outcome.result.outcome).toBe("ready");
  expect(outcome.handle).not.toBeNull();
}

function fakeShellCapabilities(
  invocations: ClosureShellCapabilityRequest[] = [],
): ClosureShellCapabilityPort {
  return {
    invoke: async (request) => {
      invocations.push(request);
      return {
        handoff: request.handoff,
        outcome: "unsupported",
        requestId: request.requestId,
        schemaVersion: CLOSURE_HANDOFF_SCHEMA_VERSION,
      };
    },
  };
}

async function launch(
  context: Awaited<ReturnType<typeof demoContext>>,
  fixture?: CandidateFixture,
  shellCapabilities: ClosureShellCapabilityPort = fakeShellCapabilities(),
): Promise<ClosureShimOutcome> {
  return await ensureAndHandoffClosure({
    ...(fixture == null ? {} : { candidate: fixture, fetch: fixture.fetch }),
    onTrace: (event) => context.traces.push(event),
    paths: context.paths,
    request: context.request,
    shellCapabilities,
    trustedKeys: { "demo-root-2026": trustedPublicKey },
  });
}

describe("Closure shim conformance demo", () => {
  it("acquires a trusted body and performs a real process handoff", async () => {
    const context = await demoContext();
    const fixture = await candidateFixture({ version: "0.19.0-beta.1" });

    const outcome = await launch(context, fixture);
    expectReady(outcome);
    const status = await outcome.handle.readStatus();

    expect(status.pid).not.toBe(process.pid);
    expect(status.handoff).toEqual(outcome.result.handoff);
    expect(context.traces).toEqual([
      "request:validated",
      "candidate:trusted",
      "candidate:activated",
      "handoff:armed",
      "body:ready",
      "runtime:confirmed",
    ]);
    const storePaths = resolveClosureStorePaths({
      channel: "beta",
      namespace: "release-beta",
      root: context.paths.installationRoot,
    });
    await expect(readClosureRuntimeDescriptor(storePaths)).resolves.toMatchObject({
      active: outcome.result.handoff.identity,
      lastSuccessful: outcome.result.handoff.identity,
    });
    await expect(readClosureAttemptDescriptor(storePaths)).resolves.toBeNull();
    await expect(outcome.close()).resolves.toMatchObject({
      handoff: outcome.result.handoff,
      schemaVersion: CLOSURE_HANDOFF_SCHEMA_VERSION,
      state: "stopped",
    });
  });

  it("reuses the verified active body on the second launch", async () => {
    const context = await demoContext();
    const fixture = await candidateFixture({ version: "0.19.0-beta.1" });
    const first = await launch(context, fixture);
    expectReady(first);
    await first.close();
    const fetchCalls = vi.mocked(fixture.fetch).mock.calls.length;
    context.traces.length = 0;

    const second = await launch(context, fixture);
    expectReady(second);

    expect(second.result.reused).toBe(true);
    expect(vi.mocked(fixture.fetch).mock.calls).toHaveLength(fetchCalls);
    expect(context.traces).toEqual([
      "request:validated",
      "candidate:trusted",
      "candidate:reused",
      "handoff:armed",
      "body:ready",
      "runtime:confirmed",
    ]);
    await second.close();
  });

  it("rejects untrusted or corrupted candidates without changing current", async () => {
    const context = await demoContext();
    const stable = await candidateFixture({ version: "0.19.0-beta.1" });
    const first = await launch(context, stable);
    expectReady(first);
    await first.close();
    const storePaths = resolveClosureStorePaths({
      channel: "beta",
      namespace: "release-beta",
      root: context.paths.installationRoot,
    });
    const before = await readClosureRuntimeDescriptor(storePaths);

    const untrusted = await candidateFixture({ version: "0.19.0-beta.2" });
    untrusted.signature = {
      ...untrusted.signature,
      value: Buffer.alloc(64).toString("base64url"),
    };
    await expect(launch(context, untrusted)).rejects.toMatchObject({
      code: "trust-rejected",
      name: "ClosureShimError",
    });
    await expect(readClosureRuntimeDescriptor(storePaths)).resolves.toEqual(before);

    const corrupt = await candidateFixture({ version: "0.19.0-beta.2" });
    corrupt.fetch = vi.fn(async (resource: string | URL | Request) => {
      const url = resource instanceof Request ? resource.url : String(resource);
      if (url === corrupt.candidate.assets.archive) {
        return new Response("corrupt", {
          headers: { "content-length": "7" },
          status: 200,
        });
      }
      if (url === corrupt.candidate.assets.inventory) {
        return new Response(JSON.stringify(corrupt.inventory), { status: 200 });
      }
      if (url === corrupt.candidate.assets.manifest) {
        return new Response(JSON.stringify(corrupt.candidate.manifest), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof globalThis.fetch;
    await expect(launch(context, corrupt)).rejects.toMatchObject({
      code: "candidate-rejected",
      name: "ClosureShimError",
    });
    await expect(readClosureRuntimeDescriptor(storePaths)).resolves.toEqual(before);
  });

  it("returns installer-reinstall before downloading an incompatible body", async () => {
    const context = await demoContext();
    const fixture = await candidateFixture({
      minShellVersion: "0.20.0-beta.1",
      version: "0.20.0-beta.1",
    });

    const outcome = await launch(context, fixture);

    expect(outcome).toEqual({
      handle: null,
      result: {
        minShellVersion: "0.20.0-beta.1",
        outcome: "installer-reinstall",
        schemaVersion: CLOSURE_SHIM_SCHEMA_VERSION,
      },
    });
    expect(vi.mocked(fixture.fetch)).not.toHaveBeenCalled();
    expect(context.traces).toEqual([
      "request:validated",
      "candidate:trusted",
      "installer:reinstall",
    ]);
  });

  it("rolls an unhealthy candidate back to last-successful exactly once", async () => {
    const context = await demoContext();
    const stable = await candidateFixture({ version: "0.19.0-beta.1" });
    const first = await launch(context, stable);
    expectReady(first);
    await first.close();
    context.traces.length = 0;
    const unhealthy = await candidateFixture({
      mode: "unhealthy",
      version: "0.19.0-beta.2",
    });

    const recovered = await launch(context, unhealthy);
    expectReady(recovered);

    expect(recovered.result).toMatchObject({
      outcome: "ready",
      reused: true,
      rolledBack: true,
    });
    expect(recovered.result.handoff.identity.version).toBe("0.19.0-beta.1");
    expect(context.traces).toEqual([
      "request:validated",
      "candidate:trusted",
      "candidate:activated",
      "handoff:armed",
      "body:failed",
      "runtime:rolled-back",
      "handoff:armed",
      "body:ready",
      "runtime:confirmed",
    ]);
    const storePaths = resolveClosureStorePaths({
      channel: "beta",
      namespace: "release-beta",
      root: context.paths.installationRoot,
    });
    const descriptor = await readClosureRuntimeDescriptor(storePaths);
    expect(descriptor.active?.version).toBe("0.19.0-beta.1");
    expect(descriptor.lastSuccessful?.version).toBe("0.19.0-beta.1");
    await expect(readClosureAttemptDescriptor(storePaths)).resolves.toBeNull();
    await recovered.close();
  });

  it("reports an unexpected real child exit as a generation-bound terminal failure", async () => {
    const context = await demoContext();
    const fixture = await candidateFixture({
      mode: "unexpected-exit",
      version: "0.19.0-beta.1",
    });

    const outcome = await launch(context, fixture);
    expectReady(outcome);

    await expect(outcome.waitForTerminal()).resolves.toMatchObject({
      error: { code: "process-exited" },
      handoff: outcome.result.handoff,
      schemaVersion: CLOSURE_HANDOFF_SCHEMA_VERSION,
      state: "failed",
    });
  });

  it("binds a Closure-to-Shell capability exchange to the active generation", async () => {
    const context = await demoContext();
    const fixture = await candidateFixture({ version: "0.19.0-beta.1" });
    const invocations: ClosureShellCapabilityRequest[] = [];
    const shellCapabilities: ClosureShellCapabilityPort = {
      invoke: async (request) => {
        invocations.push(request);
        return {
          handoff: request.handoff,
          outcome: "completed",
          output: { paths: ["selected.png"] },
          requestId: request.requestId,
          schemaVersion: CLOSURE_HANDOFF_SCHEMA_VERSION,
        };
      },
    };
    const body = createFakeStandalone({
      onHandoff: async ({ handoff, shell }) => {
        const result = await shell.invoke({
          capability: "select-file",
          handoff,
          input: { accept: ["image/png"] },
          requestId: "select-file-1",
          schemaVersion: CLOSURE_HANDOFF_SCHEMA_VERSION,
        });
        expect(result).toMatchObject({
          outcome: "completed",
          output: { paths: ["selected.png"] },
        });
      },
    });

    const outcome = await ensureAndHandoffClosure({
      candidate: fixture,
      fetch: fixture.fetch,
      importStandalone: async () => body.module,
      paths: context.paths,
      request: context.request,
      shellCapabilities,
      trustedKeys: { "demo-root-2026": trustedPublicKey },
    });
    expectReady(outcome);

    expect(invocations).toHaveLength(1);
    expect(invocations[0]).toMatchObject({
      capability: "select-file",
      handoff: outcome.result.handoff,
      requestId: "select-file-1",
    });
    await outcome.close();
  });

  it("rejects a stale capability result before the body can become ready", async () => {
    const context = await demoContext();
    const fixture = await candidateFixture({ version: "0.19.0-beta.1" });
    const body = createFakeStandalone({
      onHandoff: async ({ handoff, shell }) => {
        await shell.invoke({
          capability: "select-file",
          handoff,
          input: null,
          requestId: "select-file-1",
          schemaVersion: CLOSURE_HANDOFF_SCHEMA_VERSION,
        });
      },
    });

    await expect(ensureAndHandoffClosure({
      candidate: fixture,
      fetch: fixture.fetch,
      importStandalone: async () => body.module,
      paths: context.paths,
      request: context.request,
      shellCapabilities: {
        invoke: async (request) => ({
          handoff: {
            ...request.handoff,
            identity: {
              ...request.handoff.identity,
              generation: request.handoff.identity.generation + 1,
            },
          },
          outcome: "unsupported",
          requestId: request.requestId,
          schemaVersion: CLOSURE_HANDOFF_SCHEMA_VERSION,
        }),
      },
      trustedKeys: { "demo-root-2026": trustedPublicKey },
    })).rejects.toThrow(/no last-successful/u);
  });

  it("rejects stale body readiness without confirming the attempt", async () => {
    const context = await demoContext();
    const fixture = await candidateFixture({ version: "0.19.0-beta.1" });
    const body = createFakeStandalone({
      transformHandoff: (handoff) => ({
        ...handoff,
        identity: { ...handoff.identity, generation: handoff.identity.generation + 1 },
      }),
    });

    await expect(ensureAndHandoffClosure({
      candidate: fixture,
      fetch: fixture.fetch,
      importStandalone: async () => body.module,
      paths: context.paths,
      request: context.request,
      shellCapabilities: fakeShellCapabilities(),
      trustedKeys: { "demo-root-2026": trustedPublicKey },
    })).rejects.toThrow(/no last-successful/u);

    const storePaths = resolveClosureStorePaths({
      channel: "beta",
      namespace: "release-beta",
      root: context.paths.installationRoot,
    });
    expect((await readClosureRuntimeDescriptor(storePaths)).active).toBeNull();
    await expect(readClosureAttemptDescriptor(storePaths)).resolves.toBeNull();
    expect(body.closed).toBe(1);
  });
});
