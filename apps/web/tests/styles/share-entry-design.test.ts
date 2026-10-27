import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { readShareCss } from '../helpers/read-share-css';

function declarations(selector: string): Record<string, string> {
  const css = readShareCss(resolve('src/components/share/ShareEntry.module.css'));
  const root = postcss.parse(css);
  const result: Record<string, string> = {};
  root.walkRules(rule => {
    // Shared toolbar geometry and hover rules use comma-separated selectors.
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls(decl => { result[decl.prop] = decl.value; });
  });
  return result;
}

const toolbarScope = ':global(.app .ws-tabs-actions .chrome-action.chrome-action-secondary)';
const toolbar = `${toolbarScope}.toolbar`;
const toolbarSecondary = `${toolbarScope}.toolbarSecondary`;
const card = ':global(.artifact-card) .card:global(.artifact-card-act)';

describe('C0 toolbar / G1 card visual contract (◇ design provenance)', () => {
  it.each([toolbar, toolbarSecondary])('uses scoped C0 geometry for %s', selector => {
    expect(declarations(selector)).toMatchObject({
      'box-sizing': 'border-box', height: '30px', 'min-height': '30px', padding: '0 12px',
      gap: '8px', border: '0', 'border-radius': '7px',
      background: 'var(--toolbar-action-background)', color: 'var(--toolbar-action-color)',
      'font-size': '12px', 'font-weight': '500', 'box-shadow': 'none',
    });
  });

  it('keeps Share primary and Export secondary using the C0 palette', () => {
    expect(declarations('.toolbar')).toMatchObject({
      '--toolbar-action-background': '#242424', '--toolbar-action-color': '#fff',
    });
    expect(declarations('.toolbarSecondary')).toMatchObject({
      '--toolbar-action-background': '#f2f2f3', '--toolbar-action-color': '#555',
    });
  });

  it.each([toolbar, toolbarSecondary])('retains the action palette on enabled hover for %s', selector => {
    expect(declarations(`${selector}:hover:not(:disabled)`)).toMatchObject({
      background: 'var(--toolbar-action-background)', color: 'var(--toolbar-action-color)',
    });
  });

  it('preserves the disabled Share palette', () => {
    expect(declarations(`${toolbar}:disabled`)).toMatchObject({
      background: '#E4E4E6', color: '#A6A6AA', opacity: '1',
    });
  });

  it('preserves collaboration disabled feedback without overriding enabled card styles', () => {
    expect(declarations(`${card}:disabled`)).toMatchObject({ background: '#F3F3F1', color: '#BDBDB8', opacity: '1' });
    expect(declarations(card)).toEqual({});
    expect(declarations(`${card}:hover:not(:disabled)`)).toEqual({});
  });
});
