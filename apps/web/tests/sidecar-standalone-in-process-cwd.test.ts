import { mkdtemp, mkdir, realpath, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { startStandaloneBackendInProcess } from '../sidecar/server';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function pretendWindows(): void {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { ...descriptor, value: 'win32' });
  cleanups.push(() => Object.defineProperty(process, 'platform', descriptor));
}

function recordChdirTargets(): string[] {
  const targets: string[] = [];
  const original = process.chdir.bind(process);
  process.chdir = ((directory: string): void => {
    targets.push(directory);
    original(directory);
  }) as typeof process.chdir;
  cleanups.push(() => {
    process.chdir = original as typeof process.chdir;
  });
  return targets;
}

function preserveEnv(keys: readonly string[]): void {
  const snapshot = keys.map((key) => [key, process.env[key]] as const);
  cleanups.push(() => {
    for (const [key, value] of snapshot) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function preserveCwd(): void {
  const original = process.cwd();
  cleanups.push(() => process.chdir(original));
}

async function reserveLoopbackPort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

describe('in-process standalone backend', () => {
  // Regression test for #9157: the sidecar used to reroute the standalone server's
  // chdir back through a Windows junction, so Next (which resolves its project
  // directory with realpath) joined an alias path onto an absolute real path and
  // answered every request with a 500.
  it('leaves the standalone entry on the real path behind a directory alias', async () => {
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    const root = await realpath(await mkdtemp(join(tmpdir(), 'open-design-standalone-')));
    const realDir = join(root, 'real');
    const aliasDir = join(root, 'alias');
    await mkdir(realDir);
    await symlink(realDir, aliasDir, linkType);

    const port = await reserveLoopbackPort();
    const origin = `http://127.0.0.1:${port}`;
    await writeFile(
      join(realDir, 'server.mjs'),
      [
        "import { createServer } from 'node:net';",
        "import { dirname } from 'node:path';",
        "import { fileURLToPath } from 'node:url';",
        '',
        '// Next.js standalone output pins the process to its own directory the same way.',
        'process.chdir(dirname(fileURLToPath(import.meta.url)));',
        '',
        'const server = createServer();',
        "server.listen(Number(process.env.PORT), '127.0.0.1');",
        'server.unref();',
        '',
      ].join('\n'),
    );

    preserveCwd();
    preserveEnv(['HOSTNAME', 'NODE_ENV', 'PORT', 'OD_STANDALONE_PARENT_PID']);
    const chdirTargets = recordChdirTargets();
    // The shim this test guards against only engaged on Windows, so the platform
    // has to be faked for the regression to be reachable on a Linux CI runner.
    pretendWindows();

    const backend = await startStandaloneBackendInProcess(join(aliasDir, 'server.mjs'), port, origin);

    expect(chdirTargets).toEqual([realDir]);
    expect(backend.origin).toBe(origin);
    await backend.stop();
  });
});
