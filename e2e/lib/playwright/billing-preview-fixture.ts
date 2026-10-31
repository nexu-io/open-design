import { chmod, writeFile } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import { join } from 'node:path';

export const BILLING_SPACES = [
  { workspaceId: 'billing-paint-a', workspaceMemberId: 'billing-member-a', workspaceName: 'Billing preview A',
    workspaceType: 'personal', role: 'owner', memberStatus: 'active', lifecycleState: 'active', isDefault: true },
  { workspaceId: 'billing-paint-b', workspaceMemberId: 'billing-member-b', workspaceName: 'Billing preview B',
    workspaceType: 'personal', role: 'owner', memberStatus: 'active', lifecycleState: 'active' },
] as const;

/** Server-level AMR fixture. The thin fake CLI transports real daemon requests
 * over HTTP; no browser billing, context or membership route is fulfilled. */
export async function createBillingPreviewFixture(scratch: string) {
  const requests: Array<{ at: string; method: string; path: string; workspaceId: string | null }> = [];
  const subscriptionEvents: Array<{ at: string; workspaceId: string; revision: string }> = [];
  const streams = new Set<{ response: ServerResponse; workspaceId: string }>();
  let releasePreview!: () => void;
  const previewGate = new Promise<void>((resolve) => { releasePreview = resolve; });
  let previewStarted!: () => void;
  const previewPending = new Promise<void>((resolve) => { previewStarted = resolve; });
  let previewReleased = false;
  let quotaCursor = 0;
  let aBalance = '12.50';
  let aRemaining = '80';
  let walletRevision = '1';
  let bPlan = 'plus';
  let bBillingRevision = '1';
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const workspaceId = url.searchParams.get('workspaceId') ?? String(req.headers['x-vela-workspace-id'] ?? '');
    requests.push({ at: new Date().toISOString(), method: req.method ?? '', path: url.pathname, workspaceId: workspaceId || null });
    const json = (body: unknown, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.headers.authorization !== 'Bearer fake-control-key') return json({ error: 'unauthenticated' }, 401);
    if (url.pathname === '/api/v1/workspaces') return json({ items: BILLING_SPACES });
    const space = BILLING_SPACES.find((item) => item.workspaceId === workspaceId);
    if (url.pathname === '/api/v1/billing/summary') return json({ membershipTier: 'plus', balanceUsd: '999.00', subscriptionStatus: 'active', balances: { totalAvailableCredits: 9990000, rechargeCredits: 0, subscriptionCredits: 9990000 }, availableActions: [] });
    // Agent detection also reads an ambient catalog; only the exact upgraded
    // workspace's scoped CLI probe may unlock its Pro option.
    if (url.pathname === '/api/v1/models' && workspaceId && !space) return json({ error: 'workspace_not_authorized' }, 403);
    if (url.pathname === '/api/v1/models') return json({ source: 'remote', data: [
      { id: 'fixture-model', name: 'Fixture model', enabled: true },
      { id: 'fixture-pro-model', name: 'Fixture Pro model', enabled: workspaceId === BILLING_SPACES[1].workspaceId && bPlan === 'pro' },
    ] });
    if (!space) return json({ error: 'workspace_not_authorized' }, 403);
    if (url.pathname === '/api/v1/workspaces/current') return json({ ...space, billingState: 'active', planId: workspaceId === BILLING_SPACES[1].workspaceId ? bPlan : 'plus', providerMode: 'platform_credits', memberCount: 1 });
    if (url.pathname === '/api/v1/collab/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      res.write(`event: ready\ndata: ${JSON.stringify({ workspaceId, capabilities: ['billing-revision-clocks-v1', 'coding-plan-usage-events-v1'] })}\n\n`);
      const stream = { response: res, workspaceId };
      streams.add(stream);
      res.on('close', () => streams.delete(stream));
      return;
    }
    const personalA = space.workspaceId === BILLING_SPACES[0].workspaceId;
    if (url.pathname === `/api/v1/workspaces/${workspaceId}/billing/snapshot`) return json({
      schemaVersion: 1, workspaceId, workspaceMemberId: space.workspaceMemberId, billingScopeVersion: 2,
      billing: { billingState: 'active', planId: personalA ? 'plus' : bPlan },
      wallet: { balanceUsd: personalA ? aBalance : '42.00', expiresAt: null, updatedAt: new Date().toISOString() },
      designPlanWindows: [{ kind: '7d', windowStart: null, resetsAt: null, remainingCredits: personalA ? aRemaining : '45', limitCredits: '100' }],
      revisions: { billing: personalA ? '1' : bBillingRevision, wallet: personalA ? walletRevision : '1' },
      revisionClocks: { billing: { epoch: 'billing', counter: personalA ? '1' : bBillingRevision }, wallet: { epoch: 'wallet', counter: personalA ? walletRevision : '1' } },
    });
    if (url.pathname.endsWith('/billing/preflight')) {
      if (personalA) { previewStarted(); await previewGate; }
      return json({ schemaVersion: 1, workspaceId, workspaceMemberId: space.workspaceMemberId,
        generatedAt: new Date().toISOString(), modelId: null, balanceUsd: '999.00', billingMode: 'shared',
        funding: 'coding_plan', modelCovered: true,
        codingPlan: { workspaceId, generatedAt: new Date().toISOString(), eligible: true, tier: 'plus', windows: [] } });
    }
    return json({ error: 'fixture_route_not_found' }, 404);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('owned AMR fixture port missing');
  const apiUrl = `http://127.0.0.1:${address.port}`;
  const velaBin = join(scratch, 'billing-vela');
  await writeFile(velaBin, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes('--version') || args[0] === 'version') { console.log('vela 0.1.8-e2e'); process.exit(0); }
if (args[0] === 'models') { console.log(JSON.stringify({ source: 'remote', data: [{ id: 'fixture-model', name: 'Fixture model' }] })); process.exit(0); }
if (args[0] === 'model') {
  if (args[1] === 'preset') {
    console.log(JSON.stringify({ source: 'preset', data: [{ id: 'fixture-model', name: 'Fixture model', enabled: true }, { id: 'fixture-pro-model', name: 'Fixture Pro model', enabled: false }] }));
    process.exit(0);
  }
  if (args[1] !== 'list') process.exit(1);
  const url = new URL('/api/v1/models', ${JSON.stringify(apiUrl)});
  if (process.env.VELA_WORKSPACE_ID) url.searchParams.set('workspaceId', process.env.VELA_WORKSPACE_ID);
  const response = await fetch(url, { headers: { authorization: 'Bearer fake-control-key' } });
  console.log(await response.text());
  process.exit(response.ok ? 0 : 1);
}
if (args[0] !== 'billing') process.exit(1);
const id = args[args.indexOf('--workspace-id') + 1];
const suffix = args[1] === 'summary' ? '/api/v1/billing/summary'
  : '/api/v1/workspaces/' + id + '/billing/' + (args[1] === 'workspace-snapshot' ? 'snapshot' : args[1]);
const url = new URL(suffix, ${JSON.stringify(apiUrl)});
if (args[1] !== 'summary') url.searchParams.set('workspaceId', id);
const response = await fetch(url, { headers: { authorization: 'Bearer fake-control-key' } });
const body = await response.text();
if (!response.ok) { console.error('API request failed with status ' + response.status + ': ' + body); process.exit(1); }
console.log(body);
`, 'utf8');
  await chmod(velaBin, 0o755);
  return {
    apiUrl, velaBin, requests, previewPending, subscriptionEvents,
    get previewReleased() { return previewReleased; },
    releasePreview() { previewReleased = true; releasePreview(); },
    updateA() {
      aBalance = '17.25'; aRemaining = '70'; walletRevision = '2';
      const event = { type: 'coding-plan-usage-changed', workspaceId: BILLING_SPACES[0].workspaceId, workspaceMemberId: BILLING_SPACES[0].workspaceMemberId, eventId: String(++quotaCursor) };
      for (const stream of streams) if (stream.workspaceId === event.workspaceId) stream.response.write(`event: workspace-event\ndata: ${JSON.stringify(event)}\n\n`);
    },
    upgradeB() {
      bPlan = 'pro'; bBillingRevision = '2';
      subscriptionEvents.push({ at: new Date().toISOString(), workspaceId: BILLING_SPACES[1].workspaceId, revision: bBillingRevision });
      const event = { type: 'billing-subscription-changed', workspaceId: BILLING_SPACES[1].workspaceId,
        workspaceMemberId: BILLING_SPACES[1].workspaceMemberId, revision: bBillingRevision,
        revisionClock: { epoch: 'billing', counter: bBillingRevision } };
      for (const stream of streams) if (stream.workspaceId === event.workspaceId) stream.response.write(`event: workspace-event\ndata: ${JSON.stringify(event)}\n\n`);
    },
    async close() {
      releasePreview();
      for (const stream of streams) stream.response.end();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
