import type {
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

export async function openProjectLocationFolderDialog(): Promise<ProjectLocationFolderDialogResult> {
  let response: Response;
  try {
    response = await fetch('/api/dialog/open-folder', { method: 'POST' });
  } catch {
    return { status: 'error', reason: 'request-failed' };
  }

  let body: Record<string, unknown> = {};
  try {
    body = await response.json() as Record<string, unknown>;
  } catch {
    // Preserve the HTTP status when a reverse proxy returns a non-JSON error.
  }

  if (response.ok) {
    if (typeof body.path === 'string' && body.path) {
      return { status: 'selected', path: body.path };
    }
    if (body.path === null) return { status: 'cancelled' };
    return { status: 'error', reason: 'invalid-response' };
  }

  if (body.fallback === 'server-directory-picker' && body.code === 'NATIVE_FOLDER_DIALOG_REMOTE') {
    return { status: 'fallback', reason: 'remote' };
  }
  if (
    (body.fallback === 'server-directory-picker'
      && body.code === 'NATIVE_FOLDER_DIALOG_UNAVAILABLE')
    || response.status >= 500
  ) {
    return { status: 'fallback', reason: 'native-unavailable' };
  }
  return { status: 'error', reason: 'request-failed' };
}
