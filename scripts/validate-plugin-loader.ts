import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { createPluginLoader, validate_manifest, type PluginLoaderFsEntry, type PluginLoaderFsStat } from '../packages/plugin-runtime/src/plugin_loader.ts';

type ManifestEntry = {
  path: string;
  folder: string;
  data: Record<string, unknown>;
};

const rootDir = resolve(process.argv[2] ?? process.cwd());
const pluginsRoot = join(rootDir, 'plugins');

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function collectManifests(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectManifests(abs)));
      continue;
    }
    if (entry.isFile() && entry.name === 'manifest.json') out.push(abs);
  }
  return out;
}

function fileMentionsFsOrNetwork(src: string): { fs: boolean; network: boolean } {
  return {
    fs: /(?:\bfrom\s+['"]node:fs|from\s+['"]fs['"]|\bfs\.\w+|\breadFile\b|\bwriteFile\b|\breaddir\b|\brm\b)/.test(src),
    network: /(?:\bfetch\s*\(|\bnew\s+WebSocket\b|\bhttps?:\/\/|\bhttp:\/\/|\bXMLHttpRequest\b)/.test(src),
  };
}

async function main() {
  if (!(await exists(pluginsRoot))) {
    console.log(`stage=1 skipped reason=missing plugins root root=${pluginsRoot}`);
    process.exit(0);
  }

  const manifestPaths = await collectManifests(pluginsRoot);
  const manifestEntries: ManifestEntry[] = [];

  console.log(`stage=1 ok plugins=${manifestPaths.length}`);

  for (const path of manifestPaths) {
    const raw = await readFile(path, 'utf8');
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      console.error(`stage=2 fail path=${path} reason=invalid-json ${(error as Error).message}`);
      process.exit(1);
    }
    const validated = validate_manifest(data);
    if (!validated.ok) {
      console.error(`stage=2 fail path=${path} reason=${validated.errors.join('; ')}`);
      process.exit(1);
    }
    manifestEntries.push({ path, folder: dirname(path), data });
  }
  console.log(`stage=2 ok manifests=${manifestEntries.length}`);

  for (const manifest of manifestEntries) {
    const entryPoint = String(manifest.data.entry_point);
    const entryPath = resolve(manifest.folder, entryPoint);
    const src = await readFile(entryPath, 'utf8');
    const detected = fileMentionsFsOrNetwork(src);
    const permissions = new Set(Array.isArray(manifest.data.permissions) ? manifest.data.permissions.map(String) : []);
    if (detected.fs && !permissions.has('filesystem')) {
      console.error(`stage=3 fail path=${manifest.path} reason=filesystem access not declared`);
      process.exit(1);
    }
    if (detected.network && !permissions.has('network')) {
      console.error(`stage=3 fail path=${manifest.path} reason=network access not declared`);
      process.exit(1);
    }
  }
  console.log('stage=3 ok');

  for (const manifest of manifestEntries) {
    const permissions = new Set(Array.isArray(manifest.data.permissions) ? manifest.data.permissions.map(String) : []);
    if (!permissions.has('ui')) continue;
    const readmePath = join(manifest.folder, 'README.md');
    const htmlPath = join(manifest.folder, 'preview', 'index.html');
    let content = '';
    if (await exists(readmePath)) content += await readFile(readmePath, 'utf8');
    if (await exists(htmlPath)) content += await readFile(htmlPath, 'utf8');
    if (!/(aria-label=|aria-labelledby=|role=|<label\b)/i.test(content)) {
      console.error(`stage=4 fail path=${manifest.path} reason=ui plugin lacks accessible labels`);
      process.exit(1);
    }
  }
  console.log('stage=4 ok');

  const loader = createPluginLoader({
    rootDir,
    fs: {
      readdir: async (path: string) => (await readdir(path, { withFileTypes: true })) as unknown as PluginLoaderFsEntry[],
      readFile: async (path: string) => readFile(path, 'utf8'),
      stat: async (path: string) => (await stat(path)) as unknown as PluginLoaderFsStat,
      rm: async (path: string, options?: { recursive?: boolean; force?: boolean }) => {
        await import('node:fs/promises').then((m) => m.rm(path, options));
      },
    },
    loadModule: async (entryPoint: string) => (await import(entryPoint)).default,
    host: {
      register() {},
      unregister() {},
      log() {},
    },
  });

  const smoke = await loader.load_all();
  if (smoke.errors.length > 0) {
    console.error(`stage=5 fail reason=${smoke.errors.join('; ')}`);
    process.exit(1);
  }
  console.log(`stage=5 ok loaded=${smoke.loaded.length} skipped=${smoke.skipped.length}`);
}

main().catch((error) => {
  console.error(`validate-plugin-loader crashed: ${(error as Error).stack ?? (error as Error).message}`);
  process.exit(1);
});
