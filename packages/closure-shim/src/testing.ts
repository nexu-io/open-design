import { join } from "node:path";

import {
  CLOSURE_HANDOFF_SCHEMA_VERSION,
  CLOSURE_SHIM_SCHEMA_VERSION,
  type ClosureHandoffEnvelope,
  type ClosureRuntimeTerminalStatus,
  type ClosureShimRequest,
} from "@open-design/closure-proto";
import type { HeadlessClosurePaths } from "@open-design/headless-runtime";

import type {
  ClosureBodyHandoffInput,
  ClosureBodyModule,
  ClosureBodyStatus,
} from "./index.js";

export type FakeClosureBody = {
  readonly closed: number;
  readonly handoffs: readonly ClosureBodyHandoffInput[];
  fail(errorCode?: string): void;
  module: ClosureBodyModule;
};

export function createFakeClosureBody(options: {
  onHandoff?: (input: ClosureBodyHandoffInput) => Promise<void> | void;
  pid?: number;
  transformHandoff?: (handoff: ClosureHandoffEnvelope) => ClosureHandoffEnvelope;
} = {}): FakeClosureBody {
  const handoffs: ClosureBodyHandoffInput[] = [];
  let closed = 0;
  let failLatest: ((errorCode: string) => void) | null = null;
  const fake: FakeClosureBody = {
    get closed() {
      return closed;
    },
    get handoffs() {
      return handoffs;
    },
    fail(errorCode = "process-exited") {
      if (failLatest == null) {
        throw new Error("Fake Closure body has not been handed off");
      }
      failLatest(errorCode);
    },
    module: {
      handoffOpenDesignClosure: async (input) => {
        handoffs.push(input);
        await options.onHandoff?.(input);
        const handoff = options.transformHandoff?.(input.handoff) ?? input.handoff;
        const pid = options.pid ?? 123;
        let status: ClosureBodyStatus = {
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

export function createFakeHeadlessClosurePaths(root: string): HeadlessClosurePaths {
  return {
    cacheRoot: join(root, "cache"),
    dataRoot: join(root, "data"),
    installationRoot: root,
    logsRoot: join(root, "logs"),
    resourceRoot: join(root, "resources"),
    runtimeRoot: join(root, "run"),
  };
}
