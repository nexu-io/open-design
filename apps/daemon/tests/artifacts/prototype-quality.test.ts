import { describe, expect, it } from 'vitest';
import { inspectPrototypeScripts, qualityStatus, prototypeRequiredControls } from '../../src/artifacts/prototype-quality.js';

describe('host prototype static checks', () => {
  it('keeps explicitly named business modes when tab is a postfix', () => {
    expect(prototypeRequiredControls('Build a 点餐应用，支持堂食和自提 tab 切换。')).toEqual({ labels: ['堂食', '自提'], unresolved: false });
    expect(prototypeRequiredControls('主导航有今日和药品')).toEqual({ labels: ['今日', '药品'], unresolved: false });
  });
  it('detects native hashchange bound to document', () => {
    expect(inspectPrototypeScripts('index.html', '<script>document.addEventListener("hashchange", render)</script>'))
      .toMatchObject([{ kind: 'static', status: 'fail', reason: 'hashchange_requires_window' }]);
  });
  it('preserves valid delegation and native window binding', () => {
    expect(inspectPrototypeScripts('index.html', '<script>document.addEventListener("click", render); window.addEventListener("hashchange", render)</script>')).toEqual([]);
  });
  it('does not claim a shadowed document is the native document', () => {
    expect(inspectPrototypeScripts('index.html', '<script>const document = emitter; document.addEventListener("hashchange", render)</script>')).toEqual([]);
  });
  it('retains explicit failure even if browser coverage is incomplete', () => {
    expect(qualityStatus([{ id: 'x', kind: 'static', status: 'fail' }], false)).toBe('fail');
    expect(qualityStatus([], false)).toBe('incomplete');
  });
  it('keeps natural-language named-entry coverage unknown rather than trusting artifact discovery', () => {
    const result = prototypeRequiredControls('还需要药品管理、提醒设置、漏服处理、健康趋势和家属查看入口。');
    expect(result).toEqual({ labels: ['药品', '提醒', '趋势'], unresolved: true });
  });

  it('does not interpret a computed method variable as the native method', () => {
    expect(inspectPrototypeScripts('index.js', `const addEventListener='customMethod';document[addEventListener]('hashchange',()=>{});`)).toEqual([]);
    expect(inspectPrototypeScripts('index.js', `function document(){};document.addEventListener('hashchange',()=>{});`)).toEqual([]);
  });

});
