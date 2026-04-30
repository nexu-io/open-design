import type { ProjectMetadata, SavedWorkflowBlueprint } from '../types';

const STORAGE_KEY = 'oneshot:saved-blueprints';

export function listSavedBlueprints(): SavedWorkflowBlueprint[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedWorkflowBlueprint[];
    return Array.isArray(parsed)
      ? parsed
          .filter((item) => item && typeof item.id === 'string')
          .sort((a, b) => b.createdAt - a.createdAt)
      : [];
  } catch {
    return [];
  }
}

export function saveWorkflowBlueprint(input: {
  metadata: ProjectMetadata;
  prompt: string;
  skillId: string | null;
  designSystemId: string | null;
}): SavedWorkflowBlueprint {
  const now = Date.now();
  const id = input.metadata.workflowId
    ? `${input.metadata.workflowId}-${now}`
    : crypto.randomUUID();
  const blueprint: SavedWorkflowBlueprint = {
    id,
    name: input.metadata.workflowTitle ?? 'OneShot blueprint',
    metadata: input.metadata,
    prompt: input.prompt,
    skillId: input.skillId,
    designSystemId: input.designSystemId,
    createdAt: now,
  };
  const next = [
    blueprint,
    ...listSavedBlueprints().filter(
      (item) => item.metadata.workflowId !== input.metadata.workflowId,
    ),
  ].slice(0, 12);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('oneshot:blueprints-changed'));
  return blueprint;
}

export function deleteSavedBlueprint(id: string): void {
  const next = listSavedBlueprints().filter((item) => item.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('oneshot:blueprints-changed'));
}
