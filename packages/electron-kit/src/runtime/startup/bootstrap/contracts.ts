import type { GenerationRecord, LifecycleScope, StandaloneShellIdentity } from "@open-design/standalone";

export const ELECTRON_BOOTSTRAP_SCHEMA_VERSION = 1 as const;

export type ElectronBootstrapRequest = Readonly<{
  schemaVersion: typeof ELECTRON_BOOTSTRAP_SCHEMA_VERSION;
  correlationId: string;
  scope: LifecycleScope;
  shell: StandaloneShellIdentity;
  releaseVersion: string;
}>;

export type ElectronBootstrapResult = Readonly<{
  schemaVersion: typeof ELECTRON_BOOTSTRAP_SCHEMA_VERSION;
  correlationId: string;
  generation: GenerationRecord;
  readinessTimeoutMs: number;
}>;

export interface ElectronBootstrapPort {
  resolve(request: ElectronBootstrapRequest): Promise<ElectronBootstrapResult>;
}

export function validateElectronBootstrapResult(request: ElectronBootstrapRequest, value: ElectronBootstrapResult): ElectronBootstrapResult {
  if (value.schemaVersion !== ELECTRON_BOOTSTRAP_SCHEMA_VERSION || value.correlationId !== request.correlationId) {
    throw new Error("Electron bootstrap result correlation mismatch");
  }
  if (value.generation.schemaVersion !== 3 || !/^[a-f0-9]{64}$/u.test(value.generation.id)) throw new Error("Electron bootstrap returned an invalid generation");
  if (value.generation.channel !== request.scope.channel || value.generation.releaseVersion !== request.releaseVersion) throw new Error("Electron bootstrap escaped its requested scope");
  if (!Number.isSafeInteger(value.readinessTimeoutMs) || value.readinessTimeoutMs < 100 || value.readinessTimeoutMs > 300_000) {
    throw new Error("Electron bootstrap returned an invalid readiness timeout");
  }
  return structuredClone(value);
}
