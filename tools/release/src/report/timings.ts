type JsonRecord = Record<string, unknown>;

function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function resolveReportTimings(input: {
  build: JsonRecord | null;
  index: JsonRecord | null;
  smokeSummary: JsonRecord | null;
  suiteResult: JsonRecord | null;
}): {
  build: unknown[];
  releaseScript: unknown[];
  smoke: unknown[];
  totalDurationMs: number | null;
  totalDurationSource: "release-index" | "packaged-smoke-suite" | null;
} {
  const build = arrayOrEmpty(input.build?.timings);
  const releaseScript = arrayOrEmpty(input.build?.releaseScriptTimings ?? input.index?.timings);
  const detailedSmoke = arrayOrEmpty(input.smokeSummary?.timings);
  const suiteDurationMs = numberOrNull(input.suiteResult?.durationMs);
  const smoke = detailedSmoke.length > 0
    ? detailedSmoke
    : suiteDurationMs == null
      ? []
      : [{
          durationMs: suiteDurationMs,
          status: input.suiteResult?.status ?? null,
          step: "packaged-smoke-suite",
        }];
  const indexDurationMs = numberOrNull(input.index?.durationMs);

  return {
    build,
    releaseScript,
    smoke,
    totalDurationMs: indexDurationMs ?? suiteDurationMs,
    totalDurationSource: indexDurationMs != null
      ? "release-index"
      : suiteDurationMs != null
        ? "packaged-smoke-suite"
        : null,
  };
}
