import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'postcss';

const componentPath = resolve(__dirname, '../../src/components/BoardComposerPopover.tsx');
const draftModulePath = resolve(__dirname, '../../src/components/BoardComposerPopover.module.css');
const css = parse(readFileSync(resolve(__dirname, '../../src/styles/viewer/core.css'), 'utf8'));

function declarations(selector: string): Record<string, string> {
  const values: Record<string, string> = {};
  css.walkRules(selector, rule => {
    rule.walkDecls(decl => { values[decl.prop] = decl.value; });
  });
  return values;
}

describe('floating comment composer matches main while preserving comment behavior', () => {
  it('uses the shared main card and input surface without the draft CSS module', () => {
    expect(readFileSync(componentPath, 'utf8')).not.toContain('BoardComposerPopover.module.css');
    expect(existsSync(draftModulePath)).toBe(false);
    expect(declarations('.comment-popover')).toMatchObject({
      width: 'min(320px, calc(100% - 28px))', padding: '10px',
      'border-radius': 'var(--radius)', background: 'var(--glass-regular)',
      '-webkit-backdrop-filter': 'var(--glass-backdrop)',
      'backdrop-filter': 'var(--glass-backdrop)', 'box-shadow': 'var(--shadow-lg)',
    });
    expect(declarations('.comment-popover-titlebar')).toMatchObject({ margin: '-2px 0 8px', gap: '8px' });
    expect(declarations('.comment-popover-title')).toMatchObject({ color: 'var(--text)', 'text-overflow': 'ellipsis' });
  });

  it('retains independently added read-only explanation and reachable actions', () => {
    const component = readFileSync(componentPath, 'utf8');
    expect(component).toContain("!canEditComment && existing?.authorKind === 'user'");
    expect(component).toContain("t('comment.sharePageCommentReadOnly')");
    expect(declarations('.comment-popover-readonly-note')).toMatchObject({ color: '#888888', 'font-size': '11px' });
    expect(declarations('.comment-popover-composer')).toMatchObject({ display: 'flex', overflow: 'hidden' });
    expect(declarations('.comment-popover-body')).toMatchObject({ overflow: 'auto', 'min-height': '0' });
    expect(declarations('.comment-popover-composer .comment-popover-actions')).toMatchObject({ flex: '0 0 auto' });
  });
});
