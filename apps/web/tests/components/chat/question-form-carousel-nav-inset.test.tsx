// @vitest-environment jsdom
/**
 * OPEND-2633 —— 一沓的「下一张」箭头压在卡片上,把选中那张切掉一块。
 *
 * ── 稿子怎么说 ────────────────────────────────────────────────
 * 交付稿 `729fa43ce7:docs/design/chat-panel/src/visual-fan.css` 148–153:
 *
 * ```css
 * .opts.mod-visual .vnav {
 *   position: absolute; inset-inline: 11px; bottom: 10px;
 *   height: var(--fan-h);
 *   display: flex; align-items: center; justify-content: space-between;
 *   pointer-events: none;
 * }
 * ```
 *
 * 两件事要照着做,我们各错了一件:
 *
 * **① 11px 是从卡的内容边量的,只量一次。**
 * 稿子里 `.vnav` 的定位祖先是 `.opts.mod-visual`(visual-fan.css:11,
 * `position: relative; padding: 0 11px 10px`)—— 那是**整张卡宽**的盒子,
 * 所以 `inset-inline: 11px` 落在内容边上,和「换一批 / 随机」那一行的左右
 * 内距同一条线。`specs/current/chat-panel-feedback.md` 234 行就是这句:
 * 「11px 和「换一批 / 随机」那一行的左右内距是同一个数,三者竖向边界因此对齐」。
 *
 * 我们的定位祖先是 `.qf-visual-stage`,而它**已经**用 `margin-inline: 11px`
 * 把这条 gutter 吃掉了(composio.css 的注释自己写着这件事)。在它里面再写一次
 * `inset-inline: 11px`,11px 就被数了两遍 —— 箭头比稿子往里挪了 11px,
 * 一头扎进卡片区。工单截图里那条红线就是稿子的这条内容边。
 *
 * **② 稿子没给 `.vnav` 任何 z-index。**
 * `.vopt` 带 `z-index: 4/3/2/1`(visual-fan.css:118–122),`.vwrap` 不建层叠上下文,
 * 所以稿子里**卡片盖在箭头上**。我们写了 `z-index: 6`,比最前面那张(4)、
 * 比 hover 放大那张(5)都高 —— 于是反过来变成**箭头盖在卡片上**,
 * 也就是工单里「看起来被裁切了」的那一下。
 *
 * ── 这条测试量得到什么、量不到什么 ────────────────────────────
 * jsdom 不做布局,「箭头到底盖没盖住卡片」这种几何**在这里量不到**,
 * 只能真机看。这条测试钉的是上面两个**声明**,它们是几何的成因;
 * 真机复核仍然必须做(见交付清单)。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../../helpers/chat-mirror-cascade';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../..');
const COMPOSIO = stripComments(
  readFileSync(resolve(WEB, 'src/styles/viewer/composio.css'), 'utf-8'),
);

/** 取某条规则的声明块正文(共享量尺不收 margin / inset,只能读规则文本)。 */
function declarationsFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = new RegExp(`(^|})\\s*${escaped}\\s*\\{([^{}]*)\\}`, 'm').exec(COMPOSIO)?.[2];
  expect(found, `样式表里找不到规则 \`${selector}\``).toBeTruthy();
  return found ?? '';
}

function pxOf(block: string, prop: string): number | undefined {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*(-?[\\d.]+)px\\s*(?:;|$)`, 'm').exec(block);
  return m ? Number(m[1]) : undefined;
}

/** 稿子 `visual-fan.css:11 + 148` —— 从卡的内容边量,只量这一次。 */
const DESIGN_NAV_GUTTER_PX = 11;
/** 稿子 `visual-fan.css:118–122` 最前面那张,以及 hover 放大那一档。 */
const FAN_CARD_TOP_Z = 4;
const FAN_CARD_HOVER_Z = 5;

describe('OPEND-2633 · 一沓的翻页箭头', () => {
  it('11px 的 gutter 只数一遍 —— 箭头落在卡的内容边上', () => {
    const stage = declarationsFor('.qf-visual-stage');
    const nav = declarationsFor('.qf-visual-nav');
    const stageGutter = pxOf(stage, 'margin-inline') ?? 0;
    const navInset = pxOf(nav, 'inset-inline') ?? 0;
    expect(
      stageGutter + navInset,
      `箭头距卡边 ${stageGutter + navInset}px:\`.qf-visual-stage\` 的 ` +
        `margin-inline(${stageGutter}px)已经把 gutter 吃掉了,\`.qf-visual-nav\` ` +
        `又写了一次 inset-inline(${navInset}px),同一条 11px 数了两遍`,
    ).toBe(DESIGN_NAV_GUTTER_PX);
  });

  it('箭头不许盖在卡片上 —— 稿子的 `.vnav` 根本没有 z-index', () => {
    const nav = declarationsFor('.qf-visual-nav');
    const z = /(?:^|;)\s*z-index\s*:\s*(-?\d+)\s*(?:;|$)/m.exec(nav)?.[1];
    const navZ = z === undefined ? 0 : Number(z);
    expect(
      navZ,
      `\`.qf-visual-nav\` 写了 z-index: ${z} —— 比最前面那张卡(${FAN_CARD_TOP_Z})` +
        `和 hover 放大那张(${FAN_CARD_HOVER_Z})都高,箭头因此画在卡片之上。` +
        '稿子给 `.vnav` 的是「没有 z-index」,卡片盖箭头。',
    ).toBeLessThan(FAN_CARD_TOP_Z);
  });

  it('前提没变:一沓的卡片仍然自带 4 / 5 两档层叠(判据的锚)', () => {
    // 上一条的判据挂在这两个数上。哪天卡片的层叠改了,这里先红,
    // 免得上面那条在一个已经不成立的前提上继续「绿着」。
    const front = declarationsFor(
      ".qf-visual-picker[data-view='fan'] .qf-visual-card:nth-child(1)",
    );
    expect(/z-index\s*:\s*4/.test(front)).toBe(true);
    expect(
      /z-index\s*:\s*5/.test(COMPOSIO),
      'hover 放大那一档的 z-index: 5 不见了',
    ).toBe(true);
  });
});
