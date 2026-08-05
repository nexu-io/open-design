import type { Express } from 'express';
import {
  assertTeamResourceCopyAllowed,
  createApiError,
  createApiErrorResponse,
  TeamResourceCopyForbiddenError,
  type TeamResourceState,
} from '@open-design/contracts';
import type {
  TeamResourceKind,
  TeamResourceKey,
  TeamResourceStateProvider,
} from '../collab/team-resource-state.js';

export interface RegisterTeamResourceRoutesDeps {
  teamResources: TeamResourceStateProvider;
}

const KINDS: ReadonlySet<TeamResourceKind> = new Set(['design-system', 'plugin', 'skill']);
const STATES: ReadonlySet<TeamResourceState> = new Set(['active', 'frozen', 'deleted']);

function readKey(params: { kind?: string; id?: string }): TeamResourceKey | null {
  const kind = params.kind;
  const resourceId = typeof params.id === 'string' ? decodeURIComponent(params.id) : '';
  if (!kind || !KINDS.has(kind as TeamResourceKind) || !resourceId) return null;
  return { kind: kind as TeamResourceKind, resourceId };
}

/**
 * Team-resource routes (D1 state model + D3 enforcement). The copy-check runs
 * the real copy red-line guard against the resolved resource state, so a frozen
 * team resource is rejected with a 403 the same way the copy-out routes will be.
 * The state provider is the E-resource-hub seam (the resource-hub owner).
 */
export function registerTeamResourceRoutes(app: Express, deps: RegisterTeamResourceRoutesDeps): void {
  const { teamResources } = deps;

  app.get('/api/workspace/resources/:kind/:id/state', async (req, res) => {
    const key = readKey(req.params);
    if (!key) return res.status(400).json({ error: 'invalid resource key' });
    res.json(await teamResources.resolve(key));
  });

  // Enforce the AC-9 copy red-line for a resource about to be copied to personal.
  app.post('/api/workspace/resources/:kind/:id/copy-check', async (req, res) => {
    const key = readKey(req.params);
    if (!key) return res.status(400).json({ error: 'invalid resource key' });
    const target = await teamResources.resolve(key);
    try {
      assertTeamResourceCopyAllowed(target);
      res.json({ allowed: true });
    } catch (error) {
      if (error instanceof TeamResourceCopyForbiddenError) {
        return res.status(403).json(createApiErrorResponse(createApiError(error.code, error.message)));
      }
      throw error;
    }
  });

  // Dev/demo seam: mark a resource team-shared with a state (real hub-backed
  // provider omits `set`, so this 404s in production instead of spoofing state).
  app.put('/api/workspace/resources/:kind/:id/state', (req, res) => {
    const key = readKey(req.params);
    if (!key) return res.status(400).json({ error: 'invalid resource key' });
    if (!teamResources.set) return res.status(404).json({ error: 'resource state is not settable' });
    const body = (req.body ?? {}) as { scope?: unknown; state?: unknown };
    if (body.scope === 'personal') {
      teamResources.set(key, { scope: 'personal' });
      return res.json({ scope: 'personal' });
    }
    if (body.scope === 'team' && typeof body.state === 'string' && STATES.has(body.state as TeamResourceState)) {
      teamResources.set(key, { scope: 'team', state: body.state as TeamResourceState });
      return res.json({ scope: 'team', state: body.state });
    }
    res.status(400).json({ error: 'invalid resource state' });
  });
}
