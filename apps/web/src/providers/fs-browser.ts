import type { FsBrowserListResponse, FsBrowserRootsResponse } from '@open-design/contracts';
async function parse<T>(response: Response): Promise<T> { if (!response.ok) throw new Error('Server directory request failed'); return response.json() as Promise<T>; }
export async function listServerDirectoryRoots(): Promise<FsBrowserRootsResponse> {
  return parse<FsBrowserRootsResponse>(await fetch('/api/fs-browser/roots'));
}
export async function listServerDirectory(path: string): Promise<FsBrowserListResponse> {
  return parse<FsBrowserListResponse>(await fetch(`/api/fs-browser/list?path=${encodeURIComponent(path)}`));
}
