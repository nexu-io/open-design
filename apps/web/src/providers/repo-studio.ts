import type {
  RepoStudioApplyRequest,
  RepoStudioApplyResponse,
  RepoStudioDiffRequest,
  RepoStudioDiffResponse,
  RepoStudioInspectRequest,
  RepoStudioInspectResponse,
  RepoStudioVerifyRequest,
  RepoStudioVerifyResponse,
} from '@open-design/contracts';

export async function inspectRepoStudio(request: RepoStudioInspectRequest): Promise<RepoStudioInspectResponse> {
  return postJson('/api/repo-studio/inspect', request);
}

export async function applyRepoStudioControl(request: RepoStudioApplyRequest): Promise<RepoStudioApplyResponse> {
  return postJson('/api/repo-studio/apply', request);
}

export async function verifyRepoStudio(request: RepoStudioVerifyRequest): Promise<RepoStudioVerifyResponse> {
  return postJson('/api/repo-studio/verify', request);
}

export async function diffRepoStudio(request: RepoStudioDiffRequest): Promise<RepoStudioDiffResponse> {
  return postJson('/api/repo-studio/diff', request);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error || `Repo Studio request failed: ${response.status}`);
  return payload;
}
