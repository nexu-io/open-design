import { join } from "node:path";

import {
  CLOSURE_HANDOFF_SCHEMA_VERSION,
  CLOSURE_SHIM_SCHEMA_VERSION,
  type ClosureHandoffEnvelope,
  type ClosureRuntimeTerminalStatus,
  type ClosureShimRequest,
} from "@open-design/closure-proto";
import type { StandalonePaths } from "@open-design/standalone-runtime";

import type {
  StandaloneHandoffInput,
  StandaloneModule,
  StandaloneStatus,
} from "./index.js";

export type FakeStandalone = {
  readonly closed: number;
  readonly handoffs: readonly StandaloneHandoffInput[];
  fail(errorCode?: string): void;
  module: StandaloneModule;
};

export function createFakeStandalone(options: {
  onHandoff?: (input: StandaloneHandoffInput) => Promise<void> | void;
  pid?: number;
  transformHandoff?: (handoff: ClosureHandoffEnvelope) => ClosureHandoffEnvelope;
} = {}): FakeStandalone {
  const handoffs: StandaloneHandoffInput[] = [];
  let closed = 0;
  let failLatest: ((errorCode: string) => void) | null = null;
  const fake: FakeStandalone = {
    get closed() {
      return closed;
    },
    get handoffs() {
      return handoffs;
    },
    fail(errorCode = "process-exited") {
      if (failLatest == null) {
        throw new Error("Fake Standalone has not been handed off");
      }
      failLatest(errorCode);
    },
    module: {
      handoffOpenDesignStandalone: async (input) => {
        handoffs.push(input);
        await options.onHandoff?.(input);
        const handoff = options.transformHandoff?.(input.handoff) ?? input.handoff;
        const pid = options.pid ?? 123;
        let status: StandaloneStatus = {
          handoff,
          pid,
          schemaVersion: CLOSURE_HANDOFF_SCHEMA_VERSION,
          state: "running",
        };
        let settleTerminal: ((status: ClosureRuntimeTerminalStatus) => void) | null = null;
        const terminal = new Promise<ClosureRuntimeTerminalStatus>((resolve) => {
          settleTerminal = resolve;
        });
        const settle = (next: ClosureRuntimeTerminalStatus): void => {
          if (status.state !== "running") return;
          status = next;
          settleTerminal?.(next);
        };
        failLatest = (errorCode) => settle({
          error: { code: errorCode },
          handoff,
          pid,
          schemaVersion: CLOSURE_HANDOFF_SCHEMA_VERSION,
          state: "failed",
        });
        return {
          close: async () => {
            closed += 1;
            settle({
              handoff,
              pid,
              schemaVersion: CLOSURE_HANDOFF_SCHEMA_VERSION,
              state: "stopped",
            });
          },
          readStatus: async () => status,
          waitForTerminal: async () => await terminal,
        };
      },
    },
  };
  return fake;
}

export function createFakeClosureShimRequest(
  overrides: Partial<ClosureShimRequest> = {},
): ClosureShimRequest {
  const base: ClosureShimRequest = {
    channel: "beta",
    namespace: "release-beta",
    platform: "darwin-arm64",
    schemaVersion: CLOSURE_SHIM_SCHEMA_VERSION,
    shell: {
      type: "desktop",
      version: "0.19.0-beta.1",
    },
  };
  return {
    ...base,
    ...overrides,
    shell: {
      ...base.shell,
      ...overrides.shell,
    },
  };
}

export function createFakeStandalonePaths(root: string): StandalonePaths {
  return {
    cacheRoot: join(root, "cache"),
    dataRoot: join(root, "data"),
    installationRoot: root,
    logsRoot: join(root, "logs"),
    resourceRoot: join(root, "resources"),
    runtimeRoot: join(root, "run"),
  };
}
