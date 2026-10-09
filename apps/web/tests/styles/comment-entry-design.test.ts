import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const css = postcss.parse(readFileSync(resolve('src/styles/viewer/core.css'), 'utf8'));
function declarations(selector: string): Record<string, string> {
  const values: Record<string, string> = {};
  css.walkRules(rule => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls(decl => { values[decl.prop] = decl.value; });
  });
  return values;
}

describe('main comment entry appearance', () => {
  it('inherits toolbar button states and keeps the original count geometry', () => {
    expect(declarations('.viewer-comment-count-trigger')).toMatchObject({
      position: 'relative', 'min-width': '42px', height: '30px', padding: '0 8px', gap: '5px',
    });
    expect(declarations('.viewer-action.viewer-comment-count-trigger')).toEqual({});
    expect(declarations('.viewer-comment-unread-badge')).toEqual({});
  });
});
