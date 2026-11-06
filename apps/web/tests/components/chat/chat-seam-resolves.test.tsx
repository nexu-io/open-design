// @vitest-environment jsdom
/**
 * 接缝必须**真的带着变量**,不能只带着那个属性。
 *
 * ## 这条测试要挡的是哪一类 bug
 *
 * `theme-seam.test.tsx` 只问「`[data-chat-root]` 在不在」。而 `chatSeam()` 返回的是
 * **两样东西**:那个属性,和定义了全部 `--chat-*` 的那个类名。两样是分开的 ——
 * 属性还在、类名没了,是完全可能的:
 *
 *   · `<div {...chatSeam()} className="x">` —— 展开在前、`className` 在后,
 *     后者把类名整个盖掉,而 `data-chat-root` 是另一个属性,**毫发无损**。
 *   · 有人照着别处抄了 `data-chat-root=""` 贴在元素上,却没调 `chatSeam()`。
 *   · 哪天有人把 `ChatRoot.module.css` 重排成「`.root` 声明变量、`.vars` 只是个空壳」。
 *
 * 三条走完都是同一个现场:属性在、变量空。无头 Chrome 实测过这个现场 ——
 * 一个只有 `data-chat-root`、没有那个类的元素,`--chat-border` / `--chat-stroke` /
 * `--chat-bg` 全部返回**空字符串**,于是 `border: var(--chat-stroke) solid var(--chat-border)`
 * 塌成 `0px none`,卡片没有描边也没有底色 —— 而**一条测试都不会红**
 * (`ChatRoot.tsx` 的注释早写过:脱离接缝「组件会退化成无色无字号的裸结构 —— 而且不报错」)。
 *
 * ## 为什么不直接量 `getComputedStyle`
 *
 * jsdom 不跑层叠、也不解析 `var()`,量出来永远是空串,分不出「真的落空」和
 * 「jsdom 本来就不算」。所以这里换一条等价但可判的路:
 *
 *   1. 从 `ChatRoot.module.css` 里**解析出**哪些类真的声明了 `--chat-*`(顶层逗号拆选择器组);
 *   2. 断言 `chatSeam()` 交出来的类名就在这批里 —— 这才是「变量解析得出来」;
 *   3. 断言产品里每一个 `[data-chat-root]` 元素身上都带着这批类之一。
 *
 * 第 2 条挡「CSS 被重排成 .vars 什么都不声明」,第 3 条挡「属性还在、类名被盖掉」。
 * 两条都不靠属性本身,所以不会被属性骗过去。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChatRoot, chatSeam } from '../../../src/components/chat/ChatRoot';
import { ChatPane } from '../../../src/components/ChatPane';
import type { ChatMessage } from '../../../src/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE_CSS = readFileSync(
  resolve(HERE, '../../../src/components/chat/ChatRoot.module.css'),
  'utf-8',
);

/**
 * 只按【顶层逗号】拆选择器组。
 *
 * 这个文件正是被逗号骗过的那一类:`.vars,\n.root {` 是**一个**规则的两支选择器,
 * 竖着读像「`.vars` 是空的、变量都在 `.root` 里」。一把 `split(',')` 或者用眼睛
 * 竖着读,结论都是错的 —— 两支都拿到全部声明(无头 Chrome 实测:`.vars` 上
 * `--chat-border` = `#dbdbdb`、`--chat-stroke` = `1px`)。
 * `:is(.a, .b)` 里的逗号则相反,是参数分隔,拆开会造出不存在的选择器。
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

/** 这条规则声明了几个 `--chat-*`。 */
const chatVarsIn = (body: string) =>
  new Set([...body.matchAll(/(--chat-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));

/** 选择器的【主体】—— 最后那一节复合选择器,规则真正作用的元素。 */
function subjectOf(selector: string): string {
  let depth = 0;
  let last = '';
  for (const ch of selector) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (depth === 0 && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) {
      last = '';
      continue;
    }
    last += ch;
  }
  return last;
}

/**
 * 从 Module 源码里解析出:**哪些本地类名身上真的落着 `--chat-*` 声明**,
 * 以及每个类拿到的变量集合(用来查两支会不会漂移)。
 */
function declaringClasses(): Map<string, Set<string>> {
  const css = MODULE_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const found = new Map<string, Set<string>>();
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const vars = chatVarsIn(m[2] ?? '');
    if (vars.size === 0) continue;
    for (const sel of splitTopLevel(m[1] ?? '')) {
      if (sel.startsWith('@')) continue;
      // `:global(...)` 是 CSS Modules 语法,编译后原样展开,不是本地类
      const subject = subjectOf(sel.replace(/:global\([^)]*\)/g, ' '));
      for (const cm of subject.matchAll(/\.([A-Za-z0-9_-]+)/g)) {
        const prev = found.get(cm[1]!) ?? new Set<string>();
        for (const v of vars) prev.add(v);
        found.set(cm[1]!, prev);
      }
    }
  }
  return found;
}

const DECLARING = declaringClasses();

/** `chatSeam()` / `<ChatRoot>` 交出来的类名里,有没有一个是真的声明了变量的。 */
function carriesVars(className: string | null | undefined): boolean {
  if (!className) return false;
  return className
    .split(/\s+/)
    .filter(Boolean)
    .some((cls) => {
      // vitest 里 CSS Module 的类名带哈希(`vars` → `_vars_1a2b3`),按词根匹配
      for (const known of DECLARING.keys()) {
        if (cls === known || cls.includes(known)) return true;
      }
      return false;
    });
}

describe('先证明这把尺子是准的', () => {
  it('解析得出确实有类在声明 --chat-*', () => {
    expect(DECLARING.size).toBeGreaterThan(0);
    for (const vars of DECLARING.values()) {
      expect(vars.size).toBeGreaterThan(10);
    }
  });

  it('光有 data-chat-root、没有那个类,不算带上了变量', () => {
    // 这就是真机上量到的那个现场:属性在、变量空
    expect(carriesVars('')).toBe(false);
    expect(carriesVars('chat-composer-fixed-layer')).toBe(false);
    expect(carriesVars(null)).toBe(false);
  });
});

describe('chatSeam() 交出来的类名真的带着变量', () => {
  it('不是空串,而且落在「声明了 --chat-*」的那批类里', () => {
    const seam = chatSeam();
    expect(seam.className.trim()).not.toBe('');
    expect(
      carriesVars(seam.className),
      `chatSeam() 给的类是「${seam.className}」,而声明了 --chat-* 的类是 ` +
        `${[...DECLARING.keys()].join(' / ')} —— 对不上就等于只发了个属性`,
    ).toBe(true);
  });

  it('带上调用方自己的类名之后,接缝那个类仍然在', () => {
    const seam = chatSeam('pane');
    expect(seam.className.split(/\s+/)).toContain('pane');
    expect(carriesVars(seam.className)).toBe(true);
  });

  it('<ChatRoot> 那条路同样带着变量', () => {
    const { container } = render(<ChatRoot />);
    const root = container.firstElementChild as HTMLElement | null;
    expect(root?.hasAttribute('data-chat-root')).toBe(true);
    expect(carriesVars(root?.className)).toBe(true);
    cleanup();
  });

  /**
   * `.vars` 和 `.root` 是同一条规则的两支。哪天有人把它们拆开单独维护,
   * 两支就会各自长歪 —— 一支多一个变量、另一支少一个,而少的那一支解析出来是空串。
   */
  it('两支拿到的是同一套变量,不许漂移', () => {
    const sets = [...DECLARING.entries()];
    expect(sets.length).toBeGreaterThanOrEqual(2);
    const [firstName, first] = sets[0]!;
    for (const [name, vars] of sets.slice(1)) {
      const onlyHere = [...first].filter((v) => !vars.has(v));
      const onlyThere = [...vars].filter((v) => !first.has(v));
      expect(
        [...onlyHere, ...onlyThere],
        `.${firstName} 和 .${name} 声明的 --chat-* 不一致 —— 少的那一支上,` +
          `这些变量会解析成空串,而且不报错`,
      ).toEqual([]);
    }
  });
});

describe('产品树里,每一个 [data-chat-root] 都带着变量', () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  if (typeof HTMLElement.prototype.scrollTo !== 'function') {
    HTMLElement.prototype.scrollTo = function () { /* jsdom 没有 */ };
  }
  beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
  afterEach(() => {
    cleanup();
    Element.prototype.scrollIntoView = originalScrollIntoView;
    vi.restoreAllMocks();
  });

  const assistant = {
    id: 'a1',
    role: 'assistant',
    content: '做完了。',
    createdAt: 1_700_000_000_000,
    runStatus: 'succeeded',
    events: [
      { kind: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'tokens.css' } },
      { kind: 'tool_result', toolUseId: 't1', content: 'ok', isError: false },
    ],
  } as ChatMessage;

  it('挂着属性却没有变量类的元素,一个都不许有', () => {
    render(
      <ChatPane
        projectKindForTracking="prototype"
        messages={[assistant]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={() => {}}
        onStop={() => {}}
        conversations={[]}
        activeConversationId="conversation-1"
        onSelectConversation={() => {}}
        onDeleteConversation={() => {}}
      />,
    );

    // portal 的那些挂在 document.body 下,不在 container 里 —— 按整份文档找
    const seams = [...document.querySelectorAll<HTMLElement>('[data-chat-root]')];
    expect(seams.length, '一个接缝都没有?那是 theme-seam 那条该管的事,先去看它').toBeGreaterThan(0);

    const naked = seams
      .filter((el) => !carriesVars(el.className))
      .map((el) => `<${el.tagName.toLowerCase()} class="${el.className}">`);
    expect(
      naked,
      '这些元素带着 data-chat-root,却没有定义 --chat-* 的那个类 —— ' +
        '所有 var(--chat-…) 在它们里面会解析成空串,而且不报错',
    ).toEqual([]);
  });
});
