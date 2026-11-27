import type { Express, Response } from 'express';
import {
  PROJECT_CATALOG_CHANGED_EVENT,
  PROJECT_CATALOG_EVENTS_PATH,
  type ProjectCatalogChangedSsePayload,
} from '@open-design/contracts';

type ProjectCatalogSink = (payload: ProjectCatalogChangedSsePayload) => void;

// One create/import/run writes several rows and touches `updated_at` many
// times. Clients only need to know "re-read the list", so every mutation inside
// one window collapses into a single signal delivered when the window closes.
// Delivering at the end (not the start) also lets the writes that belong to the
// same operation commit before the client reads.
const DEFAULT_WINDOW_MS = 250;

export interface ProjectCatalogEvents {
  subscribe(sink: ProjectCatalogSink): () => void;
  /** Record that something the project list shows may have changed. */
  notify(): void;
}

export function createProjectCatalogEvents(
  options: { windowMs?: number; now?: () => number } = {},
): ProjectCatalogEvents {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const now = options.now ?? Date.now;
  const sinks = new Set<ProjectCatalogSink>();
  let pending: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    pending = null;
    const payload: ProjectCatalogChangedSsePayload = {
      type: PROJECT_CATALOG_CHANGED_EVENT,
      at: now(),
    };
    for (const sink of Array.from(sinks)) {
      try {
        sink(payload);
      } catch {
        sinks.delete(sink);
      }
    }
  }

  return {
    subscribe(sink) {
      sinks.add(sink);
      return () => {
        sinks.delete(sink);
      };
    },
    notify() {
      if (pending || sinks.size === 0) return;
      pending = setTimeout(flush, windowMs);
      pending.unref?.();
    },
  };
}

export interface RegisterProjectCatalogEventsRouteDeps {
  catalogEvents: ProjectCatalogEvents;
  createSseResponse(res: Response): {
    send(event: string, data: unknown): boolean;
  };
}

export function registerProjectCatalogEventsRoute(
  app: Express,
  { catalogEvents, createSseResponse }: RegisterProjectCatalogEventsRouteDeps,
) {
  app.get(PROJECT_CATALOG_EVENTS_PATH, (_req, res) => {
    const sse = createSseResponse(res);
    const unsubscribe = catalogEvents.subscribe((payload) => {
      sse.send(payload.type, payload);
    });
    sse.send('ready', { at: Date.now() });
    res.on('close', unsubscribe);
    res.on('finish', unsubscribe);
  });
}
