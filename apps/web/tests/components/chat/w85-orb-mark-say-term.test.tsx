// @vitest-environment jsdom
/**
 * W85 —— 四条「逐格量尺报出来的差异」的**真实归属**。
 *
 * 这四条来自全量逐格对比(镜像陈列页 vs 交付稿矩阵页)的报告。逐条在真 Chrome 里
 * 复量之后,**没有一条是产品实现走样**:三条出在陈列页那一侧(它自己重写了一段
 * 画球的脚本、它的事件流夹具没把清单收干净),一条是把两个不同的元素配对到了一起。
 *
 * 这个文件不是补测,是**钉子**:把「量出来的差异不是实现差异」这件事的依据钉住,
 * 免得下一轮全量对比又照着同一份读数去改产品。每一条都配了反向对照 ——
 * 光钉一半的话,把两边都改成同一个错值照样全绿。
 *
 * ── 四条各自的结论(依据见每个 it 的注释)────────────────────────────
 *
 * ① 壳头矮 4px、球 20 vs 24
 *    产品是对的:`ExecutionShell` 传 `box={24}`,`Orb` 按 box 定画布,画出来就是 24。
 *    陈列页照出 20,是因为它没有 React,自己重写了一段画球的脚本,那段写死
 *    `const box = host.classList.contains('mark') ? 15 : 20`,**把 `data-orb-box` 丢了**。
 *    壳头高度是被球撑起来的(24 + 6 + 6 = 36),球一小,头跟着矮 4px —— 一件事不是两件。
 *
 * ② 步骤记号写「未开始」,同一格壳头写「已完成」
 *    产品是对的,而且这是**写明的裁决**:`closeRunningSegments` 在轮次终止时把还开着的
 *    步骤收成 `stopped`(不是 `completed`)——「标成完成是替 agent 说了它没说过的话」。
 *    陈列页那几格的事件流**只发过一次清单、状态是 in_progress**,收尾那次快照没发,
 *    于是照出来的是「agent 忘了收清单」这条边缘路径,而不是那一格自己写的「跑完」。
 *
 * ③ 思考正文 13px / 12px
 *    量到的两个 `p` **不是同一个东西**:稿子那一侧是壳 body 里的开场白(13px 深墨),
 *    我们这一侧是思考抽屉里的推理段落(12px 静音灰)。我们的推理段落和**稿子自己的
 *    推理段落**逐值相同(12 / 20.4 / #A3A3A3),开场白也已经是 13px —— 配对配错了。
 *    ⚠️ 真正剩下的那半条是**开场白落进步骤抽屉**时退回 12px。那一档**稿子没画过**
 *    (稿子只写 `.fold.mod-flat > .body.mod-stack:not(.mod-stream) > .think`,
 *    一条进抽屉的规则都没有),所以**不许自己定值** → 待产品裁决,见报告。
 *
 * ④ 终端块缩进 22px
 *    产品是对的,而且**两套列都在**:嵌在步骤里 29px(与稿子逐值相同),
 *    顶层那一条 7px —— 后者是 2026-09-02 的裁决(「todo 外的 toolrow 不要有任何缩进」)。
 *    陈列页那一格的夹具把清单一上来就标成 completed,于是终端块落到了**顶层**那一列;
 *    同一族的另外两格(事件流里清单是 in_progress)量出来就是 29,和稿子一格不差。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PersistedAgentEvent } from '@open-design/contracts';

import { I18nProvider } from '../../../src/i18n';
import { Orb } from '../../../src/components/chat/primitives/Orb';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell as ShellData } from '../../../src/runtime/chat/contract';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src');
/** 注释里把这几条规则连数值一起解释了一遍,不剥掉就会把注释当规则读 */
const RECORD_CSS = readFileSync(
  resolve(SRC, 'components/chat/primitives/record.module.css'), 'utf-8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** 顶层规则:`选择器 { 声明 }`。这份 module 没有嵌套,一刀够用。 */
function rules(css: string): Array<{ selector: string; body: string }> {
  return Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g)).map((m) => ({
    selector: (m[1] ?? '').trim().replace(/\s+/g, ' '),
    body: (m[2] ?? '').trim().replace(/\s+/g, ' '),
  }));
}
const RULES = rules(RECORD_CSS);
const ruleFor = (selector: string): string | undefined =>
  RULES.find((r) => r.selector === selector)?.body;

// ── 事件流小工具:和陈列页夹具同一种写法,但这里只写这几条要用的 ──────────
type TodoState = 'pending' | 'in_progress' | 'completed';
const todos = (id: string, list: Array<[string, TodoState]>): PersistedAgentEvent[] => [
  { kind: 'tool_use', id, name: 'TodoWrite',
    input: { todos: list.map(([content, status]) => ({ content, status, activeForm: content })) } },
  { kind: 'tool_result', toolUseId: id, content: 'ok', isError: false },
] as PersistedAgentEvent[];
const read = (id: string, file: string, at: [number, number]): PersistedAgentEvent[] => [
  { kind: 'tool_use', id, name: 'Read', input: { file_path: file }, startedAt: at[0] },
  { kind: 'tool_result', toolUseId: id, content: 'ok', isError: false, completedAt: at[1] },
] as PersistedAgentEvent[];
const bash = (id: string, cmd: string, at: [number, number]): PersistedAgentEvent[] => [
  { kind: 'tool_use', id, name: 'Bash', input: { command: cmd, description: '跑一遍' }, startedAt: at[0] },
  { kind: 'tool_result', toolUseId: id, content: '✓ built', isError: false, completedAt: at[1] },
] as PersistedAgentEvent[];

function shellOf(events: PersistedAgentEvent[], runStatus: 'running' | 'succeeded'): ShellData {
  const blocks = buildTurnBlocks({ events, runStatus, nowMs: 31_000 });
  const shells = blocks.filter((b): b is ShellData => b.kind === 'shell');
  const shell = shells[shells.length - 1];
  if (!shell) throw new Error('这段事件流没有产出执行记录壳');
  return shell;
}

function show(events: PersistedAgentEvent[], runStatus: 'running' | 'succeeded'): HTMLElement {
  return render(
    <I18nProvider initial="zh-CN">
      <div className="app"><div className="root" data-chat-root="">
        <ExecutionShell shell={shellOf(events, runStatus)} deferCollapsedBodies={false} />
      </div></div>
    </I18nProvider>,
  ).container;
}

/** 记号只按**可访问名**找 —— CSS Module 的类名带哈希,在这一层是不稳定的 */
const marksIn = (root: HTMLElement): string[] =>
  [...root.querySelectorAll('[role="img"][aria-label]')]
    .map((el) => el.getAttribute('aria-label') ?? '');

/**
 * jsdom 没有 2D 上下文。`Orb` 在 `getContext` 之**前**就把画布尺寸写进了 style,
 * 所以这里把它显式打成 null:尺寸照样量得到,又不会刷 jsdom 的 "Not implemented"。
 */
function stubNoCanvasContext(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(null as unknown as CanvasRenderingContext2D);
}
const canvasBox = (root: HTMLElement): { w: string; h: string } => {
  const canvas = root.querySelector('canvas');
  if (!canvas) throw new Error('没有画布 —— 这颗球根本没渲染出来');
  return { w: canvas.style.width, h: canvas.style.height };
};

describe('W85 · 四条量尺差异的真实归属', () => {
  // ── ① 壳头那颗球 ────────────────────────────────────────────────
  describe('① 壳头那颗球按 box 定尺寸,壳头的高度是它撑起来的', () => {
    it('防真空:同一把尺子读得出 24,也读得出 20 —— 两档分得开', () => {
      stubNoCanvasContext();
      // ⚠️ 两只**同时挂着**量。中间插一次 `cleanup()` 会把先渲染那棵一起卸掉,
      // 量到的就是一只空容器 —— 那种红是量法的红,不是实现的红(踩过一次)。
      const big = render(<Orb state="connecting" box={24} />).container;
      const small = render(<Orb state="composing" box={20} />).container;
      expect(canvasBox(big)).toEqual({ w: '24px', h: '24px' });
      expect(canvasBox(small)).toEqual({ w: '20px', h: '20px' });
      // 两档真的不同 —— 都读回同一个值的话上面两条等于没量
      expect(canvasBox(big).w).not.toBe(canvasBox(small).w);
    });

    it('跑着的壳头画的是 24 的球(陈列页照出 20 是它自己那段脚本丢了 data-orb-box)', () => {
      stubNoCanvasContext();
      const root = show([...read('r0', 'tokens.css', [0, 400])], 'running');
      const host = root.querySelector('[data-orb]');
      expect(host, '跑着的壳头没有球').not.toBeNull();
      expect(host?.getAttribute('data-orb')).toBe('connecting');
      // 属性和画布必须**同时**是 24:陈列页的毛病正是属性写着 24、画布画成 20
      expect(host?.getAttribute('data-orb-box')).toBe('24');
      expect(canvasBox(root)).toEqual({ w: '24px', h: '24px' });
    });

    it('反向对照:思考那一格的球仍是 20,没跟着壳头一起变大', () => {
      stubNoCanvasContext();
      const root = show([
        { kind: 'thinking', text: '先量一下列宽。' } as PersistedAgentEvent,
      ], 'running');
      const hosts = [...root.querySelectorAll('[data-orb]')];
      const composing = hosts.find((h) => h.getAttribute('data-orb') === 'composing');
      expect(composing, '思考中那一格没有球').not.toBeNull();
      expect(composing?.getAttribute('data-orb-box')).toBe('20');
    });
  });

  // ── ② 步骤记号 ──────────────────────────────────────────────────
  describe('② 步骤记号照事件流走 —— 清单收干净才是绿勾', () => {
    /** 跑完那一格的内容:一条清单 + 四次读取 */
    const CALLS: PersistedAgentEvent[] = [
      ...read('a', '首页.png', [0, 400]),
      ...read('b', 'tokens.css', [400, 700]),
    ];

    it('收尾发了「已完成」的清单 → 绿勾', () => {
      const root = show([
        ...todos('p1', [['复刻商品列表页', 'in_progress']]),
        ...CALLS,
        ...todos('p2', [['复刻商品列表页', 'completed']]),
      ], 'succeeded');
      const marks = marksIn(root);
      expect(marks, `记号是 ${JSON.stringify(marks)}`).toContain('已完成');
      expect(marks).not.toContain('未开始');
    });

    it('防真空 + 反向对照:同一段调用、只是收尾那次清单没发 → 中性记号', () => {
      // 这就是陈列页第 4 / 5 / 7 / 8 / 10 / 11 格夹具的形状
      const root = show([
        ...todos('p1', [['复刻商品列表页', 'in_progress']]),
        ...CALLS,
      ], 'succeeded');
      const marks = marksIn(root);
      // 两条断言必须一起看:上面那条给「已完成」,这条给别的 —— 读数不是恒等式
      /*
       * 中性记号那一档 OPEND-2626 改了名:原来它和「未开始」共用一个名字,
       * 现在叫「未完成」。**这一格正是不能叫「已取消」的那个反例** ——
       * 轮次是 succeeded,没有任何人取消过它,只是 agent 收尾时没再发一次清单。
       * 要守的东西没变:不许变成绿勾(那是替 agent 说它没说过的话),
       * 也不许说成「从没开始过」(它起过步)。
       */
      expect(marks, `记号是 ${JSON.stringify(marks)}`).toContain('未完成');
      expect(marks).not.toContain('未开始');
      expect(marks).not.toContain('已取消');
    });

    it('反向对照:轮次还在跑时那条步骤是「进行中」,没有被收掉', () => {
      const root = show([
        ...todos('p1', [['复刻商品列表页', 'in_progress']]),
        ...CALLS,
      ], 'running');
      expect(marksIn(root)).toContain('进行中');
    });
  });

  // ── ③ 开场白字号 ────────────────────────────────────────────────
  describe('③ 开场白 13px、壳内其余 12px', () => {
    it('防真空:两档都读得到,而且不是同一个值', () => {
      const base = ruleFor('.think');
      const opening = ruleFor('.fold.flat > .body.stack > .think');
      expect(base, '连基准 `.think` 都没读到 —— 量法坏了,下面几条都不算数').toBeTruthy();
      expect(opening, '开场白那条规则没读到').toBeTruthy();
      expect(base).toContain('font-size: var(--chat-t-mini)');
      expect(opening).toContain('font-size: var(--chat-t-body)');
      // --chat-t-mini 与 --chat-t-body 必须真的是两档
      const seam = readFileSync(resolve(SRC, 'components/chat/ChatRoot.module.css'), 'utf-8');
      expect(seam).toContain('--chat-t-mini: var(--font-size-12)');
      expect(seam).toContain('--chat-t-body: var(--font-size-13)');
    });

    it('开场白那条连内距一起,和稿子逐值相同(6px 上下 / 13px)', () => {
      const opening = ruleFor('.fold.flat > .body.stack > .think');
      expect(opening).toContain('padding: 6px 0');
    });

    it('反向对照:思考抽屉里那几段推理**不许**被这条规则染上 13px', () => {
      // 稿子自己的推理段落就是 12px 静音灰;那一族住在 ThinkingMarkdown 自己的 module,
      // 这份文件里凡是给 `.think` 定 13px 的规则,都不许把 `.thoughts` 圈进来
      const thirteen = RULES.filter(
        (r) => r.selector.includes('.think') && r.body.includes('--chat-t-body'),
      );
      expect(thirteen.length, '一条 13px 的 `.think` 规则都没有 —— 上面几条是空转的').toBeGreaterThan(0);
      for (const r of thirteen) {
        expect(r.selector, `${r.selector} 把思考抽屉也圈进 13px 了`).not.toContain('.thoughts');
        expect(r.selector, `${r.selector} 把流窗也圈进 13px 了`).not.toContain('.stream');
      }
    });
  });

  // ── ④ 终端块的两套列 ────────────────────────────────────────────
  describe('④ 终端块两套列各自成立,不许被对齐成一条', () => {
    it('嵌在步骤里那一列 29px —— 与稿子逐值相同', () => {
      expect(ruleFor('.fold.flat .body.stack .code')).toBe('margin-inline: 29px 18px;');
    });

    it('反向对照:顶层那一列 7px —— 2026-09-02 的裁决,不许被改成 29', () => {
      // 「todo 外的 toolrow…不要有任何的缩进了」:行盒往左探出 7px,补回来正好落在壳的内容边
      expect(ruleFor('.fold.flat > .body.stack > .fold > .body.stack > .code'))
        .toBe('margin-inline: 7px 18px;');
      // 防真空:两条列真的是两个数,不是同一条规则读了两遍
      expect(ruleFor('.fold.flat .body.stack .code'))
        .not.toBe(ruleFor('.fold.flat > .body.stack > .fold > .body.stack > .code'));
    });

    it('壳 body 直接挂的那一列 22px 也还在(三层各有各的数)', () => {
      expect(ruleFor('.fold.flat > .body.stack > .code')).toBe('margin-inline: 22px 11px;');
    });
  });

  // ── 有意偏离:这几条**不是**差异,谁也不许顺手「对齐」回去 ──────────────
  describe('有意偏离一格没动', () => {
    it('行首记号贴行首摆(OPEND-2417),不跟着行高居中', () => {
      const mark = ruleFor('.mark');
      expect(mark, '`.mark` 规则没读到').toBeTruthy();
      expect(mark).toContain('align-self: flex-start');
      expect(mark).toContain('margin-top: 1.5px');
    });

    it('折叠头的图标到文字是 7px(OPEND-2516;稿子写 8,产品留 7)', () => {
      expect(ruleFor('.fold > summary')).toContain('gap: 7px');
    });

    it('流窗里的推理走静音墨(产品 2026-09-02,别当成 bug 改回深色)', () => {
      const stream = ruleFor('.stream > .think');
      expect(stream, '`.stream > .think` 规则没读到').toBeTruthy();
      expect(stream).toContain('padding: 0');
    });
  });
});
