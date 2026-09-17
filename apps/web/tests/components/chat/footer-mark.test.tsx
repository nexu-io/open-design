// @vitest-environment jsdom
/**
 * 回合状态行左边那枚记号。跑完了是绿勾;**中断的那一轮不是** ——
 * 稿子 15-6 写着「绿点转灰」,因为这一轮并没有跑完,给它一枚完成勾是在说假话。
 *
 * 这条只看 CSS 的判据:换勾的规则必须把 canceled 也排除掉,
 * 不能只排除「还在流」和「有没做完的任务」。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/styles/viewer/theater.css'),
  'utf-8',
).replace(/\/\*[\s\S]*?\*\//g, '');

describe('回合状态行的记号', () => {
  it('中断的那一轮不戴完成勾', () => {
    const tick = CSS.split('\n').filter((l) => l.includes('.dot') && l.includes('.assistant-footer'));
    const rule = tick.find((l) => l.includes(':not('));
    expect(rule, '找不到换勾那条规则').toBeDefined();
    expect(rule, '换勾的规则没有排除 canceled').toContain('canceled');
  });
});
