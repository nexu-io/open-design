import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
  type ClosureCandidateManifest,
  type ClosureShellCapabilityPort,
  type ClosureShellCapabilityRequest,
  type ClosureShimRequest,
} from "@open-design/closure-proto";
import {
  readClosureBindingDescriptor,
  resolveClosureStorePaths,
} from "@open-design/closure-store";
import {
  applyClosureUpdate,
  type ClosureReleaseCandidate,
} from "@open-design/closure-update";
import type { StandalonePaths } from "@open-design/standalone-runtime";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ensureAndHandoffClosure,
  type ClosureShimOutcome,
  type ClosureShimTraceEvent,
} from "../src/index.js";
import {
  createFakeStandalone,
  createFakeClosureShimRequest,
  createFakeStandalonePaths,
} from "../src/testing.js";

const roots: string[] = [];

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

type CandidateFixture = {
  archive: Buffer;
  candidate: ClosureReleaseCandidate;
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
    releaseVersion: input.version,
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
  return { archive, candidate, fetch, inventory };
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

function storePaths(context: Awaited<ReturnType<typeof demoContext>>) {
  return resolveClosureStorePaths({
    channel: context.request.channel,
    namespace: context.request.namespace,
    root: context.paths.installationRoot,
  });
}

async function commit(
  context: Awaited<ReturnType<typeof demoContext>>,
  fixture: CandidateFixture,
): Promise<void> {
  const result = await applyClosureUpdate({
    candidate: fixture.candidate,
    fetch: fixture.fetch,
    paths: storePaths(context),
    shellVersion: context.request.shell.version,
  });
  expect(result.state).toBe("committed");
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
  shellCapabilities: ClosureShellCapabilityPort = fakeShellCapabilities(),
): Promise<ClosureShimOutcome> {
  return await ensureAndHandoffClosure({
    onTrace: (event) => context.traces.push(event),
    paths: context.paths,
    request: context.request,
    shellCapabilities,
  });
}

describe("Closure shim committed-binding conformance", () => {
  it("enters one already-committed body through a real process handoff", async () => {
    const context = await demoContext();
    const fixture = await candidateFixture({ version: "0.19.0-beta.1" });
    await commit(context, fixture);
    const descriptorBefore = await readClosureBindingDescriptor(storePaths(context));

    const outcome = await launch(context);
    expectReady(outcome);
    const status = await outcome.handle.readStatus();

    expect(status.pid).not.toBe(process.pid);
    expect(status.handoff).toEqual(outcome.result.handoff);
    expect(outcome.result).toMatchObject({ reused: true, rolledBack: false });
    expect(context.traces).toEqual([
      "request:validated",
      "binding:resolved",
      "handoff:entered",
      "body:ready",
    ]);
    await expect(readClosureBindingDescriptor(storePaths(context))).resolves.toEqual(descriptorBefore);
    await expect(outcome.close()).resolves.toMatchObject({
      handoff: outcome.result.handoff,
      schemaVersion: CLOSURE_HANDOFF_SCHEMA_VERSION,
      state: "stopped",
    });
  });

  it("fails visibly when no committed binding exists", async () => {
    const context = await demoContext();

    await expect(launch(context)).rejects.toMatchObject({
      code: "body-unavailable",
      name: "ClosureShimError",
    });
    expect(context.traces).toEqual(["request:validated"]);
  });

  it("returns installer-reinstall for an incompatible committed body", async () => {
    const context = await demoContext();
    const fixture = await candidateFixture({
      minShellVersion: "0.20.0-beta.1",
      version: "0.20.0-beta.1",
    });
    await applyClosureUpdate({
      candidate: fixture.candidate,
      fetch: fixture.fetch,
      paths: storePaths(context),
      shellVersion: "0.20.0-beta.1",
    });

    await expect(launch(context)).resolves.toEqual({
      handle: null,
      result: {
        minShellVersion: "0.20.0-beta.1",
        outcome: "installer-reinstall",
        schemaVersion: CLOSURE_SHIM_SCHEMA_VERSION,
      },
    });
    expect(context.traces).toEqual([
      "request:validated",
      "binding:resolved",
      "installer:reinstall",
    ]);
  });

  it("fails a broken committed body without selecting an older generation", async () => {
    const context = await demoContext();
    const stable = await candidateFixture({ version: "0.19.0-beta.1" });
    await commit(context, stable);
    const broken = await candidateFixture({ mode: "unhealthy", version: "0.19.0-beta.2" });
    await commit(context, broken);
    const descriptorBefore = await readClosureBindingDescriptor(storePaths(context));

    await expect(launch(context)).rejects.toMatchObject({
      code: "handoff-failed",
      name: "ClosureShimError",
    });
    await expect(readClosureBindingDescriptor(storePaths(context))).resolves.toEqual(descriptorBefore);
    expect(descriptorBefore.committed?.standalone.version).toBe("0.19.0-beta.2");
    expect(context.traces).toEqual([
      "request:validated",
      "binding:resolved",
      "handoff:entered",
      "body:failed",
    ]);
  });

  it("fails immutable verification without repairing or replacing the binding", async () => {
    const context = await demoContext();
    const fixture = await candidateFixture({ version: "0.19.0-beta.1" });
    await commit(context, fixture);
    const descriptorBefore = await readClosureBindingDescriptor(storePaths(context));
    const digestValue = descriptorBefore.committed?.standalone.digest.slice("sha256:".length);
    expect(digestValue).toBeTruthy();
    await writeFile(join(
      storePaths(context).versionsRoot,
      "0.19.0-beta.1",
      digestValue!,
      "payload",
      CLOSURE_ARCHIVE_ENTRY_PATH,
    ), "tampered\n");

    await expect(launch(context)).rejects.toMatchObject({
      code: "body-unavailable",
      name: "ClosureShimError",
    });
    await expect(readClosureBindingDescriptor(storePaths(context))).resolves.toEqual(descriptorBefore);
  });

  it("reports an unexpected child exit as a generation-bound terminal failure", async () => {
    const context = await demoContext();
    const fixture = await candidateFixture({
      mode: "unexpected-exit",
      version: "0.19.0-beta.1",
    });
    await commit(context, fixture);

    const outcome = await launch(context);
    expectReady(outcome);
    await expect(outcome.waitForTerminal()).resolves.toMatchObject({
      error: { code: "process-exited" },
      handoff: outcome.result.handoff,
      schemaVersion: CLOSURE_HANDOFF_SCHEMA_VERSION,
      state: "failed",
    });
  });

  it("binds Closure-to-Shell capabilities to the committed generation", async () => {
    const context = await demoContext();
    const fixture = await candidateFixture({ version: "0.19.0-beta.1" });
    await commit(context, fixture);
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
        await expect(shell.invoke({
          capability: "select-file",
          handoff,
          input: { accept: ["image/png"] },
          requestId: "select-file-1",
          schemaVersion: CLOSURE_HANDOFF_SCHEMA_VERSION,
        })).resolves.toMatchObject({
          outcome: "completed",
          output: { paths: ["selected.png"] },
        });
      },
    });

    const outcome = await ensureAndHandoffClosure({
      importStandalone: async () => body.module,
      paths: context.paths,
      request: context.request,
      shellCapabilities,
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

  it("rejects stale readiness and closes the entered body", async () => {
    const context = await demoContext();
    const fixture = await candidateFixture({ version: "0.19.0-beta.1" });
    await commit(context, fixture);
    const body = createFakeStandalone({
      transformHandoff: (handoff) => ({
        ...handoff,
        identity: { ...handoff.identity, generation: handoff.identity.generation + 1 },
      }),
    });

    await expect(ensureAndHandoffClosure({
      importStandalone: async () => body.module,
      paths: context.paths,
      request: context.request,
      shellCapabilities: fakeShellCapabilities(),
    })).rejects.toMatchObject({
      code: "handoff-failed",
      name: "ClosureShimError",
    });
    expect(body.closed).toBe(1);
  });
});
