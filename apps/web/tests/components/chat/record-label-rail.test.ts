/**
 * 执行记录的顶层折叠头与工具行共用同一条 16px 图标列；图标后的 gap 也必须相同，
 * 否则同级名称会落在 23px / 24px 两条相邻竖线上。这个 1px 残留记录在
 * `specs/current/chat-panel-feedback.md` §F-18，OPEND-2516 的截图正好把它暴露出来。
 *
 * ⚠️ 列宽 15 → 16 是 `629cb3586a` 改的（槽和它装的图标同宽），名称落点跟着 22 → 23；
 *    `.step`（计划序号）和 `.mark`（状态记号）不在此列，两列仍是 15px。
 *    这条测试本身只钉 gap，改的是上面这段说明里过期的两个数。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(
  resolve(HERE, '../../../src/components/chat/primitives/record.module.css'),
  'utf-8',
).replace(/\/\*[\s\S]*?\*\//g, '');

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^{}]*)\\}`, 'm').exec(CSS);
  if (!match?.[1]) throw new Error(`找不到 CSS 规则: ${selector}`);
  return match[1];
}

function gapOf(selector: string): string {
  const match = /(?:^|;)\s*gap:\s*([^;]+)/.exec(ruleBody(selector));
  if (!match?.[1]) throw new Error(`CSS 规则没有 gap: ${selector}`);
  return match[1].trim();
}

describe('执行记录同级行的文字基线', () => {
  it('折叠头和工具行使用同一个图标到名称间距', () => {
    expect(gapOf('.fold > summary')).toBe('7px');
    expect(gapOf('.tool')).toBe(gapOf('.fold > summary'));
  });
});
