import type {
  InspirationBoard,
  InspirationPin,
  Project,
  ProjectTemplate,
  SavedWorkflowBlueprint,
} from '../types';
import { listSavedBlueprints } from './blueprints';
import { listInspirationBoards, listInspirationPins } from './inspiration';

const LIBRARY_VIEWS_KEY = 'oneshot:library-search-views';
const LIBRARY_TRANSFER_HISTORY_KEY = 'oneshot:library-search-transfer-history';
const BLUEPRINTS_KEY = 'oneshot:saved-blueprints';
const INSPIRATION_BOARDS_KEY = 'oneshot:inspiration-boards';
const INSPIRATION_PINS_KEY = 'oneshot:inspiration-pins';
const STUDIO_SNAPSHOT_SCHEMA = 'oneshot.studio-snapshot.v1';
const LOCAL_RESTORE_SECTIONS = [
  'savedBlueprints',
  'inspirationBoards',
  'inspirationPins',
  'libraryViews',
  'libraryTransferHistory',
] as const;

type StudioSnapshotLocalSection = typeof LOCAL_RESTORE_SECTIONS[number];
export type StudioSnapshotImportMode = 'merge' | 'replace';

interface StudioSnapshotInput {
  projects: Project[];
  templates: ProjectTemplate[];
}

export interface StudioSnapshot {
  schema: typeof STUDIO_SNAPSHOT_SCHEMA;
  exportedAt: number;
  counts: {
    projects: number;
    templates: number;
    savedBlueprints: number;
    inspirationBoards: number;
    inspirationPins: number;
    libraryViews: number;
    libraryTransferHistory: number;
  };
  projects: Project[];
  templates: ProjectTemplate[];
  savedBlueprints: SavedWorkflowBlueprint[];
  inspirationBoards: InspirationBoard[];
  inspirationPins: InspirationPin[];
  libraryViews: unknown[];
  libraryTransferHistory: unknown[];
}

export interface StudioSnapshotImportSectionPlan {
  key: StudioSnapshotLocalSection;
  label: string;
  incoming: number;
  local: number;
  conflicts: number;
  additions: number;
  restored: number;
}

export interface StudioSnapshotImportPlan {
  mode: StudioSnapshotImportMode;
  snapshot: StudioSnapshot;
  sections: StudioSnapshotImportSectionPlan[];
  archiveOnly: {
    projects: number;
    templates: number;
  };
  totals: {
    incoming: number;
    local: number;
    conflicts: number;
    additions: number;
    restored: number;
  };
}

export function buildStudioSnapshot({
  projects,
  templates,
}: StudioSnapshotInput): StudioSnapshot {
  const savedBlueprints = listSavedBlueprints();
  const inspirationBoards = listInspirationBoards();
  const inspirationPins = listInspirationPins();
  const libraryViews = readStoredArray(LIBRARY_VIEWS_KEY);
  const libraryTransferHistory = readStoredArray(LIBRARY_TRANSFER_HISTORY_KEY);

  return {
    schema: STUDIO_SNAPSHOT_SCHEMA,
    exportedAt: Date.now(),
    counts: {
      projects: projects.length,
      templates: templates.length,
      savedBlueprints: savedBlueprints.length,
      inspirationBoards: inspirationBoards.length,
      inspirationPins: inspirationPins.length,
      libraryViews: libraryViews.length,
      libraryTransferHistory: libraryTransferHistory.length,
    },
    projects,
    templates,
    savedBlueprints,
    inspirationBoards,
    inspirationPins,
    libraryViews,
    libraryTransferHistory,
  };
}

export function normalizeStudioSnapshot(payload: unknown): StudioSnapshot | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as Partial<StudioSnapshot>;
  if (candidate.schema !== STUDIO_SNAPSHOT_SCHEMA) return null;
  const snapshot: StudioSnapshot = {
    schema: STUDIO_SNAPSHOT_SCHEMA,
    exportedAt: Number.isFinite(candidate.exportedAt) ? Number(candidate.exportedAt) : Date.now(),
    counts: {
      projects: readArray(candidate.projects).length,
      templates: readArray(candidate.templates).length,
      savedBlueprints: readArray(candidate.savedBlueprints).length,
      inspirationBoards: readArray(candidate.inspirationBoards).length,
      inspirationPins: readArray(candidate.inspirationPins).length,
      libraryViews: readArray(candidate.libraryViews).length,
      libraryTransferHistory: readArray(candidate.libraryTransferHistory).length,
    },
    projects: readArray<Project>(candidate.projects),
    templates: readArray<ProjectTemplate>(candidate.templates),
    savedBlueprints: readArray<SavedWorkflowBlueprint>(candidate.savedBlueprints),
    inspirationBoards: readArray<InspirationBoard>(candidate.inspirationBoards),
    inspirationPins: readArray<InspirationPin>(candidate.inspirationPins),
    libraryViews: readArray(candidate.libraryViews),
    libraryTransferHistory: readArray(candidate.libraryTransferHistory),
  };
  return snapshot;
}

export function buildStudioSnapshotImportPlan(
  snapshot: StudioSnapshot,
  mode: StudioSnapshotImportMode,
): StudioSnapshotImportPlan {
  const sections = LOCAL_RESTORE_SECTIONS.map((key) => {
    const incoming = snapshot[key];
    const local = readStoredArray(storageKeyForSection(key));
    const incomingIds = new Set(incoming.map(readItemId).filter(Boolean));
    const localIds = new Set(local.map(readItemId).filter(Boolean));
    let conflicts = 0;
    incomingIds.forEach((id) => {
      if (localIds.has(id)) conflicts += 1;
    });
    const additions = Math.max(0, incoming.length - conflicts);
    return {
      key,
      label: labelForSection(key),
      incoming: incoming.length,
      local: local.length,
      conflicts,
      additions: mode === 'replace' ? incoming.length : additions,
      restored: mode === 'replace' ? incoming.length : additions,
    };
  });
  return {
    mode,
    snapshot,
    sections,
    archiveOnly: {
      projects: snapshot.projects.length,
      templates: snapshot.templates.length,
    },
    totals: sections.reduce(
      (total, section) => ({
        incoming: total.incoming + section.incoming,
        local: total.local + section.local,
        conflicts: total.conflicts + section.conflicts,
        additions: total.additions + section.additions,
        restored: total.restored + section.restored,
      }),
      { incoming: 0, local: 0, conflicts: 0, additions: 0, restored: 0 },
    ),
  };
}

export function applyStudioSnapshotLocalLibraries(
  snapshot: StudioSnapshot,
  mode: StudioSnapshotImportMode,
): void {
  LOCAL_RESTORE_SECTIONS.forEach((key) => {
    const storageKey = storageKeyForSection(key);
    const incoming = snapshot[key];
    if (mode === 'replace') {
      localStorage.setItem(storageKey, JSON.stringify(incoming));
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(mergeById(readStoredArray(storageKey), incoming)));
  });
  window.dispatchEvent(new CustomEvent('oneshot:blueprints-changed'));
  window.dispatchEvent(new CustomEvent('oneshot:inspiration-changed'));
  window.dispatchEvent(new CustomEvent('oneshot:library-views-changed'));
  window.dispatchEvent(new CustomEvent('oneshot:library-transfer-history-changed'));
}

function readStoredArray(key: string): unknown[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function readItemId(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;
  const id = (item as { id?: unknown }).id;
  return typeof id === 'string' && id.trim() ? id : null;
}

function mergeById(local: unknown[], incoming: unknown[]): unknown[] {
  const localIds = new Set(local.map(readItemId).filter(Boolean));
  const additions = incoming.filter((item) => {
    const id = readItemId(item);
    return id ? !localIds.has(id) : true;
  });
  return [...additions, ...local];
}

function storageKeyForSection(section: StudioSnapshotLocalSection) {
  switch (section) {
    case 'savedBlueprints':
      return BLUEPRINTS_KEY;
    case 'inspirationBoards':
      return INSPIRATION_BOARDS_KEY;
    case 'inspirationPins':
      return INSPIRATION_PINS_KEY;
    case 'libraryViews':
      return LIBRARY_VIEWS_KEY;
    case 'libraryTransferHistory':
      return LIBRARY_TRANSFER_HISTORY_KEY;
  }
}

function labelForSection(section: StudioSnapshotLocalSection) {
  switch (section) {
    case 'savedBlueprints':
      return 'Workflow blueprints';
    case 'inspirationBoards':
      return 'Inspiration boards';
    case 'inspirationPins':
      return 'Inspiration pins';
    case 'libraryViews':
      return 'Library Search views';
    case 'libraryTransferHistory':
      return 'Transfer history';
  }
}
