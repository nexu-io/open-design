// Plan §3.F4 / spec §8 e2e-3 anchor.
//
// Verifies the headless `od plugin install → project create → run start`
// loop end-to-end at the HTTP layer (the same paths the CLI subcommands
// from §3.F1 / §3.F2 hit). Without an actual agent backend we can't
// assert "first ND-JSON event has kind='pipeline_stage_started'" — that
// requires the run-time pipeline runner being wired into the live agent
// loop. What we can lock today:
//
//   1. POST /api/plugins/install (local fixture) succeeds.
//   2. POST /api/projects { pluginId, pluginInputs } → 200 +
//      appliedPluginSnapshotId pinned to the new project.
//   3. POST /api/runs { projectId, pluginId, pluginInputs } → 202 +
//      runId.
//   4. GET /api/runs/:id surfaces appliedPluginSnapshotId on the run
//      status body so a code agent that polled status (rather than
//      streaming events) can still reach the snapshot id.
//   5. POST /api/applied-plugins/:id is fetchable and returns the same
//      snapshot a replay would re-launch against.
//
// Once the pipeline runner is wired into startChatRun (deferred to the
// Phase 1 follow-up that lands a fully-driven agent loop), this test
// gets extended to assert the first SSE event is `pipeline_stage_started`.

import type http from 'node:http';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseOpenDesignAgentTurnV1 } from '@open-design/contracts';
import path from 'node:path';
import url from 'node:url';
import { promisify } from 'node:util';
import { startServer } from '../src/server.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'plugin-fixtures', 'sample-plugin');
const CLI_SRC = path.join(__dirname, '../src/cli.ts');
const TSX_CLI = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const execFileP = promisify(execFile);

let server: http.Server;
let baseUrl: string;
let shutdown: (() => Promise<void> | void) | undefined;

beforeAll(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as {
    url: string;
    server: http.Server;
    shutdown?: () => Promise<void> | void;
  };
  baseUrl = started.url;
  server = started.server;
  shutdown = started.shutdown;
});

afterAll(async () => {
  await Promise.resolve(shutdown?.());
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function withFakeAgent<T>(
  binName: string,
  script: string,
  run: () => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'od-headless-agent-bin-'));
  const oldPath = process.env.PATH;
  try {
    if (process.platform === 'win32') {
      const runner = path.join(dir, `${binName}-runner.cjs`);
      await writeFile(runner, script);
      await writeFile(
        path.join(dir, `${binName}.cmd`),
        `@echo off\r\nnode "${runner}" %*\r\n`,
      );
    } else {
      const bin = path.join(dir, binName);
      await writeFile(bin, `#!/usr/bin/env node\n${script}`);
      await chmod(bin, 0o755);
    }
    process.env.PATH = `${dir}${path.delimiter}${oldPath ?? ''}`;
    return await run();
  } finally {
    if (oldPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = oldPath;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

async function withHeadlessOpencode<T>(run: () => Promise<T>): Promise<T> {
  return await withFakeAgent(
    'opencode',
    `
process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({ type: 'text', part: { text: 'headless-ok' } }));
});
`,
    run,
  );
}

async function runCli(
  args: string[],
  options: { timeout?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OD_DAEMON_URL: baseUrl,
  };
  delete env.NODE_OPTIONS;
  return await execFileP(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
    cwd: path.join(__dirname, '..'),
    env,
    timeout: options.timeout ?? 20_000,
    maxBuffer: 10 * 1024 * 1024,
  }) as { stdout: string; stderr: string };
}

async function runCliResult(
  args: string[],
  options: { timeout?: number } = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  try {
    const { stdout, stderr } = await runCli(args, options);
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const failed = err as { stdout?: string; stderr?: string; code?: number | null };
    return {
      stdout: failed.stdout ?? '',
      stderr: failed.stderr ?? '',
      code: failed.code ?? 1,
    };
  }
}

async function waitForRunTerminal(runId: string): Promise<{ status: string }> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/runs/${encodeURIComponent(runId)}`);
    expect(response.status).toBe(200);
    const run = await response.json() as { status: string };
    if (run.status === 'failed' || run.status === 'succeeded' || run.status === 'canceled') {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`run ${runId} did not finish`);
}

async function readSseUntilSuccess(resp: Response) {
  if (!resp.body) throw new Error('install: no body');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const eventLine = block.split('\n').find((l) => l.startsWith('event: '));
      const dataLine  = block.split('\n').find((l) => l.startsWith('data: '));
      const event = eventLine ? eventLine.slice('event: '.length) : '';
      const data  = dataLine  ? JSON.parse(dataLine.slice('data: '.length)) : null;
      if (event === 'success') return data;
      if (event === 'error') throw new Error(data?.message ?? 'install failed');
    }
  }
  throw new Error('install stream ended without success');
}

describe('Plan §8 e2e-3 (entry slice) — headless install → project → run', () => {
  it('duplicates a bundled HTML example into a project without starting a run', async () => {
    const listResp = await fetch(`${baseUrl}/api/plugins`);
    expect(listResp.status).toBe(200);
    const listBody = (await listResp.json()) as {
      plugins?: Array<{
        id: string;
        title?: string;
        manifest?: { name?: string; od?: { preview?: { entry?: string } } };
      }>;
    };
    const plugin = (listBody.plugins ?? []).find((record) =>
      record.id === 'example-mobile-app' ||
      record.manifest?.name === 'example-mobile-app' ||
      record.title === 'Mobile App',
    );
    expect(plugin).toBeTruthy();

    const duplicateResp = await fetch(
      `${baseUrl}/api/plugins/${encodeURIComponent(plugin!.id)}/duplicate-project`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Duplicated mobile app' }),
      },
    );
    expect(duplicateResp.status).toBe(201);
    const duplicateBody = (await duplicateResp.json()) as {
      ok: true;
      projectId: string;
      conversationId: string;
      relPath: string;
      sourcePluginId: string;
      sourceEntry: string;
      copiedFiles: number;
      project: {
        id: string;
        name: string;
        pendingPrompt?: string | null;
        metadata?: {
          kind?: string;
          duplicatedFromPluginId?: string;
          duplicatedFromPluginEntry?: string;
          entryFile?: string;
        };
      };
    };
    expect(duplicateBody.ok).toBe(true);
    expect(duplicateBody.projectId).toBeTruthy();
    expect(duplicateBody.conversationId).toBeTruthy();
    expect(duplicateBody.relPath).toBe('index.html');
    expect(duplicateBody.sourcePluginId).toBe(plugin!.id);
    expect(duplicateBody.sourceEntry).toMatch(/example\.html$/);
    expect(duplicateBody.copiedFiles).toBeGreaterThan(0);
    expect(duplicateBody.project.name).toBe('Duplicated mobile app');
    expect(duplicateBody.project.pendingPrompt ?? null).toBeNull();
    expect(duplicateBody.project.metadata).toMatchObject({
      kind: 'prototype',
      duplicatedFromPluginId: plugin!.id,
      duplicatedFromPluginEntry: duplicateBody.sourceEntry,
      entryFile: 'index.html',
    });

    const filesResp = await fetch(
      `${baseUrl}/api/projects/${encodeURIComponent(duplicateBody.projectId)}/files`,
    );
    expect(filesResp.status).toBe(200);
    const filesBody = (await filesResp.json()) as { files: Array<{ name: string }> };
    const fileNames = filesBody.files.map((file) => file.name).sort();
    expect(fileNames).toContain('index.html');
    expect(fileNames).toContain('assets/template.html');

    const runsResp = await fetch(
      `${baseUrl}/api/runs?projectId=${encodeURIComponent(duplicateBody.projectId)}`,
    );
    expect(runsResp.status).toBe(200);
    const runsBody = (await runsResp.json()) as { runs?: unknown[] };
    expect(runsBody.runs ?? []).toHaveLength(0);

    await fetch(`${baseUrl}/api/projects/${encodeURIComponent(duplicateBody.projectId)}`, {
      method: 'DELETE',
    }).catch(() => {});
  });

  it('rejects bundled examples that reference local files outside the duplicated directory', async () => {
    const listResp = await fetch(`${baseUrl}/api/plugins`);
    expect(listResp.status).toBe(200);
    const listBody = (await listResp.json()) as {
      plugins?: Array<{
        id: string;
        manifest?: { name?: string };
      }>;
    };
    const plugin = (listBody.plugins ?? []).find((record) =>
      record.id === 'example-open-design-landing-deck' ||
      record.manifest?.name === 'example-open-design-landing-deck',
    );
    expect(plugin).toBeTruthy();

    const duplicateResp = await fetch(
      `${baseUrl}/api/plugins/${encodeURIComponent(plugin!.id)}/duplicate-project`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Broken duplicate should fail' }),
      },
    );

    expect(duplicateResp.status).toBe(422);
    const body = (await duplicateResp.json()) as {
      error?: { code?: string; message?: string };
    };
    expect(body.error).toMatchObject({
      code: 'UNSUPPORTED_DUPLICATE_DEPENDENCIES',
    });
    expect(body.error?.message).toContain('../open-design-landing/assets/hero.png');
  });

  it('surfaces duplicate daemon errors through CLI structured stderr', async () => {
    const result = await runCliResult([
      'plugin',
      'duplicate',
      'example-open-design-landing-deck',
      '--json',
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    const body = JSON.parse(result.stderr.trim()) as {
      error?: { code?: string; message?: string };
    };
    expect(body.error?.code).toBe('UNSUPPORTED_DUPLICATE_DEPENDENCIES');
    expect(body.error?.message).toContain('../open-design-landing/assets/hero.png');
  });

  it('walks install → project create → run start → status with snapshot pinned', async () => {
    // 1. Install a local fixture plugin via the SSE install endpoint.
    const installResp = await fetch(`${baseUrl}/api/plugins/install`, {
      method:  'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body:    JSON.stringify({ source: FIXTURE_DIR }),
    });
    expect(installResp.status).toBe(200);
    const installSuccess = await readSseUntilSuccess(installResp);
    expect(installSuccess?.plugin?.id).toBe('sample-plugin');

    // 2. Create a project bound to the plugin.
    const projectId = `headless-${Date.now()}`;
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({
        id:           projectId,
        name:         'Headless e2e-3',
        pluginId:     'sample-plugin',
        pluginInputs: { topic: 'agentic design' },
      }),
    });
    expect(createResp.status).toBe(200);
    const createBody = (await createResp.json()) as {
      project: { id: string };
      conversationId: string;
      appliedPluginSnapshotId?: string;
    };
    expect(createBody.project.id).toBe(projectId);
    expect(createBody.appliedPluginSnapshotId).toBeTruthy();

    await withHeadlessOpencode(async () => {
      // 3. Start a non-AMR run that re-uses the same applied snapshot id.
      // This plugin contract test intentionally has no Workspace headers.
      const runResp = await fetch(`${baseUrl}/api/runs`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({
          projectId,
          agentId:                  'opencode',
          pluginId:                 'sample-plugin',
          appliedPluginSnapshotId:  createBody.appliedPluginSnapshotId,
          pluginInputs:             { topic: 'agentic design' },
        }),
      });
      expect(runResp.status).toBe(202);
      const runBody = (await runResp.json()) as {
        runId: string;
        pluginId?: string;
        appliedPluginSnapshotId?: string;
      };
      expect(runBody.runId).toBeTruthy();
      expect(runBody.pluginId).toBe('sample-plugin');
      expect(runBody.appliedPluginSnapshotId).toBe(createBody.appliedPluginSnapshotId);

      // 4. The headerless run status surfaces the snapshot id so a polling
      // client can reach replay without parsing the SSE stream.
      const statusResp = await fetch(`${baseUrl}/api/runs/${encodeURIComponent(runBody.runId)}`);
      expect(statusResp.status).toBe(200);
      const statusBody = (await statusResp.json()) as {
        id: string;
        projectId: string;
        pluginId: string | null;
        appliedPluginSnapshotId: string | null;
      };
      expect(statusBody.pluginId).toBe('sample-plugin');
      expect(statusBody.appliedPluginSnapshotId).toBe(createBody.appliedPluginSnapshotId);

      // 5. Replay reads the same snapshot row.
      const snapResp = await fetch(`${baseUrl}/api/applied-plugins/${encodeURIComponent(createBody.appliedPluginSnapshotId!)}`);
      expect(snapResp.status).toBe(200);
      const snap = (await snapResp.json()) as {
        snapshotId: string;
        pluginId: string;
        query?: string;
        inputs?: Record<string, string | number | boolean>;
      };
      expect(snap.snapshotId).toBe(createBody.appliedPluginSnapshotId);
      expect(snap.pluginId).toBe('sample-plugin');
      expect(snap.query).toBe('Generate a {{topic}} brief for {{audience}}.');
      expect(snap.inputs).toEqual({ audience: 'general', topic: 'agentic design' });

      // Cancel the run before restoring PATH so a deferred start cannot resolve
      // the user's real OpenCode binary after the controlled fake disappears.
      await fetch(`${baseUrl}/api/runs/${encodeURIComponent(runBody.runId)}/cancel`, { method: 'POST' });
    });
  });

  it('creates share projects for publishing and contributing a user plugin', async () => {
    const installResp = await fetch(`${baseUrl}/api/plugins/install`, {
      method:  'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body:    JSON.stringify({ source: FIXTURE_DIR }),
    });
    expect(installResp.status).toBe(200);
    const installSuccess = await readSseUntilSuccess(installResp);
    expect(installSuccess?.plugin?.id).toBe('sample-plugin');

    const shareResp = await fetch(`${baseUrl}/api/plugins/sample-plugin/share-project`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ action: 'publish-github', locale: 'en' }),
    });
    expect(shareResp.status).toBe(200);
    const shareBody = (await shareResp.json()) as {
      ok: boolean;
      project: { id: string; pendingPrompt?: string };
      conversationId: string;
      appliedPluginSnapshotId?: string;
      actionPluginId: string;
      sourcePluginId: string;
      stagedPath: string;
      prompt: string;
    };
    expect(shareBody.ok).toBe(true);
    expect(shareBody.actionPluginId).toBe('od-plugin-publish-github');
    expect(shareBody.sourcePluginId).toBe('sample-plugin');
    expect(shareBody.appliedPluginSnapshotId).toBeTruthy();
    expect(shareBody.stagedPath).toBe('plugin-source/sample-plugin');
    expect(shareBody.prompt).toContain('Publish the local OpenDesign plugin');
    expect(shareBody.prompt).toContain('/api/projects/$OD_PROJECT_ID/plugins/publish-github');
    expect(shareBody.prompt).toContain('plugin-source/sample-plugin');
    expect(shareBody.project.pendingPrompt).toBe(shareBody.prompt);

    const filesResp = await fetch(
      `${baseUrl}/api/projects/${encodeURIComponent(shareBody.project.id)}/files`,
    );
    expect(filesResp.status).toBe(200);
    const filesBody = (await filesResp.json()) as { files: Array<{ name: string }> };
    const fileNames = filesBody.files.map((file) => file.name).sort();
    expect(fileNames).toContain('plugin-source/sample-plugin/open-design.json');
    expect(fileNames).toContain('plugin-source/sample-plugin/SKILL.md');

    const snapshotResp = await fetch(
      `${baseUrl}/api/applied-plugins/${encodeURIComponent(shareBody.appliedPluginSnapshotId!)}`,
    );
    expect(snapshotResp.status).toBe(200);
    const snapshot = (await snapshotResp.json()) as {
      pluginId: string;
      inputs?: Record<string, string | number | boolean>;
    };
    expect(snapshot.pluginId).toBe('od-plugin-publish-github');
    expect(snapshot.inputs).toMatchObject({
      source_plugin_id: 'sample-plugin',
      plugin_context_path: 'plugin-source/sample-plugin',
    });

    const contributeResp = await fetch(`${baseUrl}/api/plugins/sample-plugin/share-project`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ action: 'contribute-open-design', locale: 'en' }),
    });
    expect(contributeResp.status).toBe(200);
    const contributeBody = (await contributeResp.json()) as {
      ok: boolean;
      project: { id: string };
      appliedPluginSnapshotId?: string;
      actionPluginId: string;
      sourcePluginId: string;
      stagedPath: string;
      prompt: string;
    };
    expect(contributeBody.ok).toBe(true);
    expect(contributeBody.actionPluginId).toBe('od-plugin-contribute-open-design');
    expect(contributeBody.sourcePluginId).toBe('sample-plugin');
    expect(contributeBody.appliedPluginSnapshotId).toBeTruthy();
    expect(contributeBody.stagedPath).toBe('plugin-source/sample-plugin');
    expect(contributeBody.prompt).toContain('/api/projects/$OD_PROJECT_ID/plugins/contribute-open-design');

    const locator = process.platform === 'win32' ? 'where' : 'which';
    const realGit = ((await execFileP(locator, ['git'])).stdout as string)
      .split(/\r?\n/)
      .find(Boolean)
      ?.trim();
    expect(realGit).toBeTruthy();
    const previousRealGit = process.env.OD_REAL_GIT;
    const previousGitAuthorName = process.env.GIT_AUTHOR_NAME;
    const previousGitAuthorEmail = process.env.GIT_AUTHOR_EMAIL;
    const previousGitCommitterName = process.env.GIT_COMMITTER_NAME;
    const previousGitCommitterEmail = process.env.GIT_COMMITTER_EMAIL;
    process.env.OD_REAL_GIT = realGit;
    process.env.GIT_AUTHOR_NAME = 'OpenDesign Test';
    process.env.GIT_AUTHOR_EMAIL = 'open-design-test@example.com';
    process.env.GIT_COMMITTER_NAME = 'OpenDesign Test';
    process.env.GIT_COMMITTER_EMAIL = 'open-design-test@example.com';
    try {
      await withFakeAgent(
        'gh',
        `
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
function ok(text) {
  if (text) process.stdout.write(text + '\\n');
  process.exit(0);
}
if (args[0] === '--version') ok('gh version 2.0.0');
if (args[0] === 'auth' && args[1] === 'status') ok('Logged in to github.com account test-user');
if (args[0] === 'api' && args[1] === 'user') ok('test-user');
if (args[0] === 'repo' && args[1] === 'create') ok('https://github.com/test-user/' + args[2]);
if (args[0] === 'repo' && args[1] === 'view') {
  const repo = args[2] || '';
  if (!args.includes('--json') && (repo === 'test-user/sample-plugin' || repo.endsWith('/sample-plugin'))) {
    console.error('GraphQL: Could not resolve to a Repository with the name "' + repo + '".');
    process.exit(1);
  }
  if (args.includes('--json')) {
    const fullName = repo || 'test-user/sample-plugin';
    ok(JSON.stringify({ nameWithOwner: fullName, url: 'https://github.com/' + fullName }));
  }
  ok('https://github.com/test-user/' + path.basename(process.cwd()));
}
if (args[0] === 'repo' && args[1] === 'fork') ok('forked nexu-io/open-design');
if (args[0] === 'repo' && args[1] === 'clone') {
  const dest = args[3] || path.basename(args[2]);
  fs.mkdirSync(dest, { recursive: true });
  const init = spawnSync(process.env.OD_REAL_GIT, ['init'], { cwd: dest, stdio: 'inherit' });
  process.exit(init.status ?? 0);
}
if (args[0] === 'pr' && args[1] === 'create') ok('https://github.com/nexu-io/open-design/pull/123');
console.error('unexpected gh command: ' + args.join(' '));
process.exit(1);
`,
        async () => {
          await withFakeAgent(
            'git',
            `
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
if (args[0] === 'push') {
  console.log('pushed');
  process.exit(0);
}
if (args[0] === 'sparse-checkout') {
  process.exit(0);
}
if (args[0] === 'checkout' && args[1] === '-b' && args[2]) {
  const branch = spawnSync(
    process.env.OD_REAL_GIT,
    ['symbolic-ref', 'HEAD', 'refs/heads/' + args[2]],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  if (branch.stderr) process.stderr.write(branch.stderr);
  process.exit(branch.status ?? 0);
}
if (args[0] === 'clone') {
  const dest = args[args.length - 1];
  fs.mkdirSync(dest, { recursive: true });
  const init = spawnSync(process.env.OD_REAL_GIT, ['init'], { cwd: dest, encoding: 'utf8' });
  if (init.status !== 0) {
    if (init.stderr) process.stderr.write(init.stderr);
    process.exit(init.status ?? 1);
  }
  const branch = spawnSync(
    process.env.OD_REAL_GIT,
    ['symbolic-ref', 'HEAD', 'refs/heads/main'],
    { cwd: dest, encoding: 'utf8' },
  );
  if (branch.status !== 0) {
    if (branch.stderr) process.stderr.write(branch.stderr);
    process.exit(branch.status ?? 1);
  }
  const remote = args.find((arg) => String(arg).startsWith('https://')) || 'https://github.com/test-user/open-design.git';
  const remoteAdd = spawnSync(process.env.OD_REAL_GIT, ['remote', 'add', 'origin', remote], { cwd: dest, encoding: 'utf8' });
  if (remoteAdd.status !== 0) {
    if (remoteAdd.stderr) process.stderr.write(remoteAdd.stderr);
    process.exit(remoteAdd.status ?? 1);
  }
  process.exit(0);
}
const result = spawnSync(process.env.OD_REAL_GIT, args, {
  cwd: process.cwd(),
  env: process.env,
  encoding: 'utf8',
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 0);
`,
            async () => {
              const publishEndpointResp = await fetch(
                `${baseUrl}/api/projects/${encodeURIComponent(shareBody.project.id)}/plugins/publish-github`,
                {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ path: shareBody.stagedPath }),
                },
              );
              expect(publishEndpointResp.status).toBe(200);
              const publishEndpointBody = (await publishEndpointResp.json()) as {
                ok: boolean;
                url?: string;
              };
              expect(publishEndpointBody.ok).toBe(true);
              expect(publishEndpointBody.url).toBe('https://github.com/test-user/sample-plugin');

              const contributeEndpointResp = await fetch(
                `${baseUrl}/api/projects/${encodeURIComponent(contributeBody.project.id)}/plugins/contribute-open-design`,
                {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ path: contributeBody.stagedPath }),
                },
              );
              const contributeEndpointBody = (await contributeEndpointResp.json()) as {
                ok: boolean;
                url?: string;
                message?: string;
                log?: string[];
              };
              expect(
                contributeEndpointResp.status,
                JSON.stringify(contributeEndpointBody),
              ).toBe(200);
              expect(contributeEndpointBody.ok).toBe(true);
              expect(contributeEndpointBody.url).toBe('https://github.com/nexu-io/open-design/pull/123');
            },
          );
        },
      );
    } finally {
      if (previousRealGit === undefined) {
        delete process.env.OD_REAL_GIT;
      } else {
        process.env.OD_REAL_GIT = previousRealGit;
      }
      if (previousGitAuthorName === undefined) {
        delete process.env.GIT_AUTHOR_NAME;
      } else {
        process.env.GIT_AUTHOR_NAME = previousGitAuthorName;
      }
      if (previousGitAuthorEmail === undefined) {
        delete process.env.GIT_AUTHOR_EMAIL;
      } else {
        process.env.GIT_AUTHOR_EMAIL = previousGitAuthorEmail;
      }
      if (previousGitCommitterName === undefined) {
        delete process.env.GIT_COMMITTER_NAME;
      } else {
        process.env.GIT_COMMITTER_NAME = previousGitCommitterName;
      }
      if (previousGitCommitterEmail === undefined) {
        delete process.env.GIT_COMMITTER_EMAIL;
      } else {
        process.env.GIT_COMMITTER_EMAIL = previousGitCommitterEmail;
      }
    }
  }, 120_000);

  it('runs the CLI install → project create → plugin run path with query and local SKILL.md in the agent prompt', async () => {
    const pluginRoot = await mkdtemp(path.join(tmpdir(), 'od-headless-cli-plugin-'));
    const pluginId = `headless-cli-plugin-${randomUUID().slice(0, 8)}`;
    const fixture = path.join(pluginRoot, pluginId);
    await mkdir(fixture, { recursive: true });
    await writeFile(
      path.join(fixture, 'open-design.json'),
      JSON.stringify({
        $schema: 'https://open-design.ai/schemas/plugin.v1.json',
        name: pluginId,
        title: 'Headless CLI Plugin',
        version: '1.0.0',
        description: 'Fixture that binds a local SKILL.md for headless CLI tests.',
        license: 'MIT',
        od: {
          kind: 'skill',
          taskKind: 'new-generation',
          useCase: { query: 'Generate a {{topic}} brief for {{audience}}.' },
          context: {
            skills: [{ path: './SKILL.md' }],
            atoms: ['todo-write', 'discovery-question-form'],
          },
          inputs: [
            { name: 'topic', type: 'string', required: true, label: 'Topic' },
            { name: 'audience', type: 'string', default: 'general', label: 'Audience' },
          ],
          capabilities: ['prompt:inject'],
        },
      }, null, 2),
    );
    await writeFile(
      path.join(fixture, 'SKILL.md'),
      [
        '---',
        `name: ${pluginId}`,
        'description: Local skill loaded by the headless CLI e2e test.',
        '---',
        '# Headless Local Skill',
        '',
        'Follow this local skill during headless runs.',
      ].join('\n'),
    );

    try {
      const install = await runCli(['plugin', 'install', fixture]);
      expect(install.stdout).toContain('[install] ok');

      const topic = `headless cli ${randomUUID().slice(0, 8)}`;
      const created = await runCli([
        'project',
        'create',
        '--name',
        'CLI headless plugin run',
        '--plugin',
        pluginId,
        '--inputs',
        JSON.stringify({ topic }),
        '--json',
      ]);
      const createBody = JSON.parse(created.stdout) as {
        project: { id: string };
        appliedPluginSnapshotId?: string;
      };
      expect(createBody.appliedPluginSnapshotId).toBeTruthy();

      const captureRoot = await mkdtemp(path.join(tmpdir(), 'od-headless-cli-capture-'));
      const capturePath = path.join(captureRoot, 'prompt.txt');
      const previousCapture = process.env.OD_PROMPT_CAPTURE;
      process.env.OD_PROMPT_CAPTURE = capturePath;
      try {
        await withFakeAgent(
          'opencode',
          `
const fs = require('node:fs');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const capturePath = process.env.OD_PROMPT_CAPTURE;
  fs.appendFileSync(capturePath + '.all', '--- prompt ---\\n' + input + '\\n');
  if (input.includes('# Headless Local Skill') || input.includes('## Active plugin')) {
    fs.writeFileSync(capturePath, input);
  }
  console.log(JSON.stringify({ type: 'text', part: { text: 'headless-ok' } }));
});
`,
          async () => {
            const run = await runCli([
              'plugin',
              'run',
              pluginId,
              '--project',
              createBody.project.id,
              '--inputs',
              JSON.stringify({ topic }),
              '--agent',
              'opencode',
              '--follow',
            ], { timeout: 60_000 });
            expect(run.stdout).toContain('[run] started run');
            expect(run.stdout).toContain('"event":"agent"');
            expect(run.stdout).toContain('headless-ok');
            expect(run.stdout).toContain('"event":"end"');
            expect(run.stdout).toContain('"status":"succeeded"');
          },
        );

        const prompt = await readFile(capturePath, 'utf8');
        expect(prompt).toContain('# Headless Local Skill');
        expect(prompt).toContain('Follow this local skill during headless runs.');
        expect(prompt).toContain('## Active plugin');
        expect(prompt).toContain('The plugin\'s example brief is: _Generate a {{topic}} brief for {{audience}}._');
        expect(prompt).toContain(`- **topic**: ${topic}`);
        expect(prompt).toContain('- **audience**: general');
        expect(parseOpenDesignAgentTurnV1(prompt)).toMatchObject({
          userFirstPrompt: `Generate a ${topic} brief for general.`,
        });
      } finally {
        if (previousCapture === undefined) {
          delete process.env.OD_PROMPT_CAPTURE;
        } else {
          process.env.OD_PROMPT_CAPTURE = previousCapture;
        }
        await rm(captureRoot, { recursive: true, force: true });
      }
    } finally {
      await rm(pluginRoot, { recursive: true, force: true });
    }
  }, 60_000);

  it('lets a typeless Design turn discover and load Prototype within the same Agent process', async () => {
    const projectId = `headless-skill-discovery-${randomUUID().slice(0, 8)}`;
    const query = '帮我做一个官网';
    const previousDiscoveryMode = process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY;
    process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY = 'active';
    try {
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Agent-native Skill discovery',
        conversationMode: 'design',
        metadata: { kind: 'prototype' },
        skillDiscovery: { mode: 'agent', catalog: 'open-design-official' },
      }),
    });
    const createBody = await createResp.json() as {
      conversationId: string;
      project: {
        id: string;
        appliedPluginSnapshotId?: string | null;
        metadata?: {
          skillDiscoveryBinding?: { provenance?: string; catalog?: string };
        };
      };
    };
    expect(createResp.status, JSON.stringify(createBody)).toBe(200);
    expect(createBody.project.appliedPluginSnapshotId ?? null).toBeNull();
    expect(createBody.project.metadata?.skillDiscoveryBinding).toMatchObject({
      provenance: 'no_explicit_task_type',
      catalog: 'open-design-official',
    });

    const captureRoot = await mkdtemp(path.join(tmpdir(), 'od-skill-discovery-e2e-'));
    const promptPath = path.join(captureRoot, 'prompt.xml');
    const evidencePath = path.join(captureRoot, 'evidence.json');
    const previousPromptCapture = process.env.OD_PROMPT_CAPTURE;
    const previousDiscoveryEvidence = process.env.OD_DISCOVERY_EVIDENCE;
    process.env.OD_PROMPT_CAPTURE = promptPath;
    process.env.OD_DISCOVERY_EVIDENCE = evidencePath;
    try {
      await withFakeAgent(
        'opencode',
        `
const fs = require('node:fs');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  fs.writeFileSync(process.env.OD_PROMPT_CAPTURE, input);
  void (async () => {
    const headers = {
      authorization: 'Bearer ' + process.env.OD_TOOL_TOKEN,
      'content-type': 'application/json',
    };
    const blockedMediaResponse = await fetch(
      process.env.OD_DAEMON_URL + '/api/projects/' + encodeURIComponent(process.env.OD_PROJECT_ID) + '/media/generate',
      { method: 'POST', headers, body: JSON.stringify({}) },
    );
    const blockedMedia = await blockedMediaResponse.json();
    if (blockedMediaResponse.status !== 409 || blockedMedia.error?.code !== 'TOOL_OPERATION_DENIED') {
      throw new Error('pre-resolution media was not gated: ' + JSON.stringify(blockedMedia));
    }
    const catalogRevision = input.match(/- Catalog revision: \`(sha256:[a-f0-9]{64})\`/)?.[1];
    const candidateLine = input.split('\\n').find(
      (line) => line.trimStart().startsWith('{"id":"prototype"'),
    );
    if (!catalogRevision || !candidateLine) {
      throw new Error('prompt did not expose the pinned Prototype metadata');
    }
    const candidate = JSON.parse(candidateLine.trim());
    const prepareResponse = await fetch(process.env.OD_DAEMON_URL + '/api/tools/skills/load', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: candidate.id,
        revision: catalogRevision,
        candidateDigest: candidate.candidateDigest,
        role: 'primary',
        purpose: 'Create the requested official website prototype.',
      }),
    });
    const prepared = await prepareResponse.json();
    if (!prepareResponse.ok) throw new Error('prepare failed: ' + JSON.stringify(prepared));
    const path = require('node:path');
    const materializedRoot = prepared.resources.length > 0
      ? '.od-skills/' + prepared.alias
      : null;
    for (const resource of prepared.resources) {
      const destination = path.join(process.cwd(), materializedRoot, resource.relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, Buffer.from(resource.bytesBase64, 'base64'));
    }
    const commitResponse = await fetch(
      process.env.OD_DAEMON_URL + '/api/tools/skills/load/commit',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          pendingToken: prepared.pendingToken,
          expectedStateRevision: prepared.expectedStateRevision,
          materialization: {
            materializedRoot,
            resources: prepared.resources
              .map(({ relativePath, digest, size }) => ({ relativePath, digest, size }))
              .sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en')),
          },
        }),
      },
    );
    const load = await commitResponse.json();
    if (!commitResponse.ok) throw new Error('commit failed: ' + JSON.stringify(load));
    const committedRoot = load.loaded.materialization?.materializedRoot;
    fs.writeFileSync(process.env.OD_DISCOVERY_EVIDENCE, JSON.stringify({
      candidateId: candidate.id,
      status: load.state.status,
      loadedProfileContainsPrototype: load.loaded.profileMarkdown.includes('Prototype execution profile v1'),
      ordinaryOrchestrationIsStrategyNeutral:
        load.loaded.generalOrchestration?.markdown.startsWith('# Open Design ordinary Agent-turn orchestration v1')
        && load.loaded.profileMarkdown.includes('does not activate OD Next v2'),
      loadedRole: load.loaded.resolvedRole,
      strategyBindingAbsent: !Object.prototype.hasOwnProperty.call(load.loaded, 'strategyBinding'),
      resourceBytesAbsent: load.loaded.materialization.resources.every(
        (resource) => !Object.prototype.hasOwnProperty.call(resource, 'content')
          && !Object.prototype.hasOwnProperty.call(resource, 'bytes'),
      ),
      materializedFrameExists: typeof committedRoot === 'string'
        && fs.existsSync(path.join(process.cwd(), committedRoot, 'device-frames', 'iphone.html')),
      preResolutionMediaBlocked: true,
      loadedDirectlyFromCatalog: true,
    }));
    console.log(JSON.stringify({
      type: 'text',
      part: { text: 'discovery-loaded:' + candidate.id },
    }));
  })().catch((error) => {
    console.error(String(error && error.stack || error));
    process.exitCode = 1;
  });
});
`,
        async () => {
          const run = await runCli([
            'run',
            'start',
            '--project',
            projectId,
            '--conversation',
            createBody.conversationId,
            '--message',
            query,
            '--agent',
            'opencode',
            '--follow',
          ], { timeout: 60_000 });
          expect(run.stdout).toContain('discovery-loaded:prototype');
          expect(run.stdout).toContain('"status":"succeeded"');
        },
      );

      const prompt = await readFile(promptPath, 'utf8');
      const parsedPrompt = parseOpenDesignAgentTurnV1(prompt);
      expect(parsedPrompt.userFirstPrompt).toBe(query);
      expect(parsedPrompt.discoveryBootstrapMarkdown).toContain('# Agent-native Skill Discovery');
      expect(parsedPrompt.discoveryBootstrapMarkdown).toContain('# Official Skill metadata catalog');
      expect(parsedPrompt.discoveryBootstrapMarkdown).toContain('"id":"prototype"');
      expect(parsedPrompt.discoveryBootstrapMarkdown).not.toContain('tools skills search');
      expect(prompt).not.toContain('open-design.od-next-prompt/v2');

      const evidence = JSON.parse(await readFile(evidencePath, 'utf8')) as {
        candidateId: string;
        status: string;
        loadedProfileContainsPrototype: boolean;
        ordinaryOrchestrationIsStrategyNeutral: boolean;
        loadedRole: string;
        strategyBindingAbsent: boolean;
        resourceBytesAbsent: boolean;
        materializedFrameExists: boolean;
        preResolutionMediaBlocked: boolean;
        loadedDirectlyFromCatalog: boolean;
      };
      expect(evidence).toEqual({
        candidateId: 'prototype',
        status: 'resolved_skill',
        loadedProfileContainsPrototype: true,
        ordinaryOrchestrationIsStrategyNeutral: true,
        loadedRole: 'primary',
        strategyBindingAbsent: true,
        resourceBytesAbsent: true,
        materializedFrameExists: true,
        preResolutionMediaBlocked: true,
        loadedDirectlyFromCatalog: true,
      });
    } finally {
      if (previousPromptCapture === undefined) delete process.env.OD_PROMPT_CAPTURE;
      else process.env.OD_PROMPT_CAPTURE = previousPromptCapture;
      if (previousDiscoveryEvidence === undefined) delete process.env.OD_DISCOVERY_EVIDENCE;
      else process.env.OD_DISCOVERY_EVIDENCE = previousDiscoveryEvidence;
      await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'DELETE',
      }).catch(() => {});
      await rm(captureRoot, { recursive: true, force: true });
    }
    } finally {
      if (previousDiscoveryMode === undefined) {
        delete process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY;
      } else {
        process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY = previousDiscoveryMode;
      }
    }
  }, 60_000);

  it('fails an oversized argv discovery lifecycle before spawn while preserving safe telemetry', async () => {
    const projectId = `headless-skill-discovery-budget-${randomUUID().slice(0, 8)}`;
    const previousDiscoveryMode = process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY;
    process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY = 'active';
    try {
      const createResp = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'Agent-native Skill discovery argv budget',
          conversationMode: 'design',
          metadata: { kind: 'prototype' },
          skillDiscovery: { mode: 'agent', catalog: 'open-design-official' },
        }),
      });
      const created = await createResp.json() as { conversationId: string };
      expect(createResp.status, JSON.stringify(created)).toBe(200);

      const runResp = await fetch(`${baseUrl}/api/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          conversationId: created.conversationId,
          agentId: 'aider',
          message: '帮我做一个官网',
        }),
      });
      const started = await runResp.json() as { runId?: string; error?: unknown };
      expect(runResp.status, JSON.stringify(started)).toBe(202);
      expect((await waitForRunTerminal(started.runId!)).status).toBe('failed');

      const statusResp = await fetch(
        `${baseUrl}/api/runs/${encodeURIComponent(started.runId!)}`,
      );
      const status = await statusResp.json() as {
        errorCode?: string;
        error?: string;
        eventsLogPath?: string | null;
      };
      expect(statusResp.status, JSON.stringify(status)).toBe(200);
      expect(status.errorCode).toBe('AGENT_PROMPT_TOO_LARGE');
      expect(status.error).toContain('will not silently fall back to lexical search');
      expect(status.eventsLogPath).toBeTruthy();

      const durable = JSON.parse(await readFile(
        path.join(path.dirname(status.eventsLogPath!), 'state.json'),
        'utf8',
      )) as {
        promptTelemetry?: {
          rawBytes: number;
          sections: Array<{
            kind: string;
            rawBytes: number;
            redactedBytes: number;
            redactedContent?: string;
            metadata?: {
              lifecycleKind?: string;
              catalogRevision?: string;
              candidateCount?: number;
            };
          }>;
        };
      };
      expect(durable.promptTelemetry?.sections).toHaveLength(1);
      expect(durable.promptTelemetry?.sections[0]).toMatchObject({
        kind: 'skillDiscoveryLifecycle',
        rawBytes: expect.any(Number),
        metadata: {
          lifecycleKind: 'bootstrap',
          catalogRevision: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
          candidateCount: 166,
        },
      });
      expect(durable.promptTelemetry?.rawBytes).toBeGreaterThan(120_000);
      expect(durable.promptTelemetry?.sections[0]?.rawBytes).toBe(
        durable.promptTelemetry?.rawBytes,
      );
      expect(durable.promptTelemetry?.sections[0]?.redactedBytes).toBeLessThan(1_000);
      expect(durable.promptTelemetry?.sections[0]?.redactedContent).toBeUndefined();
    } finally {
      if (previousDiscoveryMode === undefined) {
        delete process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY;
      } else {
        process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY = previousDiscoveryMode;
      }
      await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
  }, 60_000);

  it('composes a typeless attachment-only first turn with the terminal empty-prompt marker', async () => {
    const projectId = `headless-attachment-only-${randomUUID().slice(0, 8)}`;
    const previousDiscoveryMode = process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY;
    process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY = 'active';
    const captureRoot = await mkdtemp(path.join(tmpdir(), 'od-attachment-only-prompt-'));
    const promptPath = path.join(captureRoot, 'prompt.xml');
    const previousPromptCapture = process.env.OD_PROMPT_CAPTURE;
    process.env.OD_PROMPT_CAPTURE = promptPath;
    try {
      const createResp = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'Attachment-only Skill discovery',
          conversationMode: 'design',
          metadata: { kind: 'prototype' },
          skillDiscovery: { mode: 'agent', catalog: 'open-design-official' },
        }),
      });
      const created = await createResp.json() as { conversationId: string };
      expect(createResp.status, JSON.stringify(created)).toBe(200);

      const fileResp = await fetch(
        `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/files`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'brief.txt', content: 'Build the attached brief.' }),
        },
      );
      expect(fileResp.status).toBe(200);

      await withFakeAgent(
        'opencode',
        `
const fs = require('node:fs');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  fs.writeFileSync(process.env.OD_PROMPT_CAPTURE, input);
  console.log(JSON.stringify({ type: 'text', part: { text: 'attachment-only-ok' } }));
});
`,
        async () => {
          const runResp = await fetch(`${baseUrl}/api/runs`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              projectId,
              conversationId: created.conversationId,
              agentId: 'opencode',
              message: '',
              currentPrompt: '',
              attachments: ['brief.txt'],
            }),
          });
          const runBody = await runResp.json() as { runId?: string; error?: unknown };
          expect(runResp.status, JSON.stringify(runBody)).toBe(202);
          const terminal = await waitForRunTerminal(runBody.runId!);
          expect(terminal.status).toBe('succeeded');
        },
      );

      const prompt = await readFile(promptPath, 'utf8');
      expect(prompt.trimEnd().endsWith(
        '  <user_first_prompt_empty />\n</open_design_agent_turn>',
      ), prompt.slice(-600)).toBe(true);
      expect(parseOpenDesignAgentTurnV1(prompt)).toMatchObject({
        userFirstPrompt: '',
        attachmentsMarkdown: expect.stringContaining('brief.txt'),
        discoveryBootstrapMarkdown: expect.stringContaining('# Agent-native Skill Discovery'),
      });
    } finally {
      if (previousPromptCapture === undefined) delete process.env.OD_PROMPT_CAPTURE;
      else process.env.OD_PROMPT_CAPTURE = previousPromptCapture;
      if (previousDiscoveryMode === undefined) delete process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY;
      else process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY = previousDiscoveryMode;
      await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'DELETE',
      }).catch(() => {});
      await rm(captureRoot, { recursive: true, force: true });
    }
  }, 60_000);

  it('does not enable discovery or gate wrappers after an explicit context plugin is added', async () => {
    const projectId = `headless-context-plugin-${randomUUID().slice(0, 8)}`;
    const previousDiscoveryMode = process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY;
    process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY = 'active';
    const captureRoot = await mkdtemp(path.join(tmpdir(), 'od-context-plugin-prompt-'));
    const promptPath = path.join(captureRoot, 'prompt.xml');
    const evidencePath = path.join(captureRoot, 'evidence.json');
    const previousPromptCapture = process.env.OD_PROMPT_CAPTURE;
    const previousEvidence = process.env.OD_DISCOVERY_EVIDENCE;
    process.env.OD_PROMPT_CAPTURE = promptPath;
    process.env.OD_DISCOVERY_EVIDENCE = evidencePath;
    try {
      const createResp = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'Discovery binding with context plugin',
          conversationMode: 'design',
          metadata: { kind: 'prototype' },
          skillDiscovery: { mode: 'agent', catalog: 'open-design-official' },
        }),
      });
      const created = await createResp.json() as { conversationId: string };
      expect(createResp.status, JSON.stringify(created)).toBe(200);

      const patchResp = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          metadata: {
            kind: 'prototype',
            contextPlugins: [{ id: 'example-web-prototype', title: 'Web Prototype' }],
          },
        }),
      });
      const patched = await patchResp.json() as {
        project?: { metadata?: { contextPlugins?: unknown[]; skillDiscoveryBinding?: unknown } };
      };
      expect(patchResp.status, JSON.stringify(patched)).toBe(200);
      expect(patched.project?.metadata?.contextPlugins).toHaveLength(1);
      expect(patched.project?.metadata?.skillDiscoveryBinding).toBeTruthy();

      await withFakeAgent(
        'opencode',
        `
const fs = require('node:fs');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  fs.writeFileSync(process.env.OD_PROMPT_CAPTURE, input);
  void (async () => {
    const response = await fetch(
      process.env.OD_DAEMON_URL + '/api/projects/' + encodeURIComponent(process.env.OD_PROJECT_ID) + '/media/generate',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + process.env.OD_TOOL_TOKEN,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );
    const body = await response.json();
    fs.writeFileSync(process.env.OD_DISCOVERY_EVIDENCE, JSON.stringify({ status: response.status, body }));
    console.log(JSON.stringify({ type: 'text', part: { text: 'context-plugin-ok' } }));
  })().catch((error) => {
    console.error(String(error && error.stack || error));
    process.exitCode = 1;
  });
});
`,
        async () => {
          const runResp = await fetch(`${baseUrl}/api/runs`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              projectId,
              conversationId: created.conversationId,
              agentId: 'opencode',
              message: 'Use the selected context plugin.',
              currentPrompt: 'Use the selected context plugin.',
            }),
          });
          const runBody = await runResp.json() as { runId?: string; error?: unknown };
          expect(runResp.status, JSON.stringify(runBody)).toBe(202);
          const terminal = await waitForRunTerminal(runBody.runId!);
          expect(terminal.status).toBe('succeeded');
        },
      );

      const prompt = parseOpenDesignAgentTurnV1(await readFile(promptPath, 'utf8'));
      expect(prompt.discoveryBootstrapMarkdown).toBeUndefined();
      expect(prompt.compactLifecycleCapsuleMarkdown).toBeUndefined();
      const evidence = JSON.parse(await readFile(evidencePath, 'utf8')) as {
        status: number;
        body?: { error?: { code?: string } };
      };
      expect(evidence.status).not.toBe(409);
      expect(evidence.body?.error?.code).not.toBe('TOOL_OPERATION_DENIED');
    } finally {
      if (previousPromptCapture === undefined) delete process.env.OD_PROMPT_CAPTURE;
      else process.env.OD_PROMPT_CAPTURE = previousPromptCapture;
      if (previousEvidence === undefined) delete process.env.OD_DISCOVERY_EVIDENCE;
      else process.env.OD_DISCOVERY_EVIDENCE = previousEvidence;
      if (previousDiscoveryMode === undefined) delete process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY;
      else process.env.OD_AGENT_NATIVE_SKILL_DISCOVERY = previousDiscoveryMode;
      await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'DELETE',
      }).catch(() => {});
      await rm(captureRoot, { recursive: true, force: true });
    }
  }, 60_000);

  // Full §8 e2e-3 contract — once the pipeline runner fires on a run
  // with a declared pipeline, the first ND-JSON event should be
  // `pipeline_stage_started`. Plan §3.I1 wires firePipelineForRun into
  // POST /api/runs so any plugin run with `od.pipeline.stages[*]`
  // emits the stage timeline before the agent's message_chunk stream.
  it('first SSE event on a plugin run with od.pipeline is pipeline_stage_started', async () => {
    // Install a fixture plugin with a 2-stage pipeline. We use a
    // disposable manifest rather than the on-disk fixture so the
    // pipeline shape is locked here.
    const fs = await import('node:fs/promises');
    const os = await import('node:os');
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'od-headless-pipeline-'));
    const fixture = path.join(tmpRoot, 'pipeline-plugin');
    await fs.mkdir(fixture, { recursive: true });
    await fs.writeFile(
      path.join(fixture, 'open-design.json'),
      JSON.stringify({
        $schema: 'https://open-design.ai/schemas/plugin.v1.json',
        name: 'pipeline-plugin',
        title: 'Pipeline Plugin',
        version: '1.0.0',
        description: 'fixture with a declared pipeline',
        license: 'MIT',
        od: {
          kind: 'skill',
          taskKind: 'new-generation',
          useCase: { query: 'Make a {{topic}} brief.' },
          inputs: [{ name: 'topic', type: 'string', required: true, label: 'Topic' }],
          pipeline: {
            stages: [
              { id: 'discovery', atoms: ['discovery-question-form'] },
              { id: 'plan',      atoms: ['todo-write'] },
            ],
          },
          capabilities: ['prompt:inject'],
        },
      }, null, 2),
    );
    await fs.writeFile(
      path.join(fixture, 'SKILL.md'),
      '---\nname: pipeline-plugin\ndescription: fixture with pipeline\n---\n# Pipeline\n',
    );

    const installResp = await fetch(`${baseUrl}/api/plugins/install`, {
      method:  'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body:    JSON.stringify({ source: fixture }),
    });
    await readSseUntilSuccess(installResp);

    const projectId = `pipeline-${Date.now()}`;
    // The fixture declares od.pipeline.stages and is installed under
    // sourceKind='local', which is trusted by default (trust.ts
    // defaultTrustForRecord). The trusted default grant therefore already
    // includes pipeline:*, so the snapshot is created without any ephemeral
    // grantCaps — exercising the stored/default grant path directly.
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({
        id:           projectId,
        name:         'Pipeline e2e-3',
        pluginId:     'pipeline-plugin',
        pluginInputs: { topic: 'agentic design' },
      }),
    });
    expect(createResp.status).toBe(200);
    const createBody = (await createResp.json()) as {
      project: { id: string };
      conversationId: string;
      appliedPluginSnapshotId?: string;
    };
    expect(createBody.appliedPluginSnapshotId).toBeTruthy();

    await withHeadlessOpencode(async () => {
      const runResp = await fetch(`${baseUrl}/api/runs`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({
          projectId,
          agentId:                 'opencode',
          pluginId:                'pipeline-plugin',
          appliedPluginSnapshotId: createBody.appliedPluginSnapshotId,
        }),
      });
      expect(runResp.status).toBe(202);
      const runBody = (await runResp.json()) as { runId: string };

      // The pipeline emits its first event synchronously inside POST
      // /api/runs (firePipelineForRun runs before design.runs.start
      // schedules the agent), so by the time we GET /api/runs/:id/events
      // the run buffer already contains pipeline_stage_started.
      // Wait briefly for the async tail (devloop iteration log) to settle.
      await new Promise((r) => setTimeout(r, 30));

      const statusResp = await fetch(`${baseUrl}/api/runs/${encodeURIComponent(runBody.runId)}`);
      const statusBody = (await statusResp.json()) as { id: string };
      expect(statusBody.id).toBe(runBody.runId);

      // Read the run's event buffer through the headerless SSE stream — the
      // server pipes every record through res.write, so reading the body until
      // 'end' or pipeline_stage_completed surfaces the first events. We don't
      // actually wait for end; we just look for the stage-start anchor.
      const eventsResp = await fetch(`${baseUrl}/api/runs/${encodeURIComponent(runBody.runId)}/events`, {
        headers: { accept: 'text/event-stream' },
      });
      expect(eventsResp.body).toBeTruthy();
      const reader = eventsResp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let firstStageEvent: string | null = null;
      let messageChunkSeen = false;
      const start = Date.now();
      while (Date.now() - start < 1500) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          const eventLine = block.split('\n').find((l) => l.startsWith('event: '));
          if (!eventLine) continue;
          const event = eventLine.slice('event: '.length);
          if (event === 'pipeline_stage_started' && !firstStageEvent && !messageChunkSeen) {
            firstStageEvent = event;
          }
          if (event === 'message_chunk') messageChunkSeen = true;
          if (firstStageEvent || event === 'end') break;
        }
        if (firstStageEvent) break;
      }
      void reader.cancel().catch(() => undefined);

      expect(firstStageEvent).toBe('pipeline_stage_started');

      // Keep the fake binary installed through cancellation for the same
      // fire-and-forget startup guarantee as the snapshot-pinning case.
      await fetch(`${baseUrl}/api/runs/${encodeURIComponent(runBody.runId)}/cancel`, { method: 'POST' });
    });
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });
});
