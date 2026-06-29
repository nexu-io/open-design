import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

export interface PluginInstallResult {
  ok: boolean;
  plugin: InstalledPluginLike | null;
  warnings: unknown[];
  message: string;
  log: string[];
}

export interface PluginInstallationHelpersDeps {
  db: PluginDbLike;
  installFromLocalFolder: (db: PluginDbLike, args: InstallFromLocalFolderArgs) => AsyncIterable<InstallFromLocalFolderEvent>;
  PLUGIN_REGISTRY_ROOTS: string[];
  PLUGIN_LOCKFILE_PATH: string;
  PLUGIN_UPLOAD_MAX_BYTES: number;
}

interface PluginDbLike {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
}

interface InstalledPluginLike {
  title?: string;
  [key: string]: unknown;
}

interface InstallFromLocalFolderArgs {
  source: string;
  roots: string[];
  _stagedFolder: string;
  _stagedSourceKind: string;
  lockfilePath: string;
}

interface InstallFromLocalFolderEvent {
  kind?: string;
  message?: string;
  warnings?: unknown[];
  plugin?: InstalledPluginLike;
}

export function normalizeProjectPluginFolderPath(input: unknown) {
  const value = String(input ?? '').replace(/\\/g, '/').trim();
  if (!value || value.includes('\0') || value.startsWith('/') || /^[A-Za-z]:\//.test(value)) {
    throw new Error('plugin folder path must be a relative project path');
  }
  const parts = value.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
    throw new Error('plugin folder path must not contain traversal segments');
  }
  return parts.join('/');
}

export async function resolveProjectChildDirectory(projectRoot: string, relativePath: string) {
  const rootReal = await fs.promises.realpath(projectRoot);
  const candidate = path.resolve(projectRoot, relativePath);
  const real = await fs.promises.realpath(candidate);
  if (!real.startsWith(rootReal + path.sep) && real !== rootReal) {
    throw new Error('plugin folder path escapes project dir');
  }
  const st = await fs.promises.stat(real);
  if (!st.isDirectory()) {
    const err: NodeJS.ErrnoException = new Error('plugin folder path is not a directory');
    err.code = 'ENOTDIR';
    throw err;
  }
  return real;
}

export async function folderLooksLikePlugin(folder: string) {
  const names = ['open-design.json', 'SKILL.md', path.join('.claude-plugin', 'plugin.json')];
  for (const name of names) {
    if (fs.existsSync(path.join(folder, name))) return true;
  }
  return false;
}

export async function findUploadedPluginRoot(stagedFolder: string) {
  if (await folderLooksLikePlugin(stagedFolder)) return stagedFolder;
  const entries = await fs.promises.readdir(stagedFolder, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory());
  const files = entries.filter((entry) => entry.isFile());
  if (files.length === 0 && dirs.length === 1) {
    const nested = path.join(stagedFolder, dirs[0]!.name);
    if (await folderLooksLikePlugin(nested)) return nested;
  }
  return stagedFolder;
}

export function safeUploadRelativePath(input: unknown) {
  const value = String(input || '').replace(/\\/g, '/');
  if (!value || value.includes('\0') || value.startsWith('/') || /^[A-Za-z]:\//.test(value)) {
    throw new Error('invalid upload path');
  }
  const parts = value.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
    throw new Error(`unsafe upload path: ${value}`);
  }
  return parts.join(path.sep);
}

export async function extractPluginZipToFolder(buffer: Buffer, stagedFolder: string, maxBytes: number) {
  if (buffer.length > maxBytes) throw new Error('zip file too large');
  const zip = await JSZip.loadAsync(buffer);
  let totalBytes = 0;
  const entries = Object.values(zip.files);
  if (entries.length === 0) throw new Error('zip contains no files');
  for (const entry of entries) {
    if (entry.dir) continue;
    const rel = safeUploadRelativePath(entry.name);
    const unixMode = typeof entry.unixPermissions === 'number' ? entry.unixPermissions : 0;
    if ((unixMode & 0o170000) === 0o120000) throw new Error(`zip entry is a symbolic link: ${entry.name}`);
    const content = await entry.async('nodebuffer');
    totalBytes += content.length;
    if (totalBytes > maxBytes) throw new Error('zip extracted size exceeds 50 MiB');
    const dest = path.join(stagedFolder, rel);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.writeFile(dest, content);
  }
}

export function createPluginInstallationHelpers(deps: PluginInstallationHelpersDeps) {
  async function finishUploadedPluginInstall(stagedFolder: string, source: string): Promise<PluginInstallResult> {
    const warnings: unknown[] = [];
    const log: string[] = [];
    let plugin = null;
    let message = 'Install finished.';
    try {
      const pluginRoot = await findUploadedPluginRoot(stagedFolder);
      for await (const ev of deps.installFromLocalFolder(deps.db, {
        source,
        roots: deps.PLUGIN_REGISTRY_ROOTS,
        _stagedFolder: pluginRoot,
        _stagedSourceKind: 'user',
        lockfilePath: deps.PLUGIN_LOCKFILE_PATH,
      })) {
        if (ev.message) log.push(ev.message);
        if (Array.isArray(ev.warnings)) warnings.splice(0, warnings.length, ...ev.warnings);
        if (ev.kind === 'success') {
          if (!ev.plugin) continue;
          plugin = ev.plugin;
          message = `Installed ${ev.plugin.title ?? 'plugin'}.`;
          break;
        }
        if (ev.kind === 'error') {
          message = ev.message ?? 'Install failed.';
          break;
        }
      }
      return { ok: Boolean(plugin), plugin, warnings, message, log };
    } finally {
      await fs.promises.rm(stagedFolder, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async function stageUploadedPluginZip(buffer: Buffer, source: string) {
    const stagedFolder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'od-plugin-zip-'));
    await extractPluginZipToFolder(buffer, stagedFolder, deps.PLUGIN_UPLOAD_MAX_BYTES);
    return finishUploadedPluginInstall(stagedFolder, source);
  }

  async function stageUploadedPluginFolder(files: Array<{ buffer: Buffer; originalname: string }>, rawPaths: unknown) {
    const stagedFolder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'od-plugin-folder-'));
    try {
      if (files.length === 0) return null;
      const paths = Array.isArray(rawPaths) ? rawPaths : rawPaths ? [rawPaths] : [];
      let totalBytes = 0;
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i]!;
        totalBytes += file.buffer.length;
        if (totalBytes > deps.PLUGIN_UPLOAD_MAX_BYTES) throw new Error('folder upload exceeds 50 MiB');
        const rel = safeUploadRelativePath(paths[i] || file.originalname);
        const dest = path.join(stagedFolder, rel);
        await fs.promises.mkdir(path.dirname(dest), { recursive: true });
        await fs.promises.writeFile(dest, file.buffer);
      }
      return await finishUploadedPluginInstall(stagedFolder, 'upload:folder');
    } catch (err) {
      await fs.promises.rm(stagedFolder, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
  }

  return { finishUploadedPluginInstall, stageUploadedPluginZip, stageUploadedPluginFolder };
}
