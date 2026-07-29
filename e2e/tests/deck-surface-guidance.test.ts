import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

const genericDeckGuidanceFiles = [
  'packages/contracts/src/prompts/deck-framework.ts',
  'apps/daemon/src/prompts/discovery.ts',
  'packages/contracts/src/prompts/discovery.ts',
  'design-templates/simple-deck/SKILL.md',
  'design-templates/simple-deck/assets/template.html',
  'design-templates/simple-deck/references/layouts.md',
  'design-templates/simple-deck/references/checklist.md',
  'plugins/_official/examples/simple-deck/SKILL.md',
  'plugins/_official/examples/simple-deck/assets/template.html',
  'plugins/_official/examples/simple-deck/references/layouts.md',
  'plugins/_official/examples/simple-deck/references/checklist.md',
] as const;

const mechanicalThemeRules = [
  /no 3\+ same[- ]theme/i,
  /alternating creates the rhythm/i,
  /alternating breath/i,
  /should show alternation/i,
  /swap the middle slide to the opposite theme/i,
  /mix in at least one hero light AND one hero dark/i,
  /for 8\+ slides:[^\n]*hero dark[^\n]*hero light/i,
  /dark[^\n]*every 3[–-]4 slides/i,
];

const activeDeckNavigationGuidanceFiles = [
  'apps/daemon/src/prompts/official-system.ts',
  'packages/contracts/src/prompts/official-system.ts',
  'apps/daemon/src/prompts/discovery.ts',
  'packages/contracts/src/prompts/discovery.ts',
] as const;

const simpleDeckTemplateFiles = [
  'design-templates/simple-deck/assets/template.html',
  'plugins/_official/examples/simple-deck/assets/template.html',
] as const;

describe('generic deck surface guidance', () => {
  it('[P1] uses semantic surface hierarchy instead of mechanical alternation', async () => {
    const contents = await Promise.all(
      genericDeckGuidanceFiles.map(async (relativePath) => ({
        relativePath,
        text: await readFile(path.join(repoRoot, relativePath), 'utf8'),
      })),
    );

    const violations = contents.flatMap(({ relativePath, text }) =>
      mechanicalThemeRules
        .filter((pattern) => pattern.test(text))
        .map((pattern) => `${relativePath}: ${pattern.source}`),
    );

    expect(violations).toEqual([]);
  });

  it('[P1] keeps the shared dominant-surface contract in both simple-deck copies', async () => {
    const simpleDeckFiles = genericDeckGuidanceFiles.filter((relativePath) =>
      relativePath.includes('simple-deck'),
    );

    const missing = (
      await Promise.all(
        simpleDeckFiles.map(async (relativePath) => ({
          relativePath,
          text: await readFile(path.join(repoRoot, relativePath), 'utf8'),
        })),
      )
    )
      .filter(
        ({ text }) =>
          !/dominant surface/i.test(text) ||
          !/narrative (?:role|purpose)/i.test(text) ||
          !/never alternate/i.test(text),
      )
      .map(({ relativePath }) => relativePath);

    expect(missing).toEqual([]);
  });

  it('[P1] does not ask generated decks to create a second navigation layer', async () => {
    const contents = await Promise.all(
      activeDeckNavigationGuidanceFiles.map(async (relativePath) => ({
        relativePath,
        text: await readFile(path.join(repoRoot, relativePath), 'utf8'),
      })),
    );

    const violations = contents.flatMap(({ relativePath, text }) => {
      const reasons = [
        /host injects a \*\*fixed framework\*\*/i.test(text)
          ? 'fixed-framework instruction'
          : null,
        /slide counter visible/i.test(text) ? 'visible-counter instruction' : null,
        /persist position to localStorage/i.test(text)
          ? 'localStorage navigation instruction'
          : null,
        !/Open Design owns visible navigation/i.test(text)
          ? 'missing host-navigation ownership'
          : null,
        !/(?:keyboard|key commands?)/i.test(text) || !/click\/tap/i.test(text)
          ? 'missing nonvisual navigation contract'
          : null,
        /data-deck-nav/.test(text) ? 'still permits authored navigation chrome' : null,
      ].filter(Boolean);
      return reasons.map((reason) => `${relativePath}: ${reason}`);
    });

    expect(violations).toEqual([]);
  });

  it('[P1] keeps the simple-deck runtime chrome-free but navigable', async () => {
    const violations = (
      await Promise.all(
        simpleDeckTemplateFiles.map(async (relativePath) => ({
          relativePath,
          text: await readFile(path.join(repoRoot, relativePath), 'utf8'),
        })),
      )
    )
      .flatMap(({ relativePath, text }) => [
        /<[^>]+data-deck-nav\b/.test(text)
          ? `${relativePath}: authored navigation container`
          : null,
        /class="deck-(?:counter|hint|progress)"/.test(text)
          ? `${relativePath}: visible navigation chrome`
          : null,
        !/addEventListener\('keydown'/.test(text)
          ? `${relativePath}: missing keyboard navigation`
          : null,
        !/addEventListener\('click'/.test(text)
          ? `${relativePath}: missing click navigation`
          : null,
      ].filter((value): value is string => value !== null));

    expect(violations).toEqual([]);
  });
});
