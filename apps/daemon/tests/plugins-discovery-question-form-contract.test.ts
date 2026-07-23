import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const discoveryAtomPath = fileURLToPath(
  new URL('../../../plugins/_official/atoms/discovery-question-form/SKILL.md', import.meta.url),
);
const simpleDeckManifestPath = fileURLToPath(
  new URL('../../../plugins/_official/examples/simple-deck/open-design.json', import.meta.url),
);

describe('bundled discovery-question-form atom prompt contract', () => {
  it('is included in Simple Deck before generation starts', async () => {
    const manifest = JSON.parse(await readFile(simpleDeckManifestPath, 'utf8')) as {
      od?: { pipeline?: { stages?: Array<{ id?: string; atoms?: string[] }> } };
    };
    const stages = manifest.od?.pipeline?.stages ?? [];

    expect(stages.map((stage) => stage.id)).toEqual(['discovery', 'generate']);
    expect(stages[0]?.atoms).toContain('discovery-question-form');
    expect(stages[1]?.atoms).toEqual(['file-write', 'live-artifact']);
  });

  it('delegates rendering to the shared host contract without duplicating its schema', async () => {
    const body = await readFile(discoveryAtomPath, 'utf8');

    expect(body).toContain('binding host clarification gate and shared');
    expect(body).toContain('cannot make discovery mandatory');
    expect(body).toMatch(/Preserve a form id supplied by the active skill or router/);
    expect(body).toMatch(/otherwise use\s+`discovery`/);
    expect(body).toContain('Emit one complete form and end the turn');
    expect(body).not.toContain('"questions": [');
  });

  it('does not reintroduce a concrete default question as the canonical emission shape', async () => {
    const body = await readFile(discoveryAtomPath, 'utf8');

    expect(body).not.toMatch(/```jsonc\s*\{\s*"id":/s);
    expect(body).not.toMatch(/```jsonc[\s\S]*"id": "audience"/);
    expect(body).not.toContain('Which brand source should I follow?');
  });
});
