/**
 * Whether a project already contains something an edit can target.
 *
 * This exists for exactly one caller: the chat prompt composer's direct-edit
 * fast path (`detectEditIntentSignal` in `../prompts/system.ts`). Edit
 * vocabulary alone is not enough to choose that path — "add a pricing section
 * to the landing page" reads as an edit but is a new build when the project is
 * empty. Requiring a real artifact on disk keeps the fast path from stripping
 * the discovery/plan workflow out of a genuine build request.
 *
 * Deliberately shallow and cheap: two levels, a bounded entry count, hidden and
 * dependency directories skipped. It runs once per chat turn, next to prompt
 * composition, so it must never become a full project walk.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Files an agent can meaningfully edit in place and that a user would call an artifact. */
const EDITABLE_ARTIFACT_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.md',
  '.mdx',
  '.css',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.vue',
  '.svelte',
  '.json',
]);

/** Directories that are build output, dependency trees, or daemon bookkeeping. */
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.git',
  '.od',
  '.od-skills',
  '.hyperframes-cache',
]);

const MAX_DEPTH = 2;
const MAX_ENTRIES = 600;

/**
 * True when `projectRoot` holds at least one editable artifact within
 * {@link MAX_DEPTH} levels. Unreadable/missing roots answer false — callers
 * treat that as "no artifact to edit", which only costs the normal build
 * workflow.
 */
export function projectHasEditableArtifact(projectRoot: string): boolean {
  if (!projectRoot) return false;
  const queue: Array<{ dir: string; depth: number }> = [{ dir: projectRoot, depth: 0 }];
  let seen = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (seen >= MAX_ENTRIES) return false;
      seen += 1;
      if (entry.name.startsWith('.')) continue;
      const entryPath = path.join(current.dir, entry.name);
      if (entry.isDirectory()) {
        if (current.depth + 1 >= MAX_DEPTH) continue;
        if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
        queue.push({ dir: entryPath, depth: current.depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      if (EDITABLE_ARTIFACT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}
