import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { readShareCss } from '../helpers/read-share-css';

function declarations(selector: string): Record<string, string> {
  const css = readShareCss(resolve('src/components/share/LinkAccessRow.module.css'));
  const root = postcss.parse(css);
  const result: Record<string, string> = {};
  root.walkRules(selector, rule => {
    rule.walkDecls(decl => { result[decl.prop] = decl.value; });
  });
  return result;
}

describe('D-00 link access switch thumb position', () => {
  // The switch is a <button>, so an axis it leaves undeclared falls through to
  // the global `button { justify-content: center }` in styles/primitives.css.
  it('places the thumb itself in both states instead of inheriting the global button alignment', () => {
    expect(declarations('.toggle')).toMatchObject({ display: 'inline-flex', 'justify-content': 'flex-start' });
    expect(declarations('.toggleOn')).toMatchObject({ 'justify-content': 'flex-end' });
  });
});
