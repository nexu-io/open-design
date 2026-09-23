// @vitest-environment node

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { access, chmod, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { chromium as playwrightChromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { describe, expect, test } from 'vitest';

import { requestJson } from '@/vitest/http';
import { createSmokeSuite } from '@/vitest/suite';

type ProjectResponse = {
  project: { id: string; skillId?: string | null };
};

type SkillResponse = {
  body?: string;
  id: string;
};

type BrowserSessionResponse = {
  browserSession: { id: string; websocketUrl: string };
};

type CreatedProjectResponse = ProjectResponse & {
  conversationId: string;
};

type RunStartResponse = {
  runId: string;
};

type ReconResult = {
  captures: Array<{
    screenshot: string;
    viewport: { height: number; width: number };
    signals: { title: string };
  }>;
  console: {
    errors: unknown[];
    pageErrors: unknown[];
  };
};

const execFileAsync = promisify(execFile);
const odBin = fileURLToPath(new URL('../../../apps/daemon/bin/od.mjs', import.meta.url));

// This spec deliberately uses a tiny fake executable instead of CI's browser.
// It exercises the real tools-dev daemon, project authorization, process
// lifecycle, and API contract hermetically. Adapter/CDP behavior is covered by
// the daemon unit suite, while local packaged acceptance runs real system Chrome.
describe('Website Clone main path', () => {
  test('[P1] brokers a browser lifecycle without Electron or a Playwright install', async () => {
    const suite = await createSmokeSuite('web-clone-main');
    const fakeBrowser = await writeFakeBrowserExecutable(suite.scratchDir);

    await suite.with.toolsDev(async ({ webUrl }) => {
      const project = await requestJson<ProjectResponse>(webUrl, '/api/projects', {
        body: {
          designSystemId: null,
          id: randomUUID(),
          metadata: { intent: 'web-clone', kind: 'prototype' },
          name: 'Website Clone main-path smoke project',
          pendingPrompt: '复刻 https://example.com',
          skillId: 'web-clone',
        },
      });
      expect(project.project.skillId).toBe('web-clone');

      const skill = await requestJson<SkillResponse>(webUrl, '/api/skills/web-clone');
      expect(skill.id).toBe('web-clone');
      expect(skill.body).toContain('基于 Chrome DevTools Protocol 的零依赖控制层');
      expect(skill.body).toContain('无需启动 Electron 客户端');
      expect(skill.body).not.toContain('npm install -D playwright');

      const created = await requestJson<BrowserSessionResponse>(
        webUrl,
        `/api/projects/${encodeURIComponent(project.project.id)}/browser-sessions`,
        { body: {} },
      );
      expect(created.browserSession.id).toEqual(expect.any(String));
      expect(created.browserSession.websocketUrl).toBe(
        'ws://127.0.0.1:65534/devtools/browser/web-clone-e2e',
      );

      const closed = await requestJson<{ closed: boolean }>(
        webUrl,
        `/api/projects/${encodeURIComponent(project.project.id)}/browser-sessions/${encodeURIComponent(created.browserSession.id)}`,
        { method: 'DELETE' },
      );
      expect(closed.closed).toBe(true);

      await suite.report.json('summary.json', {
        browserBroker: created.browserSession,
        electronRequired: false,
        playwrightInstalledInProject: false,
        projectId: project.project.id,
        skillId: skill.id,
      });
    }, {
      env: { OD_BROWSER_EXECUTABLE_PATH: fakeBrowser },
    });
  }, 180_000);

  test('[P0] real od CLI runs the staged recon script through the daemon browser broker', async () => {
    const suite = await createSmokeSuite('web-clone-real-browser-main');
    const fixture = await startFixtureSite();
    const browserExecutable = await resolveBrowserExecutable();
    const fakeCodex = await writeReconAgentExecutable(suite.scratchDir);

    try {
      await suite.with.toolsDev(async ({ runtime }) => {
        const daemonUrl = `http://127.0.0.1:${runtime.daemonPort}`;
        const created = await od(daemonUrl, [
          'project',
          'create',
          '--name',
          'Website Clone real browser smoke',
          '--skill',
          'web-clone',
          '--pending-prompt',
          `复刻 ${fixture.url}`,
          '--json',
        ]);
        expect(created.code, `od project create failed: ${created.stderr}`).toBe(0);
        const project = JSON.parse(created.stdout) as CreatedProjectResponse;
        expect(project.project.skillId).toBe('web-clone');
        expect(project.conversationId).toEqual(expect.any(String));

        const started = await od(daemonUrl, [
          'run',
          'start',
          '--project',
          project.project.id,
          '--conversation',
          project.conversationId,
          '--skill',
          'web-clone',
          '--agent',
          'codex',
          '--message',
          `Run the Website Clone primary-path smoke. WEB_CLONE_FIXTURE_URL=${fixture.url}`,
          '--json',
        ]);
        expect(started.code, `od run start failed: ${started.stderr}`).toBe(0);
        const { runId } = JSON.parse(started.stdout) as RunStartResponse;
        expect(runId).toEqual(expect.any(String));

        const watched = await od(daemonUrl, ['run', 'watch', runId], 180_000);
        expect(watched.code, `od run watch failed: ${watched.stderr || watched.stdout}`).toBe(0);
        const watchedEvents = watched.stdout
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as { event?: string; data?: { status?: string } });
        expect(watchedEvents).toContainEqual(expect.objectContaining({
          event: 'end',
          data: expect.objectContaining({ status: 'succeeded' }),
        }));

        const projectRoot = join(suite.dataDir, 'projects', project.project.id);
        const stagedRoots = await readdir(join(projectRoot, '.od-skills'), {
          withFileTypes: true,
        });
        const stagedWebClone = stagedRoots.find((entry) =>
          entry.isDirectory() && entry.name.startsWith('web-clone-')
        );
        expect(stagedWebClone, 'daemon must stage the selected Website Clone skill').toBeDefined();
        await expectFile(join(
          projectRoot,
          '.od-skills',
          stagedWebClone!.name,
          'scripts',
          'recon-site.mjs',
        ));

        const reconRoot = join(projectRoot, 'RECON');
        const recon = JSON.parse(
          await readFile(join(reconRoot, 'original-recon.json'), 'utf8'),
        ) as ReconResult;
        expect(recon.captures.map((capture) => capture.viewport.width)).toEqual([
          1440,
          768,
          390,
        ]);
        expect(recon.captures.every((capture) => capture.signals.title === 'Website Clone Fixture')).toBe(true);
        expect(recon.console.errors).toEqual([]);
        expect(recon.console.pageErrors).toEqual([]);

        for (const width of [1440, 768, 390]) {
          const screenshot = join(reconRoot, 'screenshots', `original-${width}.png`);
          const png = PNG.sync.read(await readFile(screenshot));
          expect(png.width).toBe(width);
          expect(png.height).toBeGreaterThanOrEqual(900);
        }

        await suite.report.json('summary.json', {
          browserExecutable,
          consoleErrors: recon.console.errors.length,
          pageErrors: recon.console.pageErrors.length,
          projectId: project.project.id,
          runId,
          stagedSkill: stagedWebClone!.name,
          viewports: recon.captures.map((capture) => capture.viewport.width),
        });
      }, {
        env: {
          CODEX_BIN: fakeCodex,
          OD_BROWSER_EXECUTABLE_PATH: browserExecutable,
        },
      });
    } finally {
      await closeServer(fixture.server);
    }
  }, 300_000);
});

async function od(
  daemonUrl: string,
  args: string[],
  timeout = 60_000,
): Promise<{ code: number; stderr: string; stdout: string }> {
  try {
    const { stderr, stdout } = await execFileAsync(process.execPath, [odBin, ...args], {
      env: { ...process.env, OD_DAEMON_URL: daemonUrl },
      maxBuffer: 4 * 1024 * 1024,
      timeout,
    });
    return { code: 0, stderr, stdout };
  } catch (error) {
    const failure = error as { code?: number; stderr?: string; stdout?: string };
    return {
      code: typeof failure.code === 'number' ? failure.code : 1,
      stderr: failure.stderr ?? '',
      stdout: failure.stdout ?? '',
    };
  }
}

async function expectFile(path: string): Promise<void> {
  await expect(access(path)).resolves.toBeUndefined();
}

async function resolveBrowserExecutable(): Promise<string> {
  const candidates = [
    process.env.OD_BROWSER_EXECUTABLE_PATH,
    playwrightChromium.executablePath(),
    ...(process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : []),
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next installed candidate.
    }
  }
  throw new Error(
    'Website Clone P0 requires an installed Chromium. CI must run `playwright install chromium` first.',
  );
}

async function startFixtureSite(): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    if (request.url === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="description" content="Hermetic Website Clone browser fixture">
    <title>Website Clone Fixture</title>
    <style>
      :root { --ink: #172033; --accent: #5b5cf0; }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); font-family: Arial, sans-serif; background: #f4f5fb; }
      header { position: sticky; top: 0; padding: 24px 6vw; color: white; background: var(--accent); }
      main { min-height: 2100px; padding: 72px 6vw; }
      h1 { max-width: 760px; font-size: clamp(42px, 7vw, 96px); line-height: .95; }
      section { margin-top: 720px; padding: 48px; border-radius: 24px; background: white; }
      footer { padding: 36px 6vw; background: #172033; color: white; }
    </style>
  </head>
  <body>
    <header><nav><a href="#proof">Open Design</a></nav></header>
    <main><h1>Deterministic browser-broker proof</h1><section id="proof"><h2>Scrolled and captured</h2><button>Primary action</button></section></main>
    <footer>Website Clone fixture footer</footer>
  </body>
</html>`);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Website Clone fixture did not bind to a TCP port');
  }
  return { server, url: `http://127.0.0.1:${address.port}/` };
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error == null ? resolve() : reject(error)));
  });
}

async function writeReconAgentExecutable(root: string): Promise<string> {
  const binDir = join(root, 'recon-agent');
  const script = join(binDir, 'codex-web-clone-e2e.cjs');
  const executable = process.platform === 'win32'
    ? join(binDir, 'codex-web-clone-e2e.cmd')
    : script;
  await mkdir(binDir, { recursive: true });
  await writeFile(script, `#!/usr/bin/env node
const { existsSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
if (args.includes('--version')) {
  process.stdout.write('codex-web-clone-e2e 0.0.0\\n');
  process.exit(0);
}

let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', run);
process.stdin.resume();

function run() {
  try {
    const url = /WEB_CLONE_FIXTURE_URL=(https?:\\/\\/\\S+)/.exec(prompt)?.[1];
    if (!url) throw new Error('missing WEB_CLONE_FIXTURE_URL marker');
    const projectDir = process.env.OD_PROJECT_DIR
      || join(process.env.OD_DATA_DIR || '', 'projects', process.env.OD_PROJECT_ID || '');
    const aliasesRoot = join(projectDir, '.od-skills');
    const alias = readdirSync(aliasesRoot, { withFileTypes: true })
      .find((entry) => entry.isDirectory() && entry.name.startsWith('web-clone-'));
    if (!alias) throw new Error('daemon did not stage the web-clone skill');
    const recon = join(aliasesRoot, alias.name, 'scripts', 'recon-site.mjs');
    if (!existsSync(recon)) throw new Error('staged recon-site.mjs is missing');
    const result = spawnSync(process.execPath, [
      recon,
      '--url', url,
      '--out', join(projectDir, 'RECON'),
      '--label', 'original',
      '--widths', '1440,768,390',
      '--wait', '10',
      '--navigation-timeout', '15000',
    ], {
      cwd: projectDir,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 4 * 1024 * 1024,
      timeout: 150000,
    });
    if (result.status !== 0) {
      throw new Error('staged recon failed: ' + (result.stderr || result.stdout || result.error?.message || result.status));
    }
    process.stdout.write(JSON.stringify({ type: 'thread.started' }) + '\\n');
    process.stdout.write(JSON.stringify({ type: 'turn.started' }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: 'Staged Website Clone recon completed: ' + result.stdout.trim() },
    }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 1, output_tokens: 1 },
    }) + '\\n');
  } catch (error) {
    process.stderr.write(String(error?.stack || error) + '\\n');
    process.exitCode = 1;
  }
}
`, 'utf8');
  if (process.platform === 'win32') {
    await writeFile(executable, '@echo off\r\nnode "%~dp0codex-web-clone-e2e.cjs" %*\r\n', 'utf8');
  } else {
    await chmod(executable, 0o755);
  }
  return executable;
}

async function writeFakeBrowserExecutable(root: string): Promise<string> {
  const binDir = join(root, 'fake-browser');
  const executable = join(binDir, 'chrome');
  await mkdir(binDir, { recursive: true });
  await writeFile(
    executable,
    [
      '#!/usr/bin/env node',
      "process.stderr.write('DevTools listening on ws://127.0.0.1:65534/devtools/browser/web-clone-e2e\\n');",
      "process.on('SIGTERM', () => process.exit(0));",
      "process.on('SIGINT', () => process.exit(0));",
      'setInterval(() => {}, 60_000);',
      '',
    ].join('\n'),
    'utf8',
  );
  await chmod(executable, 0o755);
  return executable;
}
