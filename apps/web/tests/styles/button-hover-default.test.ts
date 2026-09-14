/**
 * 红测:全局那条 `button:hover` 只能是**兜底**,不能压过组件自己的 hover。
 *
 * 用户 2026-08-27 指认:「为什么我们系统里的按钮,hover 上去会变成这样…很多按钮
 * 都是…hover 不是应该变成稍微亮一点点的颜色吗,而不是一整个按钮全变成白色」。
 *
 * 成因是**特异性**,不是哪个组件写错了:
 *   `button:hover:not(:disabled)`  → (0,2,1)
 *   `.AudioArtifact_play:hover`    → (0,2,0)
 * 于是一颗深色实心播放键 hover 时被全局那条刷成 `--bg-subtle`(近白),
 * 组件自己那条 `opacity: .86` 根本不算数。仓里已经有十几处在跟它打这场层叠仗。
 *
 * 修法是把它**包进 `:where()`**:特异性归零,它就退回它本来的身份 —— 默认值。
 * 谁都能覆盖它,而没写 hover 的裸 button 仍然有这层默认。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const primitives = readFileSync(
  new URL('../../src/styles/primitives.css', import.meta.url),
  'utf8',
);
/*
 * `packages/components` 里有**同一条规则的第二份拷贝**,而且两份都会被加载。
 * 2026-08-27 就栽在这里:只改了 app 那份,在真机上量出来两条规则都还在,
 * 那条裸选择器照样赢。所以这一条必须两份一起钉。
 */
const shared = readFileSync(
  new URL('../../../../packages/components/src/styles.css', import.meta.url),
  'utf8',
);

describe('全局 button hover 是兜底,不是赢家', () => {
  it.each([['primitives.css', () => primitives], ['packages/components', () => shared]])(
    '%s: carries zero specificity so any component rule wins',
    (_name, get) => {
    const line = get()
      .split('\n')
      .find((l) => l.includes('button') && l.includes(':hover') && l.includes('background'));
    expect(line, 'primitives.css 里找不到那条全局 hover').toBeTruthy();
    expect(
      line,
      '裸选择器 = (0,2,1),会压过组件自己的单类 hover(0,2,0)',
    ).toMatch(/:where\(/);
  });

  it('still provides the fallback fill for plain buttons', () => {
    // 归零特异性 ≠ 删掉它 —— 没写 hover 的按钮仍然要有反馈
    const line = primitives
      .split('\n')
      .find((l) => l.includes(':where(button') && l.includes(':hover'));
    expect(line).toMatch(/background:/);
  });
});
