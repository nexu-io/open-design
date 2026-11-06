import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { phase1Skills } from '../shared/workflow.ts';

const root = fileURLToPath(new URL('../', import.meta.url));

// New documentation and developer scripts require an explicit distribution decision.
export const distributionDocuments = [
  'README.md', 'AGENTS.md', 'CLAUDE.md', 'docs/README.md',
  'docs/product/architecture.md', 'docs/product/changes.md', 'docs/product/media-generation-design.md',
  'docs/agent-adapters.md', 'docs/browser-runtime.md', 'docs/design-system.md', 'docs/editor-fork.md',
  'docs/hyperframes.md', 'docs/mcp-phase1-tools.md', 'docs/model-gateway.md', 'docs/motion-director.md',
  'docs/motion-extension-scope.md', 'docs/npm-installation.md', 'docs/project-workspace.md',
  'docs/repository-migration.md', 'docs/session-architecture.md', 'docs/shared-editor.md',
  'docs/skills.md', 'docs/template-catalog.md', 'docs/test-packages.md', 'docs/templates/requirement.md',
];

export async function distributionFiles(profile: string): Promise<string[]> {
  if (!['phase1', 'legacy'].includes(profile)) throw new Error('Unknown distribution profile: ' + profile);
  const files = [
    ...distributionDocuments, '.codex-plugin/plugin.json', '.mcp.json', 'marketplace.example.json',
    'package.json', 'package-lock.json',
    'server.ts', 'browser.ts', 'workspace.ts', 'mcp.ts', 'mcp-tools.ts', 'editor-runtime.ts',
    'phase1.ts', 'phase1-versions.ts', 'preview.ts', 'hyperframes.ts', 'template-library.ts',
    'template-catalog.ts', 'editor-server.ts',
    'scripts/runtime-assets.mjs', 'scripts/npm-runtime.mjs', 'scripts/runtime-lock.json',
    'scripts/verify-export.ts', 'scripts/export-adapters.ts', 'scripts/package.ts', 'scripts/distribution.ts',
    'studio/LICENSE', 'studio/README.md', 'template-library/LICENSE', 'shared/editor-launch.pl',
  ];
  async function walk(directory: string, extensions: RegExp) {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ['node_modules', 'tests', '__tests__'].includes(entry.name)) continue;
      const file = directory + '/' + entry.name;
      if (entry.isSymbolicLink()) throw new Error('Distribution must not follow symlinks: ' + file);
      if (entry.isDirectory()) await walk(file, extensions);
      else if (entry.isFile() && !/\.(?:test|spec)\./.test(entry.name) && extensions.test(entry.name)) files.push(file);
    }
  }
  for (const directory of ['shared', 'gateway']) await walk(directory, /\.(?:ts|mjs|json)$/);
  await walk('web', /\.(?:ts|js|json|html|css|svg|jpg|png|webp|ttf|woff2?|txt)$/);
  for (const directory of ['templates', 'template-library']) await walk(directory, /\.(?:html|js|json|css|svg|jpg|png|webp|md|txt)$/);
  for (const skill of [...phase1Skills, ...(profile === 'legacy' ? ['video-to-template'] : [])]) await walk('skills/' + skill, /\.(?:md|mjs|ts|py|json)$/);
  await walk('studio/build', /\.(?:html|js|css|json|svg|png|jpg|webp|woff2?|ttf|txt)$/);
  await walk('studio/public', /\.(?:html|js|css|json|svg|png|jpg|webp|woff2?|ttf|txt)$/);
  for (const file of files) if (!(await lstat(path.join(root, file))).isFile()) throw new Error('Distribution requires a regular file: ' + file);
  return [...new Set(files)].sort();
}
