/** @module core/ignored-dirs
 * Ignored-directory policy shared by project file listing, archiving, and watching.
 * Pure data + one predicate; imports nothing, so both core/projects.ts and watchers/ can depend on it without creating edges.
 */

/**
 * Directory names that should not be listed or watched for folder-backed
 * projects. These are generated, installed, or cache trees that add file
 * descriptor pressure without adding useful design context. All entries are
 * stored lower-cased; match against a lower-cased candidate.
 */
export const IGNORED_PROJECT_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  'vendor',
  '.od',
  'debug',
  'dist',
  'build',
  '.build',
  'deriveddata',
  'target',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.output',
  'out',
  'coverage',
  '.gradle',
  '.swiftpm',
  '.tmp',
  '.venv',
  'venv',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
  '.tox',
  '.ruff_cache',
].map((name) => name.toLowerCase()));

/**
 * Case-insensitive test for whether a single directory name belongs to the
 * ignored set. Also catches Xcode's `DerivedData-<hash>` variants, which
 * can't be enumerated in the static set.
 *
 * @param name Directory basename (one path segment, not a full path).
 * @returns `true` when the directory must be skipped by listing/watching.
 */
export function isIgnoredProjectDirName(name: unknown): boolean {
  const normalized = String(name).toLowerCase();
  return (
    IGNORED_PROJECT_DIR_NAMES.has(normalized) ||
    normalized.startsWith('deriveddata-')
  );
}
