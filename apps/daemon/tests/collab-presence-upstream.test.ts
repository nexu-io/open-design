// Red spec for the packaged-client presence 502 storm (daemon half).
//
// With the vela-cli collab transport, every presence heartbeat spawns a
// `vela collab presence heartbeat` child process. The CLI exits 1 on any
// non-2xx API response and printed `API request failed with status NNN`, but
// the daemon flattened every failure into a 502 `collab_presence_unavailable`
// whose message embedded the full spawned command line. A project the
// upstream persistently rejects (404/403) therefore looked like an infra
// outage, kept spawning a CLI process per beat, and leaked spawn internals to
// the renderer.

import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { createCollabRuntime } from '../src/collab/runtime.js';
import type {
  CollabPresenceCloudClient,
  RegisterCollabPresenceRoutesDeps,
} from '../src/routes/collab-presence.js';
import { registerCollabPresenceRoutes } from '../src/routes/collab-presence.js';

let server: http.Server | null = null;

afterEach(async () => {
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
});

function teamContext(
  workspaceId = 'w1',
  workspaceMemberId = 'm1',
): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceName: `Workspace ${workspaceId}`,
    workspaceType: 'team',
    teamId: workspaceId,
    workspaceMemberId,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({
      role: 'member',
      lifecycleState: 'active',
    }),
  };
}

async function startPresenceServer(
  cloud: CollabPresenceCloudClient,
  options: {
    verifyWorkspaceRequest?: RegisterCollabPresenceRoutesDeps['verifyWorkspaceRequest'];
    presenceUpstreamCooldownMs?: number;
    presenceUpstreamNow?: () => number;
  } = {},
) {
  const app = express();
  app.use(express.json());
  registerCollabPresenceRoutes(app, {
    collab: createCollabRuntime(),
    cloud,
    cloudAuthorizesProjectPresence: () => true,
    ...(options.verifyWorkspaceRequest
      ? { verifyWorkspaceRequest: options.verifyWorkspaceRequest }
      : {}),
    ...(options.presenceUpstreamCooldownMs !== undefined
      ? { presenceUpstreamCooldownMs: options.presenceUpstreamCooldownMs }
      : {}),
    ...(options.presenceUpstreamNow
      ? { presenceUpstreamNow: options.presenceUpstreamNow }
      : {}),
  } as RegisterCollabPresenceRoutesDeps);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('server did not bind to a TCP port');
  }
  const base = `http://127.0.0.1:${address.port}`;
  return {
    async heartbeat(projectId = 'p1') {
      const response = await fetch(
        `${base}/api/projects/${projectId}/presence/heartbeat`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ memberId: 'm1' }),
        },
      );
      return {
        status: response.status,
        body: (await response.json()) as Record<string, unknown>,
      };
    },
  };
}

/** The exact failure shape execFile produces for a vela CLI non-2xx exit. */
function velaCliFailure(upstreamStatus: number, code: string): Error {
  return new Error(
    'Command failed: /opt/homebrew/bin/vela collab presence heartbeat p1 --client-id m1'
      + `\nError: API request failed with status ${upstreamStatus}: ${code}`,
  );
}

describe('collab presence upstream error relay', () => {
  it('relays a persistent upstream 404 as 404 without leaking the spawned command line', async () => {
    const heartbeatPresence = vi
      .fn()
      .mockRejectedValue(velaCliFailure(404, 'record not found'));
    const api = await startPresenceServer(
      {
        heartbeatPresence,
        listPresence: vi.fn(async () => []),
        leavePresence: vi.fn(async () => []),
      },
      {
        verifyWorkspaceRequest: async () => ({ ok: true, context: teamContext() }),
      },
    );

    const { status, body } = await api.heartbeat();

    expect(status).toBe(404);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('Command failed');
    expect(serialized).not.toContain('--client-id');
    expect(serialized).not.toContain('/opt/homebrew');
  });

  it('relays an upstream 403 rejection as 403 so the web client sees revoked authority', async () => {
    const heartbeatPresence = vi
      .fn()
      .mockRejectedValue(velaCliFailure(403, 'presence denied'));
    const api = await startPresenceServer(
      {
        heartbeatPresence,
        listPresence: vi.fn(async () => []),
        leavePresence: vi.fn(async () => []),
      },
      {
        verifyWorkspaceRequest: async () => ({ ok: true, context: teamContext() }),
      },
    );

    const { status } = await api.heartbeat();

    expect(status).toBe(403);
  });

  it('keeps genuine infrastructure failures on 502', async () => {
    const heartbeatPresence = vi
      .fn()
      .mockRejectedValue(new Error('vela binary not found; install vela or configure VELA_BIN'));
    const api = await startPresenceServer(
      {
        heartbeatPresence,
        listPresence: vi.fn(async () => []),
        leavePresence: vi.fn(async () => []),
      },
      {
        verifyWorkspaceRequest: async () => ({ ok: true, context: teamContext() }),
      },
    );

    const { status, body } = await api.heartbeat();

    expect(status).toBe(502);
    expect(body.error).toBe('collab_presence_unavailable');
  });

  it('stops spawning the upstream transport for a project that keeps failing', async () => {
    let now = 1_000_000;
    const heartbeatPresence = vi
      .fn()
      .mockRejectedValue(velaCliFailure(503, 'relay overloaded'));
    const api = await startPresenceServer(
      {
        heartbeatPresence,
        listPresence: vi.fn(async () => []),
        leavePresence: vi.fn(async () => []),
      },
      {
        verifyWorkspaceRequest: async () => ({ ok: true, context: teamContext() }),
        presenceUpstreamCooldownMs: 20_000,
        presenceUpstreamNow: () => now,
      },
    );

    // Two consecutive failures arm the negative cache…
    await api.heartbeat();
    await api.heartbeat();
    expect(heartbeatPresence).toHaveBeenCalledTimes(2);

    // …so within the cooldown window the daemon answers from the cached
    // classification without spawning another CLI process.
    const blocked = await api.heartbeat();
    expect(heartbeatPresence).toHaveBeenCalledTimes(2);
    expect(blocked.status).toBeGreaterThanOrEqual(500);

    // After the cooldown the upstream is probed again.
    now += 21_000;
    await api.heartbeat();
    expect(heartbeatPresence).toHaveBeenCalledTimes(3);
  });
});
