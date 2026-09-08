// @vitest-environment jsdom
/**
 * 分叉分界的**入场** —— 稿子第 38 格。
 *
 * ## 稿子怎么写的
 *
 * `361b78253e:docs/design/chat-panel/src/components.css:2796`
 * (`8015870095` / `853da24ea5` / `361b78253e` 三版这一整块 md5 相同 ——
 *  `853da24ea5 → 361b78253e` 的 diff 里没有一行碰 animation / transition /
 *  cubic-bezier / scale / 时长,逐条查过):
 *
 *   点出来的那两块要「落」一下:静态稿里它们本来就在,分不出是点击的结果;
 *   落这一下(4px + 淡入)说的是「这是刚才那一下带来的」。
 *   钉住展示的那一格不挂 .is-new,页面一加载就该是已经落好的样子。
 *
 *   @keyframes fork-in {
 *     from { opacity: 0; transform: translateY(-4px); }
 *     to   { opacity: 1; transform: none; }
 *   }
 *   .fork-sep.is-new,
 *   .fork-note.is-new { animation: fork-in var(--duration-normal) var(--ease-out) both; }
 *   .fork-note.is-new { animation-delay: 60ms; }
 *
 * 我们这边 `.fork-sep` / `.fork-note` 两条静态规则早就搬了,这一段**整段没搬**,
 * 全仓对 `fork-in` / `.is-new` 零命中。
 *
 * 「展示的那一格不挂 `.is-new`」在产品里天然成立:陈列页那一格
 * (`mirror-gallery.test.tsx`)是手写的裸 `.fork-sep` / `.fork-note`,
 * 类只由 `AssistantMessage` 挂,所以陈列页仍然是落好的静态样子。
 *
 * ## 尺子
 *
 * 共享量尺(`tests/helpers/chat-mirror-cascade.ts`)看不见这一条:它的
 * `expand()` 是属性白名单,`animation` / `animation-name` / `transform` 都不在
 * 名单里会被**静默丢掉**,而且顶层 `@` 规则(`@keyframes`)整块跳过。已上报,
 * 没有自己去改那份共享文件。
 *
 * 换成 jsdom 自己的 CSS 引擎:`animation` 简写读得回整串、`animation-delay`
 * 长写读得回、`@keyframes` 以 `CSSKeyframesRule` 落在 `document.styleSheets` 里。
 * jsdom 不解 `var()`,所以注入前先按 `tokens.css` 的 `:root` 展开成字面量。
 * (jsdom 不会**展开**简写:`animationName` 恒为 `none`,所以判据落在简写整串上。)
 *
 * 「这把尺子看得见动画」由第一条用例先证:同一份表里 `.msg` 的入场动画
 * (`msg-enter`)必须读得出来。
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import type { ChatMessage } from '../../../src/types';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src');
const read = (p: string): string => readFileSync(resolve(SRC, p), 'utf-8');

const decomment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** 只留动画相关声明 —— 整份表注进 jsdom 会在 `color-mix()` 上抛异常并连累后面的规则。 */
const ANIMATION_PROP = /^(animation|animation-[a-z-]+|opacity|transform)$/i;

function animationsOnly(css: string): string {
  let out = decomment(css);
  for (let pass = 0; pass < 2; pass += 1) {
    out = out.replace(/\{([^{}]*)\}/g, (_m, body: string) => {
      const kept = body
        .split(';')
        .map((d) => d.trim().replace(/\s+/g, ' '))
        .filter((d) => {
          const colon = d.indexOf(':');
          return colon > 0 && ANIMATION_PROP.test(d.slice(0, colon).trim());
        });
      return `{${kept.join(';')}${kept.length ? ';' : ''}}`;
    });
  }
  return out;
}

function lightTokens(): Map<string, string> {
  const out = new Map<string, string>();
  const root = /:root\s*\{([\s\S]*?)\}/.exec(decomment(read('styles/tokens.css')));
  for (const decl of (root?.[1] ?? '').split(';')) {
    const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(decl);
    if (m) out.set(m[1]!, m[2]!.trim());
  }
  return out;
}

function resolveVars(value: string, map: Map<string, string>, depth = 0): string {
  if (depth > 8) return value;
  return value.replace(
    /var\(\s*(--[\w-]+)\s*(?:,([^()]*(?:\([^()]*\)[^()]*)*))?\)/g,
    (whole, name: string, fallback?: string) => {
      const hit = map.get(name);
      if (hit != null) return resolveVars(hit, map, depth + 1);
      return fallback != null ? resolveVars(fallback.trim(), map, depth + 1) : whole;
    },
  );
}

/**
 * 稿子那几个值的**字面值** —— 验收判据是「算出来的和稿子逐字节相同」,
 * 不是「用了某支 token」。出处 `361b78253e:docs/design/chat-panel/src/tokens.css`
 * (稿子 `tokens.css` 三版 md5 相同,一处没动):
 *
 *   :131  --duration-normal: 200ms;
 *   :138  --curve-decelerate-mid: cubic-bezier(0, 0, 0, 1);
 *   :140  --ease-out: var(--curve-decelerate-mid);
 *
 * 位移 / 透明度 / 延迟直接写在规则里,不走 token:
 *   translateY(-4px) → none、opacity 0 → 1、animation-delay: 60ms、fill-mode both。
 */
const DESIGN_DURATION = '200ms';
const DESIGN_EASING = 'cubic-bezier(0, 0, 0, 1)';
const DESIGN_DELAY = '60ms';

const TOKENS = lightTokens();
/** 我们同名 token 解出来的值 —— 和稿子分叉时单独红出来,好指认是 token 漂了。 */
const OUR_DURATION = resolveVars('var(--duration-normal)', TOKENS);
const OUR_EASING = resolveVars('var(--ease-out)', TOKENS);

let sheet: CSSStyleSheet;

beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = resolveVars(animationsOnly(read('styles/chat.css')), TOKENS);
  document.head.appendChild(style);
  sheet = document.styleSheets[0] as CSSStyleSheet;
  const stage = document.createElement('div');
  stage.id = 'stage';
  stage.innerHTML = `
    <div class="msg assistant" id="msg">
      <div class="fork-sep is-new" id="sep-new"></div>
      <div class="fork-note is-new" id="note-new"></div>
      <div class="fork-sep" id="sep-plain"></div>
      <div class="fork-note" id="note-plain"></div>
    </div>`;
  document.body.appendChild(stage);
});

const css = (id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`夹具里没有 #${id}`);
  return getComputedStyle(el);
};

function keyframes(name: string): CSSKeyframesRule | undefined {
  return Array.from(sheet.cssRules).find(
    (r): r is CSSKeyframesRule => (r as CSSKeyframesRule).name === name,
  );
}

/** 某一帧里那两条声明,压成一行好比。 */
function frame(kf: CSSKeyframesRule, key: string): string {
  const hit = Array.from(kf.cssRules).find(
    (r) => (r as CSSKeyframeRule).keyText === key,
  ) as CSSKeyframeRule | undefined;
  if (!hit) throw new Error(`@keyframes ${kf.name} 里没有 ${key} 这一帧`);
  return `${hit.style.opacity}|${hit.style.transform}`;
}

/* ── 组件那一半 ─────────────────────────────────────────────────────── */

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
      setItem: (k: string, v: string) => store.set(k, v),
    },
  });
});

afterEach(cleanup);

const forkedTurn = () =>
  ({
    id: 'seeded-tail',
    role: 'assistant',
    content: '两页都好了。',
    runStatus: 'succeeded',
    startedAt: 1700000000,
    endedAt: 1700000042,
    events: [] as ChatMessage['events'],
    producedFiles: [],
    forkedInto: { title: '商城原型', conversationId: 'src-conv' },
  }) as unknown as ChatMessage;

function renderForked() {
  return render(
    <AssistantMessage
      message={forkedTurn()}
      streaming={false}
      isLast
      projectId="p1"
      errorCardOwnerId={null}
      onFeedback={vi.fn()}
    />,
  );
}

describe('分叉分界 · 入场', () => {
  it('先证明这把尺子看得见动画(同一份表里 .msg 的入场读得出来)', () => {
    expect(sheet.cssRules.length, '注入的表是空的 —— 后面全是假绿').toBeGreaterThan(50);
    expect(css('msg').animation).toContain('msg-enter');
    expect(keyframes('msg-enter'), '连 msg-enter 的关键帧都找不到,量法没对准').toBeTruthy();
  });

  it('我们的两支 token 和稿子同值(先把 token 漂移排除掉)', () => {
    expect(OUR_DURATION, '--duration-normal 和稿子对不上了').toBe(DESIGN_DURATION);
    expect(OUR_EASING, '--ease-out 和稿子对不上了').toBe(DESIGN_EASING);
  });

  it('挂了 .is-new 的分界线会「落」一下:200ms / cubic-bezier(0, 0, 0, 1) / both', () => {
    expect(
      css('sep-new').animation,
      '稿子 `.fork-sep.is-new { animation: fork-in var(--duration-normal) var(--ease-out) both }` 整段没搬',
    ).toBe(`fork-in ${DESIGN_DURATION} ${DESIGN_EASING} both`);
  });

  it('脚注跟着落,但晚 60ms —— 线先落,注解后到', () => {
    expect(css('note-new').animation).toBe(`fork-in ${DESIGN_DURATION} ${DESIGN_EASING} both`);
    expect(css('note-new').animationDelay).toBe(DESIGN_DELAY);
  });

  it('关键帧是「上方 4px 淡入」,不是从 scale(0) 起手', () => {
    const kf = keyframes('fork-in');
    expect(kf, '`@keyframes fork-in` 不在表里').toBeTruthy();
    expect(frame(kf!, '0%')).toBe('0|translateY(-4px)');
    expect(frame(kf!, '100%')).toBe('1|none');
  });

  it('没挂 .is-new 的不动 —— 类是那个开关', () => {
    expect(['', 'none']).toContain(css('sep-plain').animation);
    expect(['', 'none']).toContain(css('note-plain').animation);
    expect(css('note-plain').animationDelay).not.toBe(DESIGN_DELAY);
  });

  it('产品真的把 .is-new 挂上去了(线和脚注两处)', () => {
    const { container } = renderForked();
    const sep = container.querySelector('[data-testid="assistant-fork-divider"]');
    const note = container.querySelector('[data-testid="assistant-fork-note"]');
    expect(sep, '分界线没渲染出来 —— 夹具变了').toBeTruthy();
    expect(note, '脚注没渲染出来 —— 夹具变了').toBeTruthy();
    expect(sep!.classList.contains('is-new')).toBe(true);
    expect(note!.classList.contains('is-new')).toBe(true);
  });
});
