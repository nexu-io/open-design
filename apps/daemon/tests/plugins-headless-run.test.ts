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

    // 3. Start a run that re-uses the same applied snapshot id.
    const runResp = await fetch(`${baseUrl}/api/runs`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({
        projectId,
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

    // 4. The run status surfaces the snapshot id so a polling client
    // can reach replay without parsing the SSE stream.
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

    // Cancel the run so the test cleans up the in-memory child path.
    await fetch(`${baseUrl}/api/runs/${encodeURIComponent(runBody.runId)}/cancel`, { method: 'POST' });
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
    expect(shareBody.prompt).toContain('Publish the local Open Design plugin');
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
    process.env.OD_REAL_GIT = realGit;
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
if (args[0] === 'auth' && args[1] === 'status') ok('Logged in to github.com as test-user');
if (args[0] === 'api' && args[1] === 'user') ok('test-user');
if (args[0] === 'repo' && args[1] === 'create') ok('https://github.com/test-user/' + args[2]);
if (args[0] === 'repo' && args[1] === 'view') ok('https://github.com/test-user/' + path.basename(process.cwd()));
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
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
if (args[0] === 'push') {
  console.log('pushed');
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
              expect(contributeEndpointResp.status).toBe(200);
              const contributeEndpointBody = (await contributeEndpointResp.json()) as {
                ok: boolean;
                url?: string;
              };
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
    }
  });

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
  fs.writeFileSync(process.env.OD_PROMPT_CAPTURE, input);
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
        expect(prompt).toContain(`# User request\n\nGenerate a ${topic} brief for general.`);
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
    // sourceKind='local' (default trust='restricted'). The required
    // capabilities therefore include pipeline:*; the test grants it
    // ephemerally via the resolver so the snapshot is created without
    // re-asking the user.
    const createResp = await fetch(`${baseUrl}/api/projects`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({
        id:           projectId,
        name:         'Pipeline e2e-3',
        pluginId:     'pipeline-plugin',
        pluginInputs: { topic: 'agentic design' },
        grantCaps:    ['pipeline:*'],
      }),
    });
    expect(createResp.status).toBe(200);
    const createBody = (await createResp.json()) as {
      project: { id: string };
      conversationId: string;
      appliedPluginSnapshotId?: string;
    };
    expect(createBody.appliedPluginSnapshotId).toBeTruthy();

    const runResp = await fetch(`${baseUrl}/api/runs`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({
        projectId,
        pluginId:                'pipeline-plugin',
        appliedPluginSnapshotId: createBody.appliedPluginSnapshotId,
        grantCaps:               ['pipeline:*'],
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

    // Read the run's event buffer through the SSE stream — the
    // server pipes every record through res.write, so reading the
    // body until 'end' or pipeline_stage_completed surfaces the
    // first events. We don't actually wait for end (the run is
    // long-running); we just look for the stage-start anchor.
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

    await fetch(`${baseUrl}/api/runs/${encodeURIComponent(runBody.runId)}/cancel`, { method: 'POST' });
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });
});
