// @vitest-environment jsdom
/**
 * 计划卡里那几步的墨色(PR #7170 的 `plan-todo.css`)。
 *
 * 稿子这一版把「不是当前这一步」的三档(未开始 / 做完了 / **取消了**)收成同一枚
 * token —— `--plan-other-text`,原文那一行改的就是 `.steps li.is-skip`:
 *   `- .steps li.is-skip { color: var(--text-soft) }`
 *   `+ .steps li.is-skip { color: var(--plan-other-text) }`
 * 也就是说:**取消掉的那一步不额外挑一档灰**,它和别的非当前步同一档,
 * 「被划掉」这件事由那条线自己说。当前这一步是唯一深的一行。
 *
 * ⚠️ 这里有一处会打架的地方,是这条改动逼出来的:
 * 划线复用的是执行记录那枚 `.struck`,而 `.struck` **自带 `--chat-text-muted`**。
 * 行是 soft、字是 muted —— 同一行里两档灰,而且记号(StatusMark)跟着行走、
 * 文字跟着 `.struck` 走,深浅正好反着。颜色只能有一个所有者:线归 `.struck`,
 * 墨归这一行。暗色主题下两枚 token 的翻转方向不同(soft 不变、muted 变浅),
 * 不收口的话暗色里这一行会比周围**更亮**,读成「被强调了」。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { I18nProvider } from '../../../src/i18n';
import { PlanPill } from '../../../src/components/chat/PlanPill';

afterEach(cleanup);

const read = (file: string): string =>
  readFileSync(resolve(__dirname, '../../../src/components/chat', file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

const PLAN_CSS = read('PlanPill.module.css');

function declsOf(css: string, selector: string): string {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const one of (m[1] ?? '').split(',')) {
      if (one.replace(/\s+/g, ' ').trim() === selector) return (m[2] ?? '').replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

describe('计划卡:非当前的几步同一档灰', () => {
  it('未开始那一档走 plan 的非当前墨色', () => {
    const decls = declsOf(PLAN_CSS, '.steps li');
    expect(decls, '找不到 .steps li 规则').not.toBe('');
    expect(decls).toMatch(/color: var\(--chat-text-soft\)/);
  });

  it('做完 / 取消掉的那几步不另挑一档灰,和未开始同色', () => {
    expect(declsOf(PLAN_CSS, '.steps li.done')).toMatch(/color: var\(--chat-text-soft\)/);
  });

  /*
   * ⚠️ 这一条 2026-09-02 由 W73 改过一次:原文钉的是 `--chat-text-strong`。
   *
   * 那个 `--chat-text-strong` **不是产品裁决**,是本文件建档那天(同一天,
   * `1626b893df`)顺手写下的「当前步是唯一深的一行」这句话的实现细节 ——
   * 本文件真正的锚点是**上面**那两条(非当前的三档收成同一枚灰),出处是
   * PR #7170 的 `plan-todo.css`;这一条只是它的反向对照。
   *
   * 逐格对稿基线 `729fa43ce7`(= 更早的 `361b78253e`,这两枚变量一个字没改)
   * 给的是**另一枚**变量:
   *   `components.css:2007-2009` `.steps, .pmini { --plan-current-text: #353535 }`
   *   `components.css:2070`      `.steps li.is-now { color: var(--plan-current-text) }`
   * `#353535` 比 `--chat-text-strong`(#202020)浅一档。原来那枚是把「深」
   * 就近映射到了现成的接缝 token,不是稿子写的东西。
   * 现在收敛到 `--chat-plan-current-text`(接缝里亮暗两个作用域各一处,均 #353535)。
   * 这一条要说的话没变:**当前这一步仍然是唯一深的一行**。
   * 逐值对稿在 `w73-composer-and-plan-ink.test.tsx`。
   */
  it('反向对照:当前这一步仍然是唯一深的一行', () => {
    const now = declsOf(PLAN_CSS, '.steps li.now');
    expect(now).toMatch(/color: var\(--chat-plan-current-text\)/);
    expect(now).toMatch(/font-weight: 600/);
  });

  it('划线只画线:墨色跟着这一行走,不由 `.struck` 再说一次', () => {
    /*
     * `.struck` 是 (0,1,0);这一条必须**严格更特指**,否则平手按源码顺序判,
     * 而两个文件谁先进 bundle 不由这里决定 —— 那就成了「今天碰巧对」。
     */
    const decls = declsOf(PLAN_CSS, '.steps li.done .tx > *');
    expect(decls, '找不到收口规则').not.toBe('');
    expect(decls).toMatch(/color: inherit/);
  });

  it('这几条一律走 --chat-* 接缝,没有写死的色值(暗色主题靠它翻)', () => {
    for (const sel of ['.steps li', '.steps li.done', '.steps li.now']) {
      expect(declsOf(PLAN_CSS, sel), sel).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});

describe('结构对照:取消掉那一步真的既有行色又有划线', () => {
  it('划线挂在文字上,行色挂在 li 上 —— 两者不是同一个元素', () => {
    render(
      <I18nProvider initial="zh-CN">
        <PlanPill
          running
          todos={[
            { content: '第一步', status: 'completed' },
            { content: '第二步', status: 'in_progress' },
            { content: '第三步', status: 'pending' },
          ]}
        />
      </I18nProvider>,
    );
    const struck = screen.getByText('第一步');
    expect(struck.className).toMatch(/struck/);
    const li = struck.closest('li');
    expect(li).not.toBeNull();
    expect(li!.className).toMatch(/done/);
    // 划线在内层,不在 li 上 —— 线只跟着文字走,不铺满整行
    expect(li!.className).not.toMatch(/struck/);
  });
});
