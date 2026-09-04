import {
  stopSidecars,
  withSidecarLifecycleLock,
  type SidecarLifecycleLockOptions,
  type SidecarStopOptions,
  type SidecarStopResult,
} from "@open-design/sidecar";

import type { ElectronBoundPhysicalResourceSet } from "./physical-resources.js";

export const ELECTRON_PHYSICAL_RETIREMENT_SCHEMA_VERSION = 1 as const;

export type ElectronPhysicalRetirementCertificate = Readonly<{
  schemaVersion: typeof ELECTRON_PHYSICAL_RETIREMENT_SCHEMA_VERSION;
  bindingDigest: string;
  generationId: string;
  resources: readonly Readonly<{
    id: string;
    result: SidecarStopResult;
    stamp: ElectronBoundPhysicalResourceSet["resources"][number]["stamp"];
  }>[];
}>;

export type ElectronPhysicalResourceSetGuard = Readonly<{
  bindingDigest: string;
  generationId: string;
  retire(options?: SidecarStopOptions): Promise<ElectronPhysicalRetirementCertificate>;
}>;

export class ElectronPhysicalRetirementError extends Error {
  constructor(readonly remainingPids: readonly number[]) {
    super(`Electron physical resource retirement left survivors: ${remainingPids.join(", ")}`);
    this.name = "ElectronPhysicalRetirementError";
  }
}

/**
 * Hold Sidecar's cross-process resource-set guard around a Shell-owned
 * continuation. Retirement is available only through the scoped guard, so a
 * caller cannot accidentally recreate an observe/stop/commit split sequence.
 */
export async function withElectronPhysicalResourceSetGuard<T>(
  resourceSet: ElectronBoundPhysicalResourceSet,
  operation: (guard: ElectronPhysicalResourceSetGuard) => Promise<T>,
  options: SidecarLifecycleLockOptions = {},
): Promise<T> {
  const stamps = resourceSet.resources.map(({ stamp }) => stamp);
  return await withSidecarLifecycleLock(stamps, async () => {
    let active = true;
    let retirement: Promise<ElectronPhysicalRetirementCertificate> | null = null;
    const guard: ElectronPhysicalResourceSetGuard = Object.freeze({
      bindingDigest: resourceSet.binding.digest,
      generationId: resourceSet.binding.generationId,
      retire(stopOptions: SidecarStopOptions = {}) {
        if (!active) throw new Error("Electron physical resource-set guard is no longer active");
        retirement ??= retirePhysicalResourceSet(resourceSet, stopOptions);
        return retirement;
      },
    });
    let outcome: Readonly<{ ok: true; value: T }> | Readonly<{ error: unknown; ok: false }>;
    try { outcome = Object.freeze({ ok: true, value: await operation(guard) }); }
    catch (error) { outcome = Object.freeze({ error, ok: false }); }
    let retirementError: unknown = null;
    try { if (retirement != null) await retirement; }
    catch (error) { retirementError = error; }
    active = false;
    if (!outcome.ok) {
      if (retirementError != null && retirementError !== outcome.error) {
        throw new AggregateError([outcome.error, retirementError], "Electron guarded continuation and retirement failed");
      }
      throw outcome.error;
    }
    if (retirementError != null) throw retirementError;
    return outcome.value;
  }, options);
}

async function retirePhysicalResourceSet(
  resourceSet: ElectronBoundPhysicalResourceSet,
  options: SidecarStopOptions,
): Promise<ElectronPhysicalRetirementCertificate> {
  const stopped = await stopSidecars(resourceSet.resources.map(({ stamp }) => ({ options, stamp })));
  if (stopped.remainingPids.length > 0) {
    throw new ElectronPhysicalRetirementError(Object.freeze([...stopped.remainingPids]));
  }
  const results = new Map(stopped.results.map(({ result, stamp }) => [JSON.stringify(stamp), result]));
  return Object.freeze({
    schemaVersion: ELECTRON_PHYSICAL_RETIREMENT_SCHEMA_VERSION,
    bindingDigest: resourceSet.binding.digest,
    generationId: resourceSet.binding.generationId,
    resources: Object.freeze(resourceSet.resources.map(({ id, stamp }) => {
      const result = results.get(JSON.stringify(stamp));
      if (result == null) throw new Error(`Sidecar retirement omitted Electron physical resource ${id}`);
      return Object.freeze({ id, result: Object.freeze({ ...result }), stamp });
    })),
  });
}
