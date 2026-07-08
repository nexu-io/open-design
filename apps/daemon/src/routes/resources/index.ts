import type { Express, Request, RequestHandler, Response } from 'express';
import type {
  PublicSnapshotResponse,
  ResourceDetailResponse,
  ResourceListResponse,
  ResourceSnapshotRecord,
} from '@open-design/contracts';

import {
  ResourceHubError,
  createResourceHubClient,
  hasExplicitResourceHubConfig,
  readResourceHubPrincipal,
} from '../../integrations/resource-hub.js';
import {
  SharingError,
  type SharingDeps,
  createSharingOrchestrator,
} from '../../resource-sharing/orchestrator.js';

// Daemon-local team-resource-sharing surface (Spec E, consumer layer). Delegates
// to the sharing orchestrator (kind adapter + neutral SDK + local mapping store).
// Self-contained aside from the daemon context it needs (db + paths).

function paramStr(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof ResourceHubError) {
    res.status(error.status).json({ error: error.code });
    return;
  }
  if (error instanceof SharingError) {
    res.status(error.status).json({ error: error.code, detail: error.message });
    return;
  }
  throw error;
}

export function registerResourceSharingRoutes(
  app: Express,
  deps: SharingDeps & { requireLocalDaemonRequest: RequestHandler },
): void {
  const orchestrator = createSharingOrchestrator(deps);
  const { requireLocalDaemonRequest } = deps;

  // Readiness probe: hub URL configured + workspace principal resolvable.
  app.get('/api/resources/_status', (_req: Request, res: Response) => {
    res.json({
      configured: hasExplicitResourceHubConfig(),
      principalAvailable: readResourceHubPrincipal() !== null,
    });
  });

  // Team resources joined with local mapping state (shared / pulled / stale).
  app.get(
    '/api/resources',
    requireLocalDaemonRequest,
    async (_req: Request, res: Response) => {
      try {
        const response: ResourceListResponse = {
          resources: await orchestrator.list(),
        };
        res.json(response);
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  // Inspect one resource: record + versions + latest manifest.
  app.get(
    '/api/resources/:id/detail',
    requireLocalDaemonRequest,
    async (req: Request, res: Response) => {
      try {
        const response: ResourceDetailResponse = await orchestrator.detail(
          paramStr(req.params.id),
        );
        res.json(response);
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  // Share a locally-owned resource to the team.
  app.post(
    '/api/resources/:kind/:id/share',
    requireLocalDaemonRequest,
    async (req: Request, res: Response) => {
      try {
        res.json(
          await orchestrator.share(
            paramStr(req.params.kind),
            paramStr(req.params.id),
          ),
        );
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  // Pull a shared team resource into a local read-only copy.
  app.post(
    '/api/resources/:kind/:id/pull',
    requireLocalDaemonRequest,
    async (req: Request, res: Response) => {
      try {
        res.json(
          await orchestrator.pull(
            paramStr(req.params.kind),
            paramStr(req.params.id),
          ),
        );
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  // Publish a hub resource's latest version as a PUBLIC snapshot. Thin wrapper
  // over the hub (owner-gating enforced server-side). Name comes via query so
  // this works regardless of body-parser wiring. Dev-panel E2E surface.
  app.post(
    '/api/resources/:id/snapshot',
    requireLocalDaemonRequest,
    async (req: Request, res: Response) => {
      const principal = readResourceHubPrincipal();
      if (!principal) {
        res.status(400).json({ error: 'missing_principal' });
        return;
      }
      try {
        const nameRaw = req.query.name;
        const name =
          typeof nameRaw === 'string' && nameRaw.trim()
            ? nameRaw.trim()
            : 'snapshot';
        const response: ResourceSnapshotRecord =
          await createResourceHubClient().publishSnapshot(
            principal,
            paramStr(req.params.id),
            { name, ref: 'latest' },
          );
        res.json(response);
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  // Read a public snapshot by slug, proxied so the browser avoids CORS. The hub
  // call itself is UNAUTHENTICATED — the public plane needs no principal.
  app.get(
    '/api/public-snapshots/:slug',
    requireLocalDaemonRequest,
    async (req: Request, res: Response) => {
      try {
        const response: PublicSnapshotResponse =
          await createResourceHubClient().getPublicSnapshot(
            paramStr(req.params.slug),
          );
        res.json(response);
      } catch (error) {
        handleError(res, error);
      }
    },
  );
}
