import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

function declarations(selector: string): Record<string, string> {
  const css = readFileSync(resolve('src/components/share/ShareEntry.module.css'), 'utf8');
  const root = postcss.parse(css);
  const result: Record<string, string> = {};
  root.walkRules(selector, rule => {
    rule.walkDecls(decl => { result[decl.prop] = decl.value; });
  });
  return result;
}

const toolbar = ':global(.chrome-action.chrome-action-secondary).toolbar';
const card = ':global(.artifact-card) .card:global(.artifact-card-act)';

describe('E0 / G1 share entry visual contract (◇ design provenance)', () => {
  it('uses E0 geometry and opaque dark fill without changing the export button', () => {
    expect(declarations(toolbar)).toMatchObject({
      'box-sizing': 'border-box', height: '28px', 'min-height': '28px', padding: '0 12px',
      gap: '5px', border: '0', 'border-radius': '6px', background: '#282828',
      color: '#FFFFFF', 'font-size': '12px', 'font-weight': '500',
    });
    expect(declarations(`${toolbar}:disabled`)).toMatchObject({
      background: '#E4E4E6', color: '#A6A6AA', opacity: '1',
    });
  });

  it('keeps the disabled card palette distinct from enabled hover', () => {
    expect(declarations(`${card}:disabled`)).toMatchObject({ background: '#F3F3F1', color: '#BDBDB8', opacity: '1' });
    expect(declarations(`${card}:hover`)).toEqual({});
    expect(declarations(`${card}:hover:not(:disabled)`)).toMatchObject({ background: '#EDEDF0', color: '#333333' });
  });

  it('uses G1 solid 30px card action rather than the export glass pill', () => {
    expect(declarations(card)).toMatchObject({
      'box-sizing': 'border-box', height: '30px', 'min-height': '30px', gap: '5px',
      border: '0', 'border-radius': '6px', background: '#EDEDF0', color: '#333333',
      'font-size': '12px', 'font-weight': '500', 'box-shadow': 'none',
      'backdrop-filter': 'none', '-webkit-backdrop-filter': 'none',
    });
  });
});
