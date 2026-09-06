/**
 * 视觉调性是**单选**。
 *
 * 用户裁决(2026-08-27):「就是要单选啊,为啥要选两个风格? …最终 html 只会有
 * 一种风格才对吧? 除非我强制要 agent 把两个风格融合,不然默认都应该是一个风格」。
 *
 * 支撑这条的调查(subagent,同日):
 *  · 代码里**没有任何地方硬编码 2** —— 解析与执行都读模型给的数;那个 2 只活在
 *    提示词的示例里,而模型在 10 个真实表单里三次发出调性题,**三次都照抄了 2**。
 *  · 下游**没有任何东西融合两个调性**:两个值只是被 `formatFormAnswers` 用逗号
 *    拼成一行散文;daemon 从不按题目 id 解析正文;所有提示词都是单数的
 *    (「Pick **a direction**」/「Choose the **best-matching** option」),
 *    唯一相关的明文规则还是反面的(`design-templates/replit-deck/references/themes.md:22`
 *    「Never mix two themes in one deck」)。
 *  · 后果:界面承诺了一对,而没有任何代码或提示词把它当成一对用 —— 实际上
 *    有一个会悄悄胜出。
 *
 * 顺带修掉一个真实死路:预填正好填满 `maxSelections`,于是这一题**一打开就到上限**,
 * 之后每次新点击都是「你得先自己发现要取消一个」。改成单选后不存在这个状态。
 *
 * 两份提示词是**镜像**的(daemon 一份、contracts 一份给 BYOK 用),必须一起改 ——
 * 只改一份会让两条通路给出不同的表单。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string): string => readFileSync(resolve(__dirname, '../..', p), 'utf8');

const daemonPrompt = read('src/prompts/discovery.ts');
const contractsPrompt = readFileSync(
  resolve(__dirname, '../../../../packages/contracts/src/prompts/discovery.ts'),
  'utf8',
);

/** 取调性那一题的示例 JSON 片段 */
function toneExample(src: string): string {
  const i = src.indexOf('"id": "tone"');
  if (i < 0) throw new Error('tone example not found — 改名了,断言会空转');
  return src.slice(i, src.indexOf('},', i));
}

describe('调性题是单选', () => {
  for (const [name, src] of [['daemon', daemonPrompt], ['contracts', contractsPrompt]] as const) {
    it(`${name}:示例用 radio,不是 checkbox`, () => {
      expect(toneExample(src)).toMatch(/"type":\s*"radio"/);
    });

    it(`${name}:示例不再带 maxSelections`, () => {
      expect(toneExample(src)).not.toMatch(/maxSelections/);
    });

    it(`${name}:选项还在 —— 别把这题整个删了`, () => {
      expect(toneExample(src)).toMatch(/"options"/);
      expect(toneExample(src)).toMatch(/Modern minimal/);
    });
  }

  it('maxSelections 这个能力本身保留 —— 别的题可能真需要限量', () => {
    expect(daemonPrompt).toMatch(/maxSelections/);
    expect(contractsPrompt).toMatch(/maxSelections/);
  });

  it('两份提示词的调性题保持一致 —— 它们是镜像', () => {
    const strip = (s: string) => s.replace(/\s+/g, ' ').trim();
    expect(strip(toneExample(daemonPrompt))).toBe(strip(toneExample(contractsPrompt)));
  });
});
