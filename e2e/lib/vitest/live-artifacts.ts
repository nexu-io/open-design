import { requestJson, requestText } from './http.ts';

export type LiveArtifactSummary = {
  createdAt: string;
  createdByRunId?: string;
  id: string;
  projectId: string;
  refreshStatus: string;
  slug: string;
  status: string;
  title: string;
};

export async function listLiveArtifacts(
  baseUrl: string,
  projectId: string,
): Promise<LiveArtifactSummary[]> {
  const response = await requestJson<{ artifacts: LiveArtifactSummary[] }>(
    baseUrl,
    `/api/live-artifacts?projectId=${encodeURIComponent(projectId)}`,
  );
  return response.artifacts;
}

export async function readLiveArtifactPreview(
  baseUrl: string,
  projectId: string,
  artifactId: string,
): Promise<string> {
  return await requestText(
    baseUrl,
    `/api/live-artifacts/${encodeURIComponent(artifactId)}/preview?projectId=${encodeURIComponent(projectId)}`,
  );
}
