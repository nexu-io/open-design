import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { RepoStudioManifest } from '@open-design/contracts';
import {
  applyRepoStudioControl,
  diffRepoStudio,
  inspectRepoStudio,
  RepoStudioError,
  validateManifest,
  verifyRepoStudio,
} from '../src/repo-studio.js';

const roots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

function manifest(overrides: Partial<RepoStudioManifest> = {}): RepoStudioManifest {
  return {
    protocolVersion: 1,
    appId: 'rune',
    appName: 'Rune',
    previewUrl: 'http://127.0.0.1:5050',
    components: [
      {
        id: 'home.library-tasks',
        label: 'Library tasks',
        selector: '[data-od-id="home-library-tasks"]',
        sourceFile: 'src/features/home/components/library-tasks-section.tsx',
        controls: [
          {
            id: 'columns',
            label: 'Columns',
            kind: 'select',
            value: 2,
            options: [
              { value: 1, label: '1', sourceToken: 'columns: 1' },
              { value: 2, label: '2', sourceToken: 'columns: 2' },
            ],
            edit: {
              file: 'src/features/home/studio-config.ts',
              marker: '@rune-studio home.libraryTasks.columns',
            },
          },
        ],
      },
    ],
    verification: [
      { id: 'echo', label: 'Echo', command: process.execPath, args: ['-e', 'console.log("verified")'] },
    ],
    ...overrides,
  };
}

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'repo-studio-'));
  roots.push(root);
  await mkdir(path.join(root, 'src/features/home/components'), { recursive: true });
  await writeFile(
    path.join(root, 'src/features/home/studio-config.ts'),
    '// @rune-studio home.libraryTasks.columns\nexport const layout = { columns: 2 };\n',
    'utf8',
  );
  await writeFile(
    path.join(root, 'src/features/home/components/library-tasks-section.tsx'),
    'export function LibraryTasksSection() { return null; }\n',
    'utf8',
  );
  await runGit(root, ['init']);
  await runGit(root, ['config', 'user.email', 'repo-studio@example.test']);
  await runGit(root, ['config', 'user.name', 'Repo Studio Test']);
  await runGit(root, ['add', '.']);
  await runGit(root, ['commit', '-m', 'fixture']);
  return root;
}

async function serveManifest(value: RepoStudioManifest): Promise<string> {
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(value));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  return `http://127.0.0.1:${address.port}/__rune_studio/manifest`;
}

describe('Repo Studio', () => {
  it('rejects non-loopback manifests', () => {
    expect(() => validateManifest(manifest({ previewUrl: 'https://example.com' }))).toThrow(RepoStudioError);
  });

  it('inspects a loopback manifest', async () => {
    const root = await fixtureRoot();
    const manifestUrl = await serveManifest(manifest());
    const result = await inspectRepoStudio({ root, manifestUrl });
    expect(result.root).toBe(await import('node:fs/promises').then(({ realpath }) => realpath(root)));
    expect(result.manifest.appId).toBe('rune');
  });

  it('applies only an option token inside the declared marker window', async () => {
    const root = await fixtureRoot();
    const manifestUrl = await serveManifest(manifest());
    const result = await applyRepoStudioControl({
      root,
      manifestUrl,
      componentId: 'home.library-tasks',
      controlId: 'columns',
      value: 1,
    });
    expect(result.previousValue).toBe(2);
    expect(result.value).toBe(1);
    expect(await readFile(path.join(root, 'src/features/home/studio-config.ts'), 'utf8')).toContain('columns: 1');
  });

  it('runs only a verification declared by the manifest', async () => {
    const root = await fixtureRoot();
    const manifestUrl = await serveManifest(manifest());
    const result = await verifyRepoStudio({ root, manifestUrl, verificationId: 'echo' });
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain('verified');
  });

  it('returns a Git diff limited to registered files', async () => {
    const root = await fixtureRoot();
    const manifestUrl = await serveManifest(manifest());
    await applyRepoStudioControl({
      root,
      manifestUrl,
      componentId: 'home.library-tasks',
      controlId: 'columns',
      value: 1,
    });
    const result = await diffRepoStudio({ root, manifestUrl });
    expect(result.clean).toBe(false);
    expect(result.files).toContain('src/features/home/studio-config.ts');
    expect(result.diff).toContain('-export const layout = { columns: 2 };');
    expect(result.diff).toContain('+export const layout = { columns: 1 };');
  });
});

async function runGit(root: string, args: string[]): Promise<void> {
  const { spawn } = await import('node:child_process');
  await new Promise<void>((resolve, reject) => {
    const child = spawn('git', args, { cwd: root, stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`git ${args.join(' ')} failed: ${code}`)));
  });
}
