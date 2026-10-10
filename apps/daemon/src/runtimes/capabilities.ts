import type { RuntimeCapabilityMap } from './types.js';

export const agentCapabilities = new Map<string, RuntimeCapabilityMap>();

// Capability flags only describe the executable that answered the associated
// `--help` probe. Keep that provenance separately so adapter definitions can
// continue to read boolean capability entries.
export type CapabilityProbePath = {
  selectedPath: string;
  launchPath: string;
};

export const agentCapabilityProbePaths = new Map<string, CapabilityProbePath>();
