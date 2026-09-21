/**
 * The entry file is a project attribute that names a path, and the path has to
 * keep naming a file. Two ordinary file mutations can break that: a rename of
 * the entry, and a delete of the entry or of a folder that contains it. These
 * helpers say what the attribute becomes after each one, so every route that
 * moves or removes project files carries the attribute along instead of
 * leaving the preview, exports, shares and external agents pointed at a path
 * that no longer exists.
 *
 * `undefined` means "unchanged"; a string is the new entry; `null` clears the
 * record, which puts the project back on inference exactly as a project that
 * never recorded an entry.
 */

function normalizeProjectPath(value: string): string {
  return value
    .replaceAll('\\', '/')
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function recordedEntry(entryFile: unknown): string | null {
  if (typeof entryFile !== 'string') return null;
  const normalized = normalizeProjectPath(entryFile);
  return normalized.length > 0 ? normalized : null;
}

function isInsideFolder(filePath: string, folderPath: string): boolean {
  return folderPath.length > 0 && filePath.startsWith(`${folderPath}/`);
}

/** The recorded entry after `oldPath` was renamed to `newPath`. */
export function entryFileAfterRename(
  entryFile: unknown,
  oldPath: string,
  newPath: string,
): string | undefined {
  const recorded = recordedEntry(entryFile);
  if (!recorded) return undefined;
  const from = normalizeProjectPath(oldPath);
  const to = normalizeProjectPath(newPath);
  if (recorded !== from || from === to || to.length === 0) return undefined;
  return to;
}

/**
 * The recorded entry after `deletedPath` was removed: cleared when the entry
 * was that file, or lived under that folder.
 */
export function entryFileAfterDelete(
  entryFile: unknown,
  deletedPath: string,
  target: 'file' | 'folder',
): null | undefined {
  const recorded = recordedEntry(entryFile);
  if (!recorded) return undefined;
  const deleted = normalizeProjectPath(deletedPath);
  if (deleted.length === 0) return undefined;
  if (recorded === deleted) return null;
  if (target === 'folder' && isInsideFolder(recorded, deleted)) return null;
  return undefined;
}

/** Project metadata with the entry record replaced, or removed for `null`. */
export function metadataWithEntryFile<T extends { entryFile?: unknown }>(
  metadata: T | null | undefined,
  entryFile: string | null,
): Omit<T, 'entryFile'> & { entryFile?: string } {
  const source: T = metadata ?? ({ kind: 'prototype' } as unknown as T);
  const { entryFile: _previous, ...rest } = source;
  return entryFile === null ? rest : { ...rest, entryFile };
}
