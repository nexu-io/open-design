import {
  validateElectronPreflightTopology,
  type ElectronPreflightTopology,
} from "./preflight/index.js";
import {
  validateElectronRuntimeWarmupTopology,
  type ElectronWarmupTopology,
} from "./warmup/index.js";

export const ELECTRON_RUNTIME_CONFIG_SCHEMA_VERSION = 1 as const;

export type ElectronRuntimeConfig = Readonly<{
  schemaVersion: typeof ELECTRON_RUNTIME_CONFIG_SCHEMA_VERSION;
  preflight: ElectronPreflightTopology;
  warmup: ElectronWarmupTopology;
}>;

export function validateElectronRuntimeConfig(value: ElectronRuntimeConfig): ElectronRuntimeConfig {
  if (value.schemaVersion !== ELECTRON_RUNTIME_CONFIG_SCHEMA_VERSION) {
    throw new Error("unsupported Electron runtime config schema");
  }
  return Object.freeze({
    schemaVersion: ELECTRON_RUNTIME_CONFIG_SCHEMA_VERSION,
    preflight: validateElectronPreflightTopology(value.preflight),
    warmup: validateElectronRuntimeWarmupTopology(value.warmup),
  });
}
