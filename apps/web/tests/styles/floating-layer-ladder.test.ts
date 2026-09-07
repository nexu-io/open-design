/**
 * 悬浮层的两档,别再各写各的数字。
 *
 * 2026-08-27 用户截图:一条深色 tooltip 盖在展开的产物卡导出菜单上。真因有两层
 *  · **层叠上下文**:浮层原来就地留在 `.artifact-card-acts`(`position:absolute;
 *    z-index:2`)里,不管写多大都只在那个 z=2 的盒子里排序 —— 这条由
 *    `artifact-card-parity.test.tsx` 的「浮层的层位」那一组守着(portal 到 body);
 *  · **数字本身**:提示层 4000、菜单层 9000,而新浮层随手写了 30。
 *
 * 这一条只守第二层:两个档位有名字、方向正确、而且真的被用上了。它是**文本
 * 检查**,不是视觉断言 —— 「画出来谁盖谁」只有真排版量得出,那一步走 headless
 * Chrome 的 CDP,不在这儿冒充。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, '../../src', rel), 'utf8');

const tokens = read('styles/tokens.css');
const primitives = read('styles/primitives.css');
/** 注释里会引用别处的数字(比如那个 z-index:2 的层叠上下文),先剥掉。 */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

const anchoredMenu = withoutComments(read('components/chat/AnchoredMenuShell.module.css'));

function tokenValue(name: string): number {
  const match = new RegExp(`--${name}:\\s*(\\d+)`).exec(tokens);
  expect(match, `tokens.css 里没有 --${name}`).toBeTruthy();
  return Number(match![1]);
}

describe('悬浮层的两档', () => {
  it('两个档位都在 tokens.css 里有名字', () => {
    expect(tokenValue('z-hint')).toBeGreaterThan(0);
    expect(tokenValue('z-menu')).toBeGreaterThan(0);
  });

  it('菜单层在提示层之上 —— 这是方向,不是巧合', () => {
    /*
     * 人主动打开的面板不该被一条没人要求的提示盖住。反过来(hint > menu)正是
     * 出事那次的形态。
     */
    expect(tokenValue('z-menu')).toBeGreaterThan(tokenValue('z-hint'));
  });

  it('提示层用的是 --z-hint,不是裸数字', () => {
    const rule = /\.od-tooltip-layer\s*\{[^}]*\}/.exec(primitives)?.[0] ?? '';
    expect(rule, '找不到 .od-tooltip-layer').not.toBe('');
    expect(rule).toContain('z-index: var(--z-hint)');
  });

  it('既有菜单层(od-select-menu)用的是 --z-menu', () => {
    const rule = /\.od-select-menu\s*\{[^}]*\}/.exec(primitives)?.[0] ?? '';
    expect(rule, '找不到 .od-select-menu').not.toBe('');
    expect(rule).toContain('z-index: var(--z-menu)');
  });

  it('搬到卡片旁边的那份菜单也落在菜单层,而不是自己挑一个刚好压过今天那条 tooltip 的数', () => {
    expect(anchoredMenu).toContain('z-index: var(--z-menu)');
    // 反向:整个文件里不许再出现裸的 z-index 数字
    const bare = anchoredMenu.match(/z-index:\s*\d+/g) ?? [];
    expect(bare, `锚定菜单的样式里还有裸数字 ${bare.join(', ')}`).toHaveLength(0);
  });
});

/**
 * 接缝:搬走的那份和原地那份**解析同一批变量**。
 *
 * 2026-08-27 有人问:浮层现在 portal 到 body 了,会不会像 composer 的引用条那样
 * 悄悄丢掉 `--chat-*`?真机量过(headless Chrome + CDP,`getComputedStyle` 与
 * `computedStyleMap()` 逐项比):
 *
 *   · 24 项标准属性 × 菜单本体和五类子元素 —— **零差异**(祖先类跟着 portal 走了);
 *   · 自定义属性 —— **零差异**。因为预览区那块菜单本来就长在 workspace 那一栏,
 *     跟聊天那一栏是兄弟,**原地那份也不在接缝里**。两边都取不到 `--chat-*`,
 *     一致。
 *
 * 所以这里**故意不挂 `chatSeam()`**:挂上去反而会造出不对称 —— 搬走的那份能解析
 * `--chat-border`、原地那份不能,于是哪天有人往 `.share-menu-*` 里写一个
 * `var(--chat-…)`,它会在卡片旁边好好的、在工具栏下面悄悄失效。一致地没有,
 * 比一半有一半没有安全。
 *
 * 代价是这条一致性没人守 —— 由下面这条守:菜单的样式里不许出现 `--chat-*`。
 */
describe('锚定菜单的变量作用域', () => {
  const shellCss = read('components/chat/AnchoredMenuShell.tsx');

  it('壳子不挂 chatSeam —— 挂了会让两种形态解析出不同的变量', () => {
    expect(shellCss).not.toContain('chatSeam');
  });

  it('菜单的样式不许依赖 --chat-*(两种形态都取不到,写了就是静默失效)', () => {
    for (const rel of ['styles/shell.css', 'styles/viewer/tools.css']) {
      const css = withoutComments(read(rel));
      const rules = css.split('}');
      const offenders = rules.filter(
        (rule) =>
          /\.(share-menu|chrome-unified|chrome-publish|chrome-access)/.test(rule) &&
          /var\(--chat-/.test(rule),
      );
      expect(offenders, `${rel} 里的菜单规则用了 --chat-*:\n${offenders.join('\n')}`).toHaveLength(0);
    }
  });

  it('锚定壳自己也不依赖 --chat-*(反向对照:它确实读了别的变量)', () => {
    const css = withoutComments(read('components/chat/AnchoredMenuShell.module.css'));
    expect(css).not.toMatch(/var\(--chat-/);
    // 反向:不是整份文件都没有 var(),否则上一条永真
    expect(css).toMatch(/var\(--z-menu\)/);
  });
});
