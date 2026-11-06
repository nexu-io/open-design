import { vi } from "vitest";
import type { useElementLifecycleOps } from "./useElementLifecycleOps";

type LifecycleOpsParams = Parameters<typeof useElementLifecycleOps>[0];

/**
 * Baseline `useElementLifecycleOps` params for tests: inert stubs for every
 * dependency, overridden per test (typically just `commitDomEditPatchBatches`).
 * Shared by the z-reorder commit tests and the timeline-mirror harness.
 */
export function makeLifecycleOpsParams(
  overrides: Partial<LifecycleOpsParams> & Pick<LifecycleOpsParams, "commitDomEditPatchBatches">,
): LifecycleOpsParams {
  return {
    activeCompPath: "index.html",
    showToast: vi.fn(),
    writeProjectFile: vi.fn(async () => {}),
    editHistory: { recordEdit: vi.fn(async () => {}) },
    projectIdRef: { current: null },
    reloadPreview: vi.fn(),
    clearDomSelection: vi.fn(),
    ...overrides,
  };
}
