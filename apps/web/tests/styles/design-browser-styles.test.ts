import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Regression guard for the in-app browser / Reference Board panel
// (`DesignBrowserPanel.tsx`). PR #3358 ("redesign Design Files panel",
// commit 640893756) rewrote design-files.css and dropped the entire
// `.design-browser` / `.db-*` block without touching the component, which still
// references those class names. The panel shipped completely unstyled in the
// v0.10.0 beta. Nothing in CI caught it: there is no stylelint, jsdom unit
// tests never apply CSS, and the panel is not in the visual baseline suite.
// This test wires the component's class usage to its CSS so a future refactor
// cannot silently delete the module again.

const indexCss = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
const designBrowserCss = readFileSync(
  new URL('../../src/styles/workspace/design-browser.css', import.meta.url),
  'utf8',
);
const component = readFileSync(
  new URL('../../src/components/DesignBrowserPanel.tsx', import.meta.url),
  'utf8',
);

function definedClasses(css: string): Set<string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const defined = new Set<string>();
  const rulePattern = /([^{}]+)\{[^}]*\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(withoutComments)) !== null) {
    const selectorList = match[1] ?? '';
    for (const token of selectorList.matchAll(/\.((?:design-browser|db)[\w-]*)/g)) {
      defined.add(token[1]!);
    }
  }
  return defined;
}

// Classes the panel renders purely as JS state hooks / value spans / modifiers
// that never had a dedicated CSS rule — verified against the pre-#3358
// stylesheet (640893756^), which design-browser.css restores verbatim. They are
// intentionally style-less, so the coverage check exempts them rather than
// demanding a rule that never existed. A class only belongs here if it carries
// no layout of its own; anything that paints or positions must stay covered.
const STYLELESS_HOOKS = new Set([
  'db-action-browser-use',
  'db-action-menu',
  'db-action-primary',
  'db-action-save',
  'db-action-screenshot',
  'db-inspect-bg',
  'db-inspect-color',
  'db-inspect-font-size',
  'db-inspect-padding',
  'db-inspect-radius',
  'db-inspect-weight',
  'db-viewport-height',
  'db-viewport-icon',
  'db-viewport-menu-label',
  'db-viewport-width',
]);

describe('design browser panel styles', () => {
  it('is imported into the global stylesheet so the panel ships styled', () => {
    expect(indexCss).toContain("@import './styles/workspace/design-browser.css';");
  });

  it('defines every structural class the panel relies on for layout', () => {
    // Layout-critical classes — their absence is what collapsed the panel in
    // the beta (overlapping chrome, unstyled reference cards).
    const structural = [
      'design-browser',
      'db-chrome',
      'db-nav',
      'db-actions',
      'db-address-form',
      'db-address-field',
      'db-content',
      'db-start',
      'db-reference-board',
      'db-reference-chip',
      'db-reference-list',
      'db-reference-card',
    ];
    const defined = definedClasses(designBrowserCss);
    const missing = structural.filter((cls) => !defined.has(cls));
    expect(missing).toEqual([]);
  });

  it('gives the chrome bar and reference board real box rules', () => {
    // Spot-check a couple of declarations so an empty stub file cannot satisfy
    // the presence check above.
    const chrome = /\.db-chrome\s*\{([^}]*)\}/.exec(designBrowserCss)?.[1] ?? '';
    expect(chrome).toMatch(/grid-template-columns/);
    const board = /\.db-reference-board\s*\{([^}]*)\}/.exec(designBrowserCss)?.[1] ?? '';
    expect(board).toMatch(/(grid|flex|padding)/);
  });

  it('keeps every styled browser-panel class the component renders defined in the stylesheet', () => {
    // The component is the source of truth: collect EVERY `design-browser`/`db-*`
    // token it renders (not a hard-coded family subset) so dropping the rules for
    // any part of the panel — viewport switcher, browser-use menu, suggestions,
    // comment layer, etc. — turns this guard red.
    const used = new Set<string>();
    for (const token of component.matchAll(/\b(?:design-browser|db-[a-z][a-z0-9-]*)\b/g)) {
      const cls = token[0];
      // Dynamic class built from a template literal (e.g. `db-viewport-${mode}`):
      // the word boundary truncates the stem just before the interpolated `-`,
      // so the very next source char is `-`. Such classes can't be matched
      // statically — skip the stem (its static siblings are still asserted).
      if (cls.endsWith('-') || component[token.index + cls.length] === '-') continue;
      if (STYLELESS_HOOKS.has(cls)) continue;
      used.add(cls);
    }
    const defined = definedClasses(designBrowserCss);
    const orphans = [...used].filter((cls) => !defined.has(cls)).sort();
    expect(orphans).toEqual([]);
  });
});
