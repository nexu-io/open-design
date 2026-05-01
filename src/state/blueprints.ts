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
          .sort(sortSavedBlueprints)
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
  const existing = listSavedBlueprints().find(
    (item) => item.metadata.workflowId === input.metadata.workflowId,
  );
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
    pinnedAt: existing?.pinnedAt,
    collection: existing?.collection,
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

export function renameSavedBlueprint(id: string, name: string): void {
  const next = listSavedBlueprints().map((item) =>
    item.id === id ? { ...item, name } : item,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('oneshot:blueprints-changed'));
}

export function promoteSavedBlueprint(id: string): void {
  const promotedAt = Date.now();
  const next = listSavedBlueprints().map((item) =>
    item.id === id ? { ...item, createdAt: promotedAt } : item,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('oneshot:blueprints-changed'));
}

export function setSavedBlueprintPinned(id: string, pinned: boolean): void {
  const pinnedAt = pinned ? Date.now() : undefined;
  const next = listSavedBlueprints().map((item) =>
    item.id === id ? { ...item, pinnedAt } : item,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('oneshot:blueprints-changed'));
}

export function setSavedBlueprintCollection(id: string, collection: string | null): void {
  const cleanedCollection = collection?.trim();
  const next = listSavedBlueprints().map((item) =>
    item.id === id
      ? { ...item, collection: cleanedCollection || undefined }
      : item,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('oneshot:blueprints-changed'));
}

function sortSavedBlueprints(a: SavedWorkflowBlueprint, b: SavedWorkflowBlueprint) {
  const pinSort = Number(Boolean(b.pinnedAt)) - Number(Boolean(a.pinnedAt));
  if (pinSort !== 0) return pinSort;
  if (a.pinnedAt || b.pinnedAt) return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0);
  return b.createdAt - a.createdAt;
}
