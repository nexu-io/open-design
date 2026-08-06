import { readFile } from "node:fs/promises";

import type {
  ClosureHandoffEnvelope,
  ClosureRuntimeTerminalStatus,
  ClosureShellCapabilityPort,
  ClosureShellCapabilityRequest,
  ClosureShellCapabilityResult,
  ClosureShimRequest,
  ClosureShimResult,
} from "@open-design/closure-proto";
import { describe, expect, it } from "vitest";

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(
    new URL(`../../closure-proto/fixtures/${name}`, import.meta.url),
    "utf8",
  )) as unknown;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function sameHandoff(actual: unknown, expected: ClosureHandoffEnvelope): ClosureHandoffEnvelope {
  const envelope = record(actual, "handoff");
  const identity = record(envelope.identity, "handoff identity");
  for (const field of [
    "channel",
    "digest",
    "generation",
    "namespace",
    "platform",
    "protocolVersion",
    "version",
  ] as const) {
    if (identity[field] !== expected.identity[field]) {
      throw new Error(`handoff ${field} does not match the active generation`);
    }
  }
  if (envelope.schemaVersion !== 1) throw new Error("unsupported handoff schema");
  return {
    identity: identity as ClosureHandoffEnvelope["identity"],
    schemaVersion: 1,
  };
}

/** A shell-side implementation that intentionally does not use protocol validators. */
class DemoShell {
  readonly request: ClosureShimRequest = {
    channel: "beta",
    namespace: "release-beta",
    platform: "darwin-arm64",
    schemaVersion: 1,
    shell: {
      type: "desktop",
      version: "0.19.0-beta.1",
    },
  };

  consumeShimResult(value: unknown): ClosureShimResult {
    const result = record(value, "shim result");
    if (result.schemaVersion !== 1) throw new Error("unsupported shim result schema");
    if (result.outcome === "installer-reinstall") {
      if (typeof result.minShellVersion !== "string") {
        throw new Error("installer result is missing minShellVersion");
      }
      return {
        minShellVersion: result.minShellVersion,
        outcome: "installer-reinstall",
        schemaVersion: 1,
      };
    }
    if (result.outcome !== "ready") throw new Error("unsupported shim result outcome");
    if (typeof result.reused !== "boolean" || typeof result.rolledBack !== "boolean") {
      throw new Error("ready result is missing lifecycle flags");
    }
    const handoffRecord = record(result.handoff, "handoff");
    const identity = record(handoffRecord.identity, "handoff identity");
    if (
      handoffRecord.schemaVersion !== 1
      || identity.channel !== this.request.channel
      || identity.namespace !== this.request.namespace
      || identity.platform !== this.request.platform
      || identity.protocolVersion !== 1
      || typeof identity.generation !== "number"
      || !Number.isSafeInteger(identity.generation)
      || identity.generation < 0
      || typeof identity.version !== "string"
      || typeof identity.digest !== "string"
      || !/^sha256:[0-9a-f]{64}$/u.test(identity.digest)
    ) {
      throw new Error("ready result crossed shell coordinates");
    }
    return {
      handoff: {
        identity: identity as ClosureHandoffEnvelope["identity"],
        schemaVersion: 1,
      },
      outcome: "ready",
      reused: result.reused,
      rolledBack: result.rolledBack,
      schemaVersion: 1,
    };
  }

  consumeTerminal(
    value: unknown,
    handoff: ClosureHandoffEnvelope,
  ): ClosureRuntimeTerminalStatus {
    const status = record(value, "runtime status");
    const boundHandoff = sameHandoff(status.handoff, handoff);
    if (status.schemaVersion !== 1 || typeof status.pid !== "number") {
      throw new Error("invalid runtime status identity");
    }
    if (status.state === "stopped") {
      return {
        handoff: boundHandoff,
        pid: status.pid,
        schemaVersion: 1,
        state: "stopped",
      };
    }
    if (status.state === "failed") {
      const error = record(status.error, "runtime error");
      if (typeof error.code !== "string") throw new Error("runtime failure has no code");
      return {
        error: { code: error.code },
        handoff: boundHandoff,
        pid: status.pid,
        schemaVersion: 1,
        state: "failed",
      };
    }
    throw new Error("runtime status is not terminal");
  }

  capabilityPort(handoff: ClosureHandoffEnvelope): ClosureShellCapabilityPort {
    return {
      invoke: async (value: ClosureShellCapabilityRequest): Promise<ClosureShellCapabilityResult> => {
        const request = record(value, "capability request");
        sameHandoff(request.handoff, handoff);
        if (request.schemaVersion !== 1 || typeof request.requestId !== "string") {
          throw new Error("invalid capability correlation");
        }
        if (request.capability !== "select-file") {
          return {
            handoff,
            outcome: "unsupported",
            requestId: request.requestId,
            schemaVersion: 1,
          };
        }
        return {
          handoff,
          outcome: "completed",
          output: { paths: ["selected.png"] },
          requestId: request.requestId,
          schemaVersion: 1,
        };
      },
    };
  }
}

describe("independent shell-side protocol demo", () => {
  it("produces the shim request and consumes both stable outcomes from fixtures", async () => {
    const shell = new DemoShell();
    const expectedRequest = await fixture("shim-request-v1.json");
    const fakeShim = async (request: unknown): Promise<unknown> => {
      expect(request).toEqual(expectedRequest);
      return await fixture("handoff-ready-v1.json");
    };

    const ready = shell.consumeShimResult(await fakeShim(shell.request));

    expect(ready).toMatchObject({
      handoff: { identity: { generation: 7 } },
      outcome: "ready",
    });
    expect(shell.consumeShimResult(
      await fixture("installer-reinstall-v1.json"),
    )).toEqual({
      minShellVersion: "0.19.0-beta.1",
      outcome: "installer-reinstall",
      schemaVersion: 1,
    });
  });

  it("serves a reverse capability request without knowing Closure internals", async () => {
    const shell = new DemoShell();
    const ready = shell.consumeShimResult(await fixture("handoff-ready-v1.json"));
    if (ready.outcome !== "ready") throw new Error("fixture must be ready");
    const request = await fixture("shell-capability-request-v1.json") as ClosureShellCapabilityRequest;

    await expect(shell.capabilityPort(ready.handoff).invoke(request)).resolves.toEqual(
      await fixture("shell-capability-completed-v1.json"),
    );
    await expect(shell.capabilityPort(ready.handoff).invoke({
      ...request,
      capability: "future-capability",
    })).resolves.toMatchObject({ outcome: "unsupported" });
  });

  it("rejects stale reverse requests before invoking shell behavior", async () => {
    const shell = new DemoShell();
    const ready = shell.consumeShimResult(await fixture("handoff-ready-v1.json"));
    if (ready.outcome !== "ready") throw new Error("fixture must be ready");
    const request = await fixture("shell-capability-request-v1.json") as ClosureShellCapabilityRequest;

    await expect(shell.capabilityPort(ready.handoff).invoke({
      ...request,
      handoff: {
        ...request.handoff,
        identity: {
          ...request.handoff.identity,
          generation: request.handoff.identity.generation - 1,
        },
      },
    })).rejects.toThrow(/generation/u);
  });

  it("consumes requested stop and unexpected exit through one lifecycle seam", async () => {
    const shell = new DemoShell();
    const ready = shell.consumeShimResult(await fixture("handoff-ready-v1.json"));
    if (ready.outcome !== "ready") throw new Error("fixture must be ready");

    expect(shell.consumeTerminal(
      await fixture("runtime-stopped-v1.json"),
      ready.handoff,
    )).toMatchObject({ state: "stopped" });
    expect(shell.consumeTerminal(
      await fixture("runtime-failed-v1.json"),
      ready.handoff,
    )).toMatchObject({
      error: { code: "process-exited" },
      state: "failed",
    });
  });
});
