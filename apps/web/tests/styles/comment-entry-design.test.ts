import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

function declarations(selector: string): Record<string, string> {
  const result: Record<string, string> = {};
  postcss.parse(readFileSync(resolve('src/styles/viewer/core.css'), 'utf8')).walkRules(rule => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls(decl => { result[decl.prop] = decl.value; });
  });
  return result;
}

describe('R1/R2/R5/R6 comment entry visual seam (◇)', () => {
  const selector = '.viewer-action.viewer-comment-count-trigger';
  it('uses the Owner-board compact neutral button geometry', () => {
    expect(declarations(selector)).toMatchObject({
      'box-sizing': 'border-box', 'min-width': '42px', height: '30px',
      padding: '0 8px', gap: '5px', border: '0', 'border-radius': '6px',
      background: '#F3F3F4', color: '#333333', 'font-size': '12px', 'font-weight': '700',
    });
  });
  it('uses the same neutral selected fill both at rest and hovered', () => {
    for (const state of ['.active', '.active:hover:not(:disabled)']) {
      expect(declarations(`${selector}${state}`)).toMatchObject({ background: '#E4E4E6', color: '#333333' });
    }
  });
  it('retains the existing C0 count badge rather than inventing a new unread count', () => {
    expect(declarations('.viewer-comment-unread-badge')).toMatchObject({
      top: '-5px', right: '-5px', 'min-width': '15px', height: '15px',
      background: '#E5484D', color: '#FFFFFF', 'box-shadow': '0 0 0 1.5px #FFFFFF',
    });
  });
});
