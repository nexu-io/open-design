// @vitest-environment jsdom
/**
 * OPEND-2558「next step 视觉重心加强」—— 下一步建议行的字重。
 *
 * ## 先说这个文件的来历,免得后来人重踩
 *
 * 这条测试的**第一版是假的**:它只注入了 `NextStepActions.module.css`,
 * 量到「补 `font-weight: 500` 之前是 `normal`」,于是宣称补上这一档就是修复。
 * 真实层叠里根本不是这样 —— `styles/primitives.css` 的全局 `button` 规则
 * 本来就写着 `font-weight: 500`(特异性 (0,0,1)),建议行**一直**是 500。
 * 少注入一层样式表,量出来的就是另一个产品。
 *
 * 所以这一版把**真实层叠**摆全:全局 `button` 规则 + 组件 CSS Module,
 * 顺序和产品里一致。
 *
 * ## 稿子里 500 是什么意思
 *
 * 最新基准 PR #7170 @ `8015870` 的 `.nexts button` 写 `font-weight: 500`,
 * 但稿子的 `body` 也是 `font-weight: 500`(`components.css` 的 body 规则),
 * 而稿子的全局 `button` 复位只写了 `font-family: inherit`、**没有**复位字重 ——
 * 也就是说稿子那一行 500 的语义是「把这个按钮**拉回正文同档**」,不是强调。
 *
 * 我们的 `body` 没有字重声明(继承 400),但全局 `button` 自己是 500。
 * 净效果:我们的建议行相对身边的助手正文**已经重一档**,方向和稿子相反。
 * 这层基线差(body 400 vs 500)是全局问题,不归这一个组件修 —— 待产品拍板,
 * 结论见交接报告。这里只锁住两件事:值是稿子的 500,且**由组件自己钉住**。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');
const GLOBAL_BUTTON_CSS = readFileSync(resolve(SRC, 'styles/primitives.css'), 'utf-8');
const MODULE_CSS = readFileSync(
  resolve(SRC, 'components/NextStepActions.module.css'),
  'utf-8',
);

/** 稿子的形状:外层无框容器 → 三条建议行,每行一枚箭头 + 一句话。 */
const MARKUP = `
  <div class="root">
    <div class="suggestions">
      <button type="button" class="suggestionRow" id="row-0">
        <svg viewBox="0 0 24 24"></svg><span class="suggestionText">再加一页订单列表</span>
      </button>
      <button type="button" class="suggestionRow" id="row-1">
        <svg viewBox="0 0 24 24"></svg><span class="suggestionText">把商品卡换成两列布局</span>
      </button>
      <button type="button" class="suggestionRow" id="row-2">
        <svg viewBox="0 0 24 24"></svg><span class="suggestionText">补一套深色模式</span>
      </button>
    </div>
  </div>`;

/** 按产品里的真实顺序铺样式表:全局在前,组件 Module 在后。 */
function mount(sheets: readonly string[]): void {
  document.head.innerHTML = '';
  for (const css of sheets) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }
  document.body.innerHTML = MARKUP;
}

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('下一步建议行的字重(OPEND-2558)', () => {
  it('真实层叠下三行都落在稿子的 500', () => {
    mount([GLOBAL_BUTTON_CSS, MODULE_CSS]);
    for (const id of ['row-0', 'row-1', 'row-2']) {
      expect(getComputedStyle(document.getElementById(id)!).fontWeight).toBe('500');
    }
  });

  /*
   * 这一条才是真正有信息量的:全局 `button { font-weight: 500 }` 是**遗留的
   * 全局按钮样式**,不是这一块的设计意图,随时可能被按钮体系的清理拿掉
   * (它同时还漏给这一行 `white-space: nowrap` / `height: 36px` /
   * `line-height: 1`,那三条本来就不该由全局按钮规则决定,见交接报告)。
   * 所以组件必须**自己钉住**稿子的值:把全局那一句拿掉之后,行仍然是 500。
   * 少了组件里那一行声明,这条会掉回浏览器默认的 `normal`。
   */
  it('组件自己钉住,不靠全局按钮规则施舍', () => {
    const withoutGlobalWeight = GLOBAL_BUTTON_CSS.replace(
      /(\n\s*)font-weight:\s*500;/,
      '$1/* removed for this test */',
    );
    expect(withoutGlobalWeight).not.toBe(GLOBAL_BUTTON_CSS);

    mount([withoutGlobalWeight, MODULE_CSS]);
    expect(getComputedStyle(document.getElementById('row-0')!).fontWeight).toBe('500');
  });

  /*
   * 加重是**一档**,不是往上顶到标题那一档。这一块自己的标题行(`.label`,
   * 稿子里没有、是我们多出来的)是 600;建议行必须停在它下面,否则收尾处会
   * 冒出第二个标题级重量,跟刚交付的产物卡抢注意力 —— 而稿子对这一块的原话
   * 是「不画框、不画分割线……静止时不显形」。
   */
  it('只到 medium,不越过这一块自己的标题行', () => {
    mount([GLOBAL_BUTTON_CSS, MODULE_CSS]);
    document.body.innerHTML = `<div class="root"><div class="label" id="label">标题</div>${MARKUP}</div>`;
    const row = Number(getComputedStyle(document.getElementById('row-0')!).fontWeight);
    const label = Number(getComputedStyle(document.getElementById('label')!).fontWeight);
    expect(row).toBeLessThan(label);
  });
});
