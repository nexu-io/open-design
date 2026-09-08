// @vitest-environment jsdom
/**
 * 被中断的那一轮的回合状态行(交付稿 15-6 / 镜像陈列页第 #39 格)。
 *
 * 稿子这一格的 DOM 只有四样东西:
 *
 *     <span class="fin mod-stop"><i></i>已手动停止</span>
 *     <button 复制><button 新开会话>
 *     <span class="sp"></span><span class="tm">14:32</span>
 *
 * 三条要守的不变量,每条都在产线上真的错过:
 *
 *  ① **状态词**是「已手动停止」——「说清是谁停的」。产品原来是「已取消」。
 *     稿子在 CSS 注释里把理由写了两遍,顺带点名反对「仍有未完成任务」那种限定语:
 *     剩没剩、剩几步,上面那段执行记录本来就写着。
 *
 *  ② **赞 / 踩不出**。中断的一轮没有「答得好不好」可评 —— 它压根没答完。
 *     产品的 `isFeedbackEligible` 把 `canceled` 当成终态放行,两枚照常渲染。
 *     这条只能从**渲染**上守:jsdom 不算层叠,CSS 断言在这里等于没有。
 *
 *  ③ **状态词是 `--text-muted` 的中性灰**,不是 `--text-faint`。
 *     这条是纯层叠事故,规则文本上一个字都看不出来:
 *         theater.css   `.assistant-footer[data-canceled="true"] .assistant-label`  (0,3,0)
 *         routines.css  `.app .assistant-footer .assistant-label`                   (0,3,0)
 *     特异性打平,`index.css` 又把 routines 排在 theater **后面** —— 旧皮肤那份
 *     `color: var(--text-faint)`(#bdbdbd)赢,稿子要的 #5c5c5c 永远到不了屏幕上。
 *     真 Chrome 上量到的就是 `rgb(189, 189, 189)`。
 *     所以这一条按**层叠结果**判:把 index.css 的导入顺序照搬一遍,
 *     用 `matches()` 挑出真的命中这枚 label 的规则,再按 (特异性, 顺序) 决出胜者。
 */

import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { specificityTuple } from '../../helpers/chat-mirror-cascade';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { en } from '../../../src/i18n/locales/en';
import { zhCN } from '../../../src/i18n/locales/zh-CN';
import type { ChatMessage } from '../../../src/types';

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

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../../src');

function turn(over: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm-1',
    role: 'assistant',
    content: '列表页复刻到一半。',
    startedAt: 1700000000,
    endedAt: 1700000042,
    createdAt: 1700000042,
    events: [] as ChatMessage['events'],
    producedFiles: [],
    ...over,
  } as ChatMessage;
}

function renderTurn(message: ChatMessage) {
  return render(
    <AssistantMessage
      message={message}
      streaming={false}
      isLast
      projectId="p1"
      errorCardOwnerId={null}
      onFeedback={vi.fn()}
      onForkFromMessage={vi.fn()}
    />,
  );
}

/* ── 层叠:把 index.css 的导入顺序照搬一遍 ───────────────────────────── */

/** `:is(.a, .b)` 里的逗号不是选择器分隔符 —— 按括号深度切,天真 `split(',')` 会切出废选择器。 */
function splitSelectorList(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/**
 * (b, c) 两档 —— 这一族里没有 id。
 *  b = 类 / 属性 / 伪类(`:not()` / `:is()` 取参数里最重的一档)
 *  c = 元素名
 */
type Spec = readonly [ids: number, classes: number, types: number];

/**
 * 特异性走校准过的共享量尺(`tests/helpers/chat-mirror-cascade.ts`)——
 * 逐条对 CSS 规范校过,用例见 `chat-mirror-cascade.specificity.test.ts`。
 * 换成**三元组**是因为这条链上有 id 选择器(`index.css` 链里的 `#root`),
 * 原来那份两元组量尺看不见 id,一条 id 规则会凭空输掉。
 */
function specificity(selector: string): Spec {
  return specificityTuple(selector);
}

/** A → B → C 逐位比较(CSS Selectors 4 §15)。 */
const heavier = (a: Spec, b: Spec): boolean =>
  a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];

/** `index.css` 的导入顺序**就是**层叠顺序 —— 这一族的胜负一半靠它,不能手抄。 */
function cascadeFiles(): string[] {
  const index = readFileSync(resolve(SRC, 'index.css'), 'utf-8');
  return [...index.matchAll(/@import\s+'([^']+)'/g)]
    .map((m) => resolve(SRC, m[1] ?? ''))
    .filter((file) => {
      let text = '';
      try {
        text = readFileSync(file, 'utf-8');
      } catch {
        return false;
      }
      // 只有提到这几个类名的文件才可能命中这枚 label / 这枚点。
      return /assistant-footer|assistant-label|\.dot[\s,{:.]/.test(text);
    });
}

type Rule = { file: string; order: number; selector: string; body: string };

/**
 * 顶层规则 + at-rule 里的规则;暗色 / 打印 / 降级动画那几档跳过 ——
 * 这条测试判的是浅色默认态,那几档进来只会是噪音。
 */
function rulesOf(css: string, file: string, from: number): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Rule[] = [];
  let order = from;
  const walk = (chunk: string, skip: boolean) => {
    let i = 0;
    while (i < chunk.length) {
      const open = chunk.indexOf('{', i);
      if (open === -1) break;
      const prelude = chunk.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < chunk.length && depth > 0) {
        if (chunk[j] === '{') depth += 1;
        else if (chunk[j] === '}') depth -= 1;
        j += 1;
      }
      const inner = chunk.slice(open + 1, j - 1);
      if (prelude.startsWith('@')) {
        const dark = /dark|print|prefers-reduced-motion/.test(prelude);
        if (/^@(media|supports|layer|container)/.test(prelude)) walk(inner, skip || dark);
      } else if (!skip && prelude) {
        for (const one of splitSelectorList(prelude)) {
          order += 1;
          out.push({ file, order, selector: one.replace(/\s+/g, ' ').trim(), body: inner });
        }
      }
      i = j;
    }
  };
  walk(text, false);
  return out;
}

function cascade(): Rule[] {
  const out: Rule[] = [];
  for (const file of cascadeFiles()) {
    out.push(...rulesOf(readFileSync(file, 'utf-8'), file, out.length));
  }
  return out;
}

const declaration = (body: string, prop: string): string | null => {
  let hit: string | null = null;
  for (const m of body.matchAll(new RegExp(`(?:^|[;{])\\s*${prop}\\s*:([^;}]*)`, 'g'))) {
    hit = (m[1] ?? '').trim();
  }
  return hit;
};

/**
 * 挑出真的命中 `el` 的规则,按 (特异性, 源码顺序) 决出**赢的那一条**。
 * `matches()` 走的是真 DOM,祖先在不在树上它说了算 —— 少写一个祖先就不会命中,
 * 这正是「规则文本一模一样却错」的那一类事故唯一照得出来的地方。
 */
function winner(el: Element, prop: string, all: Rule[]): { rule: Rule; value: string } | null {
  let best: { rule: Rule; value: string; spec: Spec } | null = null;
  for (const rule of all) {
    const value = declaration(rule.body, prop);
    if (value == null) continue;
    let hit = false;
    try {
      hit = el.matches(rule.selector);
    } catch {
      continue; // nwsapi 认不出来的伪元素之类,让它过
    }
    if (!hit) continue;
    const spec = specificity(rule.selector);
    if (!best || heavier(spec, best.spec) || (!heavier(best.spec, spec) && rule.order > best.rule.order)) {
      best = { rule, value, spec };
    }
  }
  return best ? { rule: best.rule, value: best.value } : null;
}

/** 陈列页与产线都把面板挂在 `.app` 下面 —— 少了它,routines.css 那一层根本不参赛。 */
function mountUnderApp(container: HTMLElement) {
  const app = document.createElement('div');
  app.className = 'app';
  document.body.appendChild(app);
  app.appendChild(container);
  return app;
}

describe('中断的一轮 · 状态词', () => {
  it('写的是「已手动停止」,不是「已取消」', () => {
    // 测试环境默认走 en,所以这里比的是英文档;中文那一档在下面逐字钉。
    const { container } = renderTurn(turn({ runStatus: 'canceled' }));
    const label = container.querySelector('[data-testid="assistant-label"]');
    expect(label?.textContent).toBe(en['assistant.canceledLabel']);
    expect(en['assistant.canceledLabel']).toBe('Stopped manually');
  });

  it('文案落在 `assistant.canceledLabel` 上,逐字与稿子相同', () => {
    expect(zhCN['assistant.canceledLabel']).toBe('已手动停止');
  });

  it('旧会话同时带 no_result 时仍按手动停止处理,不回退成红色运行失败', () => {
    const { container } = renderTurn(turn({
      runStatus: 'canceled',
      resultDeliveryState: 'no_result',
      events: [
        { kind: 'tool_use', id: 'read-before-stop', name: 'Bash', input: { command: 'ls' } },
        {
          kind: 'tool_result',
          toolUseId: 'read-before-stop',
          content: 'partial output',
          isError: false,
        },
      ],
    }));

    expect(container.textContent).toContain(en['assistant.canceledLabel']);
    // 壳头报的是终态本身。OPEND-2626 之前这里是 `chat.record.running`,
    // 和一个真的在跑的回合共用同一个词;这一条要守的「不退成红色运行失败」没变。
    expect(container.textContent).toContain(en['chat.record.canceled']);
    expect(container.textContent).not.toContain(en['chat.record.running']);
    expect(container.textContent).not.toContain(en['chat.record.failedTurn']);
  });
});

describe('中断的一轮 · 只留 复制 / Fork', () => {
  it('赞 / 踩两枚不出 —— 这一轮没答完,没有「答得好不好」可评', () => {
    const { container } = renderTurn(turn({ runStatus: 'canceled' }));
    expect(container.querySelector('[data-testid="assistant-feedback-positive"]')).toBeNull();
    expect(container.querySelector('[data-testid="assistant-feedback-negative"]')).toBeNull();
    // 正面断言,免得「整行没渲染出来」也让上面两条空过。
    expect(container.querySelector('[data-testid="assistant-footer"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="assistant-copy-markdown"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="assistant-fork-button"]')).toBeTruthy();
  });

  it('跑通的那一轮照样出赞 / 踩 —— 不许一刀切', () => {
    const { container } = renderTurn(turn({ id: 'm-ok', runStatus: 'succeeded' }));
    expect(container.querySelector('[data-testid="assistant-feedback-positive"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="assistant-feedback-negative"]')).toBeTruthy();
  });
});

describe('中断的一轮 · 层叠', () => {
  it('状态词的颜色赢的是 --text-muted,不是旧皮肤那份 --text-faint', () => {
    const { container } = renderTurn(turn({ runStatus: 'canceled' }));
    mountUnderApp(container);
    const label = container.querySelector('[data-testid="assistant-label"]');
    expect(label, '没渲染出状态词,下面的层叠断言会空过').toBeTruthy();

    const all = cascade();
    const candidates = all.filter((r) => {
      if (declaration(r.body, 'color') == null) return false;
      try {
        return label!.matches(r.selector);
      } catch {
        return false;
      }
    });
    // 参赛的至少要有 composio 的底子和 theater 的中断档;一条都挑不出来说明这份
    // 层叠快照根本没读到样式,断言就成了空的。
    expect(candidates.length, '一条命中的 color 规则都没挑出来').toBeGreaterThanOrEqual(2);

    const win = winner(label!, 'color', all);
    expect(win, '没有任何规则给状态词上色').toBeTruthy();
    expect(win!.value, `赢的是 ${win!.rule.file} 的 \`${win!.rule.selector}\``).toBe('var(--text-muted)');
  });

  it('记号是 5px 灰圆点,不是那枚绿勾', () => {
    const { container } = renderTurn(turn({ runStatus: 'canceled' }));
    mountUnderApp(container);
    const dot = container.querySelector('.assistant-footer .dot');
    expect(dot, '没渲染出记号').toBeTruthy();
    expect(dot!.tagName.toLowerCase(), '中断档要用 <i>,勾那一档才是 <svg>').toBe('i');

    const all = cascade();
    expect(winner(dot!, 'background', all)?.value).toBe('var(--text-faint)');
    expect(winner(dot!, 'width', all)?.value).toBe('5px');
    expect(winner(dot!, 'border-radius', all)?.value).toBe('50%');
    // 绿勾那条规则(`--tick-img`)必须不命中中断档。
    const tick = all.find((r) => /tick-img/.test(r.body));
    expect(tick, '找不到画绿勾那条规则').toBeTruthy();
    expect(dot!.matches(tick!.selector), '中断的一轮戴上了「已完成」那枚绿勾').toBe(false);
  });
});
