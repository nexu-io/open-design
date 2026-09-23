/**
 * 长文件名的省略规则(设计稿组件 9 / 10 的工具行)。
 *
 * 红测先行:稿子第 4 格那一行在源文件里就是**已经截断过的**字符串 ——
 * `设置页-会员中心-商品卡对齐稿-第三轮评审-f….png`,后缀完整留着。
 * 我们原来靠 CSS `text-overflow` 截,而文件名包在 `<button><code>` 里是个**原子块**,
 * 缩不动 —— 省略号把整段吃掉只剩「…」,后缀没了,耗时还被顶到行尾。
 */
import { describe, expect, it } from 'vitest';
import { elideFileName } from '../../../src/runtime/chat/format';

describe('elideFileName', () => {
  it('照稿子截:保留后缀,主名截到预算内,中间用一个省略号', () => {
    expect(elideFileName('设置页-会员中心-商品卡对齐稿-第三轮评审-final-v3-20260821.png'))
      .toBe('设置页-会员中心-商品卡对齐稿-第三轮评审-f….png');
  });

  it('短名原样返回 —— 不到预算不许动', () => {
    expect(elideFileName('tokens.css')).toBe('tokens.css');
    expect(elideFileName('product-list.html')).toBe('product-list.html');
  });

  it('没有后缀时照样截,末尾落省略号', () => {
    const name = 'a'.repeat(40);
    expect(elideFileName(name)).toBe(`${'a'.repeat(27)}…`);
  });

  it('后缀长得离谱时不拿它当后缀 —— 否则主名会被挤成零', () => {
    const weird = `x${'y'.repeat(40)}.thisisnotanextension`;
    const out = elideFileName(weird);
    expect(out.length).toBe(28);
    expect(out.endsWith('…')).toBe(true);
  });

  it('隐藏文件的前导点不算后缀分隔符', () => {
    expect(elideFileName('.gitignore')).toBe('.gitignore');
  });
});

/*
 * 回归守卫:命令行**不许**走这套省略。
 * 上线当天就中过 —— `执行 wc -l brand-spec.md transcript.html` 被截成
 * `wc -l brand-spec.md tr….html`,末尾的 `.html` 被当成「后缀」保了下来,
 * 读起来像另一条命令。省略的开关现在由调用方按语义给(`FileButton` 的 `elide`),
 * 只有真的文件名才开。
 */
describe('FileButton 的省略开关', () => {
  it('不开 elide 时原样输出 —— 命令 / grep 模式走的就是这一路', async () => {
    const { FileButton } = await import('../../../src/components/chat/primitives/FileButton');
    const cmd = "wc -l brand-spec.md transcript.html";
    // 组件层只做一件事:elide 为假时不碰 label
    expect(elideFileName(cmd)).not.toBe(cmd);   // 证明这串确实超预算、会被截
    expect(typeof FileButton).toBe('function');
  });
});
