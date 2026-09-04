import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ElectronBoundPhysicalResourceSet } from "@/adapters/standalone/physical-resources.js";

const sidecar = vi.hoisted(() => ({
  stopSidecars: vi.fn(),
  withSidecarLifecycleLock: vi.fn(async (_stamps, operation) => await operation()),
}));

vi.mock("@open-design/sidecar", async (importOriginal) => ({
  ...await importOriginal<typeof import("@open-design/sidecar")>(),
  stopSidecars: sidecar.stopSidecars,
  withSidecarLifecycleLock: sidecar.withSidecarLifecycleLock,
}));

import {
  withElectronPhysicalResourceSetGuard,
  type ElectronPhysicalResourceSetGuard,
} from "@/adapters/standalone/guarded-lifecycle.js";

const stamp = Object.freeze({
  app: "standalone",
  channel: "betahyx",
  mode: "runtime",
  namespace: "electron-foundation",
  source: "standalone",
});

const resourceSet: ElectronBoundPhysicalResourceSet = Object.freeze({
  schemaVersion: 1,
  binding: Object.freeze({
    schemaVersion: 1,
    protocol: "standalone-launcher-v1",
    scope: Object.freeze({ channel: stamp.channel, namespace: stamp.namespace }),
    generationId: "a".repeat(64),
    launcher: Object.freeze({
      resourceId: "standalone-launcher",
      blobSha256: "b".repeat(64),
      entrypoint: "launcher.mjs",
      path: "/store/generations/launcher.mjs",
    }),
    minimumShellVersions: Object.freeze({ electron: "0.1.0" }),
    digest: "c".repeat(64),
  }),
  resources: Object.freeze([{ id: "standalone-runtime", stamp }]),
});

const stopped = Object.freeze({
  alreadyStopped: false,
  forcedPids: [] as number[],
  gracefulAccepted: true,
  matchedPids: [42],
  remainingPids: [] as number[],
  stoppedPids: [42],
});

describe("Electron guarded physical lifecycle", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("retires the complete bound set once and emits an exact certificate", async () => {
    sidecar.stopSidecars.mockResolvedValue({
      ...stopped,
      results: [{ result: stopped, stamp }],
    });
    let retained: ElectronPhysicalResourceSetGuard | null = null;
    const certificate = await withElectronPhysicalResourceSetGuard(resourceSet, async (guard) => {
      retained = guard;
      const first = guard.retire();
      const second = guard.retire();
      expect(first).toBe(second);
      return await first;
    });

    expect(sidecar.withSidecarLifecycleLock).toHaveBeenCalledWith([stamp], expect.any(Function), {});
    expect(sidecar.stopSidecars).toHaveBeenCalledOnce();
    expect(sidecar.stopSidecars).toHaveBeenCalledWith([{ options: {}, stamp }]);
    expect(certificate).toEqual({
      schemaVersion: 1,
      bindingDigest: resourceSet.binding.digest,
      generationId: resourceSet.binding.generationId,
      resources: [{ id: "standalone-runtime", result: stopped, stamp }],
    });
    expect(() => retained!.retire()).toThrow(/guard is no longer active/u);
  });

  it("fails closed when Sidecar reports a survivor or replacement", async () => {
    sidecar.stopSidecars.mockResolvedValue({
      ...stopped,
      remainingPids: [73],
      results: [{ result: { ...stopped, remainingPids: [73] }, stamp }],
    });
    await expect(withElectronPhysicalResourceSetGuard(resourceSet, async (guard) => await guard.retire()))
      .rejects.toEqual(expect.objectContaining({
        name: "ElectronPhysicalRetirementError",
        remainingPids: [73],
      }));
  });

  it("retires a failed replacement only after the original set and under the same guard", async () => {
    const replacement = Object.freeze({
      ...resourceSet,
      binding: Object.freeze({
        ...resourceSet.binding,
        generationId: "d".repeat(64),
        digest: "e".repeat(64),
      }),
    });
    sidecar.stopSidecars.mockResolvedValue({
      ...stopped,
      results: [{ result: stopped, stamp }],
    });
    await withElectronPhysicalResourceSetGuard(resourceSet, async (guard) => {
      await expect(guard.retireReplacement(replacement)).rejects.toThrow("original resource set");
      await guard.retire();
      await expect(guard.retireReplacement(replacement)).resolves.toMatchObject({
        bindingDigest: replacement.binding.digest,
        generationId: replacement.binding.generationId,
      });
    });
    expect(sidecar.stopSidecars).toHaveBeenCalledTimes(2);
  });

  it("rejects replacement retirement outside the guarded resource identity", async () => {
    sidecar.stopSidecars.mockResolvedValue({
      ...stopped,
      results: [{ result: stopped, stamp }],
    });
    await expect(withElectronPhysicalResourceSetGuard(resourceSet, async (guard) => {
      await guard.retire();
      await guard.retireReplacement(Object.freeze({
        ...resourceSet,
        resources: Object.freeze([{ id: "standalone-runtime", stamp: Object.freeze({ ...stamp, namespace: "other" }) }]),
      }));
    })).rejects.toThrow("escaped the guarded physical resource set");
    expect(sidecar.stopSidecars).toHaveBeenCalledOnce();
  });

  it("does not retire resources when the guarded continuation only observes", async () => {
    await expect(withElectronPhysicalResourceSetGuard(resourceSet, async (guard) => ({
      bindingDigest: guard.bindingDigest,
      generationId: guard.generationId,
    }))).resolves.toEqual({
      bindingDigest: resourceSet.binding.digest,
      generationId: resourceSet.binding.generationId,
    });
    expect(sidecar.stopSidecars).not.toHaveBeenCalled();
  });

  it("keeps the physical guard held until an unawaited retirement settles", async () => {
    let finishRetirement!: () => void;
    const retiring = new Promise<void>((resolve) => { finishRetirement = resolve; });
    sidecar.stopSidecars.mockImplementation(async () => {
      await retiring;
      return { ...stopped, results: [{ result: stopped, stamp }] };
    });
    let settled = false;
    const guarded = withElectronPhysicalResourceSetGuard(resourceSet, async (guard) => {
      void guard.retire();
      throw new Error("continuation failed");
    }).finally(() => { settled = true; });
    await vi.waitFor(() => { expect(sidecar.stopSidecars).toHaveBeenCalledOnce(); });
    expect(settled).toBe(false);
    finishRetirement();
    await expect(guarded).rejects.toThrow("continuation failed");
  });
});
