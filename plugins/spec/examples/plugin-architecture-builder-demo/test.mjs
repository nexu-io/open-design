import { mkdtemp, cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPluginLoader } from '/home/workspace/open-design/packages/plugin-runtime/src/plugin_loader.ts';

const source = '/home/workspace/open-design/plugins/spec/examples/plugin-architecture-builder-demo';
const root = await mkdtemp(join(tmpdir(), 'plugin-architecture-builder-demo-'));
await mkdir(join(root, 'plugins'), { recursive: true });
await cp(source, join(root, 'plugins', 'plugin-architecture-builder-demo'), { recursive: true });

const log = [];
const registry = new Map();
const host = {
  register(id, plugin) {
    registry.set(id, plugin);
  },
  unregister(id) {
    registry.delete(id);
  },
  log(message) {
    log.push(message);
  },
};

const loader = createPluginLoader({
  rootDir: root,
  fs: {
    readdir: async (path) => {
      const entries = await import('node:fs/promises').then((m) => m.readdir(path, { withFileTypes: true }));
      return entries;
    },
    readFile: async (path) => readFile(path, 'utf8'),
    stat: async (path) => import('node:fs/promises').then((m) => m.stat(path)),
    rm: async (path, options) => rm(path, options),
  },
  loadModule: async (entryPoint) => {
    const mod = await import(entryPoint);
    return mod.default;
  },
  host,
});

const discovered = await loader.discover();
if (discovered.manifests.length !== 1) throw new Error(`expected 1 manifest, got ${discovered.manifests.length}`);

const loadResult = await loader.load_all();
if (loadResult.loaded.join(',') !== 'plugin-architecture-builder-demo') throw new Error(`load failed: ${JSON.stringify(loadResult)}`);

const plugin = registry.get('plugin-architecture-builder-demo');
if (!plugin) throw new Error('plugin not registered');
const output = plugin.run('  hello  ');
if (output !== 'demo:hello') throw new Error(`unexpected run output: ${output}`);

await loader.disable('plugin-architecture-builder-demo');
if (registry.has('plugin-architecture-builder-demo')) throw new Error('disable did not unregister plugin');

const reenabled = await loader.enable('plugin-architecture-builder-demo');
if (!reenabled.ok) throw new Error(`enable failed: ${reenabled.reason}`);
if (!registry.has('plugin-architecture-builder-demo')) throw new Error('enable did not re-register plugin');

await loader.uninstall('plugin-architecture-builder-demo');
if (registry.has('plugin-architecture-builder-demo')) throw new Error('uninstall did not clear registry entry');
const existsAfterUninstall = await import('node:fs/promises').then((m) => m.stat(join(root, 'plugins', 'plugin-architecture-builder-demo')).then(() => true).catch(() => false));
if (existsAfterUninstall) throw new Error('uninstall did not remove files');

console.log('PASS load -> use -> disable -> enable -> uninstall');
console.log(JSON.stringify({ log }, null, 2));
