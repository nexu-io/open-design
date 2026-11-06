import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The web-clone workflow (SKILL.md + recon/harvest/audit scripts) lives once in
// the global skill registry so example-web-clone and every per-site clone
// example plugin can share it by ref instead of each duplicating a 16KB
// SKILL.md and 14 scripts. These structural checks lock that contract: if the
// skill drifts back into the plugin, or the plugin stops ref'ing the global
// skill, the shared-skill run path (server.ts resolves the ref → stages the
// skill dir) silently breaks.
const repoRoot = path.resolve(fileURLToPath(import.meta.url), '../../../..');
const skillDir = path.join(repoRoot, 'skills', 'web-clone');
const pluginManifestPath = path.join(
  repoRoot,
  'plugins',
  '_official',
  'examples',
  'web-clone',
  'open-design.json',
);

describe('web-clone shared skill contract', () => {
  it('keeps the workflow + scripts in the global skill registry', () => {
    expect(existsSync(path.join(skillDir, 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(skillDir, 'scripts', 'recon-site.mjs'))).toBe(true);
    expect(existsSync(path.join(skillDir, 'scripts', 'asset-harvest.mjs'))).toBe(true);
    expect(existsSync(path.join(skillDir, 'scripts', 'audit-clone.mjs'))).toBe(true);
  });

  it('registers the skill under the id example plugins ref', () => {
    const frontmatter = readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    expect(frontmatter).toMatch(/^\s*name:\s*web-clone\s*$/m);
  });

  it('makes example-web-clone reference the global skill by ref, not a local copy', () => {
    const manifest = JSON.parse(readFileSync(pluginManifestPath, 'utf8'));
    const skills = manifest?.od?.context?.skills ?? [];
    expect(skills).toEqual([{ ref: 'web-clone' }]);
    // The plugin must not ship its own SKILL.md / scripts anymore.
    expect(existsSync(path.join(pluginManifestPath, '..', 'SKILL.md'))).toBe(false);
    expect(existsSync(path.join(pluginManifestPath, '..', 'scripts'))).toBe(false);
  });
});
