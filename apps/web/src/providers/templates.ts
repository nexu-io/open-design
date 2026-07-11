// Thin fetch wrappers around the daemon's /api/templates routes.

import type { ProjectTemplate } from '../types';

export async function listTemplates(): Promise<ProjectTemplate[]> {
  try {
    const resp = await fetch('/api/templates');
    if (!resp.ok) return [];
    const json = (await resp.json()) as { templates: ProjectTemplate[] };
    return json.templates ?? [];
  } catch {
    return [];
  }
}

export async function getTemplate(id: string): Promise<ProjectTemplate | null> {
  try {
    const resp = await fetch(`/api/templates/${encodeURIComponent(id)}`);
    if (!resp.ok) return null;
    const json = (await resp.json()) as { template: ProjectTemplate };
    return json.template;
  } catch {
    return null;
  }
}

export async function saveTemplate(input: {
  name: string;
  description?: string;
  sourceProjectId: string;
}): Promise<ProjectTemplate | null> {
  try {
    const resp = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { template: ProjectTemplate };
    return json.template;
  } catch {
    return null;
  }
}

export async function deleteTemplate(id: string): Promise<boolean> {
  try {
    const resp = await fetch(`/api/templates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return resp.ok;
  } catch {
    return false;
  }
}
