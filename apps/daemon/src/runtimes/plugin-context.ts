import fs from 'node:fs';
import path from 'node:path';

export interface PluginContextEntry {
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
  isSymbolicLink: () => boolean;
}

export interface PluginContextFileSystem {
  realpath: (target: string) => Promise<string>;
  stat: (target: string) => Promise<{ isDirectory: () => boolean }>;
  readdir: (target: string) => Promise<readonly PluginContextEntry[]>;
  mkdir: (target: string, options: { recursive: true }) => Promise<unknown>;
  copyFile: (source: string, destination: string) => Promise<unknown>;
}

export interface PluginContextPath {
  join: (...parts: string[]) => string;
  dirname: (target: string) => string;
  sep: string;
}

export interface PluginContextCopierDependencies {
  fileSystem: PluginContextFileSystem;
  path: PluginContextPath;
}

const SKIP_DIRS = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.od',
  '.output',
  '.tmp',
  '.turbo',
  '.venv',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
  'vendor',
]);

const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db']);

export function shouldSkipPluginContextEntry(name: string): boolean {
  return SKIP_DIRS.has(name) || SKIP_FILES.has(name);
}

export function createPluginContextCopier(
  dependencies: PluginContextCopierDependencies,
): (sourceRoot: string, destRoot: string) => Promise<void> {
  const { fileSystem, path: pathOps } = dependencies;

  async function copyFolder(sourceRoot: string, destRoot: string): Promise<void> {
    const rootReal = await fileSystem.realpath(sourceRoot);
    const stat = await fileSystem.stat(rootReal);
    if (!stat.isDirectory()) {
      const error = new Error('plugin source path is not a directory') as NodeJS.ErrnoException;
      error.code = 'ENOTDIR';
      throw error;
    }
    await copyDirectory(rootReal, destRoot, rootReal);
  }

  async function copyDirectory(src: string, dest: string, rootReal: string): Promise<void> {
    await fileSystem.mkdir(dest, { recursive: true });
    const entries = await fileSystem.readdir(src);
    for (const entry of entries) {
      if (shouldSkipPluginContextEntry(entry.name) || entry.isSymbolicLink()) continue;

      const from = pathOps.join(src, entry.name);
      const to = pathOps.join(dest, entry.name);
      if (entry.isDirectory()) {
        const childReal = await fileSystem.realpath(from).catch(() => null);
        if (!childReal || (childReal !== rootReal && !childReal.startsWith(rootReal + pathOps.sep))) {
          continue;
        }
        await copyDirectory(childReal, to, rootReal);
        continue;
      }
      if (!entry.isFile()) continue;
      await fileSystem.mkdir(pathOps.dirname(to), { recursive: true });
      await fileSystem.copyFile(from, to);
    }
  }

  return copyFolder;
}

const nodeFileSystem: PluginContextFileSystem = {
  realpath: (target) => fs.promises.realpath(target),
  stat: (target) => fs.promises.stat(target),
  readdir: async (target) => fs.promises.readdir(target, { withFileTypes: true }),
  mkdir: (target, options) => fs.promises.mkdir(target, options),
  copyFile: (source, destination) => fs.promises.copyFile(source, destination),
};

export const copyPluginFolderForProjectContext = createPluginContextCopier({
  fileSystem: nodeFileSystem,
  path,
});
