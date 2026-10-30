import { chmod, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { checkCloudApp, checkPublication, components, prepareWeb, publishResources } from '../../../.github/scripts/cloud/release.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const revision = 'a'.repeat(40);
const exec = promisify(execFile);

async function fixture(run: (directory: string) => Promise<void>) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'cloud-release-')));
  try { await run(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

describe('cloud delivery contracts', () => {
  it('requires the cloud app only for targets that consume it', async () => {
    expect(components('web')).toEqual(['web']);
    expect(components('all')).toEqual(['web', 'backend', 'resources']);
    expect(() => components('desktop')).toThrow('Unknown');
    await fixture(async (directory) => {
      await expect(checkCloudApp(directory, 'backend')).rejects.toThrow('apps/cloud/package.json');
      await mkdir(join(directory, 'apps/cloud'), { recursive: true });
      await writeFile(join(directory, 'apps/cloud/package.json'), JSON.stringify({ scripts: { build: 'tsc', start: 'node dist/server.js' } }));
      await expect(checkCloudApp(directory, 'backend')).resolves.toBeUndefined();
      await expect(checkCloudApp(directory, 'resources')).rejects.toThrow('resources:prepare');
    });
  });

  it('rejects a placeholder deployment or publication from another branch', () => {
    const env = { CLOUD_PUBLISH: 'true', GITHUB_DEFAULT_BRANCH: 'main', GITHUB_REF: 'refs/heads/main' };
    expect(() => checkPublication(env, ['web'])).toThrow('Cloudflare');
    expect(() => checkPublication(env, components('all'))).toThrow('Cloudflare');
    expect(() => checkPublication({ ...env, GITHUB_REF: 'refs/heads/feature' }, ['backend'])).toThrow('default branch');
    expect(() => checkPublication(env, ['backend', 'resources'])).not.toThrow();
    expect(() => checkPublication({ CLOUD_PUBLISH: 'false' }, ['web'])).not.toThrow();
  });

  it('stages a static-only artifact with verifiable bytes and no sourcemaps', async () => {
    await fixture(async (directory) => {
      const source = join(directory, 'out');
      await mkdir(join(source, '_next/static'), { recursive: true });
      await writeFile(join(source, 'index.html'), '<html>cloud</html>');
      await writeFile(join(source, '_next/static/app.js'), 'console.log(1)');
      await writeFile(join(source, '_next/static/app.js.map'), 'private source');
      const output = join(directory, 'release/web');
      await prepareWeb(source, output, revision);
      const receipt = JSON.parse(await readFile(join(output, 'release.json'), 'utf8'));
      expect(receipt.revision).toBe(revision);
      expect(receipt.files.map((file: { path: string }) => file.path)).toEqual(['_next/static/app.js', 'index.html']);
      expect(receipt.files[0]).toMatchObject({ bytes: 14, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
      expect(await readdir(join(output, 'site/_next/static'))).toEqual(['app.js']);
      expect(await readFile(join(source, '_next/static/app.js.map'), 'utf8')).toBe('private source');
      await expect(prepareWeb(source, output, revision)).rejects.toThrow();
    });
  });

  it('rejects symlinks and removes an incomplete artifact', async () => {
    await fixture(async (directory) => {
      const source = join(directory, 'out'), output = join(directory, 'release');
      await mkdir(join(source, '_next/static'), { recursive: true });
      await writeFile(join(source, 'index.html'), 'index');
      await symlink(join(source, 'index.html'), join(source, '_next/static/leak.js'));
      await expect(prepareWeb(source, output, revision)).rejects.toThrow('symlink');
      await expect(readdir(output)).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });

  it('awaits asset verification before publishing the mapping and stops on failure', async () => {
    const calls: string[] = [];
    let release!: () => void;
    const uploaded = new Promise<void>((resolve) => { release = resolve; });
    const publication = publishResources(async (script) => {
      calls.push(script);
      if (script.endsWith(':assets')) await uploaded;
    });
    expect(calls).toEqual(['resources:publish:assets']);
    release();
    await publication;
    expect(calls).toEqual(['resources:publish:assets', 'resources:publish:metadata']);
    calls.length = 0;
    await expect(publishResources(async (script) => {
      calls.push(script);
      throw new Error('upload failed');
    })).rejects.toThrow('upload failed');
    expect(calls).toEqual(['resources:publish:assets']);
  });

  it('keeps publishing explicit and resource secrets outside preparation jobs', async () => {
    const workflow = parse(await readFile(join(root, '.github/workflows/cloud-release.yml'), 'utf8'));
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(workflow.on.workflow_dispatch.inputs.publish.default).toBe(false);
    expect(workflow.concurrency['cancel-in-progress']).toBe(false);
    expect(workflow.jobs.backend.uses).toBe('./.github/workflows/docker-image.yml');
    expect(workflow.jobs['publish-resources'].needs).toBe('resources');
    expect(JSON.stringify(workflow.jobs.resources)).not.toContain('secrets.');
    expect(JSON.stringify(workflow.jobs.web)).not.toContain('secrets.');
    const docker = parse(await readFile(join(root, '.github/workflows/docker-image.yml'), 'utf8'));
    expect(docker.jobs['build-and-push'].if).toContain('!inputs.cloud_backend');
    expect(docker.jobs['cloud-backend'].if).toContain('inputs.cloud_backend');
    expect(docker.on.workflow_call.inputs.cloud_backend.default).toBe(false);
    const build = docker.jobs['cloud-backend'].steps.find((step: { id?: string }) => step.id === 'build');
    expect(build.with.file).toBe('deploy/cloud/Dockerfile');
    expect(build.with.push).toBe('${{ inputs.cloud_publish }}');
  });

  it('passes the prepared bundle to app commands and refuses a different release SHA', async () => {
    await fixture(async (directory) => {
      const app = join(directory, 'apps/cloud'), bundle = join(directory, 'bundle');
      await mkdir(app, { recursive: true });
      await writeFile(join(app, 'package.json'), JSON.stringify({
        private: true, type: 'module', packageManager: 'pnpm@10.33.2',
        scripts: {
          'resources:prepare': 'node publisher.ts prepare',
          'resources:publish:assets': 'node publisher.ts assets',
          'resources:publish:metadata': 'node publisher.ts metadata',
        },
      }));
      await writeFile(join(app, 'publisher.ts'), `
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const directory = process.env.OD_CLOUD_RESOURCE_DIR;
const action = process.argv[2];
if (action === 'prepare') writeFileSync(join(directory, 'official-resource-meta.json'), JSON.stringify({ source: process.env.OD_CLOUD_RESOURCE_SOURCE }));
appendFileSync(join(directory, 'calls.txt'), action + '\\n');
`);
      // Corepack bootstraps pnpm from the network outside the workspace. Stub
      // that boundary while still executing the real CLI and fixture scripts.
      const bin = join(directory, 'bin');
      await mkdir(bin);
      const corepack = join(bin, 'corepack');
      await writeFile(corepack, `#!/usr/bin/env node
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const argv = process.argv.slice(2);
assert.equal(argv.length, 5);
assert.deepEqual(argv.slice(0, 4), ['pnpm', '--dir', 'apps/cloud', 'run']);
const cwd = resolve(argv[2]);
const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
const [command, ...args] = pkg.scripts[argv[4]].split(' ');
assert.equal(command, 'node');
execFileSync(process.execPath, args, { cwd, stdio: 'inherit' });
`);
      await chmod(corepack, 0o755);
      const script = join(root, '.github/scripts/cloud/release.ts');
      const env = { ...process.env, OD_CLOUD_RESOURCE_DIR: bundle, GITHUB_SHA: revision,
        PATH: [bin, process.env.PATH].join(delimiter),
        COREPACK_HOME: join(directory, 'corepack-cache'), COREPACK_ENABLE_NETWORK: '0',
        GITHUB_DEFAULT_BRANCH: 'main', GITHUB_REF: 'refs/heads/main',
        FILESYS_PUBLISH_URL: 'https://filesys.invalid', FILESYS_PUBLISH_TOKEN: 'test-only' };
      await exec(process.execPath, [script, 'prepare-resources'], { cwd: directory, env });
      const metadata = JSON.parse(await readFile(join(bundle, 'official-resource-meta.json'), 'utf8'));
      expect(metadata.source).toBe(directory);
      await expect(exec(process.execPath, [script, 'publish-resources'], {
        cwd: directory, env: { ...env, GITHUB_SHA: 'b'.repeat(40) },
      })).rejects.toThrow('does not match');
      expect(await readFile(join(bundle, 'calls.txt'), 'utf8')).toBe('prepare\n');
      await exec(process.execPath, [script, 'publish-resources'], { cwd: directory, env });
      expect(await readFile(join(bundle, 'calls.txt'), 'utf8')).toBe('prepare\nassets\nmetadata\n');
    });
  });
});
