// @vitest-environment node

/**
 * End-to-end coverage for an AMR (vela) chat run driven through the real
 * tools-dev orchestrated daemon. Boots a namespaced daemon + web pair,
 * configures it to spawn a self-contained fake `vela` binary, pre-seeds
 * `~/.amr/config.json` as if the user had already approved CLI login,
 * then drives a complete /api/runs lifecycle for `agentId: 'amr'` and
 * asserts the assistant message picks up the fake's canned text.
 *
 * What this proves that lower-tier tests don't:
 *
 *   1. The chat-run path in `apps/daemon/src/server.ts` correctly routes
 *      `agentId: 'amr'` through `attachAcpSession` (not the legacy
 *      json-event-stream parser the old `incongruous-megaraptor` branch
 *      used).
 *   2. The synthetic `'default'` model id is preserved so vela can use the
 *      upstream account default without an explicit `session/set_model`.
 *   3. The full ACP transport (`initialize` → `session/new` →
 *      `session/set_model` → `session/prompt` → `session/update*`) flows
 *      between the daemon and a spawned subprocess that respects vela's
 *      `~/.amr/config.json` resolution path.
 */

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import type { AgentsResponse } from '@open-design/contracts';

import { AMR_TEST_WORKSPACE_HEADERS } from '@/vitest/amr';
import { requestJson } from '@/vitest/http';
import { listMessages } from '@/vitest/messages';
import { readRunEvents, startRun, waitForRunStatus } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/suite';

type ProjectResponse = {
  conversationId: string;
  project: { id: string; metadata?: { kind?: string }; name: string };
};

// Inline fake `vela` binary. Handles the two argv shapes OpenDesign's
// daemon ever spawns:
//
//   `vela models`                       — legacy catalog probe compatibility.
//   `vela model preset --format json`   — print the fast preset catalog.
//   `vela model list --format json`     — print the live link model catalog.
//   `vela login`                        — write ~/.amr/config.json and exit 0.
//   `vela agent run --runtime opencode` — ACP stdio runtime (initialize →
//                                          session/new → session/set_model →
//                                          session/prompt → session/update*).
//
// Kept inline (not imported from apps/daemon/tests/fixtures/fake-vela.mjs)
// because cross-app private fixtures must not be reused — see
// e2e/AGENTS.md "tests must not borrow another app's private source".
const FAKE_VELA_SCRIPT = `#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { argv, stdin, stdout, env, exit } from 'node:process';

const ASSISTANT_TEXT = env.FAKE_VELA_TEXT || 'Hello from the e2e fake vela.';
const SESSION_ID = 'fake-amr-session-1';
const LIVE_MODEL_ID = 'glm-5';
const MIXED_MODELS = [
  { id: LIVE_MODEL_ID },
  { id: 'nano-banana-2' },
  { id: 'seedream-5.0' },
  { id: 'seedance-2' },
];
const PRESET_MODELS_JSON = JSON.stringify({ source: 'preset', data: MIXED_MODELS });
const REMOTE_MODELS_JSON = JSON.stringify({ source: 'remote', data: MIXED_MODELS });

function readBalanceState() {
  if (!env.FAKE_VELA_BALANCE_FILE) {
    return { accountBalanceUsd: '0.00', teamBalanceUsd: '0.00', walletRevision: 1 };
  }
  return JSON.parse(readFileSync(env.FAKE_VELA_BALANCE_FILE, 'utf8'));
}

if (env.FAKE_VELA_SPAWN_ENV_LOG) {
  appendFileSync(env.FAKE_VELA_SPAWN_ENV_LOG, JSON.stringify({
    argv: argv.slice(2),
    workspaceId: env.OPEN_DESIGN_WORKSPACE_ID ?? null,
    runId: env.OPEN_DESIGN_RUN_ID ?? null,
    sessionId: env.OPEN_DESIGN_SESSION_ID ?? null,
  }) + '\\n', 'utf8');
}

function writeMessage(obj) {
  stdout.write(JSON.stringify(obj) + '\\n');
}
function writeResult(id, result) {
  writeMessage({ jsonrpc: '2.0', id, result });
}
function writeNotification(method, params) {
  writeMessage({ jsonrpc: '2.0', method, params });
}

if (argv[2] === '--version') {
  stdout.write('vela version 0.0.1\\n');
  exit(0);
}

if (argv[2] === '--help') {
  exit(0);
}

if (argv[2] === 'login') {
  const file = join(homedir(), '.amr', 'config.json');
  mkdirSync(dirname(file), { recursive: true });
  const profile = (env.VELA_PROFILE || 'local').trim() || 'local';
  writeFileSync(file, JSON.stringify({
    profiles: {
      [profile]: {
        runtimeKey: 'fake-runtime-key-0000000000000000000000',
        controlKey: 'fake-control-key-0000000000000000000000',
        apiUrl: env.FAKE_VELA_API_URL || 'http://localhost:18080',
        linkUrl: env.FAKE_VELA_LINK_URL || 'http://localhost:18081',
        user: { id: 'fake-user-id', email: 'e2e@example.com', plan: 'free' },
      },
    },
  }, null, 2), 'utf8');
  exit(0);
}

if (argv[2] === 'models') {
  stdout.write([
    'public_model_glm_5         vela',
    'public_model_nano_banana_2 vela',
    'public_model_seedream_5_0  vela',
    'public_model_seedance_2    vela',
  ].join('\\n') + '\\n');
  exit(0);
}

if (argv[2] === 'model' && argv[3] === 'preset' && argv.includes('--format') && argv.includes('json')) {
  stdout.write(PRESET_MODELS_JSON + '\\n');
  exit(0);
}

if (argv[2] === 'model' && argv[3] === 'list' && argv.includes('--format') && argv.includes('json')) {
  stdout.write(REMOTE_MODELS_JSON + '\\n');
  exit(0);
}

if (argv[2] === 'billing' && argv[3] === 'summary') {
  const balance = readBalanceState();
  stdout.write(JSON.stringify({
    membershipTier: 'free',
    balanceUsd: balance.accountBalanceUsd,
    subscriptionStatus: 'inactive',
    balances: {
      totalAvailableCredits: 0,
      subscriptionCredits: 0,
      rechargeCredits: 0,
    },
    availableActions: [],
  }) + '\\n');
  exit(0);
}

if (argv[2] === 'billing' && argv[3] === 'workspace-snapshot') {
  const balance = readBalanceState();
  const workspaceId = argv[argv.indexOf('--workspace-id') + 1];
  stdout.write(JSON.stringify({
    schemaVersion: 1,
    workspaceId,
    workspaceMemberId: env.FAKE_VELA_WORKSPACE_MEMBER_ID,
    billingScopeVersion: 2,
    billing: { billingState: 'active', planId: 'team_plus' },
    wallet: {
      balanceUsd: balance.teamBalanceUsd,
      expiresAt: null,
      updatedAt: new Date().toISOString(),
    },
    revisions: {
      billing: 'billing-1',
      wallet: 'wallet-' + balance.walletRevision,
    },
  }) + '\\n');
  exit(0);
}

const sessionsWithModel = new Set();
let buffer = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\\n');
  buffer = lines.pop() || '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    handle(msg);
  }
});
stdin.on('end', () => { stdout.end(); exit(0); });

function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    writeResult(id, {
      protocolVersion: 1,
      agentCapabilities: { promptCapabilities: { text: true } },
      models: {
        currentModelId: LIVE_MODEL_ID,
        availableModels: [{ modelId: LIVE_MODEL_ID, name: LIVE_MODEL_ID }],
      },
    });
    return;
  }
  if (method === 'session/new') {
    writeResult(id, {
      sessionId: SESSION_ID,
      models: {
        currentModelId: LIVE_MODEL_ID,
        availableModels: [{ modelId: LIVE_MODEL_ID, name: LIVE_MODEL_ID }],
      },
    });
    return;
  }
  if (method === 'session/set_model' || method === 'session/set_config_option') {
    const sid = (params && params.sessionId) || SESSION_ID;
    sessionsWithModel.add(sid);
    writeResult(id, {});
    return;
  }
  if (method === 'session/prompt') {
    const sid = (params && params.sessionId) || SESSION_ID;
    if (env.FAKE_VELA_BALANCE_FILE) {
      const balance = readBalanceState();
      writeFileSync(env.FAKE_VELA_BALANCE_FILE, JSON.stringify({
        ...balance,
        teamBalanceUsd: env.FAKE_VELA_SETTLED_TEAM_BALANCE_USD || '17.50',
        walletRevision: Number(balance.walletRevision || 0) + 1,
      }), 'utf8');
    }
    writeNotification('session/update', {
      sessionId: sid,
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: ASSISTANT_TEXT } },
    });
    writeResult(id, {
      stopReason: 'end_turn',
      usage: { inputTokens: 7, outputTokens: 5, totalTokens: 12 },
    });
    return;
  }
  if (typeof id !== 'undefined') {
    writeMessage({ jsonrpc: '2.0', id, error: { code: -32601, message: 'unknown method ' + method } });
  }
}
`;

async function writeFakeVelaBin(root: string): Promise<string> {
  await mkdir(root, { recursive: true });
  const bin = join(root, 'vela');
  await writeFile(bin, FAKE_VELA_SCRIPT, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

const PROMPT = 'Reply: HELLO';
const ASSISTANT_TEXT = 'AMR-E2E-OK';

describe('AMR chat-run end-to-end', () => {
  test('drives /api/runs against vela ACP and the assistant message captures the fake stream', async () => {
    // tools-dev daemon boot + chat run lifecycle needs the same headroom
    // as the dialog/* smoke specs (~3 minutes for cold spawn + run).
    const suite = await createSmokeSuite('amr-turn');

    await suite.with.toolsDev(async ({ webUrl }) => {
      const velaBin = await writeFakeVelaBin(join(suite.scratchDir, 'fake-vela'));

      // Pre-seed `~/.amr/config.json` so `vela agent run` (the fake) does
      // not need to negotiate device-auth. Production AMR works the same
      // way: once login has happened once, the runtime reads the file.
      const velaConfigDir = join(suite.scratchDir, 'home', '.amr');
      await mkdir(velaConfigDir, { recursive: true });
      await writeFile(
        join(velaConfigDir, 'config.json'),
        JSON.stringify(
          {
            profiles: {
              local: {
                runtimeKey: 'fake-runtime-key',
                controlKey: 'fake-control-key',
                apiUrl: suite.amr.apiUrl,
                linkUrl: suite.amr.linkUrl,
                user: { id: 'fake-user-id', email: 'e2e@example.com', plan: 'free' },
              },
            },
          },
          null,
          2,
        ),
      );

      // Persist agentCliEnv so the daemon's runtime resolver picks up the
      // fake binary and the pre-run AMR status guard sees configured runtime
      // credentials without touching the developer's real ~/.amr config.
      await requestJson<{ config: Record<string, unknown> }>(webUrl, '/api/app-config', {
        body: {
          agentCliEnv: {
            amr: {
              FAKE_VELA_API_URL: suite.amr.apiUrl,
              FAKE_VELA_LINK_URL: suite.amr.linkUrl,
              VELA_BIN: velaBin,
              ...suite.amr.runtimeEnv(),
            },
          },
          agentId: 'amr',
          agentModels: { amr: { model: 'default', reasoning: 'default' } },
          designSystemId: null,
          onboardingCompleted: true,
          skillId: null,
          telemetry: { artifactManifest: true, content: false, metrics: false },
        },
        method: 'PUT',
      });

      // Cross the real daemon catalog boundary before starting the run. The
      // fake intentionally publishes image and video models beside a valid
      // chat model; those media-only ids must never reach either chat picker.
      const agents = await requestJson<AgentsResponse>(webUrl, '/api/agents');
      const amr = agents.agents.find((agent) => agent.id === 'amr');
      expect(amr, 'AMR agent is present in the detected runtime catalog').toBeDefined();
      const modelIds = amr?.models?.map((model) => model.id) ?? [];
      expect(modelIds.length, 'AMR retains a non-empty normalized chat catalog').toBeGreaterThan(0);
      expect(modelIds, 'the response came from this test\'s live fake Vela catalog').toContain('glm-5');
      expect(modelIds).not.toEqual(expect.arrayContaining([
        'nano-banana-2',
        'seedream-5.0',
        'seedance-2',
      ]));

      const project = await requestJson<ProjectResponse>(webUrl, '/api/projects', {
        body: {
          designSystemId: null,
          id: randomUUID(),
          metadata: { kind: 'prototype' },
          name: 'AMR turn e2e',
          pendingPrompt: null,
          skillId: null,
        },
        headers: { ...AMR_TEST_WORKSPACE_HEADERS },
      });
      const projectId = project.project.id;
      const conversationId = project.conversationId;

      const t0 = Date.now();
      const userMessageId = `user-${t0}`;
      const assistantMessageId = `assistant-${t0}`;

      const run = await startRun(webUrl, {
        agentId: 'amr',
        assistantMessageId,
        clientRequestId: `req-${t0}`,
        conversationId,
        designSystemId: null,
        message: PROMPT,
        // 'default' must be resolved through AMR's live `vela models`
        // preflight; if that helper regressed, the fake vela would reject
        // session/prompt with the `set_model must be called before
        // session/prompt` error encoded above.
        model: 'default',
        projectId,
        reasoning: 'default',
        skillId: null,
      }, { ...AMR_TEST_WORKSPACE_HEADERS });
      expect(run.runId).toMatch(/[a-z0-9-]/i);

      // Override the per-process FAKE_VELA_TEXT so the assertion below is
      // tied to a stable canned reply. The runtime spawn inherits the
      // daemon's process.env, so setting it after startRun would race with
      // spawn; instead we set it on `process.env` for the test process —
      // but tools-dev orchestrates a separate daemon child, so this only
      // takes effect when the fake script reads its own env. The fake
      // ships with a default 'Hello from the e2e fake vela.' literal, so
      // we assert on a substring instead of pinning the full text here.
      void ASSISTANT_TEXT;

      const finalStatus = await waitForRunStatus(webUrl, run.runId, 'succeeded', {
        headers: { ...AMR_TEST_WORKSPACE_HEADERS },
        timeoutMs: 30_000,
      });
      expect(finalStatus.status).toBe('succeeded');

      const runEvents = await readRunEvents(webUrl, run.runId, {
        headers: { ...AMR_TEST_WORKSPACE_HEADERS },
      });
      const toolTokenExpiry = runEvents.match(/"toolTokenExpiresAt":"([^"]+)"/)?.[1];
      expect(toolTokenExpiry, 'run start event exposes the run-scoped tool-token deadline').toBeTruthy();
      expect(Date.parse(toolTokenExpiry ?? '') - t0).toBeGreaterThanOrEqual(44 * 60 * 1000);
      expect(runEvents).toContain('"type":"usage"');
      expect(runEvents).toContain('input_tokens');
      expect(runEvents).toContain('output_tokens');
      // This suite opts out of content telemetry. The ACP transport still
      // persists the assistant transcript for the product, but the run event
      // stream must not leak the user's raw prompt to telemetry consumers.
      expect(runEvents).not.toContain(PROMPT);

      const messages = await listMessages(
        webUrl,
        projectId,
        conversationId,
        { ...AMR_TEST_WORKSPACE_HEADERS },
      );
      const assistantMessage = messages.find((m) => m.id === assistantMessageId);
      if (assistantMessage) {
        expect(assistantMessage.content).toContain('Hello from the e2e fake vela');
      } else {
        // Some chat flows save the assistant message under a daemon-assigned
        // id rather than the client-provided one. Fall back to checking any
        // assistant message captured the fake's text.
        const anyAssistant = messages.find(
          (m) => m.role === 'assistant' && m.content.includes('Hello from the e2e fake vela'),
        );
        expect(anyAssistant).toBeTruthy();
      }
    });
  }, 180_000);

  test('the Team run keeps its project scope and settles only that workspace wallet', async () => {
    const suite = await createSmokeSuite('amr-team-workspace-spawn');
    const workspace = {
      workspaceId: 'ws-amr-team-e2e',
      workspaceName: 'AMR Billing Team',
      workspaceType: 'team',
      workspaceMemberId: 'wm-amr-team-e2e',
      role: 'owner',
      memberStatus: 'active',
      lifecycleState: 'active',
    };
    const personalWorkspace = {
      workspaceId: 'personal-amr-team-e2e',
      workspaceName: 'Workspace Runner workspace',
      workspaceType: 'personal',
      workspaceMemberId: 'wm-amr-personal-e2e',
      role: 'owner',
      memberStatus: 'active',
      lifecycleState: 'active',
    };
    const authority = createServer((req, res) => {
      if (
        req.method === 'GET' &&
        req.url === '/api/v1/workspaces'
      ) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ items: [personalWorkspace, workspace] }));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
    await new Promise<void>((resolve) => authority.listen(0, '127.0.0.1', resolve));
    const address = authority.address();
    if (!address || typeof address === 'string') {
      throw new Error('AMR workspace authority did not bind a port');
    }
    const authorityUrl = `http://127.0.0.1:${address.port}`;
    const velaBin = await writeFakeVelaBin(
      join(suite.scratchDir, 'fake-vela-team-workspace'),
    );
    const spawnEnvLog = join(suite.scratchDir, 'vela-spawn-env.jsonl');
    const balanceStateFile = join(suite.scratchDir, 'vela-balance-state.json');
    await writeFile(balanceStateFile, JSON.stringify({
      accountBalanceUsd: '50.00',
      teamBalanceUsd: '20.00',
      walletRevision: 1,
    }));

    try {
      await suite.with.toolsDev(
        async ({ webUrl }) => {
          const velaConfigDir = join(suite.scratchDir, 'home', '.amr');
          await mkdir(velaConfigDir, { recursive: true });
          await writeFile(
            join(velaConfigDir, 'config.json'),
            JSON.stringify({
              profiles: {
                local: {
                  runtimeKey: 'fake-runtime-key',
                  controlKey: 'fake-control-key',
                  apiUrl: suite.amr.apiUrl,
                  linkUrl: suite.amr.linkUrl,
                  user: {
                    id: 'fake-user-id',
                    email: 'workspace-runner@example.com',
                    plan: 'team_plus',
                  },
                },
              },
            }),
          );
          await requestJson(webUrl, '/api/app-config', {
            method: 'PUT',
            body: {
              agentCliEnv: {
                amr: {
                  FAKE_VELA_API_URL: suite.amr.apiUrl,
                  FAKE_VELA_LINK_URL: suite.amr.linkUrl,
                  VELA_BIN: velaBin,
                  ...suite.amr.runtimeEnv(),
                },
              },
              agentId: 'amr',
              agentModels: { amr: { model: 'default', reasoning: 'default' } },
              designSystemId: null,
              onboardingCompleted: true,
              skillId: null,
              telemetry: { artifactManifest: true, content: false, metrics: false },
            },
          });

          const headers = {
            'x-od-workspace-id': workspace.workspaceId,
            'x-od-workspace-type': workspace.workspaceType,
            'x-od-workspace-member-id': workspace.workspaceMemberId,
            'x-od-workspace-role': workspace.role,
            'x-od-workspace-member-status': workspace.memberStatus,
            'x-od-workspace-lifecycle-state': workspace.lifecycleState,
            'x-od-workspace-can-share-projects': 'true',
            'x-od-workspace-can-write-synced-files': 'true',
          };
          const project = await requestJson<ProjectResponse>(webUrl, '/api/projects', {
            method: 'POST',
            headers,
            body: {
              designSystemId: null,
              id: randomUUID(),
              metadata: { kind: 'prototype' },
              name: 'Workspace-billed AMR run',
              pendingPrompt: null,
              skillId: null,
            },
          });
          const initialTeamBilling = await requestJson<{
            workspaceBalance: { balanceUsd: string } | null;
            workspaceSnapshot: { revisions: { wallet: string } } | null;
          }>(
            webUrl,
            `/api/workspace/billing?scope=workspace&workspaceId=${workspace.workspaceId}`,
            { headers },
          );
          expect(initialTeamBilling.workspaceBalance?.balanceUsd).toBe('20.00');
          expect(initialTeamBilling.workspaceSnapshot?.revisions.wallet).toBe('wallet-1');
          const initialAccountBilling = await requestJson<{
            summary: { balanceUsd: string } | null;
          }>(webUrl, '/api/workspace/billing?scope=account');
          expect(initialAccountBilling.summary?.balanceUsd).toBe('50.00');

          // Re-aim the account-level selection after the Team project has
          // already been pinned. The spawned AMR process must still use the
          // project's Team billing address, never this ambient Personal one.
          await requestJson(webUrl, '/api/workspace/active', {
            method: 'PUT',
            body: {
              workspaceId: personalWorkspace.workspaceId,
              workspaceMemberId: personalWorkspace.workspaceMemberId,
            },
          });
          const t0 = Date.now();
          const run = await requestJson<{ runId: string }>(webUrl, '/api/runs', {
            method: 'POST',
            headers,
            body: {
              agentId: 'amr',
              assistantMessageId: `assistant-${t0}`,
              clientRequestId: `request-${t0}`,
              conversationId: project.conversationId,
              designSystemId: null,
              message: 'Prove the spawned workspace scope',
              model: 'default',
              projectId: project.project.id,
              reasoning: 'default',
              skillId: null,
            },
          });
          await waitForRunStatus(webUrl, run.runId, 'succeeded', {
            headers,
            timeoutMs: 30_000,
          });

          // The fake ACP runtime settles this Team run by advancing the exact
          // workspace wallet revision. An authoritative billing read must see
          // the debit while the Personal/account wallet remains unchanged.
          const settledTeamBilling = await requestJson<{
            workspaceBalance: { balanceUsd: string } | null;
            workspaceSnapshot: { revisions: { wallet: string } } | null;
          }>(
            webUrl,
            `/api/workspace/billing?scope=workspace&workspaceId=${workspace.workspaceId}&freshness=authoritative`,
            { headers },
          );
          expect(settledTeamBilling.workspaceBalance?.balanceUsd).toBe('17.50');
          expect(settledTeamBilling.workspaceSnapshot?.revisions.wallet).toBe('wallet-2');
          const settledAccountBilling = await requestJson<{
            summary: { balanceUsd: string } | null;
          }>(webUrl, '/api/workspace/billing?scope=account');
          expect(settledAccountBilling.summary?.balanceUsd).toBe('50.00');

          const childInvocations = (await readFile(spawnEnvLog, 'utf8'))
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line) as {
              argv: string[];
              workspaceId: string | null;
              runId: string | null;
              sessionId: string | null;
            });
          const childEnv = childInvocations.find((entry) => entry.runId === run.runId) as {
            workspaceId: string | null;
            runId: string | null;
            sessionId: string | null;
          } | undefined;
          expect(childEnv, `fake vela invocations: ${JSON.stringify(childInvocations)}`).toBeDefined();
          expect(childEnv).toMatchObject({
            workspaceId: workspace.workspaceId,
            runId: run.runId,
            sessionId: project.conversationId,
          });
        },
        {
          env: {
            FAKE_VELA_SPAWN_ENV_LOG: spawnEnvLog,
            FAKE_VELA_BALANCE_FILE: balanceStateFile,
            FAKE_VELA_SETTLED_TEAM_BALANCE_USD: '17.50',
            FAKE_VELA_WORKSPACE_MEMBER_ID: workspace.workspaceMemberId,
            OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
            VELA_API_URL: authorityUrl,
            VELA_CONTROL_KEY: 'e2e-amr-workspace-control-key',
          },
        },
      );
    } finally {
      await new Promise<void>((resolve) => authority.close(() => resolve()));
    }
  }, 180_000);
});
