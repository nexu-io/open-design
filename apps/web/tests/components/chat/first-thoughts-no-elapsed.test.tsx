// @vitest-environment jsdom
/**
 * 【产品裁决 2026-09-04】整轮**头一格**推理不报时长。
 *
 * 用户看着一轮正在跑的执行记录说:「这里首次 thinking 我看是有一个计时的,
 * 能不能不要计时, 不然跟上面一行的进行中的计时有点重复」。
 *
 * ── 为什么这不是随手改的样式偏好 ────────────────────────────────────────
 *
 * 因为那两个数**说的是同一件事**。thinking 事件一个时刻都不带 ——
 * `runtime/chat/contract.ts` 的 `ShellText.elapsedMs` 逐字记着这件事:daemon 送出的
 * `thinking_delta` 载荷就是 `{ type, delta }`,落库形态是 `{ kind: 'thinking', text }`。
 * 所以推理的时长只能靠「它填掉了哪一段空白」反推:上一件带时刻的事结束,到下一件
 * 带时刻的事开始。**头一格前面什么都没有**,于是 `build-turn-blocks` 给它的起点是
 * `input.startedAtMs`(轮次开头),而壳头那句「进行中 1m 9s」的起点
 * (`shellElapsed` 的 `isFirst` 分支)是同一个时刻、跑着的时候终点也是同一个 `nowMs`。
 * 两行贴在一起,写的是同一个数 —— 两个数字,一个事实。
 *
 * 后面几格不是这样:它们填的是**两次工具调用之间**的空白,那个数是新信息,照旧要报。
 *
 * ── ⚠️ 压制有到期时刻(用户 2026-09-06,本文件整体改写的原因)──────────────
 *
 * 用户:「即使是第一个 thinking,思考过程中不显示耗时,但**结束还是要显示的吧**?」
 * (同一轮他先报的是「现在思考耗时好像只有第一次的 thinking 没显示耗时?」)
 *
 * **这不是推翻 2026-09-04,是把它还原成它自己的理由。** 上面那段推导里
 * 「跑着的时候终点也是同一个 `nowMs`」这句话**只在这一格还在流的时候成立**:
 * 一旦下一件带时刻的事把它结账(`build-turn-blocks` 的 `stamp()` → `closeThink(at)`),
 * 这一格的数字就冻在那儿,而壳头那个数继续走到轮次收尾 —— 两个数当场分叉,
 * 「两个数字,一个事实」不再成立,压制也就到期。
 *
 * 于是本文件的断言分成**两类**,改动时别混:
 *   · **相位 = 还在想(`live`)** —— 断言仍然是空槽,一个字没改。产品裁决 2026-09-04
 *     原样有效,这是防「修过头」的那道闩。
 *   · **相位 = 想完了** —— 原来也断言空槽,那是把「当时的现状」当成了裁决内容。
 *     现在断言写出自己那一段的秒数,每一处都在就近的注释里写了为什么。
 *
 * 判据落点:`ThoughtsRow` 的 `const elapsed = muted && live ? '' : formatElapsed(…)`。
 * 「想完了要有数」那一面另有 `amr-thinking-slot-blank.test.tsx` 从用户报的两个
 * 真实画面钉一遍。
 *
 * ── 和 `live-row-elapsed.test.tsx` 的关系 ──────────────────────────────
 *
 * 那个文件守的是 2026-09-02 的反向裁决(「进行中的行都得有计时」,覆盖思考中 /
 * 工具行 / 步骤行 / 生图行四类)。这一次裁决**只收窄其中一个位置的一个相位** ——
 * 整轮头一格推理**还在想的时候** —— 别的位置一格没动,下面第三节就是拿来钉这件事的。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import type {
  ExecutionShell as Shell,
  ShellItem,
  TodoStatus,
} from '../../../src/runtime/chat/contract';

afterEach(cleanup);

const shellOf = (items: ShellItem[], over: Partial<Shell> = {}): Shell => ({
  kind: 'shell', id: 'shell-1', status: 'running', items, segments: [],
  thinking: false, stopped: false, elapsedMs: null, quietMs: null, ...over,
});

const show = (shell: Shell): ReactElement => (
  <I18nProvider initial="zh-CN">
    <ExecutionShell shell={shell} deferCollapsedBodies={false} />
  </I18nProvider>
);

const thought = (text: string, elapsedMs: number): ShellItem =>
  ({ kind: 'text', text, thinking: true, elapsedMs } as ShellItem);

const tool = (id: string): ShellItem => ({
  kind: 'tool', id, tool: 'read', name: 'Read', title: `读取 ${id}`, rawTitle: false,
  file: null, pattern: null, hits: null, delta: null, elapsedMs: 400,
  pending: false, failed: false, failReason: null, command: null, terminal: null,
} as ShellItem);

const step = (content: string, status: TodoStatus, items: ShellItem[]): ShellItem => ({
  kind: 'todo',
  segment: {
    content, status, recalled: false, abandoned: false, implicit: false,
    items, elapsedMs: 9_000,
  },
} as ShellItem);

/**
 * 每一格「思考」右边那个槽的文字,按出现顺序。
 *
 * 读的是**槽本身**而不是整块 `textContent`:「不含 /\d+s/」这种问法在夹具本来就没有
 * 数字时恒真(而这个文件所有夹具都用同一个 `thought(…, 1_710_000)`,第二节的正向
 * 对照就是拿来证明「不改代码它会写 28m 30s」的)。槽不存在时给一个显眼的哨兵,
 * 免得选择器没命中被读成「压住了」。
 */
function thoughtsElapsed(root: HTMLElement): string[] {
  const rows = Array.from(root.querySelectorAll<HTMLElement>('details[class*="thoughts"]'));
  if (!rows.length) throw new Error('一格思考都没渲染出来 —— 选择器没命中,不是耗时的问题');
  return rows.map((row) => {
    const slot = row.querySelector('summary [data-testid="chat-foldable-elapsed"]');
    return slot ? (slot.textContent ?? '') : '<无槽>';
  });
}

describe('整轮头一格推理**还在想的时候**不报时长(用户裁决 2026-09-04)', () => {
  it('用户那个画面:壳里只有一段还在写的推理 —— 右边不写秒数', () => {
    const { container } = render(show(shellOf(
      [thought('还在想…', 1_710_000)],
      { thinking: true },
    )));
    // 正向对照:确实是「思考中」那一档,不是收起来的「思考过程」
    expect(container.textContent).toContain('思考中');
    expect(thoughtsElapsed(container)).toEqual(['']);
    expect(container.textContent).not.toContain('28m 30s');
  });

  /**
   * 防真空 —— **这把尺子看得见缺陷**,而且看得见的正是「相位」这一个变量。
   *
   * 上一条断言的是「读到空串」,而空串在夹具本来就写不出数字时恒真。这一条把
   * **同一张壳、同一段推理、同一个 `1_710_000`** 再渲一遍,只把相位从「还在想」
   * 翻成「想完了」(`thinking: false` + 轮次收尾),读出来是 `28m 30s`。
   *
   * 一条测试同时钉住两件事:
   *   · 上一条的空串是**压住了**,不是夹具从头到尾就没有数;
   *   · 压制的到期判据就是 `live` 本身 —— 变量只动了这一个(用户 2026-09-06)。
   *
   * ⚠️ 这一条原来是「同一个值**挪到第二格**」。位置对照留在下一条,但它已经不再是
   * 「压住 vs 没压住」的对照了:第二格前面那一格现在也写数(它想完了)。
   */
  it('防真空 · 相位对照:同一格同一个值,想完之后就写 28m 30s', () => {
    const { container } = render(show(shellOf(
      [thought('想完的那一段。', 1_710_000)],
      { thinking: false, status: 'done' },
    )));
    // 正向对照:确实翻到了「思考过程」那一档
    expect(container.textContent).toContain('思考过程');
    expect(thoughtsElapsed(container)).toEqual(['28m 30s']);
  });

  /**
   * 位置对照:同一个值挪到第二格照旧写 `28m 30s` —— 选择器和 `formatElapsed` 都活着。
   *
   * ⚠️ 头一格从 `''` 改成 `1m 2s` 是**裁决变了**,不是把断言改松:这张壳里头一格
   * 后面压着一次调用,`build-turn-blocks` 的 `stamp()` 早就把它结账冻住了 ——
   * 它**已经想完**,`live` 是假,压制不覆盖这个相位(用户 2026-09-06)。
   * 写出来的 `1m 2s` 就是它自己那 62 秒,不是壳头那个还在走的数的复读。
   */
  it('位置对照:头一格想完了写自己那 1m 2s,第二格照旧写 28m 30s', () => {
    const { container } = render(show(shellOf(
      [thought('开场那一段。', 62_000), tool('a.ts'), thought('还在想…', 1_710_000)],
      { thinking: true },
    )));
    expect(thoughtsElapsed(container)).toEqual(['1m 2s', '28m 30s']);
  });

  /**
   * 判据是**位置**,不是时刻 —— 裁决原话就是「首次 thinking」,一轮里只压一格。
   *
   * ⚠️ 这一条和裁决给的**理由**在一个边角上分岔:前面已经有过一次带时刻的调用时,
   * 这一格填的空白起点是那次调用的结束,不再等于轮次开头,壳头那个数于是不是它的复读。
   * 仍然按位置压,理由有两条:一,渲染层看不见时刻(`ShellItem` 里只有算好的 `elapsedMs`,
   * 分不出「从轮次开头起」还是「从上一次调用起」),按时刻分档得把判断挪回
   * `build-turn-blocks`;二,真机里推理几乎总是排在头一件事,两种读法只在这个边角上
   * 分岔。**没有再自造一条更窄的产品规则**;真要按时刻分档,得产品另裁一次。
   */
  it('判据是位置:前面已经有过一次调用,头一格推理照样不报时长', () => {
    const { container } = render(show(shellOf(
      [tool('a.ts'), thought('还在想…', 1_710_000)],
      { thinking: true },
    )));
    expect(thoughtsElapsed(container)).toEqual(['']);
  });

  /**
   * ⚠️ 这一条原来叫「头一格压住,后面那一格照旧报自己的数」,断言 `['', '1m 2s']`。
   *
   * 那个 `''` 守的是「**想完之后也不显示**」—— 而这张壳里两格推理都早已想完
   * (`thinking: false`,两格后面各压着一次带时刻的调用),压制根本不覆盖这个相位。
   * 断言改成两格各写各的数(用户 2026-09-06)。
   *
   * 「头一格被压住」这件事**没有失去覆盖**:它只在 `live` 相位存在,由本节第一条
   * (整格 `['']`)和第三条(前面有过调用、头一格仍在流)各钉一遍。
   */
  it('两格都想完了:头一格写自己那 28m 30s,后面那一格写自己的 1m 2s', () => {
    const { container } = render(show(shellOf([
      thought('开场那一段。', 1_710_000),
      tool('a.ts'),
      thought('两次调用之间那一段。', 62_000),
      tool('b.ts'),
    ])));
    expect(thoughtsElapsed(container)).toEqual(['28m 30s', '1m 2s']);
  });
});

describe('「头一格」是整轮一格,不是每条 todo 抽屉各来一格', () => {
  /**
   * 有清单时推理落进当前那条 in_progress 的 todo(`build-turn-blocks` 的 `sink()`),
   * 所以整轮头一格完全可能是在抽屉里。它仍然是**整轮的**头一格 —— 压的是它。
   *
   * ⚠️ 这一节原来用的是「抽屉一已完成 + 抽屉二进行中」那张壳,断言 `['', '1m 2s']`。
   * 那个 `''` 落在一格**早就想完**的推理上,守的其实是「想完之后也不显示」——
   * 前提已随 2026-09-06 的裁决作废。压制只活在 `live` 相位,所以要钉「头一格在抽屉里
   * 也会被压住」,夹具本身就得让那一格**还在流**:清单只有一条、正在进行、
   * 推理就写在它里面(`thinking: true`),这也是真机里头一格落进抽屉的实际形状。
   */
  it('头一格在抽屉里、而且还在流:压住它,右边不写秒数', () => {
    const { container } = render(show(shellOf(
      [step('复刻商品列表页', 'in_progress', [thought('抽屉里还在想…', 1_710_000)])],
      { thinking: true },
    )));
    expect(container.textContent, '正向对照:确实是「思考中」那一档').toContain('思考中');
    expect(thoughtsElapsed(container)).toEqual(['']);
  });

  /**
   * 防真空:同一张壳、同一段推理,只把相位翻成「想完了」就写得出 `28m 30s`。
   * 上一条读到的空串因此是**压住了**,不是抽屉这条路径本来就画不出槽。
   */
  it('防真空 · 相位对照:抽屉里那一格想完之后照旧写 28m 30s', () => {
    const { container } = render(show(shellOf(
      [step('复刻商品列表页', 'in_progress', [thought('抽屉里想完的那一段。', 1_710_000)])],
      { thinking: false },
    )));
    expect(thoughtsElapsed(container)).toEqual(['28m 30s']);
  });

  /**
   * 第二条抽屉里那一段填的是两次调用之间的空白,是新信息,**不算头一格**。
   *
   * ⚠️ 夹具加了 `thinking: true`,这不是装饰:抽屉二是 `in_progress`,于是它那一格
   * 是 `live` 的。真要是被错认成「整轮头一格」,压制会把它抹成空串,这一条当场红 ——
   * 原来那张 `thinking: false` 的壳两格都想完了,谁被压住都读不出来,守不住任何东西。
   * 抽屉一那一格现在写 `28m 30s`(它想完了),这是 2026-09-06 裁决的直接结果。
   */
  it('头一格在第一条抽屉里:第二条抽屉里那一格还在流,也照旧有数', () => {
    const { container } = render(show(shellOf(
      [
        step('复刻商品列表页', 'completed', [thought('抽屉一的推理。', 1_710_000), tool('a.ts')]),
        step('按同一套间距做设置页', 'in_progress', [thought('抽屉二还在想…', 62_000)]),
      ],
      { thinking: true },
    )));
    expect(thoughtsElapsed(container)).toEqual(['28m 30s', '1m 2s']);
  });

  /**
   * 同上:`thinking: true` 让抽屉里那一格是 `live` 的,被错认成头一格就会读到空串。
   */
  it('顶层已经有过一格时,抽屉里那一格不再算「头一格」', () => {
    const { container } = render(show(shellOf(
      [
        thought('清单之前的开场推理。', 1_710_000),
        step('复刻商品列表页', 'in_progress', [thought('抽屉里还在想…', 62_000)]),
      ],
      { thinking: true },
    )));
    expect(thoughtsElapsed(container)).toEqual(['28m 30s', '1m 2s']);
  });
});

describe('2026-09-02 那条裁决在别的位置一格没动', () => {
  it('进行中的工具行、步骤行照旧写秒数', () => {
    const { container } = render(show(shellOf([
      thought('开场那一段。', 1_710_000),
      // `as unknown as` 中转:`ShellItem` 是判别联合,直接断言成 `Record` TS 会拦
      // (两个类型没有足够重叠)。这里只是给这一行盖上 pending + 秒数。
      { ...(tool('c.ts') as unknown as Record<string, unknown>), pending: true, elapsedMs: 847_000 } as unknown as ShellItem,
      step('复刻商品列表页', 'in_progress', []),
    ], { thinking: true })));
    /*
     * 这一格原来断言 `''`。壳里已经有一条 in_progress 的清单,推理的落点因此换到了
     * 抽屉里(`ExecutionShell` 那句 `!activeTodo`),顶层这一格**已经不在流** ——
     * 想完了就报自己那一段(用户 2026-09-06)。这一条本来要守的是下面两行,
     * 顶层思考那一格只是同一张壳上的邻居,跟着裁决改。
     */
    expect(thoughtsElapsed(container)).toEqual(['28m 30s']);
    expect(container.textContent, '进行中的工具行').toContain('14m 7s');
    expect(container.textContent, '进行中的步骤行').toContain('9.0s');
  });
});
