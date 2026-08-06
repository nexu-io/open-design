import { join } from "node:path";

import {
  CLOSURE_SHIM_SCHEMA_VERSION,
  type ClosureHandoffEnvelope,
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
  module: ClosureBodyModule;
};

export function createFakeClosureBody(options: {
  pid?: number;
  transformHandoff?: (handoff: ClosureHandoffEnvelope) => ClosureHandoffEnvelope;
} = {}): FakeClosureBody {
  const handoffs: ClosureBodyHandoffInput[] = [];
  let closed = 0;
  const fake: FakeClosureBody = {
    get closed() {
      return closed;
    },
    get handoffs() {
      return handoffs;
    },
    module: {
      handoffOpenDesignClosure: async (input) => {
        handoffs.push(input);
        const status: ClosureBodyStatus = {
          handoff: options.transformHandoff?.(input.handoff) ?? input.handoff,
          pid: options.pid ?? 123,
          state: "running",
        };
        return {
          close: async () => {
            closed += 1;
          },
          readStatus: async () => status,
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
