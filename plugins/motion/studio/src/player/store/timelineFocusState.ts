export interface TimelineFocusRequest {
  id: string;
  projectId: string | null;
  sessionEpoch: number;
  nonce: number;
}

export function createTimelineFocusRequest(
  id: string,
  projectId: string | null,
  sessionEpoch: number,
  nonce: number,
): TimelineFocusRequest {
  return { id, projectId, sessionEpoch, nonce };
}
