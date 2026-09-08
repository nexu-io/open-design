// @vitest-environment jsdom

/**
 * 分叉分界脚注:**长译文要出省略号,不能被直接切掉**(OPEND-2714 后续)。
 *
 * ## 缺陷长什么样
 *
 * PR #7863 把脚注从「线 + 线下一行」并成一行之后,`.fork-note` 为了让分支图标
 * 和文字并排,变成了 `display: flex`。而截断那三条(`overflow: hidden` /
 * `text-overflow: ellipsis` / `white-space: nowrap`)还写在 `.fork-sep span` 上,
 * 也就是**同一个元素** —— 于是它们落在了一个 **flex 容器**上。
 *
 * flex 容器里的裸文本会被包进一个**匿名 flex item**,文字的行盒属于那个匿名盒,
 * 不属于 `.fork-note` 自己。而 `text-overflow` 是**非继承**属性(css-ui-4 §5.3
 * Inherited: no),匿名盒拿不到 `ellipsis`,取初始值 `clip`。
 * 结果:`max-width: 62%` 照旧把宽度卡住、`overflow: hidden` 照旧把溢出裁掉,
 * 但裁口上**没有省略号** —— 长译文是被**齐口切断**的。
 *
 * 英文 `Continued from chat` 只有 19 个字符,62% 这一刀多半够不着它;别的语言
 * 都更长(最长的德语 `Fortsetzung der Konversation` 是 28 个),所以这条缺陷
 * 只在**非英语 locale** 上现网可见。夹具因此取 19 支语言包里**最长的那条**,
 * 不自己编一根假的长字符串 —— 编出来的长度证明不了现网会不会切到。
 *
 * ## 判据怎么立的(以及它照不出什么)
 *
 * jsdom 不排版:没有行盒、没有实际宽度,「有没有出现那三个点」在这一层**量不到**。
 * 光断言 CSS 文本里写着 `text-overflow: ellipsis` 更是假绿 —— 缺陷现场那句
 * **本来就写着**,坏的是它挂在了错的盒子上。
 *
 * 所以判据落在**让省略号成立的那条结构 + 层叠规则**上,逐条对应 CSS 规范:
 *
 *   1. 文字必须住在**自己的具名元素**里(不是 `.fork-note` 的裸文本):
 *      匿名盒没有类名,CSS 永远够不着它。
 *   2. 那个元素**不能是 flex / grid 容器**:`text-overflow` 只作用于块容器
 *      直接排出来的行盒(css-overflow-4 §4.1 "Applies to: block containers")。
 *   3. 那个元素上,`overflow` / `text-overflow` / `white-space` / `min-width`
 *      四条必须**层叠意义上真的赢**(不是「文件里出现过」)。
 *   4. 那个元素必须**能被压缩**:它是 `.fork-note` 的 flex item,`flex: none`
 *      的项目不参与收缩,`min-width: 0` 也就无从谈起 —— 宽度永远等于内容宽度,
 *      一样出不来省略号。
 *   5. 图标保持 `flex: none`:该被压缩的是文字,不是那枚 12px 的分支图标。
 *
 * **这把尺子照不出**:真实像素(那三个点到底画没画出来)、62% 到底够不够宽、
 * RTL 下省略号落在哪一端、以及 `chat.css` 以外某张表里一条**不提 `.fork-`**
 * 的选择器(例如裸 `span {}`)把这几条盖掉的情形 —— 下面有一条守卫钉住
 * 「`.fork-` 只有 `chat.css` 一个出处」,但盖不住不提 `.fork-` 的写法。
 * 真实像素归无头 Chrome / 真机。
 */

import { cleanup, render } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { I18nProvider } from '../../../src/i18n';
import { ar } from '../../../src/i18n/locales/ar';
import { de } from '../../../src/i18n/locales/de';
import { en } from '../../../src/i18n/locales/en';
import { esES } from '../../../src/i18n/locales/es-ES';
import { fa } from '../../../src/i18n/locales/fa';
import { fr } from '../../../src/i18n/locales/fr';
import { hu } from '../../../src/i18n/locales/hu';
import { id } from '../../../src/i18n/locales/id';
import { it as itDict } from '../../../src/i18n/locales/it';
import { ja } from '../../../src/i18n/locales/ja';
import { ko } from '../../../src/i18n/locales/ko';
import { pl } from '../../../src/i18n/locales/pl';
import { ptBR } from '../../../src/i18n/locales/pt-BR';
import { ru } from '../../../src/i18n/locales/ru';
import { th } from '../../../src/i18n/locales/th';
import { tr } from '../../../src/i18n/locales/tr';
import { uk } from '../../../src/i18n/locales/uk';
import { zhCN } from '../../../src/i18n/locales/zh-CN';
import { zhTW } from '../../../src/i18n/locales/zh-TW';
import { LOCALES, type Dict, type Locale } from '../../../src/i18n/types';
import type { ChatMessage } from '../../../src/types';
import { parseRules, specificity, splitList } from '../../helpers/chat-mirror-cascade';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src');
const CHAT_CSS = readFileSync(join(SRC, 'styles/chat.css'), 'utf-8');

/* ── 尺子:chat.css 上的微型层叠 ──────────────────────────────────────
 * 复用 `chat-mirror-cascade` 已校准的规则解析、选择器列表拆分与特异性计算,
 * 但**不**走它的 `resolved()` —— 那条路要过 `expand()` 的属性白名单,而
 * `display` / `overflow` / `text-overflow` / `flex` 都不在名单里(白名单对
 * 未知属性是**静默丢弃**,读回 `<unset>`,任何断言都会假绿)。这里要的属性
 * 全是长手或本地展开得了的简写,所以自己算胜出者更直接。
 */
type Read = (el: Element, prop: string) => string;

const UNSET = '<unset>';

/** `flex` 简写按 css-flexbox-1 §7.1.1 展开成三条长手(只覆盖本文件用得到的形态)。 */
function expandFlex(value: string): Array<[string, string]> {
  const v = value.trim().toLowerCase();
  if (v === 'none') return [['flex-grow', '0'], ['flex-shrink', '0'], ['flex-basis', 'auto']];
  if (v === 'auto') return [['flex-grow', '1'], ['flex-shrink', '1'], ['flex-basis', 'auto']];
  if (v === 'initial') return [['flex-grow', '0'], ['flex-shrink', '1'], ['flex-basis', 'auto']];
  const parts = v.split(/\s+/);
  if (parts.length === 1 && /^[\d.]+$/.test(parts[0]!)) {
    return [['flex-grow', parts[0]!], ['flex-shrink', '1'], ['flex-basis', '0%']];
  }
  if (parts.length === 1) return [['flex-grow', '1'], ['flex-shrink', '1'], ['flex-basis', parts[0]!]];
  const [grow, second, third] = parts as [string, string, string?];
  const shrinkIsNumber = /^[\d.]+$/.test(second);
  return [
    ['flex-grow', grow],
    ['flex-shrink', shrinkIsNumber ? second : '1'],
    ['flex-basis', third ?? (shrinkIsNumber ? '0%' : second)],
  ];
}

function expandDecl(prop: string, value: string): Array<[string, string]> {
  const v = value.trim();
  if (prop === 'flex') return expandFlex(v);
  if (prop === 'overflow') {
    const [x, y = x] = v.split(/\s+/) as [string, string?];
    return [['overflow-x', x!], ['overflow-y', y!]];
  }
  return [[prop, v]];
}

function makeReader(css: string): Read {
  const { rules } = parseRules(css, 0);
  return (el, prop) => {
    let best: { spec: number; order: number; value: string } | null = null;
    for (const rule of rules) {
      const branch = splitList(rule.selector).find((s) => {
        try {
          return el.matches(s);
        } catch (err) {
          // 伪元素分支匹配不到元素本体,这一类可以跳;其余解析失败必须响 ——
          // 静默跳过等于悄悄丢一条规则,而丢掉的规则读成「没人声明」= 假绿。
          if (s.includes('::')) return false;
          throw new Error(`量尺看不懂这条选择器:${s}(出自 ${rule.selector}):${String(err)}`);
        }
      });
      if (!branch) continue;
      const spec = specificity(branch);
      for (const decl of rule.body.split(';')) {
        const m = /^\s*([\w-]+)\s*:\s*([\s\S]+)$/.exec(decl);
        if (!m) continue;
        for (const [name, value] of expandDecl(m[1]!.toLowerCase(), m[2]!)) {
          if (name !== prop) continue;
          if (!best || spec > best.spec || (spec === best.spec && rule.order >= best.order)) {
            best = { spec, order: rule.order, value: value.trim().toLowerCase() };
          }
        }
      }
    }
    return best?.value ?? UNSET;
  };
}

const read = makeReader(CHAT_CSS);

/* ── 判据本体 ────────────────────────────────────────────────────────
 * 写成一个**纯函数**,好把它同时对着产品节点和对照组各跑一遍:
 * 产品那边必须一条都不剩,对照组那边必须还剩着 —— 后者证明这把尺子不是空过。
 */
const FORMATTING_CONTEXTS = new Set(['flex', 'inline-flex', 'grid', 'inline-grid']);

function ellipsisViolations(note: HTMLElement): string[] {
  const out: string[] = [];

  const walker = note.ownerDocument.createTreeWalker(note, NodeFilter.SHOW_TEXT);
  let textNode: Text | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if ((n.textContent ?? '').trim()) {
      textNode = n as Text;
      break;
    }
  }
  if (!textNode) return ['脚注里根本没有文案 —— 夹具坏了'];

  const label = textNode.parentElement;
  if (!label) return ['文案没有宿主元素'];

  if (label === note) {
    out.push('文案是 .fork-note 的裸文本 —— 它落在匿名 flex item 里,CSS 够不着,text-overflow 不可能生效');
    return out; // 后面每一条都是问「那个元素上写了什么」,没有那个元素就没得问
  }
  if (!label.className) {
    out.push('文案的宿主元素没有类名 —— 样式够不着它');
  }

  const display = read(label, 'display');
  if (FORMATTING_CONTEXTS.has(display)) {
    out.push(`文案宿主是 ${display} 容器 —— text-overflow 只作用于块容器直接排出的行盒`);
  }
  if (read(label, 'text-overflow') !== 'ellipsis') {
    out.push('文案宿主上没赢下 text-overflow: ellipsis');
  }
  if (read(label, 'overflow-x') !== 'hidden') {
    out.push('文案宿主上没赢下 overflow: hidden —— 不裁就没有「溢出」可省略');
  }
  if (read(label, 'white-space') !== 'nowrap') {
    out.push('文案宿主上没赢下 white-space: nowrap —— 会换行而不是截断');
  }
  if (!/^0(px)?$/.test(read(label, 'min-width'))) {
    out.push('文案宿主上没赢下 min-width: 0 —— flex item 默认 min-width:auto,压不到内容宽度以下');
  }
  if (read(label, 'flex-shrink') === '0') {
    out.push('文案宿主被钉成不可收缩(flex: none)—— 宽度恒等于内容宽度,永远溢不出去也就永远不省略');
  }

  const icon = note.querySelector('svg');
  if (!icon) {
    out.push('脚注里没有分支图标 —— 夹具坏了');
  } else if (read(icon, 'flex-shrink') !== '0' || read(icon, 'flex-grow') !== '0') {
    out.push('分支图标不是 flex: none —— 该被压缩的是文字,不是图标');
  }

  return out;
}

/* ── 夹具 ────────────────────────────────────────────────────────── */

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

function forkedTurn(): ChatMessage {
  return {
    id: 'seeded-tail',
    role: 'assistant',
    content: '两页都好了。',
    runStatus: 'succeeded',
    startedAt: 1700000000,
    endedAt: 1700000042,
    events: [] as ChatMessage['events'],
    producedFiles: [],
    forkedInto: { title: '商城原型', conversationId: 'src-conv' },
  } as unknown as ChatMessage;
}

/* ── 夹具用哪支 locale ────────────────────────────────────────────────
 * **不自己编一根长字符串** —— 编出来的长度证明不了任何事。夹具取的是**真实语料
 * 里最长的那条**:19 支语言包全在这里,谁最长谁上场。哪天某支译文被改长了,
 * 夹具自动跟着换,判据仍然钉在现网真正会溢出的那句上。
 */
const DICTS: Record<Locale, Dict> = {
  'en': en, 'id': id, 'de': de, 'zh-CN': zhCN, 'zh-TW': zhTW, 'pt-BR': ptBR,
  'es-ES': esES, 'ru': ru, 'fa': fa, 'ar': ar, 'ja': ja, 'ko': ko, 'pl': pl,
  'hu': hu, 'fr': fr, 'uk': uk, 'tr': tr, 'th': th, 'it': itDict,
};

const noteLength = (locale: Locale): number => [...DICTS[locale]['assistant.forkNote']].length;

/** 现网最长的那句分界文案 —— 62% 那一刀最先切到的就是它。 */
const LONGEST_LOCALE: Locale = LOCALES.reduce((a, b) =>
  noteLength(b) > noteLength(a) ? b : a,
);
const LONGEST_NOTE = DICTS[LONGEST_LOCALE]['assistant.forkNote'];

function renderForked(locale: Locale) {
  return render(
    <I18nProvider initial={locale}>
      <AssistantMessage
        message={forkedTurn()}
        streaming={false}
        isLast
        projectId="p1"
        errorCardOwnerId={null}
        onFeedback={vi.fn()}
      />
    </I18nProvider>,
  );
}

const noteOf = (container: HTMLElement): HTMLElement =>
  container.querySelector<HTMLElement>('[data-testid="assistant-fork-note"]')!;

/** 把一段手写的分界线挂进 document(`matches()` 需要它真的在树里)。 */
function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host.querySelector<HTMLElement>('.fork-note')!;
}

describe('分叉脚注 · 长译文该出省略号', () => {
  it('19 支语言包都有这句,而且最长的那句确实比英文长', () => {
    // 判据的前提:英文短到多半碰不着 62% 上限,这条缺陷只在长 locale 上现网可见。
    // 若哪天所有译文都被改到和英文一样短,这条会红 —— 那时该重新确认「还需不需要
    // 截断」,而不是把这条删掉:没有长译文,下面几条就失去了现实意义。
    expect(en['assistant.forkNote']).toBe('Continued from chat');
    expect(LOCALES.filter((l) => !DICTS[l]['assistant.forkNote'])).toEqual([]);
    expect(noteLength(LONGEST_LOCALE)).toBeGreaterThan(noteLength('en'));
  });

  it('英文这一档:文案住在自己的具名元素里,截断四条都落在它身上', () => {
    const { container } = renderForked('en');
    expect(ellipsisViolations(noteOf(container))).toEqual([]);
  });

  it('最长的那支 locale(现网最先被切到的就是它):同一份契约必须照样成立', () => {
    const { container } = renderForked(LONGEST_LOCALE);
    const note = noteOf(container);
    expect(note.textContent).toBe(DICTS[LONGEST_LOCALE]['assistant.forkNote']);
    expect(ellipsisViolations(note)).toEqual([]);
  });

  it('图标和文字仍然并排,文案仍然只出现一次', () => {
    const { container } = renderForked(LONGEST_LOCALE);
    const note = noteOf(container);
    expect(note.querySelector('svg')).toBeTruthy();
    // 包一层内层 span 不能把文案复制成两份,也不能把它挪出 `.fork-note`。
    expect(container.querySelectorAll('.fork-note')).toHaveLength(1);
    expect(note.textContent).toBe(DICTS[LONGEST_LOCALE]['assistant.forkNote']);
  });
});

/* ── 对照组:证明这把尺子不是空过 ───────────────────────────────────
 * 「省略号不生效」在 jsdom 里没有像素可量,所以判据只能问结构 + 层叠。
 * 那就必须回答一件事:这套问法**照得出坏形态吗**?下面两组是静态的坏形态,
 * 判据必须在它们身上留下违规 —— 都绿才说明上面那几条不是恒真。
 */
describe('对照组 · 坏形态必须被判出来', () => {
  it('回到 #7863 的形态(文案是 flex 容器的裸文本)—— 判据必须红', () => {
    const note = mount(
      '<div class="fork-sep"><i></i>' +
        `<span class="fork-note"><svg></svg>${LONGEST_NOTE}</span>` +
        '<i></i></div>',
    );
    expect(ellipsisViolations(note).join('\n')).toContain('匿名 flex item');
  });

  it('包了一层但没配样式(无类名内层)—— 判据必须红', () => {
    const note = mount(
      '<div class="fork-sep"><i></i>' +
        `<span class="fork-note"><svg></svg><span>${LONGEST_NOTE}</span></span>` +
        '<i></i></div>',
    );
    const found = ellipsisViolations(note);
    expect(found.length).toBeGreaterThan(0);
    expect(found.join('\n')).toContain('没有类名');
  });
});

/* ── 守卫:`.fork-` 的样式只有 chat.css 一个出处 ─────────────────────
 * 上面那把尺子只读 chat.css。这条钉住「没有第二张表在写 `.fork-`」,
 * 免得哪天别处冒出一条更重的规则,而尺子完全看不见它。
 * ⚠️ 盖不住**不提 `.fork-`** 的选择器(裸 `span {}` 之类)—— 那种只能靠真机。
 */
describe('守卫 · 分界样式的唯一出处', () => {
  it('styles/ 里只有 chat.css 写 .fork-', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.css') || full === join(SRC, 'styles/chat.css')) continue;
        const css = readFileSync(full, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const m of css.matchAll(/([^{}]+)\{/g)) {
          if (/(^|[\s,>+~])\.fork-/.test(m[1] ?? '')) offenders.push(`${full}: ${m[1]!.trim()}`);
        }
      }
    };
    walk(join(SRC, 'styles'));
    expect(offenders).toEqual([]);
  });
});
