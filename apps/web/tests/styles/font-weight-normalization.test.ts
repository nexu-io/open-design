import { readdirSync, readFileSync } from 'node:fs';
import { extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const styleRoots = [
  fileURLToPath(new URL('../../src', import.meta.url)),
  fileURLToPath(new URL('../../../../packages/components/src', import.meta.url)),
  fileURLToPath(new URL('../../../../apps/desktop/src', import.meta.url)),
];

/**
 * Stylesheets owned by pull requests that were in flight when the ladder
 * landed. They still carry pre-ladder weights and are normalised in their
 * own PRs (entry layout / nav rail: #7832, design files: #7772). Remove an
 * entry as soon as its file is clean; the second spec below fails when an
 * entry has become unnecessary so the list cannot outlive its reason.
 */
const pendingNormalization = new Set([
  'apps/web/src/styles/home/entry-layout.css',
  'apps/web/src/components/EntryNavRail.module.css',
  'apps/web/src/styles/workspace/design-files.css',
  // The chat panel (#7518) draws to its own delivered spec, which uses 400 for
  // bare buttons, record rows and pills (see `w77-bare-button-weight.test.ts`).
  // Reconciling that spec with the ladder is tracked with the chat module port
  // (OPEND-2553), not with the sync that brought the two side by side.
  'apps/web/src/components/chat/AmrOwnerTopUpDialog.module.css',
  'apps/web/src/components/chat/PlanPill.module.css',
  'apps/web/src/components/chat/UpgradeCard.module.css',
  'apps/web/src/components/chat/primitives/record.module.css',
  'apps/web/src/styles/chat.css',
  'apps/web/src/styles/viewer/composio.css',
]);

function cssFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory()) return cssFiles(path);
    return ['.css', '.scss', '.less'].includes(extname(entry.name)) ? [path] : [];
  });
}

function withoutFontFaces(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@font-face\s*\{[^}]*\}/g, '');
}

/**
 * The product UI consolidates on a 500 / 600 / 700 ladder: 400 is reserved
 * for font metadata, and the in-between values (450–680 other than 500/600,
 * 720–800) that used to approximate emphasis are folded onto the nearest step.
 */
function isForbiddenWeight(weight: number): boolean {
  const isIntermediateLow =
    weight >= 450 && weight <= 680 && weight !== 500 && weight !== 600;
  const isIntermediateHigh = weight >= 720 && weight <= 800;
  return weight === 400 || isIntermediateLow || isIntermediateHigh;
}

function ladderViolations(file: string): string[] {
  const violations: string[] = [];
  const css = withoutFontFaces(readFileSync(file, 'utf8'));
  for (const match of css.matchAll(/font-weight\s*:\s*(\d+)\b/g)) {
    const weight = Number(match[1]);
    if (isForbiddenWeight(weight)) {
      violations.push(`${relative(repoRoot, file)}: ${weight}`);
    }
  }
  for (const match of css.matchAll(/(?:^|[;{])\s*font\s*:\s*([^;}]+)/g)) {
    const shorthand = match[1]!.trim();
    if (shorthand === 'inherit') continue;

    const explicitWeight = shorthand.match(/^(?:(?:normal|italic|oblique)\s+)?([1-9]00)\b/);
    if (!explicitWeight) {
      violations.push(`${relative(repoRoot, file)}: font shorthand implicit 400`);
      continue;
    }

    const weight = Number(explicitWeight[1]);
    if (isForbiddenWeight(weight)) {
      violations.push(`${relative(repoRoot, file)}: font shorthand ${weight}`);
    }
  }
  return violations;
}

describe('product UI font-weight normalization', () => {
  const files = styleRoots.flatMap(cssFiles);
  const isPending = (file: string) => pendingNormalization.has(relative(repoRoot, file));

  it('defaults unspecified text and buttons to the 600 step', () => {
    const baseCss = withoutFontFaces(
      readFileSync(new URL('../../src/styles/base.css', import.meta.url), 'utf8'),
    );
    const primitivesCss = withoutFontFaces(
      readFileSync(new URL('../../src/styles/primitives.css', import.meta.url), 'utf8'),
    );
    const buttonModuleCss = withoutFontFaces(
      readFileSync(
        new URL('../../../../packages/components/src/button.module.css', import.meta.url),
        'utf8',
      ),
    );

    expect(baseCss).toMatch(/(?:^|\})\s*body\s*\{[^}]*font-weight:\s*600;/);
    expect(primitivesCss).toMatch(/(?:^|\})\s*button\s*\{[^}]*font-weight:\s*600;/);
    expect(buttonModuleCss).toMatch(/\.button\s*\{[^}]*font-weight:\s*600;/);
  });

  it('carries no scoped stand-in for the app-wide default', () => {
    // The hero, the project composer and the portaled "+" menu each used to
    // re-declare the 600 default locally while the global one was pending.
    const standIns = files.flatMap((file) => {
      const css = readFileSync(file, 'utf8');
      return /Typography ladder stand-in/.test(css) ||
        /:where\(\.(?:home-hero|composer|plus-menu__popup)\)\s*button\s*\{[^}]*font-weight/.test(
          css.replace(/\/\*[\s\S]*?\*\//g, ''),
        )
        ? [relative(repoRoot, file)]
        : [];
    });
    expect(standIns).toEqual([]);
  });

  it('uses the consolidated weight ladder outside font metadata', () => {
    const violations = files.filter((file) => !isPending(file)).flatMap(ladderViolations);
    expect(violations).toEqual([]);
  });

  it('keeps the pending list limited to files that still need it', () => {
    const stale = files.filter((file) => isPending(file) && ladderViolations(file).length === 0);
    expect(stale.map((file) => relative(repoRoot, file))).toEqual([]);
  });

  it('preserves the real ranges registered by the bundled font files', () => {
    const baseCss = readFileSync(new URL('../../src/styles/base.css', import.meta.url), 'utf8');

    const albertFaces = [...baseCss.matchAll(/@font-face\s*\{[^}]*\}/g)].filter((match) =>
      match[0].includes('font-family: "Albert Sans"'),
    );

    expect(albertFaces).toHaveLength(2);
    for (const face of albertFaces) expect(face[0]).toMatch(/font-weight:\s*100 900;/);
    expect(baseCss).toMatch(
      // The static face is declared at 500: the chat panel's typography
      // baseline (see the docblock above that @font-face) requests 500.
      /@font-face\s*\{[^}]*font-family:\s*"JiduMono Pro";[^}]*font-weight:\s*500;/s,
    );
  });
});
