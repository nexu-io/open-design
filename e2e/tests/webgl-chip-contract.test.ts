// The Home "WebGL experience" chip advertises a GPU capability, so the plugin
// it dispatches must actually carry WebGL generation instructions. The 2026-08
// gallery curation briefly rebound the chip to the generic web-prototype seed
// (whose SKILL.md has no shader/WebGL contract), which made the chip generate
// ordinary landing pages: `intent: 'webgl-experience'` classifies the project
// but is never injected into the agent prompt. This guard pins the chip to a
// bundled scenario whose prompt contract is verifiably WebGL-specific, so the
// capability cannot silently degrade into a working-looking placebo again.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const CHIPS_SOURCE = path.join(repoRoot, 'apps/web/src/components/home-hero/chips.ts');
const WEBGL_PLUGIN_DIR = path.join(repoRoot, 'plugins/_official/examples/webgl-experience');

// The chip's catalog entry, from `id: 'webgl'` up to the next chip id. Text-level
// on purpose: importing chips.ts would drag the web app's React/i18n graph into
// this repo-resource suite.
async function webglChipBlock(): Promise<string> {
  const source = await readFile(CHIPS_SOURCE, 'utf8');
  const start = source.indexOf("id: 'webgl'");
  expect(start, "chips.ts declares the 'webgl' chip").toBeGreaterThan(-1);
  const rest = source.slice(start);
  const end = rest.indexOf("id: '", 1);
  return end > 0 ? rest.slice(0, end) : rest;
}

describe('webgl chip generation contract', () => {
  it("[P1] dispatches to the bundled WebGL scenario, not a generic prototype seed", async () => {
    const block = await webglChipBlock();
    expect(block).toContain("pluginId: 'example-webgl-experience'");
    expect(block).not.toContain("pluginId: 'example-web-prototype'");
  });

  it('[P1] the bound plugin ships a WebGL-specific prompt contract', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(WEBGL_PLUGIN_DIR, 'open-design.json'), 'utf8'),
    ) as {
      name?: string;
      od?: {
        mode?: string;
        useCase?: { query?: Record<string, string> };
        context?: { skills?: Array<{ path?: string }> };
      };
    };

    expect(manifest.name).toBe('example-webgl-experience');
    expect(manifest.od?.mode).toBe('prototype');
    // The seed query itself asks for WebGL output, so even the composer's
    // one-line prompt carries the capability.
    expect(manifest.od?.useCase?.query?.en ?? '').toMatch(/WebGL2?/);
    // The SKILL.md is wired into generation context (not just documentation).
    const skillPaths = (manifest.od?.context?.skills ?? []).map((s) => s.path);
    expect(skillPaths).toContain('./SKILL.md');

    const skill = await readFile(path.join(WEBGL_PLUGIN_DIR, 'SKILL.md'), 'utf8');
    // The markers that make the contract WebGL-specific: a real GPU context,
    // shader authoring, and the powered-preview detection the chip's hint
    // promises. A generic prototype skill contains none of these.
    expect(skill).toMatch(/getContext\('webgl2?'\)/);
    expect(skill).toMatch(/shader/i);
    expect(skill).toMatch(/powered preview/i);
  });
});
