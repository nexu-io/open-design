import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

describe('S1-T2 scope menu container', () => {
  it('uses canvas spacing and elevation without changing the anchor', () => {
    const css = postcss.parse(readFileSync(resolve('src/components/share/ShareTab.module.css'), 'utf8'));
    const values: Record<string, string> = {};
    css.walkRules('.panel :global(.chrome-access-options)', rule => {
      rule.walkDecls(decl => { values[decl.prop] = decl.value; });
    });
    expect(values).toMatchObject({
      'box-sizing': 'border-box', padding: '4px', display: 'flex', 'flex-direction': 'column', gap: '2px',
      border: '1px solid #00000008', 'border-radius': '8px', background: '#FFFFFF',
      'box-shadow': '0 6px 20px #00000012, 0 1px 4px #00000006',
    });
    for (const property of ['position', 'top', 'left', 'right']) expect(values).not.toHaveProperty(property);
  });
});

describe('S1-T2 leading selection layout', () => {
  it('reserves one leading check column and fits translated labels', () => {
    const css = postcss.parse(readFileSync(resolve('src/components/share/ShareTab.module.css'), 'utf8'));
    const values = (selector: string) => {
      const result: Record<string, string> = {};
      css.walkRules(selector, rule => { rule.walkDecls(decl => { result[decl.prop] = decl.value; }); });
      return result;
    };
    expect(values('.panel :global(.chrome-access-options)')).toMatchObject({ width: 'max-content', 'min-width': '168px', 'max-width': '100%' });
    expect(values('.panel :global(.chrome-access-options button)')).toMatchObject({ 'grid-template-columns': '13px minmax(0, 1fr)' });
    expect(values('.panel :global(.chrome-access-options button > .share-menu-icon)')).toMatchObject({ display: 'none' });
    expect(values('.panel :global(.chrome-access-options button > span:nth-child(2))')).toMatchObject({ 'grid-column': '2', 'grid-row': '1' });
    expect(values('.panel :global(.chrome-access-options button > svg)')).toMatchObject({ 'grid-column': '1', 'grid-row': '1', width: '13px', height: '13px' });
  });
});

describe('S1-T2 scope option rows', () => {
  it('declares compact rows and neutral selected/hover feedback', () => {
    const css = postcss.parse(readFileSync(resolve('src/components/share/ShareTab.module.css'), 'utf8'));
    const declarations = (selector: string) => {
      const values: Record<string, string> = {};
      css.walkRules(selector, rule => { rule.walkDecls(decl => { values[decl.prop] = decl.value; }); });
      return values;
    };
    expect(declarations('.panel :global(.chrome-access-options button)')).toMatchObject({
      'box-sizing': 'border-box', height: '28px', 'min-height': '28px', padding: '0 8px',
      gap: '8px', border: '0', 'border-radius': '4px', color: '#494949', 'font-size': '12px', 'font-weight': '400',
    });
    for (const state of ['[aria-selected="true"]', ':hover:not(:disabled)']) {
      expect(declarations(`.panel :global(.chrome-access-options button${state})`)).toMatchObject({
        background: '#F2F2F4', color: '#1F1F1F',
      });
    }
  });
});

describe('S1-T/S4-T shared scope trigger', () => {
  it('places title and trigger in a canvas row and anchors the menu inward', () => {
    const css = postcss.parse(readFileSync(resolve('src/components/share/ShareTab.module.css'), 'utf8'));
    const values = (selector: string) => {
      const result: Record<string, string> = {};
      css.walkRules(selector, rule => { rule.walkDecls(decl => { result[decl.prop] = decl.value; }); });
      return result;
    };
    expect(values('.scopeRow')).toMatchObject({ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '12px', 'min-height': '28px' });
    expect(values('.panel :global(.chrome-access-options)')).toMatchObject({ 'inset-inline-start': 'auto', 'inset-inline-end': '0' });
  });
  it('adds the 20px section offset only when scope follows another section', () => {
    const css = postcss.parse(readFileSync(resolve('src/components/share/ShareTab.module.css'), 'utf8'));
    const values: Record<string, string> = {};
    css.walkRules('.scopeHeading:not(:first-child)', rule => {
      rule.walkDecls(decl => { values[decl.prop] = decl.value; });
    });
    expect(values).toEqual({ 'margin-block-start': '20px' });
    css.walkRules('.scopeHeading', rule => {
      rule.walkDecls(decl => { expect(decl.prop).not.toMatch(/^margin/); });
    });
  });
  it('removes only the legacy horizontal scope inset, preserving the anchor', () => {
    const css = postcss.parse(readFileSync(resolve('src/components/share/ShareTab.module.css'), 'utf8'));
    const values: Record<string, string> = {};
    css.walkRules('.panel :global(.chrome-access-select)', rule => {
      rule.walkDecls(decl => { values[decl.prop] = decl.value; });
    });
    expect(values).toEqual({ padding: '0', 'flex-shrink': '0' });
  });
  it('uses canvas scope heading typography without inheriting menu item insets', () => {
    const css = postcss.parse(readFileSync(resolve('src/components/share/ShareTab.module.css'), 'utf8'));
    const values: Record<string, string> = {};
    css.walkRules('.panel :global(.share-menu-section-label--help)', rule => {
      rule.walkDecls(decl => { values[decl.prop] = decl.value; });
    });
    expect(values).toMatchObject({ padding: '0', 'min-width': '0', 'overflow-wrap': 'anywhere', color: '#333333', 'font-size': '13px', 'line-height': '20px', 'font-weight': '500' });
  });
  it('hides decorative icons but preserves the busy slot and sizes the chevron', () => {
    const css = postcss.parse(readFileSync(resolve('src/components/share/ShareTab.module.css'), 'utf8'));
    const declarations = (selector: string) => {
      const values: Record<string, string> = {};
      css.walkRules(selector, rule => { rule.walkDecls(decl => { values[decl.prop] = decl.value; }); });
      return values;
    };
    expect(declarations('.panel :global(.chrome-access-trigger > .share-menu-icon:not(:has(.icon-spin)))')).toMatchObject({ display: 'none' });
    expect(declarations('.panel :global(.chrome-access-trigger > svg)')).toMatchObject({ width: '12px', height: '12px', 'flex-shrink': '0' });
    expect(declarations('.panel :global(.chrome-access-trigger > .share-menu-icon)')).not.toHaveProperty('display');
  });
  it('uses the compact canvas trigger only under ShareTab', () => {
    const css = postcss.parse(readFileSync(resolve('src/components/share/ShareTab.module.css'), 'utf8'));
    const values: Record<string, string> = {};
    css.walkRules('.panel :global(.chrome-access-trigger)', rule => {
      rule.walkDecls(decl => { values[decl.prop] = decl.value; });
    });
    expect(values).toMatchObject({
      'box-sizing': 'border-box', display: 'flex', 'align-items': 'center',
      'justify-content': 'space-between', width: 'fit-content', 'min-width': '88px',
      height: '28px', 'min-height': '28px', padding: '0 8px', border: '0',
      'border-radius': '5px', background: '#F6F6F6', color: '#555555',
      'font-size': '12px', gap: '8px',
    });
  });
});
