// Transport for a single routine's run history and the crystallize action
// that promotes a successful run into reviewable automation-evolution
// proposals.
import type { RoutineRun, RoutineRunCrystallizeResponse, RoutineRunsResponse } from '@open-design/contracts';

export async function fetchRoutineRuns(routineId: string, limit: number): Promise<RoutineRun[]> {
  const res = await fetch(`/api/routines/${encodeURIComponent(routineId)}/runs?limit=${limit}`);
  if (!res.ok) throw new Error(`runs: ${res.status}`);
  const json = (await res.json()) as RoutineRunsResponse;
  return json.runs ?? [];
}

export async function crystallizeRoutineRun(
  routineId: string,
  runId: string,
): Promise<RoutineRunCrystallizeResponse> {
  const res = await fetch(
    `/api/routines/${encodeURIComponent(routineId)}/runs/${encodeURIComponent(runId)}/crystallize`,
    { method: 'POST' },
  );
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `crystallize failed: ${res.status}`);
  }
  return (await res.json()) as RoutineRunCrystallizeResponse;
}
