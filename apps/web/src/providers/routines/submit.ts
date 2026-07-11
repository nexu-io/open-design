// Transport for creating and updating a routine from the automation modal.
import type { CreateRoutineRequest, Routine, RoutineResponse, UpdateRoutineRequest } from '@open-design/contracts';

export async function createRoutine(body: CreateRoutineRequest): Promise<Routine> {
  const res = await fetch('/api/routines', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `create failed: ${res.status}`);
  }
  const json = (await res.json()) as RoutineResponse;
  return json.routine;
}

export async function updateRoutine(id: string, body: UpdateRoutineRequest): Promise<Routine> {
  const res = await fetch(`/api/routines/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `update failed: ${res.status}`);
  }
  const json = (await res.json()) as RoutineResponse;
  return json.routine;
}
