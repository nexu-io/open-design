import type { ClosureDistributionColdStartBudget } from "@open-design/closure/protocol";

type JsonRecord = Record<string, unknown>;

export type PublicColdStartTiming = {
  launchDurationMs: number;
  readinessBudgetMs: number;
  readinessDurationMs: number;
  totalDurationMs: number;
};

export type PublicColdStartEvidence = ClosureDistributionColdStartBudget & {
  schemaVersion: 1;
  status: "success";
  timing: PublicColdStartTiming;
};

function record(value: unknown, label: string): JsonRecord {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function duration(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

export function parsePublicColdStartTiming(value: unknown): PublicColdStartTiming {
  const coldStart = record(value, "public smoke coldStart");
  if (coldStart.schemaVersion !== 1 || coldStart.status !== "success") {
    throw new Error("public smoke coldStart proof is invalid");
  }
  const timing = record(coldStart.timing, "public smoke coldStart.timing");
  const normalized = {
    launchDurationMs: duration(timing.launchDurationMs, "coldStart.timing.launchDurationMs"),
    readinessBudgetMs: duration(timing.readinessBudgetMs, "coldStart.timing.readinessBudgetMs"),
    readinessDurationMs: duration(timing.readinessDurationMs, "coldStart.timing.readinessDurationMs"),
    totalDurationMs: duration(timing.totalDurationMs, "coldStart.timing.totalDurationMs"),
  };
  if (normalized.totalDurationMs !== normalized.launchDurationMs + normalized.readinessDurationMs) {
    throw new Error("public smoke coldStart totalDurationMs must equal launch plus readiness");
  }
  return normalized;
}

export function createPublicColdStartEvidence(
  budget: ClosureDistributionColdStartBudget,
  observation: unknown,
): PublicColdStartEvidence {
  return {
    ...budget,
    schemaVersion: 1,
    status: "success",
    timing: parsePublicColdStartTiming(observation),
  };
}

export function parsePublicColdStartBudget(value: unknown): ClosureDistributionColdStartBudget {
  const evidence = record(value, "public acceptance coldStart");
  const components = record(evidence.components, "public acceptance coldStart.components");
  const parseArtifact = (name: string) => {
    const artifact = record(components[name], `public acceptance coldStart.components.${name}`);
    if (
      typeof artifact.digest !== "string"
      || !/^sha256:[0-9a-f]{64}$/u.test(artifact.digest)
      || typeof artifact.mediaType !== "string"
      || typeof artifact.url !== "string"
    ) throw new Error(`public acceptance coldStart ${name} component is invalid`);
    return {
      digest: artifact.digest as `sha256:${string}`,
      mediaType: artifact.mediaType,
      size: duration(artifact.size, `coldStart.components.${name}.size`),
      url: artifact.url,
    };
  };
  const normalized: ClosureDistributionColdStartBudget = {
    budgetBytes: duration(evidence.budgetBytes, "coldStart.budgetBytes") as 30000000,
    components: {
      body: parseArtifact("body"),
      launcher: parseArtifact("launcher"),
      native: parseArtifact("native"),
    },
    requiredBytes: duration(evidence.requiredBytes, "coldStart.requiredBytes"),
    target: typeof evidence.target === "string" ? evidence.target : "",
  };
  if (
    normalized.budgetBytes !== 30_000_000
    || normalized.target.length === 0
    || normalized.requiredBytes >= normalized.budgetBytes
  ) throw new Error("public acceptance coldStart identity is invalid");
  const unique = new Map(Object.values(normalized.components).map((artifact) => [artifact.digest, artifact.size]));
  const requiredBytes = [...unique.values()].reduce((total, bytes) => total + bytes, 0);
  if (requiredBytes !== normalized.requiredBytes) {
    throw new Error("public acceptance coldStart requiredBytes does not match its components");
  }
  return normalized;
}

export function parsePublicColdStartEvidence(value: unknown): PublicColdStartEvidence {
  const evidence = record(value, "public acceptance coldStart");
  if (evidence.schemaVersion !== 1 || evidence.status !== "success") {
    throw new Error("public acceptance coldStart identity is invalid");
  }
  return {
    ...parsePublicColdStartBudget(evidence),
    schemaVersion: 1,
    status: "success",
    timing: parsePublicColdStartTiming(evidence),
  };
}
