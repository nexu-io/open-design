// @vitest-environment jsdom
/**
 * 音频产物:**播着的时候波形要动**,播放键要待在白行里(交付稿组件 24 · 第 43 / 44 格)。
 *
 * ## 稿子写了什么
 *
 *     .aud[data-playing] .wave > i {
 *       animation: wave-pulse 0.55s var(--ease-out) infinite;
 *       animation-delay: calc(var(--i) * 18ms);
 *     }
 *     @keyframes wave-pulse { 0%{scaleY(.72)} 50%{scaleY(1)} 100%{scaleY(.78)} }
 *     @media (prefers-reduced-motion: reduce){ .aud[data-playing] .wave > i { animation: none } }
 *
 * 稿子把这一下的语义写得很清楚:它**不表示音量**(音量已经由柱高定死了),
 * 表示的是「还在响」。所以是**全条一起动**,不只动已播那截。
 *
 * 产品这边三样全缺,而且 `AudioArtifact.tsx` **从不写 `--i`** ——
 * 就算把 keyframes 补上,四十根柱子也会齐步走,错不开。
 * 另外播放键在稿子里是白行 `.aud-in` 的**最后一个孩子**,产品把它挂成了
 * `.inner` 的**兄弟**,于是它落在外层灰底上,白行右端凭空短一截。
 * 柱子条数稿子是 28(`--i:0` … `--i:27`,数过),产品默认 40。
 *
 * ## 尺子
 *
 * 三种判据,各用在它该用的地方:
 *
 * 1. **DOM / 行为** —— 渲染真组件,不手捏夹具。条数、`--i` 的值、播放键的祖先
 *    都从产线 DOM 上读。
 * 2. **计算值** —— 把 `index.css` 按真实导入顺序整条注入,再注入这一支
 *    CSS Module(类名按 vitest 给出的**真实哈希**改写,和打包器做的是同一件事),
 *    然后读 `getComputedStyle`。这样「写了一条规则却被后面某处盖掉」照得出来。
 *    ⚠ jsdom 不把 `animation` 简写拆成 `animation-name`(实测:拆出来是 `none`),
 *    也不解析 `calc()` / `var()`,所以这两条读的是**赢下层叠的那条简写声明本身**。
 * 3. **CSSOM** —— `@keyframes` 的三个关键帧、以及降级动画那条 `@media`,
 *    从注入后的 `document.styleSheets` 里读真解析出来的规则,不做文本 diff。
 *    jsdom 不匹配媒体查询,所以降级那条只能验「规则在且内容对」——
 *    这一点如实写在这里,不冒充成计算值。
 *
 * 判据两端都钉**具体字面值**,不写「两个元素相等」——都算成 `none` 时那种断言永远绿。
 */
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { AudioArtifact } from '../../../src/components/chat/AudioArtifact';
import audioStyles from '../../../src/components/chat/AudioArtifact.module.css';
import { readExpandedIndexCss } from '../../helpers/read-expanded-css';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src');
const MODULE_PATH = resolve(SRC, 'components/chat/AudioArtifact.module.css');
const MODULE_CSS = readFileSync(MODULE_PATH, 'utf-8');

/** 稿子的字面值 —— 判据的锚,不从实现里读回来 */
const DESIGN_BARS = 28;
const DESIGN_DURATION = '0.55s';
const DESIGN_STAGGER = 'calc(var(--i) * 18ms)';
const DESIGN_KEYFRAMES = [
  ['0%', 'scaleY(0.72)'],
  ['50%', 'scaleY(1)'],
  ['100%', 'scaleY(0.78)'],
] as const;
/** 多条音频之间的间距。锚在产物卡那一档:稿子 `.arts { gap: 8px }`,产品同值。 */
const STACK_GAP = '8px';

const local = (name: string): string => {
  const hit = (audioStyles as Record<string, string | undefined>)[name];
  return typeof hit === 'string' && hit.length > 0 ? hit : name;
};

/**
 * 把 CSS Module 源码里的局部名改写成 vitest 实际发下来的哈希名 ——
 * 和打包器做的是同一件事,于是注入的表和真组件渲染出来的 DOM 对得上。
 * `@keyframes` 的名字连同引用它的 `animation` 简写一起改,也和打包器一致。
 */
function scopedModuleCss(): string {
  const keyframeNames = [...MODULE_CSS.matchAll(/@keyframes\s+([A-Za-z_][\w-]*)/g)].map((m) => m[1]!);
  let css = MODULE_CSS;
  for (const name of keyframeNames) {
    css = css
      .replace(new RegExp(`@keyframes\\s+${name}\\b`, 'g'), `@keyframes ${local(name)}`)
      .replace(new RegExp(`(animation(?:-name)?\\s*:[^;}]*?)\\b${name}\\b`, 'g'), `$1${local(name)}`);
  }
  return css.replace(/\.(-?[A-Za-z_][\w-]*)/g, (whole, name: string) => {
    const scoped = local(name);
    return scoped === name ? whole : `.${scoped}`;
  });
}

function injectStyles(): void {
  for (const [mark, text] of [
    ['index', readExpandedIndexCss()],
    ['module', scopedModuleCss()],
  ] as const) {
    const style = document.createElement('style');
    style.textContent = text;
    style.dataset.odTestSheet = mark;
    document.head.appendChild(style);
  }
}

function mount(props: Partial<ComponentProps<typeof AudioArtifact>> = {}): HTMLElement {
  const { container } = render(
    <AudioArtifact src="/api/projects/p1/raw/voice.mp3" name="voice.mp3" durationSec={48} {...props} />,
  );
  const app = document.createElement('div');
  app.className = 'app';
  document.body.appendChild(app);
  app.appendChild(container);
  return container.querySelector<HTMLElement>('[data-testid="chat-audio-artifact"]')!;
}

const barsOf = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('i')];

/** 注入后的 CSSOM 里那张 `@keyframes` 表 */
function keyframesRule(name: string): CSSKeyframesRule | null {
  for (const sheet of [...document.styleSheets]) {
    for (const rule of [...(sheet as CSSStyleSheet).cssRules]) {
      if (rule.constructor.name === 'CSSKeyframesRule' && (rule as CSSKeyframesRule).name === name) {
        return rule as CSSKeyframesRule;
      }
    }
  }
  return null;
}

/** 降级动画那条 `@media` 里,命中柱子的规则 */
function reducedMotionRules(): CSSStyleRule[] {
  const out: CSSStyleRule[] = [];
  for (const sheet of [...document.styleSheets]) {
    for (const rule of [...(sheet as CSSStyleSheet).cssRules]) {
      if (rule.constructor.name !== 'CSSMediaRule') continue;
      const media = rule as CSSMediaRule;
      if (!/prefers-reduced-motion/.test(media.conditionText ?? media.media.mediaText)) continue;
      for (const inner of [...media.cssRules]) {
        if (inner.constructor.name === 'CSSStyleRule') out.push(inner as CSSStyleRule);
      }
    }
  }
  return out;
}

afterEach(() => {
  cleanup();
  document.querySelectorAll('style[data-od-test-sheet]').forEach((n) => n.remove());
  document.querySelectorAll('.app').forEach((n) => n.remove());
});

describe('这把尺子看得见缺陷', () => {
  it('哈希改写是真的在做事 —— 局部名和实际类名不是同一个字符串', () => {
    expect(local('aud')).not.toBe('aud');
    injectStyles();
    const root = mount();
    expect(root.className).toBe(local('aud'));
    expect(getComputedStyle(root).padding).toBe('3px');
  });
});

describe('波形在播的时候起伏', () => {
  it('每根柱子都带着自己的序号 --i,不然错不开', () => {
    const root = mount({ previewPlaying: true, previewCurrentSec: 12 });
    const bars = barsOf(root);
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.map((bar) => bar.style.getPropertyValue('--i').trim())).toEqual(
      bars.map((_, i) => String(i)),
    );
  });

  it('播着的时候柱子挂上 wave-pulse,0.55s 无限循环', () => {
    injectStyles();
    const root = mount({ previewPlaying: true, previewCurrentSec: 12 });
    expect(root.hasAttribute('data-playing')).toBe(true);
    expect(getComputedStyle(barsOf(root)[0]!).animation).toBe(
      `${local('wave-pulse')} ${DESIGN_DURATION} var(--chat-ease-out) infinite`,
    );
  });

  it('逐根错开 18ms —— 全条一起动的是「还在响」,不是音量', () => {
    injectStyles();
    const root = mount({ previewPlaying: true, previewCurrentSec: 12 });
    expect(getComputedStyle(barsOf(root)[0]!).animationDelay).toBe(DESIGN_STAGGER);
  });

  it('关键帧就是稿子那三档 scaleY', () => {
    injectStyles();
    const rule = keyframesRule(local('wave-pulse'));
    expect(rule, '注入的表里找不到 wave-pulse').not.toBeNull();
    const stops = [...rule!.cssRules].map((one) => [
      (one as CSSKeyframeRule).keyText,
      (one as CSSKeyframeRule).style.transform,
    ]);
    expect(stops).toEqual(DESIGN_KEYFRAMES.map(([k, v]) => [k, v]));
  });

  it('停着的时候不动', () => {
    injectStyles();
    const root = mount();
    expect(root.hasAttribute('data-playing')).toBe(false);
    const animation = getComputedStyle(barsOf(root)[0]!).animation;
    expect(animation === '' || animation === 'none').toBe(true);
  });

  it('降级动画时整条停下 —— 规则在,且就是 animation: none', () => {
    injectStyles();
    const barSelector = `.${local('aud')}[data-playing] .${local('wave')} > i`;
    const hit = reducedMotionRules().filter((rule) => rule.selectorText === barSelector);
    expect(hit.map((rule) => rule.style.animation)).toEqual(['none']);
  });

  it('已播那截仍然变实 —— 这条本来就对,别在改动画时弄丢', () => {
    injectStyles();
    const root = mount({ previewPlaying: true, previewCurrentSec: 24 });
    const on = barsOf(root).filter((bar) => bar.className === local('on'));
    expect(on.length).toBe(Math.round((24 / 48) * DESIGN_BARS));
  });
});

describe('白行的构成', () => {
  it('播放键在白行【里面】,和稿子的 .aud-b 同一层', () => {
    const root = mount();
    const inner = root.querySelector<HTMLElement>(`.${local('inner')}`)!;
    const play = root.querySelector<HTMLElement>(`.${local('play')}`)!;
    expect(inner.contains(play)).toBe(true);
  });

  it('下载键仍在白行【外面】—— 它删/存的是整条附件,不是音频里的某一段', () => {
    const root = mount();
    const inner = root.querySelector<HTMLElement>(`.${local('inner')}`)!;
    const download = root.querySelector<HTMLElement>(`.${local('download')}`)!;
    expect(inner.contains(download)).toBe(false);
    expect(download.parentElement).toBe(root);
  });

  it('柱子默认 28 根,和稿子数出来的一样', () => {
    expect(barsOf(mount()).length).toBe(DESIGN_BARS);
  });
});

describe('多条音频之间有间距', () => {
  it('第二条往下让 8px —— 和产物卡那一档同值', () => {
    injectStyles();
    // 产线的形状:`FileOpsSummary.tsx:179` 把每段音频平铺进 `.file-ops-audio`
    const { container } = render(
      <div className="file-ops-audio">
        <AudioArtifact src="/api/projects/p1/raw/a.mp3" name="a.mp3" durationSec={48} />
        <AudioArtifact src="/api/projects/p1/raw/b.mp3" name="b.mp3" durationSec={30} />
      </div>,
    );
    const app = document.createElement('div');
    app.className = 'app';
    document.body.appendChild(app);
    app.appendChild(container);
    const [first, second] = [...container.querySelectorAll<HTMLElement>('[data-testid="chat-audio-artifact"]')];
    expect(second, '应该渲染出两条音频').toBeTruthy();
    expect(getComputedStyle(second!).marginTop).toBe(STACK_GAP);
    // 第一条不能带这一档,否则整个列表凭空多出一截上边距。
    // jsdom 把零值算成裸 `0`(不带单位),这里补齐再钉字面值。
    const marginTopOfFirst = getComputedStyle(first!).marginTop;
    expect(marginTopOfFirst === '' || marginTopOfFirst === '0' ? '0px' : marginTopOfFirst).toBe('0px');
  });
});
