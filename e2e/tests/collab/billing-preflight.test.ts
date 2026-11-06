// @vitest-environment node
import { execFile } from 'node:child_process';
import { chmod, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type { WorkspaceBillingPreflight, WorkspaceBillingResponse } from '@open-design/contracts';
import { expect, test } from 'vitest';

import { createSmokeSuite } from '@/vitest/suite';

const scopes = ['a', 'b'].map((id) => ({
  workspaceId: `ws-preflight-${id}`,
  workspaceMemberId: `member-preflight-${id}`,
  workspaceName: `Preflight ${id}`,
  workspaceType: 'personal',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
}));

function preflight(workspaceId: string, modelId: string | null): WorkspaceBillingPreflight {
  return {
    schemaVersion: 1, workspaceId,
    workspaceMemberId: scopes.find((item) => item.workspaceId === workspaceId)!.workspaceMemberId,
    modelId, generatedAt: new Date().toISOString(), balanceUsd: '0.00',
    modelCovered: true, funding: 'coding_plan',
    codingPlan: {
      workspaceId, generatedAt: new Date().toISOString(), eligible: true, tier: 'go',
      windows: [18000, 604800].map((durationSeconds) => ({
        policyId: `policy-${durationSeconds}`, durationSeconds,
        resetMode: 'activity_triggered',
        usedCredits: '2', limitCredits: '100', remainingCredits: '98',
        windowStart: null, resetsAt: null,
      })),
    },
  };
}

test('[P0] scoped billing carries CLI evidence through real daemon HTTP and rejects corrupt or unauthorized evidence',
  { timeout: 300_000 }, async () => {
    const suite = await createSmokeSuite('billing-preflight');
    const calls: string[][] = [];
    const evidence: unknown[] = [];
    let mutate: (value: WorkspaceBillingPreflight) => void = () => {};
    let failure: string | null = null;
    let heldModel: string | null = null;
    let releaseHeld: (() => void) | undefined;
    let signalHeld: (() => void) | undefined;
    const authority = createServer(async (req, res) => {
      const url = new URL(req.url!, 'http://fixture.invalid');
      if (url.pathname === '/api/v1/workspaces') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ items: scopes }));
        return;
      }
      if (url.pathname !== '/cli') { res.writeHead(404).end(); return; }
      const args = JSON.parse(url.searchParams.get('args')!) as string[];
      calls.push(args);
      const workspaceId = args[args.indexOf('--workspace-id') + 1];
      const member = scopes.find((item) => item.workspaceId === workspaceId);
      let value: unknown = null;
      let error: string | null = null;
      if (args[1] === 'summary') {
        value = { membershipTier: 'go', balanceUsd: '0', subscriptionStatus: 'active', balances: {}, availableActions: [] };
      } else if (args[1] === 'workspace-snapshot') {
        value = {
          schemaVersion: 1, billingScopeVersion: 2, workspaceId,
          workspaceMemberId: member?.workspaceMemberId,
          billing: { billingState: 'active', planId: 'go' },
          wallet: { balanceUsd: '0.00', expiresAt: null, updatedAt: new Date().toISOString() },
          revisions: { billing: '1', wallet: '1' },
        };
      } else if (args[1] === 'preflight') {
        const modelId = args.includes('--model') ? args[args.indexOf('--model') + 1]! : null;
        const result = preflight(workspaceId!, modelId);
        mutate(result);
        value = result;
        error = failure;
        if (heldModel != null && modelId === heldModel) {
          await new Promise<void>((resolve) => { releaseHeld = resolve; signalHeld?.(); });
        }
      } else error = 'unknown command';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ stdout: error ? '' : JSON.stringify(value), stderr: error ?? '', code: error ? 1 : 0 }));
    });
    await new Promise<void>((resolve) => authority.listen(0, '127.0.0.1', resolve));
    const address = authority.address();
    if (!address || typeof address === 'string') throw new Error('fixture port missing');
    const authorityUrl = `http://127.0.0.1:${address.port}`;
    const velaBin = join(suite.scratchDir, 'vela-fixture');
    await writeFile(velaBin, `#!/usr/bin/env node
const url = new URL('/cli', ${JSON.stringify(authorityUrl)});
url.searchParams.set('args', JSON.stringify(process.argv.slice(2)));
fetch(url).then(r => r.json()).then(r => {
  process.stdout.write(r.stdout); process.stderr.write(r.stderr); process.exitCode = r.code;
}).catch(e => { process.stderr.write(String(e)); process.exitCode = 1; });
`);
    await chmod(velaBin, 0o755);
    try {
      await suite.with.toolsDev(async ({ webUrl, runtime }) => {
        async function read(scopeIndex = 0, modelId = 'model-covered') {
          const scope = scopes[scopeIndex]!;
          const url = new URL('/api/workspace/billing', webUrl);
          url.search = new URLSearchParams({ scope: 'workspace', workspaceId: scope.workspaceId, includePreflight: '1', modelId }).toString();
          const response = await fetch(url, { headers: {
            'x-od-workspace-id': scope.workspaceId,
            'x-od-workspace-member-id': scope.workspaceMemberId,
          } });
          return { status: response.status, body: await response.json() as WorkspaceBillingResponse };
        }
        const initial = await read();
        expect(initial.status).toBe(200);
        expect(initial.body.preflight).toMatchObject({ workspaceId: scopes[0]!.workspaceId, workspaceMemberId: scopes[0]!.workspaceMemberId, modelId: 'model-covered' });
        evidence.push({ case: 'M06-06 HTTP exact scope/model', ...initial });

        const odBin = fileURLToPath(new URL('../../../apps/daemon/bin/od.mjs', import.meta.url));
        const { stdout } = await promisify(execFile)(process.execPath, [odBin, 'workspace', 'billing', '--workspace-type', 'personal', '--workspace', scopes[1]!.workspaceId, '--model', 'model with spaces', '--json'], {
          env: { ...process.env, OD_DAEMON_URL: `http://127.0.0.1:${runtime.daemonPort}` },
        });
        const cli = JSON.parse(stdout) as WorkspaceBillingResponse;
        expect(cli.preflight).toMatchObject({ workspaceId: scopes[1]!.workspaceId, workspaceMemberId: scopes[1]!.workspaceMemberId, modelId: 'model with spaces' });
        expect(calls).toContainEqual(['billing', 'preflight', '--workspace-id', scopes[1]!.workspaceId, '--format', 'json', '--model', 'model with spaces']);
        evidence.push({ case: 'M06-06 real od CLI argument preservation', body: cli });

        const corruptions: Array<[string, typeof mutate]> = [
          ['old-schema', (v) => { v.schemaVersion = 0 as 1; }],
          ['foreign-workspace', (v) => { v.workspaceId = scopes[1]!.workspaceId; }],
          ['foreign-member', (v) => { v.workspaceMemberId = scopes[1]!.workspaceMemberId; }],
          ['foreign-model', (v) => { v.modelId = 'other-model'; }],
          ['invalid-date', (v) => { v.generatedAt = 'invalid'; }],
          ['negative-credit', (v) => { v.codingPlan.windows[0]!.usedCredits = '-1'; }],
          ['fractional-credit', (v) => { v.codingPlan.windows[0]!.usedCredits = '0.5'; }],
          ['non-numeric-credit', (v) => { v.codingPlan.windows[0]!.usedCredits = 'NaN'; }],
          ['zero-limit', (v) => { v.codingPlan.windows[0]!.limitCredits = '0'; }],
          ['remaining-above-limit', (v) => { v.codingPlan.windows[0]!.remainingCredits = '101'; }],
          ['invalid-reset-date', (v) => { v.codingPlan.windows[0]!.resetsAt = 'invalid'; }],
        ];
        for (const [name, mutation] of corruptions) {
          mutate = mutation;
          const result = await read();
          expect(result.status, name).toBe(200);
          expect(result.body.preflight, name).toBeNull();
          expect(result.body.workspaceBalance?.workspaceId, name).toBe(scopes[0]!.workspaceId);
          evidence.push({ case: `M06-08 ${name}`, ...result });
        }
        mutate = (v) => { v.codingPlan.windows[0]!.limitCredits = '900719925474099312345'; v.codingPlan.windows[0]!.remainingCredits = '900719925474099312343'; };
        const large = await read();
        expect(large.body.preflight?.codingPlan.windows[0]?.remainingCredits).toBe('900719925474099312343');
        evidence.push({ case: 'M06-08 large integer lossless', ...large });

        mutate = () => {};
        for (const message of ['unknown command "preflight" for "vela billing"', 'upstream temporarily unavailable']) {
          failure = message;
          const result = await read();
          expect(result.status).toBe(200);
          expect(result.body.preflight).toBeNull();
          expect(result.body.workspaceBalance?.balanceUsd).toBe('0.00');
          evidence.push({ case: 'M07-07 compatibility/unavailable evidence', message, ...result });
        }
        for (const status of [401, 403]) {
          failure = `api request failed with status ${status}: forbidden`;
          const result = await read();
          expect(result.status).toBe(403);
          expect(result.body).toEqual({ error: 'workspace_not_authorized' });
          evidence.push({ case: 'M07-08 auth cannot degrade', upstreamStatus: status, ...result });
        }
        failure = null;
        heldModel = 'delayed-model-a';
        const held = new Promise<void>((resolve) => { signalHeld = resolve; });
        const delayedA = read(0, heldModel);
        await held;
        try {
          const currentB = await read(1, 'current-model-b');
          expect(currentB.body.preflight).toMatchObject({ workspaceId: scopes[1]!.workspaceId, modelId: 'current-model-b' });
          releaseHeld!();
          const lateA = await delayedA;
          expect(lateA.body.preflight).toMatchObject({ workspaceId: scopes[0]!.workspaceId, modelId: 'delayed-model-a' });
          expect((await read(1, 'current-model-b')).body.preflight).toMatchObject({ workspaceId: scopes[1]!.workspaceId, modelId: 'current-model-b' });
          evidence.push({ case: 'M05 HTTP concurrent subjects remain independent (UI discard covered separately)', currentB, lateA });
        } finally { releaseHeld?.(); }
        mutate = (value) => { value.codingPlan.windows = []; };
        const emptyPlan = await read();
        evidence.push({ case: 'M04-16/M06-08 empty windows cannot supply Coding Plan recovery evidence', ...emptyPlan });
        await suite.report.json('billing-preflight-evidence.json', evidence);
        await suite.report.json('vela-invocations.json', calls);
        expect(emptyPlan.status).toBe(200);
        expect(emptyPlan.body.preflight, 'coding_plan + covered + eligible with no applicable windows is not funding evidence').toBeNull();
      }, { env: { AMR_HOME: join(suite.scratchDir, 'amr-home'), OD_WORKSPACE_CONTEXT_SOURCE: 'vela', VELA_API_URL: authorityUrl, VELA_CONTROL_KEY: 'billing-test-key', VELA_BIN: velaBin } });
      console.log(`Billing HTTP/CLI evidence: ${suite.report.root}`);
    } finally {
      releaseHeld?.();
      await new Promise<void>((resolve) => authority.close(() => resolve()));
    }
  });
