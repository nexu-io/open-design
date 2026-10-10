// Measurement spec for multi-line <button> rows clipped by the global
// button primitive (issue #8176).
//
// styles/primitives.css hands every <button> `height: 36px; line-height: 1;
// white-space: nowrap`. A component class only wins for the properties it
// declares, so any column-flex button class that omits `height` stays pinned
// to 36px while its stacked content (thumb + name, head + desc + example,
// label + desc) needs 60-90px — the overflow is then cropped by
// `overflow: hidden` or paints over the neighbouring row. Same root cause as
// #7703 (ProjectReferenceModal `.item`) and the slash-palette squash
// (OPEND-2236); the per-class `height: auto` opt-out is the established fix
// (see .model-select-searchable__option, .project-search-item,
// .artifact-version-card).
//
// These pins hold the three confirmed instances to their content and keep
// hover/selected from touching the box. Byte-level CSS assertions, mirroring
// tests/styles/project-reference-modal-rows.test.ts — no jsdom needed.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const artifactsCss = readFileSync(
  new URL('../../src/styles/workspace/artifacts.css', import.meta.url),
  'utf8',
);

const templatesPluginsCss = readFileSync(
  new URL(
    '../../src/styles/viewer/templates-plugins.css',
    import.meta.url,
  ),
  'utf8',
);

function declarations(css: string, selector: string): string {
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssWithoutComments)) !== null) {
    const selectors = (match[1] ?? '').split(',').map((item) => item.trim());
    if (selectors.includes(selector)) blocks.push(match[2] ?? '');
  }
  return blocks.join('\n');
}

describe('multi-line buttons escape the 36px primitive (#8176)', () => {
  it('sizes the New Project start card to thumb + name instead of 36px', () => {
    const card = declarations(artifactsCss, '.newproj-start-card');
    expect(card).toMatch(/height:\s*auto/);
    // Column flex makes the cross axis horizontal, so the primitive's
    // `align-items: center` would shrink the full-bleed thumb to its
    // content width; stretch keeps it edge to edge.
    expect(card).toMatch(/align-items:\s*stretch/);
  });

  it('sizes the MCP picker action to head + desc + example', () => {
    const action = declarations(
      templatesPluginsCss,
      '.mcp-picker-item-action',
    );
    expect(action).toMatch(/height:\s*auto/);
    // The primitive's `white-space: nowrap` is inherited and would keep the
    // description on one line; `line-height: 1` would crush the desc's own
    // 1.45. Same pair as .artifact-version-card in shell.css.
    expect(action).toMatch(/white-space:\s*normal/);
    expect(action).toMatch(/line-height:\s*normal/);
  });

  it('sizes the plugin Use-menu item to label + desc', () => {
    const item = declarations(
      templatesPluginsCss,
      '.plugin-details-modal__use-menu-item',
    );
    expect(item).toMatch(/height:\s*auto/);
    expect(item).toMatch(/white-space:\s*normal/);
    expect(item).toMatch(/line-height:\s*normal/);
  });

  it('keeps hover/selected on the same box as the resting row', () => {
    const cases: Array<[string, string]> = [
      [artifactsCss, '.newproj-start-card:hover'],
      [artifactsCss, '.newproj-start-card.active'],
      [templatesPluginsCss, '.mcp-picker-item:hover'],
      [
        templatesPluginsCss,
        '.plugin-details-modal__use-menu-item:hover',
      ],
    ];
    for (const [css, selector] of cases) {
      const state = declarations(css, selector);
      expect(state, selector).not.toMatch(
        /(?<![a-z-])(?:min-|max-)?height\s*:/,
      );
      expect(state, selector).not.toMatch(/\bpadding(?:-[a-z]+)?\s*:/);
      expect(state, selector).not.toMatch(/\bmargin(?:-[a-z]+)?\s*:/);
      expect(state, selector).not.toMatch(/\bborder-width\s*:/);
      expect(state, selector).not.toMatch(/\bborder\s*:/);
      // border-color/background recolour only — the 1px box never changes
      // size between states.
    }
    // .newproj-start-card:hover intentionally lifts with
    // `transform: translateY(-1px)` (pre-existing); it is a paint-only
    // offset, not a box change, so it is exempt from the no-transform pin
    // the reference test applies to its own rows.
    expect(
      declarations(artifactsCss, '.newproj-start-card:hover'),
    ).toMatch(/transform:\s*translateY\(-1px\)/);
  });
});
