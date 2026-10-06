/**
 * 视觉方向卡的**画幅**必须等于素材的画幅 —— 否则 `object-fit: cover` 会把图切掉。
 *
 * ## 用户看到的
 *
 *   「这里卡片可能要改成更适合展示完整图片的尺寸,竖着的展示不全」(2026-08-27)
 *
 * ## 量出来的事实(不是推测)
 *
 * 目录里全部 **96** 张预览图逐张下载读 WebP 头,尺寸**全是 `1600 × 1200`**:
 *
 * | 上下文 | 张数 | 尺寸 |
 * |---|---|---|
 * | deck | 25 | 1600×1200 |
 * | prototype | 26 | 1600×1200 |
 * | document | 11 | 1600×1200 |
 * | image | 22 | 1600×1200 |
 * | video | 12 | 1600×1200 |
 *
 * 也就是 **4:3 横图**,一张不差。而卡片是**竖的**:叠放态 `5/7`(0.714)、
 * 网格态 `422/560`(0.754)。`.qf-visual-preview-image` 是 `object-fit: cover`,
 * 于是横图按高度铺满、左右各切掉一截:
 *
 *   叠放态可见宽度 = 0.714 / 1.333 = **53.6%**(切掉 46.4%)
 *   网格态可见宽度 = 0.754 / 1.333 = **56.5%**(切掉 43.5%)
 *
 * 「竖着的展示不全」说的就是这个:一半的构图根本没进画面。
 *
 * ## 稿子怎么说
 *
 * 交付稿(`1bbdce0b06`,md5 `28ea4c65…`)自己写着这条规则该怎么改:
 *
 *   「铺开时格子按【图本身的画幅】,不切图。原来是 1:1,而素材是 422×560 的竖图 ——
 *     方格子配 cover,上下各被切掉一截。铺开就是为了挨个比构图,把构图切了
 *     等于把要比的东西拿走了。数字直接写素材的像素……**真素材换进来只要仍是
 *     同一画幅,改这一行即可**。」
 *
 * 稿子里的 `422 × 560` 是**占位素材**的尺寸(稿子在同一段里把这一点写明了:
 * 「视觉选项 .vpv 仍然是纯占位灰」)。真素材已经换进来了,而且仍是同一画幅
 * (96 张全是 1600×1200),所以这里做的正是稿子交代的那一步:改这一行。
 *
 * 叠放态的 `5/7` 是稿子从上游 image-stack 抄来的**卡片形状**,稿子承认那一档
 * 「切了还说得过去(那是一沓卡片的形状)」。产品 2026-08-27 覆盖了这一条:
 * 要的是**看得全**,不是卡片好看。两档因此统一到素材的 4/3。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const COMPOSIO = strip(
  readFileSync(resolve(HERE, '../../../src/styles/viewer/composio.css'), 'utf-8'),
);

/** 素材实测画幅 —— 96 张逐张读 WebP 头,无一例外。 */
const ASSET_W = 1600;
const ASSET_H = 1200;
const ASSET_RATIO = ASSET_W / ASSET_H;

/**
 * 只按【顶层逗号】拆选择器组:`:is(.a, .b)` 里的逗号是参数分隔,不是选择器组分隔。
 * 一把 `split(',')` 切下去会切出 `:is(.a` 和 `.b)` 这种不存在的选择器,而且是静默变绿。
 * (和 `visual-option-stack-opacity.test.ts` 同一把尺子。)
 */
function splitTopLevel(selectorList: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of selectorList) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

type Rule = { sel: string; body: string };

function rules(css: string): Rule[] {
  const out: Rule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = (m[2] ?? '').replace(/\s+/g, ' ').trim();
    for (const sel of splitTopLevel(m[1] ?? '')) {
      if (sel && !sel.startsWith('@')) out.push({ sel, body });
    }
  }
  return out;
}

const RULES = rules(COMPOSIO);

/** `aspect-ratio: 4 / 3` → 1.333…;写成 `4/3` 或带空格都认。 */
function declaredRatio(body: string): number | null {
  const m = /(?:^|;)\s*aspect-ratio\s*:\s*([0-9.]+)\s*(?:\/\s*([0-9.]+))?/.exec(body);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] === undefined ? 1 : Number(m[2]);
  return a / b;
}

const close = (a: number, b: number) => Math.abs(a - b) < 0.001;

describe('拆选择器只切顶层逗号', () => {
  it(':is() 里的逗号不算选择器组分隔', () => {
    expect(splitTopLevel('.a, .b')).toEqual(['.a', '.b']);
    expect(splitTopLevel(':is(.a, .b)')).toEqual([':is(.a, .b)']);
    expect(splitTopLevel('.x:has(~ :is(.a, .b)), .y')).toEqual(['.x:has(~ :is(.a, .b))', '.y']);
  });
});

describe('预览面的画幅 = 素材的画幅', () => {
  /** 先证明筛子能筛到东西 —— 否则下面几条是空过。 */
  it('筛子有效:预览面在两档视图下各有一条 aspect-ratio', () => {
    const withRatio = RULES.filter(
      (r) => /\.qf-visual-(preview|card-preview)\b/.test(r.sel) && declaredRatio(r.body) !== null,
    );
    expect(withRatio.length).toBeGreaterThanOrEqual(3);
  });

  it('叠放态:预览面是 4/3,不再是 5/7 的竖卡', () => {
    const fan = RULES.filter(
      (r) => r.sel.includes("[data-view='fan']") && /\.qf-visual-(preview|card-preview)$/.test(r.sel),
    );
    expect(fan.length, "叠放态没有任何一条规则给预览面定画幅").toBeGreaterThan(0);
    for (const r of fan) {
      const ratio = declaredRatio(r.body);
      expect(ratio, `${r.sel} 没写 aspect-ratio`).not.toBeNull();
      expect(
        close(ratio!, ASSET_RATIO),
        `${r.sel} 的画幅是 ${ratio},素材是 ${ASSET_W}×${ASSET_H}(${ASSET_RATIO});` +
          ` object-fit: cover 会把 ${((1 - ratio! / ASSET_RATIO) * 100).toFixed(1)}% 的宽度切掉`,
      ).toBe(true);
    }
  });

  it('网格态:预览面同样是 4/3,不再是占位素材那个 422/560', () => {
    const grid = RULES.filter(
      (r) => r.sel.includes("[data-view='grid']") && /\.qf-visual-preview$/.test(r.sel),
    );
    expect(grid.length, '网格态没有任何一条规则给预览面定画幅').toBeGreaterThan(0);
    for (const r of grid) {
      const ratio = declaredRatio(r.body);
      expect(close(ratio!, ASSET_RATIO), `${r.sel} 的画幅是 ${ratio}`).toBe(true);
    }
  });

  /**
   * 图**必须**仍然铺满卡面(`cover`)。改成 `contain` 也能「不切图」,但那会在
   * 卡面上留出两道空条 —— 稿子的 `.vpv` 是一整块图,不是带画框的图。
   * 画幅一致 + cover = 既铺满又一刀不切。
   */
  it('图仍然是 cover —— 靠对齐画幅不切图,不是靠留白', () => {
    const img = RULES.find((r) => r.sel === '.qf-visual-preview-image');
    expect(img, '.qf-visual-preview-image 不见了').toBeTruthy();
    expect(img!.body).toMatch(/object-fit:\s*cover/);
  });

  /**
   * 一沓的高度 `--qf-fan-h` 得跟着画幅走:横过来之后卡矮了一大截,
   * 高度不改的话这一沓下面会空出一大片,左右箭头也跟着掉到卡外面
   * (箭头靠 `.qf-visual-stage` 的高度对齐垂直中线)。
   */
  it('一沓的高度跟着横过来的卡收窄了', () => {
    const fanVars = RULES.find(
      (r) => r.sel === ".qf-visual-picker[data-view='fan']" && /--qf-fan-h/.test(r.body),
    );
    expect(fanVars, '--qf-fan-h 的定义处不见了').toBeTruthy();

    const h = Number(/--qf-fan-h:\s*(\d+)px/.exec(fanVars!.body)?.[1]);
    const w = Number(/--qf-fan-w:\s*(\d+)px/.exec(fanVars!.body)?.[1]);
    expect(Number.isFinite(h) && Number.isFinite(w)).toBe(true);

    // 竖卡时代是 244px(卡 152×212)。横过来之后卡只有 w×3/4 高,一沓不该还占 244。
    expect(h).toBeLessThan(244);
    // 但也要装得下:顶部内缩 + 卡身。卡身 ≈ (w - 2) * 3/4 + 2。
    expect(h).toBeGreaterThan(((w - 2) * 3) / 4 + 2);
  });
});
