import type {
  NativeFolderDialogFallbackResponse,
  NativeFolderDialogSelectionResponse,
  ProjectLocation,
  ProjectLocationsResponse,
  ScanProjectLocationsResponse,
  UpdateProjectLocationsRequest,
} from '@open-design/contracts';

export async function fetchProjectLocations(): Promise<ProjectLocation[]> {
  try {
    const resp = await fetch('/api/project-locations');
    if (!resp.ok) return [];
    const json = (await resp.json()) as ProjectLocationsResponse;
    return Array.isArray(json.locations) ? json.locations : [];
  } catch {
    return [];
  }
}

export async function updateProjectLocations(
  locations: UpdateProjectLocationsRequest['locations'],
): Promise<ProjectLocation[] | null> {
  try {
    const resp = await fetch('/api/project-locations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations }),
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as ProjectLocationsResponse;
    return Array.isArray(json.locations) ? json.locations : [];
  } catch {
    return null;
  }
}

export async function scanProjectLocations(): Promise<ScanProjectLocationsResponse | null> {
  try {
    const resp = await fetch('/api/project-locations/scan', { method: 'POST' });
    if (!resp.ok) return null;
    return (await resp.json()) as ScanProjectLocationsResponse;
  } catch {
    return null;
  }
}

export type ProjectLocationFolderDialogResult =
  | { status: 'selected'; path: string }
  | { status: 'cancelled' }
  | { status: 'fallback'; reason: 'remote' | 'native-unavailable' }
  | { status: 'error'; reason: 'invalid-response' | 'request-failed' };

function isSelection(value: unknown): value is NativeFolderDialogSelectionResponse {
  if (!value || typeof value !== 'object') return false;
  const selected = (value as Record<string, unknown>).path;
  return selected === null || (typeof selected === 'string' && selected.trim().length > 0);
}

function isFallback(value: unknown): value is NativeFolderDialogFallbackResponse {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return body.fallback === 'server-directory-picker'
    && (body.code === 'NATIVE_FOLDER_DIALOG_REMOTE' || body.code === 'NATIVE_FOLDER_DIALOG_UNAVAILABLE');
}

export async function openProjectLocationFolderDialog(): Promise<ProjectLocationFolderDialogResult> {
  let response: Response;
  try {
    response = await fetch('/api/dialog/open-folder', { method: 'POST' });
  } catch {
    return { status: 'error', reason: 'request-failed' };
  }
  let body: unknown = null;
  try { body = await response.json(); } catch { /* preserve HTTP semantics */ }
  if (response.ok) {
    if (!isSelection(body)) return { status: 'error', reason: 'invalid-response' };
    return body.path === null ? { status: 'cancelled' } : { status: 'selected', path: body.path };
  }
  if (response.status === 403 && isFallback(body) && body.code === 'NATIVE_FOLDER_DIALOG_REMOTE') return { status: 'fallback', reason: 'remote' };
  if (response.status === 503 && isFallback(body) && body.code === 'NATIVE_FOLDER_DIALOG_UNAVAILABLE') return { status: 'fallback', reason: 'native-unavailable' };
  return { status: 'error', reason: 'request-failed' };
}
