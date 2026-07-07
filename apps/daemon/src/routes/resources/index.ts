import type { Express, Request, Response } from 'express';
import type {
  ResourceDetailResponse,
  ResourceListResponse,
} from '@open-design/contracts';

import {
  ResourceHubError,
  createResourceHubClient,
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
  res.status(502).json({ error: 'resource_hub_unreachable' });
}

export function registerResourceSharingRoutes(
  app: Express,
  deps: SharingDeps,
): void {
  const orchestrator = createSharingOrchestrator(deps);

  // Readiness probe: hub URL configured + workspace principal resolvable.
  app.get('/api/resources/_status', (_req: Request, res: Response) => {
    res.json({
      configured: createResourceHubClient().isConfigured(),
      principalAvailable: readResourceHubPrincipal() !== null,
    });
  });

  // Team resources joined with local mapping state (shared / pulled / stale).
  app.get('/api/resources', async (_req: Request, res: Response) => {
    try {
      const response: ResourceListResponse = {
        resources: await orchestrator.list(),
      };
      res.json(response);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Inspect one resource: record + versions + latest manifest.
  app.get('/api/resources/:id/detail', async (req: Request, res: Response) => {
    try {
      const response: ResourceDetailResponse = await orchestrator.detail(
        paramStr(req.params.id),
      );
      res.json(response);
    } catch (error) {
      handleError(res, error);
    }
  });

  // Share a locally-owned resource to the team.
  app.post(
    '/api/resources/:kind/:id/share',
    async (req: Request, res: Response) => {
      try {
        res.json(await orchestrator.share(paramStr(req.params.kind), paramStr(req.params.id)));
      } catch (error) {
        handleError(res, error);
      }
    },
  );

  // Pull a shared team resource into a local read-only copy.
  app.post(
    '/api/resources/:kind/:id/pull',
    async (req: Request, res: Response) => {
      try {
        res.json(await orchestrator.pull(paramStr(req.params.kind), paramStr(req.params.id)));
      } catch (error) {
        handleError(res, error);
      }
    },
  );
}
