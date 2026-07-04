// Authors: Leon Aburime using Claude Fable 5
// @ts-nocheck — carried over verbatim from server.ts's file-level @ts-nocheck.
// The moved bodies are untyped JS-in-TS; typing them is a later effort and new
// sibling code must NOT copy this.
/** @module plugin-share
 * Plugin manifest reading + plugin-share (publish-to-GitHub / contribute-to-OD)
 * prompt and staging helpers.
 *
 * `readProjectPluginManifest` parses a project's open-design.json (validating
 * the plugin name); `githubRepoNameFromPluginName` slugifies a plugin name into
 * a repo name; `normalizePluginShareAction` validates a share action against the
 * contracts registry; `renderPluginSharePrompt` composes the agent prompt for a
 * share action; `copyPluginFolderForProjectContext` / `copyPluginContextDir`
 * stage a plugin's source into a project (skipping the SKIP_DIRS/SKIP_FILES sets
 * and refusing symlink escapes). All are pure or filesystem-only — none read
 * daemon module state.
 *
 * Extracted verbatim from apps/daemon/src/server.ts (strangler-fig slice 3).
 * server.ts imports back the six symbols it references and re-exports the
 * __forTestReadProjectPluginManifest wrapper to preserve its public surface.
 */

import path from 'node:path';
import fs from 'node:fs';
import { PLUGIN_SHARE_ACTION_PLUGIN_IDS } from '@open-design/contracts';

async function readProjectPluginManifest(folder) {
  const raw = await fs.promises.readFile(path.join(folder, 'open-design.json'), 'utf8');
  const manifest = JSON.parse(raw);
  const name = typeof manifest.name === 'string' && manifest.name.trim()
    ? manifest.name.trim()
    : path.basename(folder);
  if (/[/\\]/.test(name) || /^\.+$/.test(name)) {
    throw new Error(
      `open-design.json in ${folder}: name "${name}" must not contain path separators or consist only of dots`,
    );
  }
  return {
    name,
    title: typeof manifest.title === 'string' ? manifest.title : name,
    version: typeof manifest.version === 'string' ? manifest.version : '0.1.0',
    manifest,
  };
}

export const __forTestReadProjectPluginManifest = readProjectPluginManifest;

export function githubRepoNameFromPluginName(name) {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/(^[-._]+|[-._]+$)/g, '');
  return slug || 'open-design-plugin';
}

export const PLUGIN_SHARE_ACTION_LABELS = {
  'publish-github': 'Publish to GitHub',
  'contribute-open-design': 'Contribute to Open Design',
};

export const USER_PLUGIN_SOURCE_KINDS = new Set([
  'user',
  'project',
  'marketplace',
  'github',
  'url',
  'local',
]);

const PLUGIN_CONTEXT_SKIP_DIRS = new Set([
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

const PLUGIN_CONTEXT_SKIP_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
]);

export function normalizePluginShareAction(input) {
  const value = typeof input === 'string' ? input.trim() : '';
  return Object.prototype.hasOwnProperty.call(PLUGIN_SHARE_ACTION_PLUGIN_IDS, value)
    ? value
    : null;
}

export function renderPluginSharePrompt({ action, sourcePlugin, stagedPath }) {
  const title = sourcePlugin.title || sourcePlugin.id;
  if (action === 'publish-github') {
    return [
      `Publish the local Open Design plugin "${title}" as a new public GitHub repository.`,
      '',
      `The plugin source files have been copied into this project at \`${stagedPath}\`.`,
      'Use the local daemon share endpoint so the publish flow runs through Open Design\'s validated GitHub path:',
      '',
      '```bash',
      `curl -sS -X POST "$OD_DAEMON_URL/api/projects/$OD_PROJECT_ID/plugins/publish-github" \\`,
      `  -H 'content-type: application/json' \\`,
      `  -d '${JSON.stringify({ path: stagedPath })}'`,
      '```',
      '',
      'Read the JSON response. If `ok` is true, report the final repository URL and any validation/log summary. If it fails, report the `message`, `code`, and the useful log lines. The endpoint checks `gh` auth and performs the repository creation; do not hand-roll a second GitHub flow unless you are explaining a daemon endpoint failure.',
      '',
      'Do not rewrite the plugin unless publishing requires a small metadata fix. If you make any fix, explain it before publishing.',
    ].join('\n');
  }
  return [
    `Open a pull request to add the local Open Design plugin "${title}" to the Open Design repository.`,
    '',
    `The plugin source files have been copied into this project at \`${stagedPath}\`.`,
    'Use the local daemon share endpoint so the contribution flow runs through Open Design\'s validated GitHub path:',
    '',
    '```bash',
    `curl -sS -X POST "$OD_DAEMON_URL/api/projects/$OD_PROJECT_ID/plugins/contribute-open-design" \\`,
    `  -H 'content-type: application/json' \\`,
    `  -d '${JSON.stringify({ path: stagedPath })}'`,
    '```',
    '',
    'Read the JSON response. If `ok` is true, report the PR URL, branch, and any validation/log summary. If it fails, report the `message`, `code`, and the useful log lines. The endpoint checks `gh` auth, forks/clones, pushes, and opens the PR; do not hand-roll a second GitHub flow unless you are explaining a daemon endpoint failure.',
    '',
    'Keep the PR focused on this plugin. Report the PR URL and any validation you ran.',
  ].join('\n');
}

export async function copyPluginFolderForProjectContext(sourceRoot, destRoot) {
  const rootReal = await fs.promises.realpath(sourceRoot);
  const stat = await fs.promises.stat(rootReal);
  if (!stat.isDirectory()) {
    const err = new Error('plugin source path is not a directory');
    err.code = 'ENOTDIR';
    throw err;
  }
  await copyPluginContextDir(rootReal, destRoot, rootReal);
}

async function copyPluginContextDir(src, dest, rootReal) {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (shouldSkipPluginContextEntry(entry.name)) continue;
    if (entry.isSymbolicLink()) continue;

    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      const childReal = await fs.promises.realpath(from).catch(() => null);
      if (!childReal || (childReal !== rootReal && !childReal.startsWith(rootReal + path.sep))) {
        continue;
      }
      await copyPluginContextDir(childReal, to, rootReal);
      continue;
    }
    if (!entry.isFile()) continue;
    await fs.promises.mkdir(path.dirname(to), { recursive: true });
    await fs.promises.copyFile(from, to);
  }
}

function shouldSkipPluginContextEntry(name) {
  return PLUGIN_CONTEXT_SKIP_DIRS.has(name) || PLUGIN_CONTEXT_SKIP_FILES.has(name);
}
