export interface PluginLoaderFsEntry {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

export interface PluginLoaderFsStat {
  isDirectory(): boolean;
  isFile(): boolean;
}

export interface PluginLoaderFs {
  readdir(path: string): Promise<PluginLoaderFsEntry[]>;
  readFile(path: string): Promise<string>;
  stat(path: string): Promise<PluginLoaderFsStat>;
  rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
}

export interface PluginLoaderHost {
  register(id: string, plugin: PluginModule): void;
  unregister(id: string): void;
  log(message: string): void;
}

export interface PluginModule {
  register(host: PluginLoaderHost): void | Promise<void>;
  unregister(host: PluginLoaderHost): void | Promise<void>;
}

export interface PluginManifestShape {
  id: string;
  name: string;
  version: string;
  entry_point: string;
  permissions: string[];
  dependencies: Record<string, string>;
  source_dir?: string;
}

export interface LoadedPluginRecord {
  manifest: PluginManifestShape;
  module: PluginModule;
  enabled: boolean;
}

export interface DiscoverResult {
  manifests: PluginManifestShape[];
  errors: string[];
}

export interface LoadResult {
  loaded: string[];
  skipped: Array<{ id: string; reason: string }>;
  errors: string[];
}

const PERMISSIONS = new Set([
  'filesystem',
  'network',
  'ui',
  'assets',
  'design-system',
  'skills',
  'integrations',
  'automations',
  'background-service',
]);

const SEMVER_RANGE = /^(?:\^|~|>=|<=|>|<)?\s*[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\s*(?:\|\||\s)\s*(?:\^|~|>=|<=|>|<)?\s*[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validate_manifest(value: unknown): { ok: true; manifest: PluginManifestShape } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['manifest must be an object'] };

  const requiredKeys: Array<keyof PluginManifestShape> = ['id', 'name', 'version', 'entry_point', 'permissions', 'dependencies'];
  for (const key of requiredKeys) {
    if (!(key in value)) errors.push(`missing required field: ${key}`);
  }
  if (errors.length > 0) return { ok: false, errors };

  const id = value.id;
  const name = value.name;
  const version = value.version;
  const entry_point = value.entry_point;
  const permissions = value.permissions;
  const dependencies = value.dependencies;

  if (typeof id !== 'string' || !id.trim()) errors.push('id must be a non-empty string');
  if (typeof name !== 'string' || !name.trim()) errors.push('name must be a non-empty string');
  if (typeof version !== 'string' || !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) errors.push('version must be semver');
  if (typeof entry_point !== 'string' || !entry_point.trim()) errors.push('entry_point must be a non-empty string');
  if (typeof entry_point === 'string' && (entry_point.startsWith('/') || entry_point.includes('\\') || entry_point.includes('..'))) {
    errors.push('entry_point must be a relative path inside the plugin folder');
  }
  if (!Array.isArray(permissions) || permissions.some((permission) => typeof permission !== 'string' || !PERMISSIONS.has(permission))) {
    errors.push('permissions must be an array of allowlisted values');
  } else if (new Set(permissions).size !== permissions.length) {
    errors.push('permissions must not contain duplicates');
  }
  if (!isRecord(dependencies)) {
    errors.push('dependencies must be an object');
  } else {
    for (const [depId, range] of Object.entries(dependencies)) {
      if (depId !== 'core' && !depId.trim()) errors.push('dependency keys must be non-empty strings or "core"');
      if (typeof range !== 'string' || !range.trim() || !SEMVER_RANGE.test(range.trim())) {
        errors.push(`dependency range for ${depId} must be a semver range`);
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  const allowedPermissions = permissions as string[];
  return {
    ok: true,
    manifest: {
      id: String(id),
      name: String(name),
      version: String(version),
      entry_point: String(entry_point),
      permissions: [...allowedPermissions],
      dependencies: { ...(dependencies as Record<string, string>) },
    },
  };
}

export function createPluginLoader(opts: {
  rootDir: string;
  fs: PluginLoaderFs;
  loadModule(entryPoint: string): Promise<PluginModule>;
  host: PluginLoaderHost;
}) {
  const records = new Map<string, LoadedPluginRecord>();
  const disabled = new Set<string>();

  async function discoverManifests(dir: string, out: string[]): Promise<void> {
    const entries = await opts.fs.readdir(dir);
    for (const entry of entries) {
      const abs = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        await discoverManifests(abs, out);
        continue;
      }
      if (entry.isFile() && entry.name === 'manifest.json') out.push(abs);
    }
  }

  async function discover(): Promise<DiscoverResult> {
    const manifests: PluginManifestShape[] = [];
    const errors: string[] = [];
    const manifestPaths: string[] = [];
    const seenIds = new Map<string, string>();
    await discoverManifests(`${opts.rootDir}/plugins`, manifestPaths);
    for (const manifestPath of manifestPaths) {
      try {
        const raw = await opts.fs.readFile(manifestPath);
        const parsed = JSON.parse(raw) as unknown;
        const validated = validate_manifest(parsed);
        if (!validated.ok) {
          errors.push(`${manifestPath}: ${validated.errors.join('; ')}`);
          continue;
        }
        const prior = seenIds.get(validated.manifest.id);
        if (prior) {
          errors.push(`${manifestPath}: duplicate manifest id '${validated.manifest.id}' also defined at ${prior}`);
          continue;
        }
        seenIds.set(validated.manifest.id, manifestPath);
        manifests.push({ ...validated.manifest, source_dir: manifestPath.slice(0, -'/manifest.json'.length) });
      } catch (error) {
        errors.push(`${manifestPath}: ${(error as Error).message}`);
      }
    }
    return { manifests, errors };
  }

  async function load(manifest: PluginManifestShape): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      if (!manifest.source_dir) throw new Error('manifest.source_dir is required for loading');
      const entryPoint = manifest.source_dir
        ? `${manifest.source_dir}/${manifest.entry_point.replace(/^\.\//, '')}`
        : manifest.entry_point;
      const entryPath = entryPoint.includes('..') ? '' : entryPoint;
      if (!entryPath) throw new Error('entry_point escapes the plugin folder');
      const plugin = await opts.loadModule(entryPath);
      await plugin.register(opts.host);
      opts.host.register(manifest.id, plugin);
      records.set(manifest.id, { manifest, module: plugin, enabled: true });
      disabled.delete(manifest.id);
      return { ok: true };
    } catch (error) {
      const reason = (error as Error).message;
      opts.host.log(`plugin load failed for ${manifest.id}: ${reason}`);
      return { ok: false, reason };
    }
  }

  async function load_all(): Promise<LoadResult> {
    const discovered = await discover();
    const loaded: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    const errors = [...discovered.errors];
    for (const manifest of discovered.manifests) {
      if (disabled.has(manifest.id)) {
        skipped.push({ id: manifest.id, reason: 'disabled' });
        continue;
      }
      const result = await load(manifest);
      if (result.ok) loaded.push(manifest.id);
      else skipped.push({ id: manifest.id, reason: result.reason });
    }
    return { loaded, skipped, errors };
  }

  async function disable(id: string): Promise<void> {
    const record = records.get(id);
    if (!record) {
      disabled.add(id);
      return;
    }
    try {
      await record.module.unregister(opts.host);
    } finally {
      opts.host.unregister(id);
      record.enabled = false;
      disabled.add(id);
      records.set(id, record);
    }
  }

  async function enable(id: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    disabled.delete(id);
    const discovered = await discover();
    const manifest = discovered.manifests.find((entry) => entry.id === id);
    if (!manifest) return { ok: false, reason: 'manifest not found' };
    const existing = records.get(id);
    if (existing?.enabled) return { ok: true };
    return load(manifest);
  }

  async function uninstall(id: string): Promise<void> {
    await disable(id);
    const target = `${opts.rootDir}/plugins/${id}`;
    await opts.fs.rm(target, { recursive: true, force: true });
    records.delete(id);
    disabled.delete(id);
  }

  async function selfTest(): Promise<{ loaded: string[]; errors: string[]; skipped: Array<{ id: string; reason: string }> }> {
    return load_all();
  }

  return { discover, validate_manifest, load, load_all, disable, enable, uninstall, selfTest };
}
