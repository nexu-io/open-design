import { mkdtemp, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPluginLoader, validate_manifest } from '../src/plugin_loader';

async function makeLoader(rootDir: string) {
  const registry = new Map<string, unknown>();
  const host = {
    register(id: string, plugin: unknown) {
      registry.set(id, plugin);
    },
    unregister(id: string) {
      registry.delete(id);
    },
    log() {},
  };

  return {
    registry,
    loader: createPluginLoader({
      rootDir,
      fs: {
        readdir: async (path) => import('node:fs/promises').then((m) => m.readdir(path, { withFileTypes: true })),
        readFile: async (path) => readFile(path, 'utf8'),
        stat: async (path) => import('node:fs/promises').then((m) => m.stat(path)),
        rm: async (path, options) => rm(path, options),
      },
      loadModule: async (entryPoint) => (await import(entryPoint)).default,
      host,
    }),
  };
}

describe('plugin loader hardening', () => {
  it('rejects duplicate ids, unsafe entry points, and invalid dependency ranges', async () => {
    expect(validate_manifest({
      id: 'demo',
      name: 'Demo',
      version: '1.0.0',
      entry_point: '../index.ts',
      permissions: ['filesystem'],
      dependencies: { core: 'banana' },
    }).ok).toBe(false);

    const root = await mkdtemp(join(tmpdir(), 'plugin-loader-hardening-'));
    await mkdir(join(root, 'plugins', 'one'), { recursive: true });
    await mkdir(join(root, 'plugins', 'two'), { recursive: true });
    await writeFile(join(root, 'plugins', 'one', 'manifest.json'), JSON.stringify({
      id: 'dup',
      name: 'One',
      version: '1.0.0',
      entry_point: './index.ts',
      permissions: [],
      dependencies: { core: '^1.0.0' },
    }));
    await writeFile(join(root, 'plugins', 'two', 'manifest.json'), JSON.stringify({
      id: 'dup',
      name: 'Two',
      version: '1.0.0',
      entry_point: './index.ts',
      permissions: [],
      dependencies: { core: '^1.0.0' },
    }));
    await writeFile(join(root, 'plugins', 'one', 'index.ts'), 'export default { register() {}, unregister() {} };');
    await writeFile(join(root, 'plugins', 'two', 'index.ts'), 'export default { register() {}, unregister() {} };');

    const { loader } = await makeLoader(root);
    const discovered = await loader.discover();
    expect(discovered.manifests).toHaveLength(1);
    expect(discovered.errors.some((error) => error.includes('duplicate manifest id'))).toBe(true);
  });

  it('loads, disables, re-enables, and uninstalls the demo plugin', async () => {
    const source = '/home/workspace/open-design/plugins/spec/examples/plugin-architecture-builder-demo';
    const root = await mkdtemp(join(tmpdir(), 'plugin-loader-demo-'));
    await mkdir(join(root, 'plugins'), { recursive: true });
    await cp(source, join(root, 'plugins', 'plugin-architecture-builder-demo'), { recursive: true });

    const { loader, registry } = await makeLoader(root);
    const smoke = await loader.selfTest();
    expect(smoke.loaded).toEqual(['plugin-architecture-builder-demo']);

    const plugin = registry.get('plugin-architecture-builder-demo') as { run(input: string): string };
    expect(plugin.run('  hello  ')).toBe('demo:hello');

    await loader.disable('plugin-architecture-builder-demo');
    expect(registry.has('plugin-architecture-builder-demo')).toBe(false);

    const enabled = await loader.enable('plugin-architecture-builder-demo');
    expect(enabled.ok).toBe(true);
    expect(registry.has('plugin-architecture-builder-demo')).toBe(true);

    await loader.uninstall('plugin-architecture-builder-demo');
    expect(registry.has('plugin-architecture-builder-demo')).toBe(false);
    await expect(import('node:fs/promises').then((m) => m.stat(join(root, 'plugins', 'plugin-architecture-builder-demo')))).rejects.toBeTruthy();
  });
});
