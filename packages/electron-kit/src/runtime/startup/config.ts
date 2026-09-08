import {
  validateElectronPreflightTopology,
  type ElectronPreflightTopology,
} from "./preflight/index.js";
export const ELECTRON_CARRIER_CONFIG_SCHEMA_VERSION = 1 as const;

export type ElectronCarrierConfig = Readonly<{
  schemaVersion: typeof ELECTRON_CARRIER_CONFIG_SCHEMA_VERSION;
  preflight: ElectronPreflightTopology;
  startupTimeoutMs: number;
  shutdownTimeoutMs: number;
}>;

export function validateElectronCarrierConfig(input: unknown): ElectronCarrierConfig {
  if (input == null || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).sort().join(",") !== "preflight,schemaVersion,shutdownTimeoutMs,startupTimeoutMs") {
    throw new Error("invalid Electron carrier config fields");
  }
  const value = input as ElectronCarrierConfig;
  if (value.schemaVersion !== ELECTRON_CARRIER_CONFIG_SCHEMA_VERSION) throw new Error("unsupported Electron carrier config schema");
  for (const timeout of [value.startupTimeoutMs, value.shutdownTimeoutMs]) {
    if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 3_600_000) throw new Error("invalid Electron carrier lifecycle timeout");
  }
  return Object.freeze({
    schemaVersion: ELECTRON_CARRIER_CONFIG_SCHEMA_VERSION,
    preflight: validateElectronPreflightTopology(value.preflight),
    startupTimeoutMs: value.startupTimeoutMs,
    shutdownTimeoutMs: value.shutdownTimeoutMs,
  });
}
