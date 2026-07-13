import type { CreateRoutineRequest, Routine, RoutineRun, UpdateRoutineRequest } from '@open-design/contracts';

import { requestJson } from './http.ts';

export type RoutineListResponse = {
  routines: Routine[];
};

export type RoutineMutationResponse = {
  routine: Routine;
};

export type RoutineRunStartResponse = {
  agentRunId?: string | null;
  conversationId?: string | null;
  projectId?: string | null;
  run?: RoutineRun | null;
  routine?: Routine | null;
};

export async function listRoutines(baseUrl: string): Promise<Routine[]> {
  const response = await requestJson<RoutineListResponse>(baseUrl, '/api/routines');
  return response.routines;
}

export async function createRoutine(baseUrl: string, body: CreateRoutineRequest): Promise<Routine> {
  const response = await requestJson<RoutineMutationResponse>(baseUrl, '/api/routines', {
    body,
    method: 'POST',
  });
  return response.routine;
}

export async function updateRoutine(
  baseUrl: string,
  routineId: string,
  body: UpdateRoutineRequest,
): Promise<Routine> {
  const response = await requestJson<RoutineMutationResponse>(
    baseUrl,
    `/api/routines/${encodeURIComponent(routineId)}`,
    {
      body,
      method: 'PATCH',
    },
  );
  return response.routine;
}

export async function runRoutine(baseUrl: string, routineId: string): Promise<RoutineRunStartResponse> {
  return await requestJson<RoutineRunStartResponse>(
    baseUrl,
    `/api/routines/${encodeURIComponent(routineId)}/run`,
    {
      body: {},
      method: 'POST',
    },
  );
}

export async function deleteRoutine(baseUrl: string, routineId: string): Promise<void> {
  await requestJson<null>(baseUrl, `/api/routines/${encodeURIComponent(routineId)}`, {
    body: {},
    method: 'DELETE',
  });
}
