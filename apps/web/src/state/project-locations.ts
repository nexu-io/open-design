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

export async function openProjectLocationFolderDialog(): Promise<string | null> {
  try {
    const resp = await fetch('/api/dialog/open-folder', { method: 'POST' });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { path?: string | null };
    return typeof json.path === 'string' && json.path.trim() ? json.path : null;
  } catch {
    return null;
  }
}
