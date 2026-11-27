import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type Component = 'web' | 'backend' | 'resources';
const resourceScripts = ['resources:prepare', 'resources:publish:assets', 'resources:publish:metadata'];

export function components(target: string): Component[] {
  if (target === 'all') return ['web', 'backend', 'resources'];
  if (target === 'web' || target === 'backend' || target === 'resources') return [target];
  throw new Error(`Unknown cloud release target: ${target}`);
}

export async function checkCloudApp(root: string, component: 'backend' | 'resources') {
  const file = join(root, 'apps/cloud/package.json');
  let pkg: { scripts?: Record<string, string> };
  try { pkg = JSON.parse(await readFile(file, 'utf8')); }
  catch { throw new Error('apps/cloud/package.json is required; land the cloud backend before running this target.'); }
  for (const script of component === 'backend' ? ['build', 'start'] : resourceScripts) {
    if (!pkg.scripts?.[script]?.trim()) throw new Error(`apps/cloud must provide the ${script} script (see docs/deployment/cloud-ci.md).`);
  }
}

export function checkPublication(env: NodeJS.ProcessEnv, selected: Component[]) {
  if (env.CLOUD_PUBLISH !== 'true') return;
  if (!env.GITHUB_DEFAULT_BRANCH || env.GITHUB_REF !== `refs/heads/${env.GITHUB_DEFAULT_BRANCH}`) {
    throw new Error('Cloud publication is only allowed from the default branch.');
  }
  if (selected.includes('web')) {
    throw new Error('Cloudflare deployment is a placeholder. Use publish=false to build the static artifact; wire Cloudflare before publishing web/all.');
  }
}

/** Stage only static browser files. Sourcemaps never leave the build job. */
export async function prepareWeb(source: string, output: string, revision: string) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('A full source commit SHA is required.');
  if (!(await lstat(join(source, 'index.html'))).isFile()
    || !(await lstat(join(source, '_next/static'))).isDirectory()) throw new Error('Expected a Next.js static export.');
  // A fresh output prevents stale chunks from leaking into a release.
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output, { recursive: false });
  const files: { path: string; bytes: number; sha256: string }[] = [];
  async function visit(relative: string) {
    for (const entry of await readdir(join(source, relative), { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Static export contains a symlink: ${path}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && !path.endsWith('.map')) {
        const bytes = await readFile(join(source, path));
        await mkdir(dirname(join(output, 'site', path)), { recursive: true });
        await cp(join(source, path), join(output, 'site', path), { recursive: false });
        files.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
      }
    }
  }
  try {
    await visit('');
    if (!files.some((file) => file.path.startsWith('_next/static/'))) throw new Error('Static export has no browser chunks.');
    files.sort((a, b) => a.path.localeCompare(b.path));
    await writeFile(join(output, 'release.json'), JSON.stringify({ schemaVersion: 1, revision, files }, null, 2) + '\n');
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}

export async function publishResources(run: (script: string) => void | Promise<void>) {
  // The app's asset command must verify remote upload receipts before returning.
  // A failed upload must never expose a catalogue that references missing files.
  await run('resources:publish:assets');
  await run('resources:publish:metadata');
}

async function main() {
  const root = process.cwd();
  const [action, target] = process.argv.slice(2);
  const runResource = (script: string) => {
    execFileSync('corepack', ['pnpm', '--dir', 'apps/cloud', 'run', script], { cwd: root, stdio: 'inherit' });
  };
  if (action === 'check') {
    const selected = components(target ?? 'all');
    checkPublication(process.env, selected);
    for (const component of selected) if (component !== 'web') await checkCloudApp(root, component);
  } else if (action === 'prepare-web') {
    await prepareWeb(join(root, 'apps/web/out'), join(root, '.tmp/cloud-web'), process.env.GITHUB_SHA ?? '');
  } else if (action === 'prepare-resources' || action === 'publish-resources') {
    await checkCloudApp(root, 'resources');
    const directory = process.env.OD_CLOUD_RESOURCE_DIR;
    if (!directory || !/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? '')) {
      throw new Error('OD_CLOUD_RESOURCE_DIR and a full GITHUB_SHA are required.');
    }
    process.env.OD_CLOUD_RESOURCE_DIR = resolve(directory);
    process.env.OD_CLOUD_RESOURCE_SOURCE = root;
    process.env.OD_CLOUD_RESOURCE_REVISION = process.env.GITHUB_SHA;
    if (action === 'prepare-resources') {
      await mkdir(dirname(resolve(directory)), { recursive: true });
      await mkdir(resolve(directory), { recursive: false });
      runResource('resources:prepare');
      if (!(await lstat(join(directory, 'official-resource-meta.json'))).isFile()) {
        throw new Error('Resource preparation must produce official-resource-meta.json.');
      }
      await writeFile(join(directory, 'ci-source.json'), JSON.stringify({ revision: process.env.GITHUB_SHA }) + '\n');
    } else {
      checkPublication({ ...process.env, CLOUD_PUBLISH: 'true' }, ['resources']);
      const receipt = JSON.parse(await readFile(join(directory, 'ci-source.json'), 'utf8'));
      if (receipt.revision !== process.env.GITHUB_SHA) throw new Error('Resource bundle does not match this release commit.');
      const url = new URL(process.env.FILESYS_PUBLISH_URL ?? '');
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
        throw new Error('FILESYS_PUBLISH_URL must be an HTTPS origin without credentials.');
      }
      if (!process.env.FILESYS_PUBLISH_TOKEN) throw new Error('FILESYS_PUBLISH_TOKEN is required.');
      await publishResources(runResource);
    }
  } else throw new Error('Usage: release.ts check <web|backend|resources|all> | prepare-web | prepare-resources | publish-resources');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
