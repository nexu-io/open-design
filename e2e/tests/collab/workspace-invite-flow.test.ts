// @vitest-environment node

import { createServer, type Server } from 'node:http';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { requestJson } from '@/vitest/http';
import { createSmokeSuite } from '@/vitest/suite';

const WORKSPACE = 'ws-invite-team';
const MEMBER = 'mem-invite-owner';

const OWNER_CONTEXT = {
  workspaceId: WORKSPACE,
  workspaceType: 'team' as const,
  workspaceMemberId: MEMBER,
  role: 'owner' as const,
  memberStatus: 'active' as const,
  lifecycleState: 'active' as const,
  billingState: 'active' as const,
  planId: 'team_plus',
  providerMode: 'platform_credits' as const,
  seatSummary: { seatLimit: 5, usedSeats: 1 },
};

const INVITEE_CONTEXT = {
  workspaceId: WORKSPACE,
  workspaceType: 'team' as const,
  workspaceMemberId: 'mem-invite-accepted',
  role: 'member' as const,
  memberStatus: 'active' as const,
  lifecycleState: 'active' as const,
  billingState: 'active' as const,
  planId: 'team_plus',
  providerMode: 'platform_credits' as const,
  seatSummary: { seatLimit: 5, usedSeats: 2 },
};

function workspaceHeaders(context: typeof OWNER_CONTEXT | typeof INVITEE_CONTEXT) {
  return {
    'x-od-workspace-id': context.workspaceId,
    'x-od-workspace-member-id': context.workspaceMemberId,
  };
}

let authority: Server;
let authorityUrl: string;
let inviteMode: 'partial' | 'success' = 'partial';
const acceptedControlKeys = new Set<string>();
let inviteAccepted = false;

beforeAll(async () => {
  authority = createServer(async (req, res) => {
    if (req.url === `/api/v1/workspaces/${WORKSPACE}/invites` && req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        invitedEmail: string;
        role: string;
      };
      res.setHeader('content-type', 'application/json');
      if (inviteMode === 'partial' && body.invitedEmail === 'already@example.com') {
        res.writeHead(409);
        res.end(JSON.stringify({ code: 'active_pending_invite' }));
        return;
      }
      res.writeHead(201);
      res.end(JSON.stringify({ inviteId: `invite-${body.role}-${body.invitedEmail}` }));
      return;
    }

    if (req.url?.startsWith('/api/v1/workspace-invites/continuations/') && req.method === 'POST') {
      const nonce = req.url.split('/').at(-2);
      res.setHeader('content-type', 'application/json');
      if (nonce === 'expired') {
        res.writeHead(410);
        res.end(JSON.stringify({ code: 'invite_expired' }));
        return;
      }
      if (nonce === 'consumed') {
        res.writeHead(409);
        res.end(JSON.stringify({ code: 'invite_consumed' }));
        return;
      }
      const controlKey = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
      if (controlKey) acceptedControlKeys.add(controlKey);
      inviteAccepted = true;
      res.writeHead(200);
      res.end(JSON.stringify({
        workspaceMemberId: INVITEE_CONTEXT.workspaceMemberId,
        currentWorkspaceContext: {
          ...INVITEE_CONTEXT,
          workspaceName: 'Invited team',
        },
      }));
      return;
    }

    if (req.url === '/api/v1/workspaces' && req.method === 'GET') {
      const controlKey = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim() ?? '';
      const context = acceptedControlKeys.has(controlKey) || (inviteAccepted && controlKey !== 'e2e-invite-owner-control-key')
        ? { ...INVITEE_CONTEXT, workspaceName: 'Invited team' }
        : controlKey === 'e2e-invite-owner-control-key'
          ? { ...OWNER_CONTEXT, workspaceName: 'Invited team' }
          : null;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ items: context ? [context] : [] }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise<void>((resolve) => authority.listen(0, '127.0.0.1', resolve));
  const address = authority.address();
  if (address == null || typeof address === 'string') throw new Error('mock invite authority has no port');
  authorityUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => authority.close(() => resolve()));
});

describe('workspace invite create and acceptance handoff', () => {
  test(
    '[P0] creates scoped invites and accepts the continuation in an isolated invitee daemon',
    { timeout: 240_000 },
    async () => {
      const ownerSuite = await createSmokeSuite('collab-workspace-invite-owner');
      const inviteeSuite = await createSmokeSuite('collab-workspace-invite-invitee');
      inviteMode = 'partial';
      acceptedControlKeys.clear();
      inviteAccepted = false;

      await ownerSuite.with.toolsDev(
        async ({ webUrl: ownerWebUrl }) => {
          const initialOwnerContext = await requestJson<{
            context: { workspaceId: string; workspaceMemberId: string; role: string } | null;
          }>(ownerWebUrl, '/api/workspace/context', {
            headers: workspaceHeaders(OWNER_CONTEXT),
          });
          expect(initialOwnerContext.context).toMatchObject({
            workspaceId: WORKSPACE,
            workspaceMemberId: OWNER_CONTEXT.workspaceMemberId,
            role: 'owner',
          });

          const created = await requestJson<{
            results: Array<{ email: string; ok: boolean; inviteId?: string; error?: string }>;
          }>(ownerWebUrl, '/api/workspace/invite', {
            method: 'POST',
            headers: workspaceHeaders(OWNER_CONTEXT),
            body: {
              invites: [
                { email: 'new@example.com', role: 'member' },
                { email: 'already@example.com', role: 'admin' },
                // `owner` is never assignable; the daemon must normalize it
                // to the safe default instead of letting the client mint an
                // owner membership.
                { email: 'owner-role@example.com', role: 'owner' },
              ],
            },
          });
          expect(created.results).toEqual([
            {
              email: 'new@example.com',
              ok: true,
              inviteId: 'invite-member-new@example.com',
            },
            {
              email: 'already@example.com',
              ok: false,
              error: 'active_pending_invite',
            },
            {
              email: 'owner-role@example.com',
              ok: true,
              inviteId: 'invite-member-owner-role@example.com',
            },
          ]);

          // Acceptance runs through a second isolated daemon/data directory,
          // matching the real owner → invitee account handoff instead of
          // mutating the inviter's local workspace selection.
          await inviteeSuite.with.toolsDev(
            async ({ webUrl: inviteeWebUrl }) => {
              // Desktop's deeplink parser/dispatcher owns the thin URL ->
              // nonce POST bridge and is pinned in apps/desktop tests. This
              // cross-process witness starts at that public daemon boundary so
              // E2E stays outside the guarded packaged-leaf implementation.
              const accepted = await requestJson<{
                context: { workspaceMemberId: string };
              }>(inviteeWebUrl, '/api/workspace/invite/continue', {
                method: 'POST',
                body: { nonce: 'accepted-nonce' },
              });
              expect(accepted.context.workspaceMemberId).toBe(
                INVITEE_CONTEXT.workspaceMemberId,
              );

              const inviteeContext = await requestJson<{
                context: { workspaceId: string; workspaceMemberId: string; role: string } | null;
              }>(inviteeWebUrl, '/api/workspace/context', {
                headers: workspaceHeaders(INVITEE_CONTEXT),
              });
              expect(inviteeContext.context).toMatchObject({
                workspaceId: WORKSPACE,
                workspaceMemberId: INVITEE_CONTEXT.workspaceMemberId,
                role: 'member',
              });

              for (const [nonce, status, error] of [
                ['expired', 410, 'continuation_410'],
                ['consumed', 409, 'continuation_409'],
              ] as const) {
                const response = await fetch(
                  new URL('/api/workspace/invite/continue', `${inviteeWebUrl}/`),
                  {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ nonce }),
                  },
                );
                expect(response.status).toBe(status);
                expect(await response.json()).toEqual({ error });
              }
            },
            {
              env: {
                AMR_HOME: joinScratchHome(inviteeSuite.scratchDir),
                OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
                VELA_API_URL: authorityUrl,
                VELA_CONTROL_KEY: 'e2e-invitee-control-key',
              },
            },
          );

          const ownerContext = await requestJson<{
            context: { workspaceId: string; workspaceMemberId: string; role: string } | null;
          }>(ownerWebUrl, '/api/workspace/context', {
            headers: workspaceHeaders(OWNER_CONTEXT),
          });
          expect(ownerContext.context).toMatchObject({
            workspaceId: WORKSPACE,
            workspaceMemberId: OWNER_CONTEXT.workspaceMemberId,
            role: 'owner',
          });
        },
        {
          env: {
            AMR_HOME: joinScratchHome(ownerSuite.scratchDir),
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            VELA_API_URL: authorityUrl,
            VELA_CONTROL_KEY: 'e2e-invite-owner-control-key',
          },
        },
      );
    },
  );

});

function joinScratchHome(scratchDir: string): string {
  return `${scratchDir}/empty-amr-home`;
}
