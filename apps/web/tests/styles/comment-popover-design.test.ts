import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'postcss';

const moduleSource = readFileSync(resolve(__dirname, '../../src/components/CommentComposer.module.css'), 'utf8');
const css = parse(moduleSource);
function declarations(selector: string): Record<string, string> {
  const values: Record<string, string> = {};
  css.walkRules(selector, rule => { rule.walkDecls(decl => { values[decl.prop] = decl.value; }); });
  return values;
}
describe('comment composer owns its current design directly', () => {
  it('declares the complete card frame without overriding the legacy global skin', () => {
    expect(moduleSource).not.toContain(':global(');
    expect(moduleSource).not.toContain('comment-popover');
    expect(declarations('.popover')).toMatchObject({
      position:'absolute', 'z-index':'40', display:'flex', 'flex-direction':'column', overflow:'hidden',
      'border-radius':'12px', background:'#fff', border:'1px solid #e6e6e6', 'box-shadow':'0 4px 18px #00000012',
    });
  });
  it('keeps the scroll body separate from actions and supplies native icon button layout', () => {
    expect(declarations('.body')).toMatchObject({flex:'1 1 auto',overflow:'auto','min-height':'0'});
    expect(declarations('.actions')).toMatchObject({flex:'0 0 auto',display:'flex'});
    expect(declarations('.iconButton')).toMatchObject({display:'inline-flex',width:'22px',height:'22px',background:'transparent'});
    expect(declarations('.readonlyNote')).toMatchObject({color:'#888','font-size':'11px'});
  });
});
