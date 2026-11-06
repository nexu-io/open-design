// Project catalog hop-2 (daemon → web) thin invalidation.
//
// `GET /api/project-catalog/events` carries one signal: "the set of projects
// the daemon knows about changed". It is deliberately not workspace-scoped and
// carries no project id, name, or content, so it needs no account identity and
// reveals nothing beyond "re-read the list". The web re-fetches its own scoped
// project list on receipt; a missed event is closed by the reconnect re-fetch.

/** A project was created through any entry point (web UI, `od` CLI, MCP). */
export interface ProjectCatalogChangedSsePayload {
  type: 'project-catalog-changed';
  /** Emit time (epoch ms); advisory only. */
  at?: number;
}

export const PROJECT_CATALOG_EVENTS_PATH = '/api/project-catalog/events';

export const PROJECT_CATALOG_CHANGED_EVENT = 'project-catalog-changed' as const;
