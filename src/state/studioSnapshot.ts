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
const STUDIO_SNAPSHOT_SCHEMA = 'oneshot.studio-snapshot.v1';

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
