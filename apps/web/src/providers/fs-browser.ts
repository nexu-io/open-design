import type {
  FsBrowserListResponse,
  FsBrowserMkdirResponse,
  FsBrowserRootsResponse,
} from '@open-design/contracts';

async function apiError(response: Response): Promise<Error> {
  const fallback = `Request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ''}).`;
  try {
    const body = await response.json() as { error?: string | { message?: string }; message?: string };
    const message = typeof body.error === 'string'
      ? body.message ?? body.error
      : body.error?.message ?? body.message;
    return new Error(typeof message === 'string' && message ? message : fallback);
  } catch {
    return new Error(fallback);
  }
}

export async function listServerDirectoryRoots(): Promise<FsBrowserRootsResponse> {
  const response = await fetch('/api/fs-browser/roots');
  if (!response.ok) throw await apiError(response);
  return await response.json() as FsBrowserRootsResponse;
}

export async function listServerDirectory(path: string): Promise<FsBrowserListResponse> {
  const response = await fetch(`/api/fs-browser/list?path=${encodeURIComponent(path)}`);
  if (!response.ok) throw await apiError(response);
  return await response.json() as FsBrowserListResponse;
}

export async function createServerDirectory(
  parentPath: string,
  name: string,
  signal?: AbortSignal,
): Promise<FsBrowserMkdirResponse> {
  const response = await fetch('/api/fs-browser/mkdir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentPath, name }),
    signal,
  });
  if (!response.ok) throw await apiError(response);
  return await response.json() as FsBrowserMkdirResponse;
}
