import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const dialogStyles = readFileSync(
  new URL('../../src/components/GoPlanSunsetDialog.module.css', import.meta.url),
  'utf8',
);
const dialogSource = readFileSync(
  new URL('../../src/components/GoPlanSunsetDialog.tsx', import.meta.url),
  'utf8',
);

function declarationBlocks(selector: string): string[] {
  const rulePattern = new RegExp(`${selector}\\s*\\{([^{}]*)\\}`, 'g');
  return Array.from(dialogStyles.matchAll(rulePattern), (match) => match[1] ?? '');
}

describe('Go Plan sunset dialog responsive layout', () => {
  it('keeps the action footer reachable on short mobile and landscape viewports', () => {
    const copyPanelRules = declarationBlocks('\\.copyPanel');
    expect(copyPanelRules).toHaveLength(3);

    const [baseRule, mobileRule, shortLandscapeRule] = copyPanelRules;
    // The copy panel owns the scroll path. A bounded grid item also needs
    // min-height: 0 so its content can shrink below its intrinsic height.
    expect(baseRule).toMatch(/min-height:\s*0;/);
    expect(baseRule).toMatch(/overflow-y:\s*auto;/);

    // 390px-wide phones inherit the base scroll container; the mobile rule
    // only changes spacing and must not replace it with overflow: visible.
    expect(mobileRule).toContain('padding: 28px 22px 22px;');
    expect(mobileRule).not.toMatch(/overflow(?:-y)?\s*:/);
    expect(dialogStyles).toContain('max-height: calc(100dvh - 24px);');

    // A short landscape phone takes the compact-height rule at widths above
    // the mobile breakpoint and must keep the same scroll behavior.
    expect(shortLandscapeRule).toContain('padding-top: 30px;');
    expect(shortLandscapeRule).not.toMatch(/overflow(?:-y)?\s*:/);

    // Both actions remain inside that scroll container, so scrolling the copy
    // panel exposes the footer even when the announcement exceeds the panel.
    expect(dialogSource).toMatch(
      /<div className=\{styles\.copyPanel\}>[\s\S]*<footer className=\{styles\.actions\}>/,
    );
  });

  it('lets localized action labels wrap without escaping their buttons', () => {
    const actionRules = declarationBlocks('\\.actions \\.action');
    expect(actionRules).toHaveLength(1);

    const [baseRule] = actionRules;
    expect(baseRule).toMatch(/height:\s*auto;/);
    expect(baseRule).toMatch(/white-space:\s*normal;/);
    expect(baseRule).toMatch(/overflow-wrap:\s*anywhere;/);
  });

  it('vertically centers each decision label against its number badge', () => {
    const decisionLabelRules = declarationBlocks('\\.decisions strong');
    expect(decisionLabelRules).toHaveLength(1);

    const [baseRule] = decisionLabelRules;
    expect(baseRule).toMatch(/display:\s*flex;/);
    expect(baseRule).toMatch(/min-height:\s*20px;/);
    expect(baseRule).toMatch(/align-items:\s*center;/);
  });
});
