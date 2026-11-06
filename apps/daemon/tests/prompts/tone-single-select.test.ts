/**
 * 视觉调性那道题**已整题下线**(T69,2026-09-07)。
 *
 * ⚠️ 文件名还叫 `tone-single-select` 是**故意的** —— 这里是那条裁决链的落点,
 * 改名会让「当年为什么定成单选、后来为什么整题没了」这段线索断掉。
 *
 * ── 现在的裁决(2026-09-07,产品逐字)──────────────────────────
 *
 *   「选中态就是当前切换到的那个效果,或者你能否把提示词里让 agent 感知到
 *     question-form 能出设计风格的那些提示词下掉?**不问了**,这些代码先讲提示词
 *     干掉,组件代码注释,后续可能要找回」
 *
 * 于是开场简报里那道 `{ "id": "tone", "label": "Visual tone", "type": "radio" }`
 * 整条撤掉。它是设计风格选择卡的**第二个入口**,而且比 `direction-cards` 隐蔽 ——
 * 它长得像一道普通单选,渲染时却被 `QuestionForm.tsx` 的 `asksVisualDirection`
 * (`q.id === 'tone'`)认走,换成整份风格目录。只撤 `direction-cards` 会留下它。
 *
 * ── 被这条推翻的旧裁决 ───────────────────────────────────────
 *
 * **2026-08-27 用户裁决**(原文):「就是要单选啊,为啥要选两个风格? …最终 html
 * 只会有一种风格才对吧? 除非我强制要 agent 把两个风格融合,不然默认都应该是
 * 一个风格」。当时的调查支撑(同日 subagent)如下,**结论本身没有被证伪**,
 * 只是它守的那道题不存在了:
 *  · 代码里没有任何地方硬编码 2 —— 那个 2 只活在提示词的示例里,而模型在 10 个
 *    真实表单里三次发出调性题,三次都照抄了 2;
 *  · 下游没有任何东西融合两个调性:两个值只是被 `formatFormAnswers` 拼成一行散文;
 *  · 后果是界面承诺了一对,却没有代码把它当成一对用 —— 实际有一个会悄悄胜出。
 *
 * 原文件里那条 `选项还在 —— 别把这题整个删了` 是**防误删**的守卫。这次的删除
 * **不是误删,是产品指令**,所以它连同其余调性断言一起退场,换成下面的反向守卫。
 *
 * ── 这里还留着什么 ───────────────────────────────────────────
 *
 * 一条正向守卫(`maxSelections` 这个能力本身别跟着一起被扫掉)和一条反向守卫
 * (调性题别被谁"顺手加回来")。提示词那七条路撤干净没有,由
 * `e2e/tests/question-form-visual-style-retired.test.ts` 正面守着。
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

const MIRRORS = [
  ['daemon', daemonPrompt],
  ['contracts', contractsPrompt],
] as const;

describe('调性题已整题下线(T69)', () => {
  for (const [name, src] of MIRRORS) {
    it(`${name}:开场简报的示例表单里没有调性题`, () => {
      expect(src).not.toMatch(/"id":\s*"tone"/);
      // 「Visual tone」这个标签也不许以别的 id 换皮回来
      expect(src).not.toContain('Visual tone');
    });

    it(`${name}:防真空 —— 示例表单本身还在,别的题一道没少`, () => {
      /* 少了这条,上面那条会因为「整个示例表单都没了」而假绿。
         四道题是撤掉调性之后应有的全部:做什么 / 给谁 / 品牌 / 多大体量。 */
      expect(src).toContain('<question-form id="discovery"');
      for (const id of ['output', 'audience', 'brand', 'scale']) {
        expect(src, `${id} 那道题不见了 —— 这次只该撤调性`).toMatch(
          new RegExp(`"id":\\s*"${id}"`),
        );
      }
    });
  }

  it('maxSelections 这个能力本身保留 —— 别的题可能真需要限量', () => {
    /* 这一条和调性题正交:它当年是顺带记下来的,今天仍然成立。
       调性题曾是唯一用到 `maxSelections` 的示例,撤题时很容易把规则一起扫掉。 */
    expect(daemonPrompt).toMatch(/maxSelections/);
    expect(contractsPrompt).toMatch(/maxSelections/);
  });

  it('两份提示词仍然是镜像 —— 只改一份会让两条通路给出不同的表单', () => {
    /* 原文件用「调性题那一段逐字相等」来守镜像关系。那一段没了,改用整份示例
       表单相等 —— 守的是同一件事,而且覆盖面更大。 */
    const formOf = (src: string): string => {
      const start = src.indexOf('<question-form id="discovery"');
      const end = src.indexOf('</question-form>', start);
      if (start < 0 || end < 0) throw new Error('示例表单找不到了 —— 断言会空转');
      return src.slice(start, end).replace(/\s+/g, ' ').trim();
    };
    expect(formOf(daemonPrompt)).toBe(formOf(contractsPrompt));
  });
});
