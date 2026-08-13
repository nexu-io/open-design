export type PackagedColdStartObservation = {
  schemaVersion: 1;
  status: 'success';
  timing: {
    launchDurationMs: number;
    readinessBudgetMs: number;
    readinessDurationMs: number;
    totalDurationMs: number;
  };
};

export function createPackagedColdStartObservation(input: {
  launchFinishedAt: number;
  launchStartedAt: number;
  readinessBudgetMs: number;
  readyAt: number;
}): PackagedColdStartObservation {
  const launchDurationMs = Math.max(0, input.launchFinishedAt - input.launchStartedAt);
  const readinessDurationMs = Math.max(0, input.readyAt - input.launchFinishedAt);
  return {
    schemaVersion: 1,
    status: 'success',
    timing: {
      launchDurationMs,
      readinessBudgetMs: input.readinessBudgetMs,
      readinessDurationMs,
      totalDurationMs: launchDurationMs + readinessDurationMs,
    },
  };
}
