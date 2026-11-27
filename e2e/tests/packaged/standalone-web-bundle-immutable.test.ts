// @vitest-environment node

// Issue #7284: the packaged desktop app runs the Next.js standalone web server
// from its signed app bundle (`Contents/Resources/open-design-web-standalone`).
// Next's default incremental cache flushes every rendered catch-all route into
// `.next/server/app`, which mutated the bundle and broke its code signature.
//
// This test builds the real standalone web output, lays it out the way the
// packaged after-pack hook does, serves real project/conversation routes, and
// asserts the web tree is byte-for-byte unchanged while the cache entries land
// in the mutable cache directory the packaged supervisor passes in.

import { spawn, type ChildProcess } from 'node:child_process';
import { cp, lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { allocateToolsDevPorts } from '@/tools-dev/ports';
import { createSmokeSuite, e2eWorkspaceRoot, type SmokeSuite } from '@/vitest/suite';

const webRoot = join(e2eWorkspaceRoot(), 'apps', 'web');
const pnpmCommand = process.env.OD_E2E_PNPM_COMMAND ?? 'pnpm';
// Reuse an existing `OD_WEB_OUTPUT_MODE=standalone` build (`apps/web/.next`)
// instead of rebuilding, e.g. when iterating locally.
const prebuiltDistDir = process.env.OD_E2E_WEB_STANDALONE_DIST_DIR?.trim() || null;
// Mirrors PACKAGED_WEB_CACHE_DIR_ENV in apps/packaged/src/config.ts.
const WEB_CACHE_DIR_ENV = 'OD_WEB_CACHE_DIR';

const projectId = '7284aaaa-0000-4000-8000-000000000001';
const conversationId = '7284bbbb-0000-4000-8000-000000000002';

type TreeEntry = { kind: 'dir' | 'file' | 'symlink'; mtimeMs: number; size: number };

async function snapshotTree(root: string): Promise<Map<string, TreeEntry>> {
  const entries = new Map<string, TreeEntry>();
  async function visit(current: string): Promise<void> {
    for (const dirent of await readdir(current, { withFileTypes: true })) {
      const absolute = join(current, dirent.name);
      const stats = await lstat(absolute);
      const kind = stats.isSymbolicLink() ? 'symlink' : stats.isDirectory() ? 'dir' : 'file';
      entries.set(relative(root, absolute), { kind, mtimeMs: stats.mtimeMs, size: stats.size });
      if (kind === 'dir') await visit(absolute);
    }
  }
  await visit(root);
  return entries;
}

function diffTrees(before: Map<string, TreeEntry>, after: Map<string, TreeEntry>): string[] {
  const changes: string[] = [];
  for (const [path, entry] of after) {
    const previous = before.get(path);
    if (previous == null) changes.push(`added ${path}`);
    else if (previous.kind !== entry.kind || previous.size !== entry.size || previous.mtimeMs !== entry.mtimeMs) {
      changes.push(`changed ${path}`);
    }
  }
  for (const path of before.keys()) {
    if (!after.has(path)) changes.push(`removed ${path}`);
  }
  return changes.sort();
}

async function listFiles(root: string): Promise<string[]> {
  const snapshot = await snapshotTree(root).catch(() => new Map<string, TreeEntry>());
  return [...snapshot].filter(([, entry]) => entry.kind === 'file').map(([path]) => path).sort();
}

async function run(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }): Promise<void> {
  const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout?.on('data', (chunk) => { output += String(chunk); });
  child.stderr?.on('data', (chunk) => { output += String(chunk); });
  const code = await new Promise<number | null>((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', resolveExit);
  });
  if (code !== 0) throw new Error(`${command} ${args.join(' ')} exited ${code}\n${output.slice(-4000)}`);
}

async function buildStandaloneWeb(): Promise<string> {
  if (prebuiltDistDir != null) return prebuiltDistDir;
  // `next build` rewrites next-env.d.ts; restore it like tools-pack does.
  const nextEnvPath = join(webRoot, 'next-env.d.ts');
  const previousNextEnv = await readFile(nextEnvPath, 'utf8').catch(() => null);
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production', OD_WEB_OUTPUT_MODE: 'standalone' };
  delete env.OD_WEB_DIST_DIR;
  delete env.OD_WEB_PROD;
  try {
    await run(pnpmCommand, ['--filter', '@open-design/web', 'exec', 'next', 'build'], { cwd: e2eWorkspaceRoot(), env });
  } finally {
    if (previousNextEnv != null) await writeFile(nextEnvPath, previousNextEnv, 'utf8');
  }
  return join(webRoot, '.next');
}

// Same copy steps as tools/pack/resources/web-standalone-after-pack.cjs:
// the standalone tree plus `.next/static` and `public` beside server.js.
async function assemblePackagedWebResource(distDir: string, resourcesRoot: string): Promise<string> {
  const destinationRoot = join(resourcesRoot, 'open-design-web-standalone');
  const destinationWebRoot = join(destinationRoot, 'apps', 'web');
  await mkdir(resourcesRoot, { recursive: true });
  await cp(join(distDir, 'standalone'), destinationRoot, { recursive: true, verbatimSymlinks: true });
  await cp(join(distDir, 'static'), join(destinationWebRoot, '.next', 'static'), { recursive: true });
  await cp(join(webRoot, 'public'), join(destinationWebRoot, 'public'), { recursive: true });
  return destinationRoot;
}

async function waitForServer(origin: string, child: ChildProcess, output: () => string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`standalone server exited ${child.exitCode}\n${output()}`);
    try {
      const response = await fetch(`${origin}/desktop-pet`);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await sleep(250);
  }
  throw new Error(`standalone server did not become ready at ${origin}\n${output()}`);
}

describe('packaged standalone web bundle immutability (#7284)', () => {
  let suite: SmokeSuite;
  let distDir: string;
  let passed = false;

  beforeAll(async () => {
    suite = await createSmokeSuite('standalone-web-bundle-immutable');
    distDir = await buildStandaloneWeb();
  }, 900_000);

  afterAll(async () => {
    // Failed runs keep the assembled resource tree and cache for diagnosis.
    await suite?.finalize({ success: passed });
  });

  test('serving project and conversation routes leaves the packaged web tree untouched', { timeout: 180_000 }, async () => {
    const resourceRoot = await assemblePackagedWebResource(distDir, join(suite.scratchDir, 'Resources'));
    const cacheDir = join(suite.scratchDir, 'namespace', 'cache', 'web');
    const buildId = (await readFile(join(resourceRoot, 'apps', 'web', '.next', 'BUILD_ID'), 'utf8')).trim();
    const before = await snapshotTree(resourceRoot);

    const ports = await allocateToolsDevPorts();
    const port = ports.webPort;
    await ports.release();
    const origin = `http://127.0.0.1:${port}`;
    let output = '';
    const server = spawn(process.execPath, [join(resourceRoot, 'apps', 'web', 'server.js')], {
      cwd: join(resourceRoot, 'apps', 'web'),
      env: {
        ...process.env,
        [WEB_CACHE_DIR_ENV]: cacheDir,
        HOSTNAME: '127.0.0.1',
        NODE_ENV: 'production',
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout?.on('data', (chunk) => { output += String(chunk); });
    server.stderr?.on('data', (chunk) => { output += String(chunk); });

    try {
      await waitForServer(origin, server, () => output);

      const conversationPath = `/projects/${projectId}/conversations/${conversationId}`;
      const requests: Array<{ path: string; headers?: Record<string, string> }> = [
        { path: '/' },
        { path: `/projects/${projectId}` },
        { path: conversationPath },
        { path: conversationPath, headers: { RSC: '1' } },
        // Preview-relative assets resolve through the catch-all route too.
        { path: `${conversationPath}/hero.png` },
        { path: `/projects/${projectId}/tokens.css` },
        { path: '/_next/image?url=%2Fapp-icon.png&w=64&q=75' },
      ];
      for (const request of requests) {
        const response = await fetch(`${origin}${request.path}`, { headers: request.headers ?? {} });
        await response.arrayBuffer();
        expect(response.status, `${request.path}\n${output}`).toBe(200);
      }
      // Cache writes are flushed asynchronously after the response.
      await sleep(1_000);
    } finally {
      server.kill('SIGTERM');
      await new Promise((resolveExit) => {
        if (server.exitCode != null || server.signalCode != null) resolveExit(null);
        else server.once('exit', resolveExit);
      });
    }

    const after = await snapshotTree(resourceRoot);
    expect(diffTrees(before, after)).toEqual([]);

    // The requests above really exercised the cache: the rendered conversation
    // route was persisted, under the build-scoped mutable cache directory.
    const cachedFiles = await listFiles(cacheDir);
    expect(cachedFiles).toContain(
      join(buildId, 'server', 'app', 'projects', projectId, 'conversations', `${conversationId}.html`),
    );
    expect(cachedFiles.every((file) => file.startsWith(`${buildId}${sep}`))).toBe(true);
    expect(output).not.toMatch(/Failed to write|invariant/i);
    passed = true;
  });
});
