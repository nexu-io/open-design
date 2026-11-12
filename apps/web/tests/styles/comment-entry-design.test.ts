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

describe('restored comment appearance', () => {
  it('uses the neutral reference entry skin without replacing the current unread indicator', () => {
    expect(declarations('.viewer-action.viewer-comment-count-trigger')).toMatchObject({
      position: 'relative', 'min-width': '42px', height: '30px', padding: '0 8px', gap: '5px',
      background: '#F3F3F4', color: '#333333',
    });
    expect(declarations('.viewer-action.viewer-comment-count-trigger.active')).toMatchObject({
      background: '#E4E4E6',
    });
    expect(declarations('.viewer-comment-unread-badge')).toEqual({});
  });

  it('restores the compact neutral panel, selection and send styles', () => {
    expect(declarations('.comment-side-panel')).toMatchObject({
      background: '#FAFAFA', 'border-radius': '10px', 'box-shadow': 'none',
    });
    expect(declarations('.comment-side-header')).toMatchObject({ height: '56px', padding: '0 16px' });
    expect(declarations('.comment-side-item.selected')).toMatchObject({ background: '#EDEDED' });
    expect(declarations('.comment-side-item.active')).toMatchObject({ background: '#EDEDED', 'box-shadow': 'none' });
    expect(declarations('.comment-side-check.checked')).toMatchObject({ background: '#202020' });
    expect(declarations('.comment-side-selectbar .primary')).toMatchObject({ background: '#202020', height: '28px' });
  });

  it('restyles pins without adding a different tooltip trigger or changing long-comment disclosure', () => {
    expect(declarations('.comment-saved-pin')).toMatchObject({ width: '28px', height: '28px', 'font-size': '12px' });
    expect(declarations('.comment-side-body.is-clamped')).toMatchObject({ '-webkit-line-clamp': '3', overflow: 'hidden' });
    expect(declarations('.comment-side-expand')).toMatchObject({ cursor: 'pointer' });
    expect(declarations('.od-tooltip-layer.tipd')).toEqual({});
  });

  it('reserves matching preview space for the restored floating panel', () => {
    const shell = postcss.parse(readFileSync(resolve('src/styles/shell.css'), 'utf8'));
    const values: Record<string, Record<string, string>> = {};
    shell.walkRules(rule => {
      if (!rule.selector.includes('comment-float-host')) return;
      const declarations: Record<string, string> = {};
      rule.walkDecls(decl => { declarations[decl.prop] = decl.value; });
      values[rule.selector] = declarations;
    });
    expect(values['.comment-float-host']).toMatchObject({ width: 'min(320px, calc(100vw - 32px))' });
    expect(values['.split:has(> .comment-float-host:not(:empty)) .viewer-body']).toMatchObject({
      'padding-right': 'max(0px, min(348px, calc(100% - 160px)))',
    });
  });
});
