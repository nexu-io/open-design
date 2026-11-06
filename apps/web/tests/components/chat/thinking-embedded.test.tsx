// @vitest-environment jsdom
/**
 * N7:**思考是壳内的一个条目,不是壳的一种形态**(用户裁决,2026-08-27)。
 *
 * 用户原话(两条,先后到达):
 *   ①「诶卧槽这个思考中的怎么把原本的进行中卡片给顶掉了卧槽..这个思考中的我理解应该是
 *      嵌入到进入中卡片呢? 它就算做一个普通的文本或者工具调用, 只不过有一个特殊的动画
 *      和样式啊, **绝不能 thinking 的时候直接把进行中或原本的东西给替换了**啊!!」
 *      「然后 thinking 完了之后, 怎么没像创建\编辑之类的调用那样, 把超长的内容收起来???
 *      全摊开了.. 太长了..」
 *   ②「思考中的时候, 最好是能有现在那个动画加思考中的文案, 然后下面文字也是要滚动的,
 *      思考完就收起变成 toolrow, 但思考中动画啥的, 这些都是和 toolrow 所在地方同样的缩进逻辑」
 *      「我说的思考完之后, 不是这个绿的, 就变成普通的这个搜索一样的东西, 只不过可以下拉展开,
 *      它的缩进看是否在 todo 或者前面是否是普通文案动态决定缩进是多少,
 *      你可以给这个加一个 brain 的 icon」
 *
 * 裁决落成四条不变量,这个文件逐条钉:
 *   D46' 限高滚动窗挂在**思考这一个条目**上,不是壳 body(壳 body 永远 `.stack`)
 *   N7-a 思考期间壳里原有的工具行 / 清单**原样还在**
 *   N7-b 壳头在思考时仍是「进行中」——「思考中」的动画与文案落到思考块自己身上
 *   N7-c 跑完的推理一律收成一格,**包括落在 todo 段里的那些**(问题二的真因)
 *   N7-d 那一格不画绿勾,用 brain 图标,长得像工具行
 *
 * 规格冲突与裁决理由见 `specs/current/chat-panel-feedback.md` §F-15。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type {
  ExecutionShell as Shell,
  ShellItem,
  TodoSegment,
} from '../../../src/runtime/chat/contract';
import amrRun from '../../fixtures/chat/amr-thinking-todo.turn0.json';

afterEach(cleanup);

function shellOf(items: ShellItem[], over: Partial<Shell> = {}): Shell {
  return {
    kind: 'shell', seq: 0, status: 'succeeded', items, segments: [],
    thinking: false, stopped: false, elapsedMs: null, quietMs: null,
    ...over,
  } as Shell;
}

const show = (shell: Shell): ReactElement => (
  <I18nProvider initial="zh-CN">
    <ExecutionShell shell={shell} deferCollapsedBodies={false} />
  </I18nProvider>
);

const think = (text: string): ShellItem => ({ kind: 'text', text, thinking: true });
const tool = (id: string): ShellItem => ({
  kind: 'tool', id, tool: 'read', title: `读取 ${id}`, name: 'Read', rawTitle: false,
  file: null, delta: null, hits: null, pattern: null, elapsedMs: 400,
  failed: false, failReason: null, command: null, terminal: null,
} as ShellItem);

function todo(content: string, status: TodoSegment['status'], items: ShellItem[]): ShellItem {
  return {
    kind: 'todo',
    segment: {
      content, status, recalled: false, abandoned: false, implicit: false,
      items, elapsedMs: null,
    },
  };
}

/** 摊开外层那张壳(跑完时它是收起的);内层折叠保持各自的默认态 */
const openShell = (root: HTMLElement): void => {
  for (const d of Array.from(root.querySelectorAll('details'))) {
    if (d.className.includes('flat')) d.open = true;
  }
};

/** 壳自己那只 body(直接挂在扁平壳的 summary 后面) */
const shellBody = (root: HTMLElement): HTMLElement => {
  const body = root.querySelector('details[class*="flat"] > div[class*="body"]');
  if (!(body instanceof HTMLElement)) throw new Error('壳 body 没渲染出来');
  return body;
};

/** 页面上**看得见**的推理字数 —— 收在闭合 <details> 里的不算 */
function visibleThinkChars(root: HTMLElement): number {
  let n = 0;
  for (const p of Array.from(root.querySelectorAll('[class*="think"]'))) {
    if (!p.closest('details:not([open])')) n += (p.textContent ?? '').length;
  }
  return n;
}
function allThinkChars(root: HTMLElement): number {
  let n = 0;
  for (const p of Array.from(root.querySelectorAll('[class*="think"]'))) {
    n += (p.textContent ?? '').length;
  }
  return n;
}

/* ── N7-a 思考不吞掉壳里原有的东西 ──────────────────────────── */

describe('N7-a 思考期间,壳里原有的内容原样还在', () => {
  it('壳 body 不因为思考换成限高滚动窗', () => {
    const { container } = render(show(shellOf(
      [tool('a.png'), tool('b.png'), think('先判断这一屏属于哪种页面类型。')],
      { status: 'running', thinking: true },
    )));
    openShell(container);

    /* 正向对照:壳确实渲染了、原有的工具行确实在。
       少了这一条,壳整个没渲染时下面的否定断言会天然通过。 */
    expect(screen.getByText(/读取 a\.png/)).toBeInTheDocument();
    expect(screen.getByText(/读取 b\.png/)).toBeInTheDocument();

    /* 真正要钉的:壳 body 是 `.stack`(高度 auto),不是 `.stream`(96px 限高窗)。
       现状 `streaming = running && shell.thinking` 把 `.stream` 套在整个壳 body 上,
       两条工具行被塞进 96px 里滚走 —— 这就是用户说的「把原本的进行中卡片给顶掉了」。 */
    expect(shellBody(container).className).toMatch(/stack/);
    expect(shellBody(container).className).not.toMatch(/stream/);
  });

  it('限高滚动窗挂在**思考那一个条目**自己身上', () => {
    const { container } = render(show(shellOf(
      [tool('a.png'), think('先判断这一屏属于哪种页面类型。')],
      { status: 'running', thinking: true },
    )));
    openShell(container);

    const stream = container.querySelector('[class*="stream"]');
    expect(stream).not.toBeNull();
    /* 它不能是壳 body ——「下沉到思考段自己身上」的全部含义就在这一句 */
    expect(stream).not.toBe(shellBody(container));
    /* 而且推理正文得真的在这只窗里,否则挂了个空窗也能绿。
       按 textContent 而不是 getByText:还在化开的那几个字被 `useCharReveal` 拆成了
       一串 `.rv` span(2026-08-27 起思考也走逐字化开),精确文本匹配会被拆散的节点挡住。
       要钉的是「字在这只窗里」,不是「字在同一个元素里」。 */
    expect(stream!.textContent).toContain('先判断这一屏属于哪种页面类型。');
    /* 反过来:工具行**不在**窗里(它没被卷进去) */
    expect(stream!.contains(screen.getByText(/读取 a\.png/))).toBe(false);
  });
});

/* ── N7-b 壳头不被思考顶掉 ──────────────────────────────────── */

describe('N7-b 壳头在思考时仍是「进行中」', () => {
  it('思考期间壳头不换成「思考中」', () => {
    const { container } = render(show(shellOf(
      [think('先判断这一屏属于哪种页面类型。')],
      { status: 'running', thinking: true },
    )));
    const summary = container.querySelector('details[class*="flat"] > summary');
    expect(summary).not.toBeNull();
    // 正向对照:壳头确实有状态词
    expect(summary!.textContent).toContain('进行中');
    // 用户原话:「绝不能 thinking 的时候直接把进行中…给替换了」
    expect(summary!.textContent).not.toContain('思考中');
  });

  it('「思考中」的文案和动画落在思考块自己身上', () => {
    const { container } = render(show(shellOf(
      [think('先判断这一屏属于哪种页面类型。')],
      { status: 'running', thinking: true },
    )));
    openShell(container);
    const label = screen.getByText('思考中');
    // 它必须住在壳头**之外**(否则等于没搬家)
    expect(label.closest('details[class*="flat"] > summary')).toBeNull();
    // 动画三件套:扫光 + 三个点,和原来壳头上那一套同源
    expect(label.className).toMatch(/shimmer/);
    // 稿子里壳头才用 head 档；壳内 live thinking 是 500 / muted 的普通 shimmer。
    expect(label.className).not.toMatch(/head/);
    expect(label.querySelector('[class*="dots"]')).not.toBeNull();
  });

  it('claude 那种全空的 thinking:壳里仍然出现「思考中」这一行', () => {
    /* 真实数据:本机 .od/runs 里 14 条 claude(model=default)共 1786 个 thinking 帧,
       非空 0 个。空串不成段,壳里一条推理都落不下 —— 但「它在想」这件事还得说出来。 */
    const { container } = render(show(shellOf(
      [tool('a.png')],
      { status: 'running', thinking: true },
    )));
    openShell(container);
    expect(screen.getByText(/读取 a\.png/)).toBeInTheDocument();   // 正向对照
    expect(screen.getByText('思考中')).toBeInTheDocument();
    // 且没有把壳 body 变成滚动窗
    expect(shellBody(container).className).not.toMatch(/stream/);
  });
});

/* ── N7-c 跑完就收起来,todo 段里的也要收 ────────────────────── */

describe('N7-c 跑完的推理一律收成一格', () => {
  it('落在 todo 段里的推理也收起来(问题二的真因)', () => {
    const { container } = render(show(shellOf([
      todo('选定视觉方向', 'in_progress', [
        tool('a.png'),
        think('这一段推理很长很长,长到能占满好几屏。'),
        think('第二段推理。'),
      ]),
    ])));
    openShell(container);
    for (const d of Array.from(container.querySelectorAll('details'))) {
      if (d.querySelector('summary')?.textContent?.includes('选定视觉方向')) d.open = true;
    }

    /* 正向对照:todo 抽屉确实展开了、里面的工具行读得到。
       否则「推理被收起来」在抽屉整个没渲染时也天然成立。 */
    expect(screen.getByText(/读取 a\.png/)).toBeInTheDocument();

    // todo 段里也要出「思考过程」那一格
    expect(screen.getAllByText('思考过程').length).toBeGreaterThan(0);
    // 且推理正文默认藏着
    expect(visibleThinkChars(container)).toBe(0);
    expect(allThinkChars(container)).toBeGreaterThan(0);   // 正文确实渲染了,只是收着
  });

  it('从「思考中」切到「思考完」的那一刻,推理是收起来的', () => {
    /*
     * 这是用户原话「thinking 完了之后…全摊开了」的**那一帧**:同一张壳,
     * `shell.thinking` 从 true 翻到 false。思考中那一格是摊开的(要读到滚动的字),
     * 翻过去之后必须**收起来**,不能把摊开态带过去。
     *
     * 挡的是 `Foldable` 的内部展开态:它只在挂载时读一次 `defaultOpen`,
     * 复用同一只 `<details>` 的话 live 那会儿的 open 会原样留着。
     */
    const items: ShellItem[] = [tool('a.png'), think('一段很长的推理。')];
    const { container, rerender } = render(show(
      shellOf(items, { status: 'running', thinking: true }),
    ));
    openShell(container);
    // 正向对照:思考中的时候正文确实是**读得到**的,否则下面那条不成立
    expect(visibleThinkChars(container)).toBeGreaterThan(0);

    rerender(show(shellOf(items, { status: 'running', thinking: false })));
    openShell(container);
    expect(screen.getByText(/读取 a\.png/)).toBeInTheDocument();      // 壳还在
    expect(screen.getByText('思考过程')).toBeInTheDocument();          // 已经收成一格
    expect(visibleThinkChars(container)).toBe(0);                     // 而且没摊开
  });

  it('真实录制回放:38K 字的推理不能摊在屏幕上', () => {
    /* 夹具来自本机 `.od/runs/0161ef44-…/events.jsonl`(agent=amr,2026-08-27 16:52)。
       只做了一件事:把连续的 thinking delta 拼起来(`buildTurnBlocks` 本来就会拼,
       已验证落块结果与全量事件逐字节相同),别的事件一律原样。 */
    const blocks = buildTurnBlocks({
      events: (amrRun as unknown as { events: PersistedAgentEvent[] }).events,
      runStatus: 'canceled',
    });
    const shell = blocks.find((b): b is Shell => b.kind === 'shell');
    expect(shell).toBeDefined();

    const { container } = render(show(shell!));
    openShell(container);
    for (const d of Array.from(container.querySelectorAll('details'))) {
      if (d.querySelector('summary')?.textContent?.includes('选定视觉方向')) d.open = true;
    }

    // 正向对照:这一轮确实有一大堆推理被渲染出来了
    expect(allThinkChars(container)).toBeGreaterThan(30_000);
    // 修之前这里是 38,064 —— 用户截图里那几屏字
    expect(visibleThinkChars(container)).toBe(0);
  });
});

/* ── N7-d 那一格长得像工具行 ────────────────────────────────── */

describe('N7-d 「思考过程」不画绿勾,用 brain 图标', () => {
  it('不再出现完成态的绿勾', () => {
    const { container } = render(show(shellOf([think('一段推理。'), tool('a.png')])));
    openShell(container);
    const summary = screen.getByText('思考过程').closest('summary');
    expect(summary).not.toBeNull();
    // 正向对照:这一行确实有一枚图标位
    expect(summary!.querySelector('[class*="icon"]')).not.toBeNull();
    // 用户原话:「不是这个绿的」
    expect(summary!.querySelector('[aria-label="已完成"]')).toBeNull();
  });

  it('图标就是 brain,且尺寸交给工具行那一套(不写死 18)', () => {
    const { container } = render(show(shellOf([think('一段推理。'), tool('a.png')])));
    openShell(container);
    const summary = screen.getByText('思考过程').closest('summary')!;
    const svg = summary.querySelector('svg');
    expect(svg).not.toBeNull();
    // brain-line 的路径起手式(`remix-icon-paths.ts` 的 'brain-line'),换成别的图标这条会红
    expect(svg!.querySelector('path')?.getAttribute('d')).toMatch(/^M9 4C10\.1046 4 11 4\.89543 11 6V12\.8271/);
    // 尺寸走 `.icon > svg`(14px),不是 SettingsDialog 那档 18
    expect(svg!.getAttribute('width')).not.toBe('18');
  });
});

/* ── 缩进:思考块和工具行同层同缩进,两态之间不跳 ──────────── */

describe('N7-f 缩进对齐工具行,两态之间不跳', () => {
  /**
   * jsdom 不做层叠,量不到 computed style;这里钉的是**规则本身**,打法同
   * `sandwiched-prose-rail.test.tsx` / `record-cascade.test.ts`。
   *
   * 真机数字是在 Chrome 里量出来的(harness 见交付说明),修之前:
   *   顶层  工具行图标 x=22,思考中 x=-3、思考过程 x=0   → 差 22~25px
   *   todo 里 工具行图标 x=22,思考过程 x=22           → 本来就齐,不用补
   * 所以要补的只有**顶层那一层**,补到和工具行同一个值。
   */
  const CSS = readFileSync(
    resolve(__dirname, '../../../src/components/chat/primitives/record.module.css'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '');

  /** 取某条规则里某个属性的值 */
  const declOf = (selector: string, prop: string): string | null => {
    for (const block of CSS.split('}')) {
      const [head, body] = block.split('{');
      if (!head || !body) continue;
      if (head.replace(/\s+/g, ' ').trim() !== selector) continue;
      const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body);
      if (m?.[1]) return m[1].trim();
    }
    return null;
  };

  it('思考中三个点的静止线在文字视觉中线,不落到基线上(OPEND-2411)', () => {
    expect(declOf('.dots', 'vertical-align')).toBe('middle');
  });

  it('顶层:思考那一格的行首和工具行**取同一个值**', () => {
    /*
     * ⚠️ **这条断言的期望值 2026-08-27 变过一次:29px → 7px。**
     *
     * 原来两边都是 29(图标落在 22)。用户当天晚些时候指着顶层 Thoughts 左边那个
     * 空槽问「像这里如果是 todo 外面, 不应该有这个缩进? todo 外面的工具调用应该也
     * 没这个缩进吧?」—— 于是**基准本身**从 29 挪回 7:22 那一列是「步骤**里面**」
     * 的列(稿子:「缩进一格(状态点 15 + 间距 7 = 22)」),顶层的行不该占它。
     * 交付稿里 `.fold.mod-flat > .body.mod-stack > .tool` 命中 0 处(放进 Chrome 数过),
     * 顶层清一色是步骤、行首一律落 0。完整口径见 `chat-panel-feedback.md` §F-18。
     *
     * **这一条要钉的东西没变**:思考那一格和同层工具行取同一个值,而不是各写各的。
     */
    const toolPad = declOf('.fold.flat > .body.stack > .tool', 'padding');
    expect(toolPad).not.toBeNull();
    expect(toolPad).toBe('5px 7px');

    /*
     * 思考那一格在**顶层**没有自己的缩进规则 —— 和步骤、工具行同吃那一档
     * `padding: 5px 7px`。留一条专属规则就是留一个会各走各的地方。
     *
     * ⚠️ 2026-09-02 中间试过一版「列挂到抽屉、summary 归零」,为的是让悬停底和
     * 灰底面板**齐平**;用户看了说齐平反而丑(「应该允许比下面的超出一点点,
     * 有个 padding 而已」),于是收回 —— 顶层这一档回到没有专属规则的样子,
     * 悬停底靠 summary 自己那 7px 内距比面板宽出一圈。只有**嵌在步骤里**那一档
     * 还留着拆分(抽屉 22 + summary 7 = 原来的 29),因为那一列本来就要拆。
     */
    expect(declOf('.fold.flat > .body.stack > .fold.thoughts > summary', 'padding-inline-start')).toBeNull();
    expect(declOf('.fold.flat > .body.stack > .fold.thoughts', 'padding-inline-start')).toBeNull();
    expect(declOf('.fold.flat > .body.stack > .fold > summary', 'padding')).toBe('5px 7px');
  });

  it('**反向对照**:清单抽屉**里面**那一层照旧 29px —— 顶层挪回去没把它带走', () => {
    /*
     * 少了这一条,把所有行一律改成 7px 也能让上面那条绿 —— 那会把抽屉里的子行
     * 一起拽到最左,清单和它的子项就分不出层级了。
     * 真机量到(§F-18):顶层三种行的图标都是 0,抽屉里三种行的图标都是 22。
     */
    /* 这两支写在同一条规则的两个逗号段里,`declOf` 是按整段 head 精确比的,匹配不到 —— 直接读文本 */
    expect(CSS).toMatch(
      /\.fold\.flat \.body\.stack :is\(\.body\.stack, \.body\.stream\) > \*,\s*\.fold\.flat \.body\.stack \.body\.stack > \.fold > summary \{[^}]*padding-inline-start: 29px/,
    );
  });

  /*
   * ⚠️ **这条断言前后被推翻过两次,历史比结论值钱。**
   *
   * ① 2026-08-27 之前:断言「思考那一格**不**画步骤之间那条竖线」,做法是给链那两条
   *    选择器挂 `:not(.thoughts)`。理由是量到「线在 14.5、图标在 22,线孤零零落在图标
   *    左边」。**观察没错,病根找反了** —— 错的是思考那一格当时缩到了 22。
   * ② 2026-08-27:那一格回到第 0 列,线正好压在它的图标中轴上,断言翻成「**在**链上」。
   * ③ 2026-09-02:**设计裁决把那条线整个撤掉了**(用户原话「这个灰色竖线不要了,
   *    设计同学说」)。所以现在断言的是:样式表里一段链都不许再有。
   *
   * 留着这一路是因为「为什么曾经排除过它」比「现在没排除」更值钱:哪天线要回来,
   * 得先回答「思考那一格的列对不对」,而不是再把它从链上摘一次。
   */
  it('链已撤销 —— 样式表里一段竖线都不许再有', () => {
    const chained = CSS
      .split('}')
      .map((block) => ({
        sel: (block.split('{')[0] ?? '').replace(/\s+/g, ' ').trim(),
        body: block.split('{')[1] ?? '',
      }))
      .filter((r) => r.sel.endsWith('::before')
        && /width:\s*1px/.test(r.body)
        && /background:\s*var\(--chat-border\)/.test(r.body));
    expect(chained.map((r) => r.sel)).toEqual([]);
  });

  /*
   * ⚠️ 这条探针 2026-09-02 改过一次选择器,**断言的东西没变**。
   *
   * 原来写的是 `summary :scope > [class*="icon"]` —— 图标槽是 summary 的**直接**孩子。
   * `Foldable` 后来把标题那一段裹进了 `.summaryContent`(OPEND-2548:窄侧栏下只让标题
   * 槽收缩,耗时和箭头各占固定位,`1m 59s` 不再被拆成两行),于是图标槽下沉了一层,
   * 探针照不到,读起来像「图标槽没了」。
   *
   * 要钉的不是层数,是**两态共用同一只槽**,所以改成从标题槽往里找,并把「槽是标题段
   * 的头一个元素」一并钉住 —— 真把槽删了、或者只给其中一态加,这条照样红。
   */
  const iconSlotOf = (label: string): Element | null => {
    const content = screen.getByText(label).closest('summary')!
      .querySelector(':scope > [data-testid="chat-foldable-summary-content"]');
    expect(content).not.toBeNull();
    const slot = content!.firstElementChild;
    return slot && /icon/.test(slot.className) ? slot : null;
  };

  // 槽宽 15 → 16 是 `629cb3586a` 改的(和它装的图标同宽);`.step` / `.mark` 仍是 15px。
  it('思考中 / 思考过程用**同一个** 16px 图标位 —— 左边缘不会跳', () => {
    const live = render(show(shellOf(
      [tool('a.png'), think('推理。')], { status: 'running', thinking: true },
    )));
    openShell(live.container);
    const liveSlot = iconSlotOf('思考中');
    expect(liveSlot).not.toBeNull();
    // 球还在那只槽里(动画没丢)
    expect(liveSlot!.querySelector('[data-orb]')).not.toBeNull();
    cleanup();

    const done = render(show(shellOf([tool('a.png'), think('推理。')])));
    openShell(done.container);
    const doneSlot = iconSlotOf('思考过程');
    expect(doneSlot).not.toBeNull();
    // 两态的行首槽是同一个类 —— 宽度一致,后面的字才不会横跳
    expect(doneSlot!.className).toBe(liveSlot!.className);
  });
});

describe('N7-e 思考块和 ToolRow 同层,缩进跟着同一套规则走', () => {
  /**
   * jsdom 不做层叠也不做布局,量不到 computed style。这里钉的是**结构前提** ——
   * 两态都是壳 body 里同一种 DOM(`details.fold`),和可展开的命令工具行一模一样,
   * 于是 `record.module.css` 那套缩进规则对三者一视同仁。
   * 真正的 computed style 在浏览器里量,harness 见 `docs/design/chat-mirror`(见交付说明)。
   */
  const streamingShell = shellOf(
    [tool('a.png'), think('推理。')],
    { status: 'running', thinking: true },
  );
  const doneShell = shellOf([tool('a.png'), think('推理。')]);

  const foldAt = (root: HTMLElement, text: string): HTMLElement => {
    const el = screen.getByText(text, { selector: '*' }).closest('details');
    if (!(el instanceof HTMLElement)) throw new Error(`${text} 不在 details 里`);
    return el;
  };

  it('思考中态:思考块是壳 body 的直接子节点,和工具行平级', () => {
    const { container } = render(show(streamingShell));
    openShell(container);
    const body = shellBody(container);
    const block = foldAt(container, '思考中');
    expect(block.parentElement).toBe(body);
    // 正向对照:工具行也确实是同一只 body 的直接子节点
    const row = screen.getByText(/读取 a\.png/).closest('[class*="tool"]');
    expect(row?.parentElement).toBe(body);
  });

  it('思考完态:同一个位置、同一种 DOM —— 左边缘不会跳', () => {
    const { container } = render(show(doneShell));
    openShell(container);
    const block = foldAt(container, '思考过程');
    expect(block.parentElement).toBe(shellBody(container));
    // 两态用的是同一组结构类名,缩进规则才可能一致
    const { container: c2 } = render(show(streamingShell));
    openShell(c2);
    const live = foldAt(c2, '思考中');
    expect(block.className).toBe(live.className);
  });
});
