// @vitest-environment jsdom
/**
 * 镜像陈列页 —— 设计验收工具,不是普通单测。
 *
 * 为什么需要它(规格 §11 记的坑):稿子那一侧的陈列页抽的是
 * **设计稿自己的实体**。设计师不读代码,所以「我们做出来的和稿子对上了没有」在此之前
 * 没有任何人能判断。这里用**我们的组件**把稿子的 90 格逐格渲染一遍,编号与
 * `docs/design/chat-mirror/build-matrix.mjs` 从交付稿抽出来的那一页**逐格同序**
 * (那个脚本里的 `ORDER` 是两边编号的唯一出处),两页并排开着就能逐格对。
 *
 * **90 格里只有 1 格出不来**(第 85 格 · 设计系统工作区状态卡,卡在产品拍板)。
 * 早先注记里写的「没上页的五格 47 / 49 / 50 / 54 / 55」是**旧话**:那五格
 * (用户消息发送失败态、附件失败与 hover 预览)后来都补上了,现在都在页面上。
 *
 * 三条自律:
 *  1. 每一格的数据都走**真实链路**:执行记录家族过 `buildTurnBlocks`,产物卡过
 *     `deriveFileOps`,待发送附件过 `buildStagedAttachmentCards`;挂现成组件的那几格
 *     **照抄产品的调用点**(连产品漏传的 prop 也照抄,见第 34 格)。**不手捏组件 props** ——
 *     手捏就成了「我照着稿子摆一遍」,证明不了产线上真的长这样。
 *  2. 我们做不到的格子照样出格,写清楚**为什么做不到** —— 卡在行为、数据 / 契约、
 *     产品裁决,还是这一页本身够不着。不留空、也不拿近似糊过去。
 *  3. 待设计确认的地方逐格标出来,不混在已对齐的格子里。
 *  4. **不为了让某一格好看去改组件**:建页那一轮对 `src/` 只加了三个 `export`
 *     (`QueuedSendStrip` / `AssistantFooter` / `AssistantFeedback`),行为、样式、默认值一个没动。
 *     挂的过程中照出来的三条实现缺陷(第 34 / 39 / 72 格)当时只写进注记没有顺手改;
 *     **它们后来都由各自的 PR 修掉了**,注记已经跟着改口 —— 陈列页不许再报一个不存在的问题。
 *
 * 这个文件平时当测试跑(断言每一格真的渲染出了东西);要重新生成页面时给它一个落点:
 *   `OD_WRITE_MIRROR=<绝对路径>/mirror-exec.html pnpm --filter @open-design/web exec \
 *      vitest run -c vitest.config.ts tests/components/chat/mirror-gallery.test.tsx`
 *
 * 落点**由命令给,不写在这里**:合并闸的 web 车道会跑这个文件,而 `docs/` 属于
 * certain-exempt 面 —— 源码里出现那条路径,等于让一次纯文档改动去影响一条本该被跳过的车道
 * (`scripts/check-certain-exempt-consumption.ts`)。重建命令写在 chat-mirror 的 README 里。
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { I18nProvider, tForLanguageTag } from '../../../src/i18n';
import { Icon, type IconName } from '../../../src/components/Icon';
import type { VisualStyleContext } from '../../../src/runtime/visual-style-catalog';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import { QuestionFormView } from '../../../src/components/QuestionForm';
import { OdCardView } from '../../../src/components/OdCard';
import { QueuedSendStrip, UserMessageImpl } from '../../../src/components/ChatPane';
import { AssistantFeedback, AssistantFeedbackReasons, AssistantFooter, AssistantMessage, feedbackReasonOptions } from '../../../src/components/AssistantMessage';
import { FileOpsSummary } from '../../../src/components/FileOpsSummary';
import { UpgradeCard } from '../../../src/components/chat/UpgradeCard';
import { PlanPill } from '../../../src/components/chat/PlanPill';
import { UserStatusCard } from '../../../src/components/chat/UserStatusCard';
import { parseTodoWriteInput } from '../../../src/runtime/todos';
import { QuoteBarView } from '../../../src/components/chat/QuoteBar';
import { QuotedRefs } from '../../../src/components/chat/QuotedRefs';
import { Button } from '@open-design/components';
import { AudioArtifact } from '../../../src/components/chat/AudioArtifact';
import { RunErrorCard } from '../../../src/components/chat/RunErrorCard';
import { SupportDialog } from '../../../src/components/chat/SupportDialog';
import { DiscordIcon, FeishuIcon } from '../../../src/components/chat/support-brand-icons';
import { renderMarkdown } from '../../../src/runtime/markdown';
import { NextStepActions } from '../../../src/components/NextStepActions';
import { AmrGuidance } from '../../../src/components/AmrGuidance';
import { Reconnect } from '../../../src/components/chat/Reconnect';
import { PauseLine } from '../../../src/components/chat/PauseLine';
import { StagedAttachmentTray } from '../../../src/components/ChatComposer';
import { buildStagedAttachmentCards } from '../../../src/runtime/chat/staged-attachment';
import { deriveFileOps } from '../../../src/runtime/file-ops';
import type { QuestionForm } from '../../../src/artifacts/question-form';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ReactElement } from 'react';
import type { ExecutionShell as ShellData } from '../../../src/runtime/chat/contract';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../..');

/* ── 事件构造 ─────────────────────────────────────────────── */

function call(
  id: string, name: string, input: unknown,
  o: { content?: string; isError?: boolean; startedAt?: number; completedAt?: number } = {},
): PersistedAgentEvent[] {
  return [
    o.startedAt != null ? { kind: 'tool_use', id, name, input, startedAt: o.startedAt } : { kind: 'tool_use', id, name, input },
    { kind: 'tool_result', toolUseId: id, content: o.content ?? 'ok', isError: Boolean(o.isError),
      ...(o.completedAt != null ? { completedAt: o.completedAt } : {}) },
  ];
}
const todos = (id: string, items: Array<[string, string]>): PersistedAgentEvent[] => ([
  { kind: 'tool_use', id, name: 'TodoWrite', input: { todos: items.map(([content, status]) => ({ content, status })) } },
]);
/**
 * 收尾那一条清单快照。
 *
 * **不补它照出来的是另一条路径**:轮次终止时 `closeRunningSegments`
 * (`runtime/chat/build-turn-blocks.ts`)把还开着的步骤收成 `stopped`,不是 `completed`
 * ——「标成完成是替 agent 说了它没说过的话」。产品这条判断是对的、也是裁决过的,
 * 于是只发过一次 `in_progress` 快照的夹具照出来是「步骤记号未开始 + 壳头已完成」,
 * 而那几格自己写的状态是「跑完」。也就是说陈列页在给验收的人看一个**错的状态**:
 * 它照的是「agent 忘了收清单」这条边缘路径,不是这一格声称的那条。
 *
 * 所以跑完的那几格都补一条收尾快照 —— 这不是为了让格子好看,产线上正常收尾的
 * 一轮本来就会再发一次全 `completed` 的 TodoWrite(第 2 格、第 6 格就是这么来的)。
 */
const CLOSING = (id: string, ...done: string[]): PersistedAgentEvent[] =>
  todos(id, done.map((text) => [text, 'completed']));
const gen = (path: string) => JSON.stringify({ status: 'succeeded', path });
const genFail = () => JSON.stringify({ status: 'failed', error: { code: 'provider_missing' } });

/**
 * 组件 7 三态共用的一份数据。**内容照着稿子那一格来** —— 四个步骤、每种工具行各一条,
 * 这样并排比的时候差的是画法,不是夹具。
 */
const PLAN: PersistedAgentEvent[] = [
  { kind: 'thinking', text: '两张图是同一套栅格,先复刻列表页再拿它的商品卡去拼设置页,可以省一半工。' },
  ...todos('p1', [
    ['复刻商品列表页', 'in_progress'],
    ['抽出商品卡为共享组件', 'pending'],
    ['按同一套间距做设置页', 'pending'],
    ['接上两页之间的跳转', 'pending'],
  ]),
  ...call('r0', 'Read', { file_path: '首页.png' }, { startedAt: 0, completedAt: 18_200 }),
  ...todos('p2', [
    ['复刻商品列表页', 'completed'],
    ['抽出商品卡为共享组件', 'in_progress'],
    ['按同一套间距做设置页', 'pending'],
    ['接上两页之间的跳转', 'pending'],
  ]),
  ...call('r1', 'Read', { file_path: 'card.html' }, { startedAt: 18_200, completedAt: 24_600 }),
  ...todos('p3', [
    ['复刻商品列表页', 'completed'],
    ['抽出商品卡为共享组件', 'completed'],
    ['按同一套间距做设置页', 'in_progress'],
    ['接上两页之间的跳转', 'pending'],
  ]),
  ...call('s1', 'Grep', { pattern: '商品卡' }, { content: 'a.css:1\nb.css:2\nc.css:3\nd.css:4\ne.css:5\nf.css:6' }),
  ...call('r2', 'Read', { file_path: '设置页.png' }, { startedAt: 25_000, completedAt: 25_400 }),
  ...call('w1', 'Write', { file_path: 'settings.html', content: Array.from({ length: 140 }, () => 'x').join('\n') }),
  ...call('b1', 'Bash', { command: 'npm run build', description: '构建产物,看能不能跑通' },
    { content: '✓ built in 8.42s', startedAt: 26_000, completedAt: 34_400 }),
  ...call('g1', 'Bash', { command: 'od media generate a && od media generate b && od media generate c && od media generate d' },
    { content: [JSON.stringify({ status: 'succeeded', path: 'a.png' }), JSON.stringify({ status: 'succeeded', path: 'b.png' })].join('\n'), startedAt: 34_400 }),
];

const LINES = Array.from({ length: 182 }, () => 'x').join('\n');
const LINES96 = Array.from({ length: 96 }, () => 'x').join('\n');
const LINES64 = Array.from({ length: 64 }, () => 'x').join('\n');
const LINES58 = Array.from({ length: 58 }, () => 'x').join('\n');
const LINES6 = Array.from({ length: 6 }, () => 'x').join('\n');
const LINES2 = Array.from({ length: 2 }, () => 'x').join('\n');
const LINES4 = Array.from({ length: 4 }, () => 'x').join('\n');
const LINES140 = Array.from({ length: 140 }, () => 'x').join('\n');

/**
 * 组件 7 的**已完成**那一格(7-2),内容逐条照稿子:四条 todo、每条底下的工具行、
 * 文件名与改动量、以及每一步的耗时(总计 1m 12s)。
 *
 * 为什么不跟 `PLAN` 共用:那份是「进行中」那一格的场景,两边内容对不上时,
 * 逐元素比样式只能靠标签硬凑,报出来的是错位不是差异。
 *
 * 稿子里几段 `.think` 夹在抽屉**之间**(壳层);我们的过程叙述是往**进行中**那条 todo 里落的
 * (D43 / D36),所以这里只保留开头那一段 —— 它落在任何 todo 之前,两边位置一致。
 */
const PLAN_DONE: PersistedAgentEvent[] = [
  { kind: 'thinking', text: '两张图是同一套栅格,先复刻列表页,再拿它的商品卡去拼设置页。' },
  ...todos('d1', [
    ['复刻商品列表页', 'in_progress'],
    ['抽出商品卡为共享组件', 'pending'],
    ['按同一套间距做设置页', 'pending'],
    ['接上两页之间的跳转', 'pending'],
  ]),
  ...call('d-r0', 'Read', { file_path: '首页.png' }, { startedAt: 0, completedAt: 400 }),
  ...call('d-r1', 'Read', { file_path: 'tokens.css' }, { startedAt: 400, completedAt: 700 }),
  ...call('d-w0', 'Write', { file_path: 'product-list.html', content: LINES }),
  ...call('d-w1', 'Write', { file_path: 'product-list.css', content: LINES96 }),
  ...todos('d2', [
    ['复刻商品列表页', 'completed'],
    ['抽出商品卡为共享组件', 'in_progress'],
    ['按同一套间距做设置页', 'pending'],
    ['接上两页之间的跳转', 'pending'],
  ]),
  ...call('d-w2', 'Write', { file_path: 'product-card.html', content: LINES64 }),
  ...call('d-e0', 'Edit', { file_path: 'product-list.html', old_string: LINES58, new_string: LINES6 }),
  ...todos('d3', [
    ['复刻商品列表页', 'completed'],
    ['抽出商品卡为共享组件', 'completed'],
    ['按同一套间距做设置页', 'in_progress'],
    ['接上两页之间的跳转', 'pending'],
  ]),
  ...call('d-r2', 'Read', { file_path: '设置页.png' }, { startedAt: 25_000, completedAt: 25_400 }),
  ...call('d-w3', 'Write', { file_path: 'settings.html', content: LINES140 }),
  ...todos('d4', [
    ['复刻商品列表页', 'completed'],
    ['抽出商品卡为共享组件', 'completed'],
    ['按同一套间距做设置页', 'completed'],
    ['接上两页之间的跳转', 'in_progress'],
  ]),
  ...call('d-e1', 'Edit', { file_path: 'product-list.html', old_string: LINES2, new_string: LINES4 }),
  ...call('d-b0', 'Bash', { command: 'npm run build', description: '跑一遍,看两页能不能通' },
    { content: '✓ built in 2.14s (2 pages)', startedAt: 69_400, completedAt: 72_000 }),
];

interface Cell {
  gid: number;
  sub: string;
  cmp: string;
  state: string;
  /** 页面按家族分段;编号仍是整页的全局编号 */
  family?: string;
  /**
   * 执行记录家族走事件流(`events`);其余家族的实体本来就不是执行记录 ——
   * 组件 5 / 8 在产品里**已经有生产实现**,这里直接挂那两个组件,
   * 照出「现有实现 vs 稿子」的差距,而不是另写一套
   */
  node?: () => ReactElement;
  events?: PersistedAgentEvent[];
  run?: 'running' | 'succeeded' | 'failed' | 'canceled';
  /**
   * 稿子那一格**只画了整棵树里的一段**时,用这个选择器指出对应的那一段。
   *
   * 工具调用那几格(9 / 10 / 11 号组件)在稿子里是
   * `<div class="fold mod-flat"><div class="body mod-stack"><details class="fold" open>…`
   * —— 外层那个 `.fold.mod-flat` **没有 summary**,只是个样式上下文;真正画出来的是里面
   * 那个抽屉。我们这一格挂的是完整的执行记录壳(壳头 +「执行计划」卡 + 抽屉),
   * 逐元素比对时两边从第一个元素就错开一位,后面每一条都会被报成差异。
   * 页面上照旧展示整张壳(设计要看的是真东西),只有**比对**落在这一段上。
   */
  crop?: string;
  /** 与设计稿的差异 / 待确认项;每条都要说清楚是「等设计答复」还是「数据侧做不到」 */
  notes?: string[];
  /** 我们目前根本出不来这一态 */
  missing?: string;
  /**
   * 陈列页把这一格**替设计师点开**。这不是改组件行为:跑完默认收起是 D18 定的,
   * 而设计稿的实体本身就是「点开之后」的样子(7-2 的状态名写着「点开只摊一级」)。
   * 收着比是比不出东西的,所以这里按稿子里那一格的展开程度摊开。
   *   shell 只摊壳;deep 壳 + 第一层抽屉
   */
  expand?: 'shell' | 'deep';
  /**
   * 陈列页把这一格**替设计师按住**。同 `expand` 一个道理:稿子里的 hover 格画的
   * 就是「鼠标停在上面」的样子,静态页里没有鼠标,收着比不出东西。
   * 落成 `data-hover`,页面样式把 `:hover` 那两条规则原样重放一遍(见 PAGE_CSS)。
   */
  hover?: boolean;
  /**
   * 附件行的左右翻页箭头出不出,是**量出来的**(`attachment-nav.ts` 量滚动位置)。
   * 静态陈列页没有布局回合、也没有滚动,量出来永远是「两边都到头」,于是两颗都藏着;
   * 而稿子那几格画的是「装不下、能往右翻」的样子。
   * 这个开关让陈列页替它把对应那颗打开 —— 和 `data-hover` / `data-expand` 一个性质:
   * 陈列页替设计师摆出那个状态,组件一个字没改。
   */
  scroll?: 'prev' | 'next' | 'both';
}

const NO_LAYOUT = (what: string) =>
  `**静态页里看不到${what}** —— 这一步要量像素,而 SSR 出来的标记没有布局,组件里的量法一次都没跑。`
  + '要看它得起真实页面(`pnpm tools-dev run web`)。**没有**为了让它在这一页出现去改组件。';

const EXECUTION: Cell[] = [
  {
    gid: 1, sub: '7-1', cmp: '任务进度', state: '进行中 · 秒数在走,跑完的收着、正在跑的开着',
    events: PLAN, run: 'running',
    notes: ['壳头的球与扫光都在动;秒数取 `nowMs`,静态页里定在一个时刻'],
  },
  {
    gid: 2, sub: '7-2', cmp: '任务进度', state: '已完成 · 点开只摊一级,二三级还收着',
    expand: 'shell',
    events: [...PLAN_DONE, ...todos('d9', [
      ['复刻商品列表页', 'completed'], ['抽出商品卡为共享组件', 'completed'],
      ['按同一套间距做设置页', 'completed'], ['接上两页之间的跳转', 'completed'],
    ])],
    run: 'succeeded',
  },
  {
    gid: 3, sub: '7-3', cmp: '任务进度', state: '运行失败 · 默认收起,原因和动作由 19 · 报错给',
    /*
     * 内容逐条照稿子第 7-3 格:一条 todo「按现有结构重做这一屏」,底下三次读取
     * (最后一次失败)+ 一次构建失败,壳头总耗时 4.0s = 0.4 + 0.3 + 1.2 + 2.1。
     * 原来这一格和 7-1 / 7-2 共用 `PLAN`(四条 todo 的另一个场景),
     * 逐元素比样式时两边内容对不上,配对只能靠标签硬凑,报出来的是错位不是差异。
     */
    events: [
      ...todos('p1', [['按现有结构重做这一屏', 'in_progress']]),
      ...call('r0', 'Read', { file_path: '首页.png' }, { startedAt: 0, completedAt: 400 }),
      ...call('r1', 'Read', { file_path: 'tokens.css' }, { startedAt: 400, completedAt: 700 }),
      ...call('r2', 'Read', { file_path: '规范.pdf' },
        { content: '✗ 打不开:文件已损坏', isError: true, startedAt: 700, completedAt: 1900 }),
      ...call('b1', 'Bash', { command: 'npm run build', description: '构建产物,看能不能跑通' },
        { content: '✗ Could not resolve "./ProductCard" from src/pages/List.tsx', isError: true, startedAt: 1900, completedAt: 4000 }),
    ],
    run: 'failed',
    notes: [
      '壳头只换状态词;原因与「联系支持」属于组件 19,不在本家族',
      '内容逐条照稿子第 7-3 格 —— 原来和 7-1 / 7-2 共用另一个场景,两边内容对不上,配对只能硬凑',
    ],
  },
  {
    gid: 4, sub: '9-1', cmp: '工具调用-读', state: '成功 / 失败 —— 没有「执行中」,跑完才落下这一行',
    crop: 'details details:last-of-type',
    expand: 'deep',
    events: [
      ...todos('p1', [['复刻商品列表页', 'in_progress']]),
      ...call('a', 'Read', { file_path: '首页.png' }, { startedAt: 0, completedAt: 400 }),
      ...call('b', 'Read', { file_path: 'tokens.css' }, { startedAt: 400, completedAt: 700 }),
      ...call('c', 'Read', { file_path: '设置页-会员中心-商品卡对齐稿-第三轮评审-final-v3-20260821.png' }, { startedAt: 700, completedAt: 1300 }),
      ...call('d', 'Read', { file_path: '规范.pdf' }, { isError: true, content: 'unsupported', startedAt: 1300, completedAt: 2500 }),
      ...CLOSING('p2', '复刻商品列表页'),
    ],
    run: 'succeeded',
    notes: [
      'S1 未答:失败行「只给失败按钮」与「把原因跟在名字后面」是否有意区分',
      '稿子这一格只截了步骤抽屉;我们的清单一到就会先落一行「执行计划 · N 步」(D13),不是差异',
      '稿子这一格的行首还是圆点(`.ti` 是空的),而稿子**别处**同名的行已经换成图标(8/21 版);我们跟的是新的那一版,请确认',
    ],
  },
  {
    gid: 5, sub: '10-1', cmp: '工具调用-写', state: '成功 / 失败 —— 改动量跟在文件名后面',
    crop: 'details details:last-of-type',
    expand: 'deep',
    events: [
      ...todos('p1', [['按同一套间距做设置页', 'in_progress']]),
      ...call('a', 'Write', { file_path: 'settings.html', content: Array.from({ length: 140 }, () => 'x').join('\n') }),
      ...call('b', 'Edit', { file_path: 'product-list.html', old_string: Array.from({ length: 58 }, () => 'o').join('\n'), new_string: Array.from({ length: 6 }, () => 'n').join('\n') }),
      ...call('c', 'Write', { file_path: 'dist/bundle.js', content: 'x' }, { isError: true, content: 'EACCES: 目录只读', startedAt: 0, completedAt: 200 }),
      ...CLOSING('p2', '按同一套间距做设置页'),
    ],
    run: 'succeeded',
    notes: ['写文件不挂耗时、挂改动量;数不出改动量时才回落成耗时', '稿子这一格的行首还是圆点(`.ti` 是空的),而稿子**别处**同名的行已经换成图标(8/21 版);我们跟的是新的那一版,请确认'],
  },
  {
    gid: 6, sub: '11-1', cmp: '工具调用-代码执行', state: '执行中 · 终端实时追加,限高滚动自动贴底',
    crop: 'details details:last-of-type',
    expand: 'deep',
    events: [
      /*
       * 这一条**必须是 `in_progress`**,收尾另发一条 `completed`。
       * 原来一上来就标 `completed`,于是终端块落到了**壳层**(D36 的 sink 规则:
       * 内容只往还开着的那条 todo 里落),走的是顶层那一列 —— 顶层缩进是 7px
       * (2026-09-02 裁决:「todo 外的 toolrow 不要有任何缩进」),而稿子这一格量的是
       * **步骤里面**那一套列的 29px。两个数都对,只是这一格摆错了位置。
       */
      ...todos('t1', [['接上两页之间的跳转', 'in_progress']]),
      ...call('c1', 'Bash', { command: 'npm run build', description: '构建产物,看能不能跑通' },
        { content: 'vite v5.4.2 building for production...\ntransforming (142) src/components/ProductCard.tsx\nrendering chunks...',
          startedAt: 0, completedAt: 4100 }),
      ...CLOSING('t2', '接上两页之间的跳转'),
    ],
    run: 'succeeded',
    notes: [
      '**终端块本身摆得出来**,所以这一格不再空着 —— 能比的是:命令行那一条、输出区的字体 / 字色 / 行高 / 限高、以及整块的圆角与底色',
      '⚠️ 与稿子差两处,都在**「执行中」这个状态**上,不在画法上:稿子行首是转着的球、耗时那一格是空的;我们按 D3「调用跑完才落行」,所以这里是已完成的样子',
      '⚠️ **「实时追加」没有数据来源**:`tool_result` 是终端内容的唯一载体,命令跑完才一次性到达。要做需要 daemon 新增一条工具进度事件 —— 待产品/设计裁决',
    ],
  },
  {
    gid: 7, sub: '11-2', cmp: '工具调用-代码执行', state: '成功 · 默认收起 —— 标题那一行已经说了跑没跑通',
    crop: 'details details:last-of-type',
    expand: 'deep',
    events: [
      ...todos('p1', [['接上两页之间的跳转', 'in_progress']]),
      ...call('x', 'Bash', { command: 'npm run build', description: '构建产物,看能不能跑通' },
        { content: '✓ built in 8.42s · dist/ 已更新', startedAt: 0, completedAt: 8420 }),
      ...CLOSING('p2', '接上两页之间的跳转'),
    ],
    run: 'succeeded',
    notes: ['输出行的绿 / 红按行首 `✓` `✗` 判;设计稿只给了成品截图,没给判定规则 —— 待确认'],
  },
  {
    gid: 8, sub: '11-3', cmp: '工具调用-代码执行', state: '失败 · 默认展开 —— 报错原文是这时候唯一要读的东西',
    crop: 'details details:last-of-type',
    expand: 'deep',
    events: [
      ...todos('p1', [['接上两页之间的跳转', 'in_progress']]),
      ...call('x', 'Bash', { command: 'npm run build', description: '构建产物,看能不能跑通' },
        { content: '✗ Could not resolve "./ProductCard" from src/pages/List.tsx', isError: true, startedAt: 0, completedAt: 2100 }),
      // 稿子这一格的步骤记号是 `mk is-ok`(绿勾)—— 命令挂了,但那一步 agent 自己收了。
      // 同 `CLOSING` 上面那段:不补收尾快照,轮次终止会把它收成 `stopped`,照出来是「未开始」。
      ...CLOSING('p2', '接上两页之间的跳转'),
    ],
    run: 'failed',
  },
  {
    gid: 9, sub: '12-1', cmp: '工具调用-生图', state: '执行中 · 出一张落一张,计数在走',
    crop: 'details details:last-of-type',
    expand: 'deep',
    events: [
      /*
       * 稿子这一格的抽屉头画的是**已完成**(绿勾 + 9.6s),里面那一行生图却还在跑。
       * 这个状态在我们的数据模型里出不来:内容是往**进行中**那条 todo 里落的
       * (D36 的 sink 规则),把它标成 completed,这一行生图就落到壳层去了,抽屉当场空掉
       * —— 试过一次,crop 出来只剩 5 个元素,是个假的零差异。
       * 所以这里维持 in_progress,行首是转着的球;剩下的两条差异记在这一格的 notes 上。
       */
      ...todos('p1', [['按同一套间距做设置页', 'in_progress']]),
      ...call('g1', 'Bash', { command: 'od media generate a' }, { content: gen('a.png'), startedAt: 0, completedAt: 1200 }),
      ...call('g2', 'Bash', { command: 'od media generate b' }, { content: gen('b.png'), startedAt: 1200, completedAt: 2400 }),
      { kind: 'tool_use', id: 'g3', name: 'Bash', input: { command: 'od media generate c && od media generate d' }, startedAt: 2400 },
    ],
    run: 'running',
    notes: [
      '⚠️ **抽屉头的状态与稿子对不上,而且改不了**:稿子画的是「已完成(绿勾 + 9.6s)的 todo 里装着一行还在跑的生图」。我们的内容是往**进行中**那条 todo 里落的(D36),标成已完成这一行就落到壳层、抽屉空掉。逐格量到的两条差异(行首那枚标记的 `align-items`)全部出自这里 —— 是稿子那张静态图内部不自洽,不是实现走样',
      '未出的格子已经接上稿子那套**像素液体**(`pixel-liquid.js` 21:02 版 → `PixelLiquid` / `runtime/pixel-liquid.ts`,color_frag 一字未改,速度场用 curl noise 顶替上游的 GPU 解算)。⚠️ **这一页照不出它**:陈列页走 `renderToStaticMarkup`,只出 DOM 不跑 effect,`<canvas>` 在这里永远是空白的 —— 格子里看到的是它底下 `--chat-bg-subtle` 那层底色,不是动效坏了。要看真东西请起本地 runtime',
      'S19 未答:这里按「连续调用合并成一行」算,隔着别的工具调用就另起一行',
    ],
  },
  {
    gid: 10, sub: '12-2', cmp: '工具调用-生图', state: '成功 · 收成一行 + 缩略图条',
    crop: 'details details:last-of-type',
    expand: 'deep',
    events: [
      ...todos('p1', [['按同一套间距做设置页', 'in_progress']]),
      ...call('g1', 'Bash', { command: 'od media generate a && od media generate b && od media generate c && od media generate d' },
        { content: [gen('a.png'), gen('b.png'), gen('c.png'), gen('d.png')].join('\n'), startedAt: 0, completedAt: 2600 }),
      ...CLOSING('p2', '按同一套间距做设置页'),
    ],
    run: 'succeeded',
    notes: ['缩略图现在是占位灰块 —— 接真实图要项目上下文里的文件 URL,尚未接线', '稿子这一格的行首还是圆点(`.ti` 是空的),而稿子**别处**同名的行已经换成图标(8/21 版);我们跟的是新的那一版,请确认'],
  },
  {
    gid: 11, sub: '12-3', cmp: '工具调用-生图', state: '部分失败 · 失败格留空,单独重试',
    crop: 'details details:last-of-type',
    expand: 'deep',
    events: [
      ...todos('p1', [['按同一套间距做设置页', 'in_progress']]),
      ...call('g1', 'Bash', { command: 'od media generate a && od media generate b && od media generate c && od media generate d' },
        { content: [gen('a.png'), genFail(), gen('b.png'), gen('c.png')].join('\n'), startedAt: 0, completedAt: 3100 }),
      ...CLOSING('p2', '按同一套间距做设置页'),
    ],
    run: 'succeeded',
    notes: [
      '设计稿里失败格在第二个;我们只拿得到「成了几张、砸了几张」,顺序信息事件流里没有,所以成的排前、砸的排后',
      '失败格有**两态**(产品 2026-09-02):轮次还在跑时是「⊗ 失败」,一条状态说明、点不动;轮次一停才换成「↻ 重试」的真按钮。陈列页不接回调,所以这里看到的永远是前一态',
    ],
  },
];

/**
 * CSS Module 的类名在构建里是带哈希的(`_fold_09d9ab`),而陈列页内联的是**源文件**,
 * 里面写的是 `.fold`。所以把哈希摘掉,让页面里的类名与源码里的选择器对上。
 * 顺带一个好处:设计师看到的是 `class="fold flat"`,能直接和稿子里的 `fold mod-flat` 对照。
 *
 * 注:下面几处匹配写成 `class="fold flat[ "]` 而不是精确闭合的 `class="fold flat"` ——
 * 带清单的壳会再追一个 `hasTodo` 标记类(见 `record.module.css` 的 `:not(.hasTodo)`,
 * 它决定夹心正文对不对齐那条竖线)。这几条断言问的是「有几张平铺壳」,
 * 不是「class 属性一字不差等于什么」,所以认到词边界为止。
 */
const dehash = (html: string): string => html.replace(/\b_([A-Za-z0-9]+)_[a-z0-9]{5,8}\b/g, '$1');

/* ── 理解段(组件 3 / 4 / 5 / 8,第 12–27 格)────────────────────────────
 * 这一族和执行记录**性质不同**:组件 5(意图澄清)与组件 8(记忆卡)在产品里
 * 已经有生产实现,所以这里挂的是**那两个现成组件**,照出「现有实现 vs 稿子」的差距;
 * 组件 3 的思考已被 D29 收进执行记录壳,组件 4 是消息层的正文渲染。
 * 结论是:这一族要做的是**对齐已有实现**,不是再造四个组件。
 */

/*
 * 文案与**选项条数**逐字取自交付稿的意图澄清五格。
 *
 * 条数不是小事:陈列页要和稿子逐元素比样式,少一条 / 多一条,LCS 从那里开始整体串位,
 * 后面每一项都会被报成差异,真差异淹在里面看不见。稿子每一张卡的最后一项都是「自己填」,
 * 所以这两份夹具都带 `allowCustom`。
 */
const ASK: QuestionForm = {
  id: 'q1',
  title: '还需要确认一件事',
  questions: [{
    id: 'scope',
    label: '设置页要不要沿用列表页的商品卡组件?',
    type: 'radio',
    allowCustom: true,
    options: [
      { label: '沿用列表页那张商品卡,抽成两页共享的组件', value: 'share' },
      { label: '设置页单独写一套,不跟列表页绑', value: 'own' },
    ],
  }],
};
const ASK_MULTI: QuestionForm = {
  id: 'q2',
  title: '这几页都要跟着改吗',
  questions: [{
    id: 'extras',
    label: '除了设置页,还有哪几页要一起换成新的商品卡?',
    type: 'checkbox',
    allowCustom: true,
    options: [
      { label: '商品详情页', value: 'detail' },
      { label: '搜索结果页 —— 里面那张卡是列表页的窄版', value: 'search' },
      { label: '结算页的商品缩略图', value: 'checkout' },
    ],
  }],
};
const ASK_CUSTOM: QuestionForm = {
  id: 'q3',
  title: '先对一下方向',
  questions: [{ ...(ASK.questions[0] as QuestionForm['questions'][number]), allowCustom: true }],
};
const ASK_MULTI_CUSTOM: QuestionForm = {
  id: 'q4',
  title: '还有哪些要一起改',
  questions: [{ ...(ASK_MULTI.questions[0] as QuestionForm['questions'][number]), allowCustom: true }],
};
/*
 * 稿子第 21 / 22 格是**四张**卡,文案逐字取自交付稿(`.vopt > .vmeta > .vt`)。
 * `allowCustom: false`:稿子这两格的底栏是「换一批 / 随机 / 下一步」,没有「自己填」。
 */
const ASK_CARDS: QuestionForm = {
  id: 'q5',
  title: '先定个视觉方向',
  questions: [{
    /*
     * 走**内置风格目录**那一路(`id: 'tone'` + `visualStyleContext`),不是模型现给的几张卡。
     *
     * 原来这里写的是 `type: 'direction-cards'` 配四张手捏的卡。那是照错了组件:
     * 固定四张天生没有「下一批」,底栏于是只剩「随机」,左下落回通用的「跳过 · 你来判断」——
     * 和稿子的「换一批 | 随机 | 下一步」对不上。产品里「先定个视觉方向」走的是目录
     * (prototype 档 26 张、一页 4 张),「换一批」和「+22」本来就都有。
     */
    id: 'tone',
    label: '这套电商 App 原型走哪种感觉?四张预览用的是同一份示例内容,比的是风格。',
    type: 'radio',
    allowCustom: false,
    options: [{ label: '', value: '' }],
  }],
};

const askCell = (
  gid: number, sub: string, state: string, form: QuestionForm,
  opts: {
    draft?: Record<string, string | string[]>;
    answered?: Record<string, string | string[]>;
    notes?: string[];
    /** 给了就走「内置风格目录」那一路(稿子第 21 / 22 格),而不是模型现给的固定几张卡 */
    visualStyleContext?: VisualStyleContext;
  } = {},
): Cell => ({
  gid, sub, cmp: '意图澄清', state, family: '理解段',
  node: () => (
    <QuestionFormView
      form={form}
      interactive={!opts.answered}
      {...(opts.visualStyleContext ? { visualStyleContext: opts.visualStyleContext } : {})}
      // 必须给 onSubmit:组件的锁判据是 `!interactive || !onSubmit || submittedAnswers`,
      // 不给就整张锁成「已回答」,陈列页照出来的就是假的
      {...(opts.answered ? { submittedAnswers: opts.answered } : { onSubmit: () => undefined })}
      {...(opts.draft ? { draftAnswers: opts.draft } : {})}
    />
  ),
  ...(opts.notes ? { notes: opts.notes } : {}),
});

const UNDERSTANDING: Cell[] = [
  {
    gid: 12, sub: '3-1', cmp: 'Thinking', state: '进行中 · 推理在底下自己往上走,不想看点一下收走',
    family: '理解段',
    events: [
      // 真实里推理是一路拼起来的 delta,段落边界就在文本里的空行上
      { kind: 'thinking', text: '两张图的栅格看着是同一套 —— 先量一下列宽和沟槽,对得上就只复刻一次列表页,商品卡抽出来给设置页共用;对不上再分开做。' },
      { kind: 'thinking', text: '\n\n规格那份 md 里写了断点,得先读完再定。要是断点和图里的列数对不上,以 md 为准 —— 图是某一个宽度下的截屏,md 才是规则。' },
      { kind: 'thinking', text: '\n\n商品卡里有价格行。价格是数字,得走等宽,不然一列价格对不齐;但商品名是中文,跟着正文字体走。' },
    ],
    run: 'running',
    notes: [
      '**滚动形态已按 D46 做了**(用户 2026-08-25 拍板「做」):限高 96px、上下渐隐、每 2s 挪一行、到底回到顶重来 —— 常量与稿子的 `stream()` 一致',
      '落点仍在执行记录壳内(D29 不变);稿子那一格是独立的思考块,收在壳里是我们这边的形态',
      '静态截图看不出「在动」:图上能核的是限高和上下渐隐',
    ],
  },
  {
    gid: 13, sub: '3-2', cmp: 'Thinking', state: '内容开始落地 · 这一行让位给开场白,不再占地方',
    family: '理解段',
    events: [
      { kind: 'thinking', text: '先量一下列宽和沟槽。' },
      { kind: 'text', text: '好,先把列表页搭起来,再拿同一张商品卡去做设置页。' },
    ],
    run: 'running',
    notes: ['「让位」在我们这里是自动的:壳头一有正文就从「思考中」回到「进行中」(W11)'],
  },
  {
    gid: 14, sub: '3-3', cmp: 'Thinking', state: '跑完 · 收进 7 · 任务进度里,是几段纯文字,不再自带折叠',
    family: '理解段', expand: 'shell',
    events: [
      { kind: 'thinking', text: '两张图的栅格看着是同一套,先量列宽。' },
      ...call('r1', 'Read', { file_path: 'tokens.css' }, { startedAt: 0, completedAt: 300 }),
    ],
    run: 'succeeded',
    notes: ['这一格与稿子一致:收进壳里就是几段纯文字,不自带折叠'],
  },
  {
    gid: 15, sub: '4-1', cmp: '开始执行文案', state: '唯一状态',
    family: '理解段',
    // 原来这一格写着「出不来」。其实**画它的东西现在就有**:壳外的结论走 `.prose-block`,
    // markdown 渲染器是 `runtime/markdown` 的 `renderMarkdown`,直接喂一句话就出来。
    // 出不来的只是**逐字化开那个动画**(W9 / W13),静态页本来也照不出动画。
    node: () => (
      <div className="prose-block">
        {renderMarkdown('明白了,我先把商品列表页复刻成能点的原型,再按同一套间距和圆角做设置页。整个过程你可以随时打断。')}
      </div>
    ),
    notes: [
      '文案与稿子同一句;这一格能比的是**字号 / 行高 / 字色 / 段落间距**',
      NO_LAYOUT('逐字化开(单字 0.4s、字间错开 0.01s)') + '静态页照不出动画,要看得起真实页面',
    ],
  },
  /*
   * `sub` 是**指向稿子哪一态**的指针,不是这一页自己的序号。
   * 当前基线的交付稿(`729fa43ce7`,由 `build-matrix.mjs` 的 `DRAFT_COMMIT` 钉住)
   * 给组件 5 插了三个新态(5-2 下拉单选、5-7 颜色、5-8 滑杆),
   * 后面的状态号整体后移;这里的 `sub` 已经跟着改到新号 —— 早先写的 5-2…5-10
   * 会把看页的人指到稿子另一格上去。新增那三态在第 86 / 87 / 88 格。
   */
  askCell(16, '5-1', '单选 · 待选,一个都没选 ——「下一步」置灰', ASK, {
    notes: ['这一族挂的是**产品里已有的** `QuestionFormView`(1737 行)+ 解析器(832 行),不是新写的组件'],
  }),
  askCell(17, '5-3', '单选 · 选中一项,「下一步」才亮起 —— 点错了还能换', ASK, { draft: { scope: 'own' } }),
  askCell(18, '5-4', '多选 · 方钮,选完点「下一步」统一提交', ASK_MULTI, { draft: { extras: ['detail', 'search'] } }),
  // 「自己填」的展开靠组件内部状态(点一下才开),静态陈列页点不了 ——
  // 用一个空白自定义值把它撑开:值非空所以展开,又看不出字,和稿子那格(空框 + 占位符)对得上。
  askCell(19, '5-5', '选中「自己填」· 原地长出输入框,没写字前「下一步」仍置灰', ASK_CUSTOM, { draft: { scope: ' ' } }),
  askCell(20, '5-6', '多选勾上「自己填」· 是在已勾项之外再加一条', ASK_MULTI_CUSTOM, {
    draft: { extras: ['detail', 'search', '还有会员中心里那两张小卡,也是同一张商品卡缩小的'] },
  }),
  askCell(21, '5-9', '视觉方向 · 看图选择(风格类问题不能用文字选项),没选时「下一步」置灰', ASK_CARDS,
    { visualStyleContext: 'prototype' }),
  askCell(22, '5-10', '选中一张 · 图上落绿勾,「下一步」才亮起', ASK_CARDS,
    { visualStyleContext: 'prototype', draft: { tone: 'prototype-content-led-product' } }),
  askCell(23, '5-11', '已回答 · 点「下一步」后收成陈述', ASK, { answered: { scope: 'share' } }),
  askCell(24, '5-12', '已回答 · 多选,勾了几条就列几条', ASK_MULTI, { answered: { extras: ['detail', 'search'] } }),
  askCell(25, '5-13', '已回答 · 视觉方向,带上你选的那张图', ASK_CARDS,
    { visualStyleContext: 'prototype', answered: { tone: 'prototype-content-led-product' } }),
  {
    gid: 26, sub: '8-1', cmp: '记忆组件', state: '收起', family: '理解段',
    node: () => (
      <OdCardView card={{
        kind: 'memory-applied',
        summary: '已记住 3 条偏好',
        used: [
          { type: 'project', name: '商品卡做成共享组件' },
          { type: 'feedback', name: '圆角统一 12px' },
          { type: 'user', name: '不要暖色背景' },
        ],
      }} />
    ),
    notes: ['已按 D47 改成可折叠:收起只留一句,条目移进展开区(用户 2026-08-25 拍板)'],
  },
  {
    gid: 27, sub: '8-2', cmp: '记忆组件', state: '展开 · 查看被记忆的内容', family: '理解段',
    expand: 'shell',
    node: () => (
      <OdCardView card={{
        kind: 'memory-applied',
        summary: '已记住 3 条偏好',
        used: [
          { type: 'project', name: '商品卡做成可复用的共享组件' },
          { type: 'feedback', name: '卡片圆角统一 12px' },
          { type: 'user', name: '不要暖色背景' },
        ],
      }} />
    ),
    notes: [
      '展开的就是原来铺在行内的那三条,没有新数据(D47)',
      '**与稿子的一处不同**:我们保留了类型色点(项目 / 反馈 / 用户),稿子是纯「· 文字」—— 色点是产品已有的信息,稿子没建模,请确认去留',
    ],
  },
];


/* ── 产出收尾(组件 13 / 14 / 15 / 16 / 24,第 28–44 格)──────────────────
 * 这一族在产品里**全部有生产实现**(音频那两格除外),所以挂的都是现成组件:
 *  · 13 总结文案 → `runtime/markdown.tsx` 的 `renderMarkdown`(`ProseBlocks` 未导出,
 *    但它内部调的就是这个纯函数,壳只是一层 `.prose-block`)
 *  · 14 产物卡 → `FileOpsSummary`(走 `deriveFileOps` 真实事件流 → `ArtifactCards`)
 *  · 15 回合状态行 → `AssistantFooter` / `AssistantFeedback`
 *  · 16 下一步引导 → `NextStepActions`
 *  · 24 音频产物 → 没有实现,逐格写在 `missing` 里 */

/** 稿子第 34 / 39 格上写着 `14:32`;同第 45 格,按本地时间构造避免时区漂。 */
const REPLY_AT = new Date(2026, 7, 20, 14, 32).getTime();

const SUMMARY_SHORT = '商品列表页和设置页都做完了,商品卡已经抽成共享组件';
const SUMMARY_FULL = '商品列表页和设置页都做完了,商品卡已经抽成共享组件,'
  + '两页共用同一套间距与 **12px** 圆角。右边可以直接点着走。';

/** 正文块的壳:产品里这一层是 `ProseBlocks` 的根节点(`AssistantMessage.tsx`)。
 *  `streaming` 这个入参留着是因为下面的格子按它分「生成中 / 已完成」两态,
 *  但**它不再改变标记** —— 流式光标 2026-08-27 整个删掉了,见下面那一格的注记。 */
const prose = (text: string, _streaming = false) => (
  <div className="prose-block">
    {renderMarkdown(text)}
  </div>
);

/** 产物卡走**真实事件流**:`Write` 事件 → `deriveFileOps` → `FileOpsSummary` 自己判
 *  哪些进卡、哪些留文本行(`artifactCardKind`),不手捏 `ArtifactCardItem`。
 *  生图 / 生视频在产线上是 `od media generate`(Bash),`deriveFileOps` 不认;
 *  它们靠 `AssistantMessage` 的 `summaryArtifactOpsForProducedFiles` 合成
 *  `ops: ['write']` 的同一种条目再喂进来,所以这里用 `Write` 是同一条路。 */
const arts = (paths: string[], opts: { publish?: boolean } = {}) => {
  const events = paths.flatMap((p, i) => call(`w${i}`, 'Write', { file_path: p, content: 'x' }));
  return (
    <FileOpsSummary
      entries={deriveFileOps(events as never)}
      projectId="p1"
      onRequestOpenFile={() => {}}
      onExport={() => {}}
      {...(opts.publish === false ? {} : { onPublish: () => {} })}
    />
  );
};

/**
 * 逐字照抄 `AssistantMessageImpl` 给 `AssistantFeedback` 的那份 `footerProps`
 * (`AssistantMessage.tsx` 的 `showFeedback` 分支)。
 * `createdAt` **不放在默认值里**:产线上两条分支都传了 `message.createdAt`,
 * 但它是逐格的数据(哪一格摆几点),所以由用得着的那几格自己给。
 */
type FooterProps = Parameters<typeof AssistantFooter>[0];
const footer = (over: Partial<FooterProps> = {}): FooterProps => ({
  streaming: false,
  hasUnfinishedTodos: false,
  hasEmptyResponse: false,
  copyMarkdown: SUMMARY_SHORT,
  onFork: () => undefined,
  forceVisible: true,
  isLast: true,
  ...over,
});

/**
 * 助手消息那一层壳。**这不是为了让格子好看套的壳,是产线上本来就有的那一层**:
 * `AssistantMessage.tsx:1387` 渲染的正是 `<div class="msg assistant">`,回合状态行
 * (footer / feedback / 反馈面板)全都长在它里面。
 *
 * 缺了它,量出来的是**假差异**:那枚附属信息的静音色是声明在 `.msg` 上的
 * 自定义属性(`chat.css` 的 `.msg, .fork-note { --chat-message-muted-ink: #a3a3a3 }`),
 * 裸挂的时候这枚 token 解不出来、退到兜底的 `--text-soft`(#848484)——
 * 于是第 34–37 / 39 / 40 这几格的每一枚图标都要记一条「色差一档」,
 * 而产品里从来就是对的。自定义属性解析失败**不报错**,所以它一直无声无息。
 */
const assistantMsg = (children: ReactElement) => (
  <div className="msg assistant">{children}</div>
);

/** 赞 / 踩两枚是 `AssistantFeedback` 注入 `AssistantFooter` 的,单挂 footer 出不来 ——
 *  所以第 34 / 36 / 37 / 39 格挂的是外面那一层。`useAnalytics()` 在 provider 之外
 *  返回空实现,单挂是安全的(组件注释里写着)。 */
const fbRowInner = (rating: 'positive' | 'negative' | null, over: Partial<FooterProps> = {}) => (
  <AssistantFeedback
    feedback={rating ? { rating, createdAt: REPLY_AT } : undefined}
    onFeedback={() => undefined}
    hasDesignSystemContext={false}
    footerProps={footer(over)}
    projectId="p1"
    projectKind={null}
    conversationId="c1"
    runId="r1"
    assistantMessageId="m1"
    modelId="claude-sonnet"
    agentProviderId="claude_code"
    producedFileCount={2}
  />
);
const fbRow = (rating: 'positive' | 'negative' | null, over: Partial<FooterProps> = {}) =>
  assistantMsg(fbRowInner(rating, over));

/**
 * 被中断的那一轮(第 #39 格)。**不走 `fbRow`** —— 产线上 `isFeedbackEligible`
 * 对 `canceled` 判 false,渲染的是没有赞踩的那条分支,连 `.assistant-feedback-wrap`
 * 那层壳都没有。挂 `AssistantFeedback` 会照出一个用户根本看不到的样子。
 */
const stoppedRow = () => assistantMsg(
  <AssistantFooter
    {...footer({
      canceled: true,
      copyMarkdown: SUMMARY_SHORT,
      createdAt: Date.UTC(2026, 0, 1, 6, 32),
    })}
  />,
);

/** 笼子类名:见 `scope()`。挂在组件外面一层空 div 上,只为把那份 module 的样式圈住。 */
const CAGE_NEXT_STEP = 'cage-next-step';
const CAGE_ACTION_CARD = 'cage-action-card';
const CAGE_UPGRADE = 'cage-upgrade';
const CAGE_QUOTE = 'cage-quote';
const CAGE_ERR = 'cage-err';
const CAGE_AUDIO = 'cage-audio';
const CAGE_EDGE = 'cage-edge';
const CAGE_PLAN = 'cage-plan';
/** 设计系统状态卡的 module 类名是 `.card` / `.icon` / `.copy`,大路名字,同样关笼子 */
const CAGE_STATUS = 'cage-status';

/** 音频产物(组件 24)。静态页里放不出声,`previewCurrentSec` 直接摆出那一刻的样子 */
/*
 * 采样逐字取自稿子那 **28** 根竖条的 `--h`(`<i style="--h:18;--i:0">` … `--i:27`)——
 * 夹具一变,比出来的就是「数据不一样」不是「画得不一样」。
 *
 * 原来这里把这 28 个值**抄了两遍凑成 56**,`bars` 又跟着写 `WAVE.length`,
 * 于是我们画 56 根、稿子画 28 根:每一格白白多出 28 个 onlyOurs 元素,
 * 每根竖条的宽度和 x 坐标也全部对不上 —— 43 / 44 两格的读数因此一直是假的。
 */
const WAVE = [18, 31, 24, 39, 30, 43, 27, 18, 9, 29, 38, 24, 34, 18, 26, 37, 21, 14, 7, 11, 22, 35, 18, 26, 41, 29, 17, 33];
const audio = (currentSec: number, playing: boolean) => (
  <div className={CAGE_AUDIO} style={{ width: 406, maxWidth: '100%' }}>
    <AudioArtifact
      src="#"
      name="配音-第一版.mp3"
      durationSec={48}
      samples={WAVE}
      bars={WAVE.length}
      previewCurrentSec={currentSec}
      previewPlaying={playing}
    />
  </div>
);
const CAGE_SUPPORT = 'cage-support';

/**
 * 报错卡(组件 19):白卡、红只留在标题那一行、动作靠右。
 * 稿子每颗动作**都带图标**(耳机 / 上传 / 循环箭头),不是纯文字按钮。
 */
const ERR_ACTION_ICON: Record<string, IconName> = {
  '联系支持': 'headset',
  '导出日志': 'upload',
  '从失败处重试': 'refresh',
  '切换到 Cloud': 'refresh',
};
const errCard = (title: string, desc: string, actions: Array<[string, 'secondary' | 'primary']>) => (
  <div className={CAGE_ERR}>
    <RunErrorCard
      title={title}
      description={desc}
      actions={actions.map(([label, variant]) => (
        <Button key={label} type="button" variant={variant} size="sm">
          {ERR_ACTION_ICON[label] ? <Icon name={ERR_ACTION_ICON[label] as IconName} size={11} /> : null}
          {label}
        </Button>
      ))}
    />
  </div>
);

/** 联系支持弹窗(组件 19 · 第 80 格)。渠道由调用方给,这里用产品在用的两条 */
const supportDialog = () => (
  <div className={CAGE_SUPPORT}>
    <SupportDialog
      inline
      onClose={() => undefined}
      channels={[
        { id: 'feishu', name: '飞书社群', href: '#', icon: <FeishuIcon /> },
        { id: 'discord', name: 'Discord', href: 'https://discord.gg/mHAjSMV6gz', icon: <DiscordIcon /> },
      ]}
    />
  </div>
);

/*
 * 正文取词(组件 23)。
 *
 * 稿子把浮条画在 `<mark class="sel">` **里面**(`.sel { position: relative }` +
 * `.selbar { left: 50%; translate: -50% 0 }`)—— 也就是**居中于被划线的那几个字**。
 * 产品里浮条按选区矩形 `position: fixed` 定位,同样居中于选区;但这一页没有真选区,
 * 所以照着稿子的摆法:高亮那一段自己 `position: relative`,浮条绝对定位居中在它上面。
 * 原来是拿**整个容器**的 50% 摆的,于是浮条和划线的那段完全对不上(用户指的就是这个)。
 */
const quoteBar = (placement: 'above' | 'below') => (
  <div className={CAGE_QUOTE} style={{ padding: placement === 'above' ? '44px 0 0' : '0 0 44px' }}>
    <div className="prose-block">
      <p className="md-p">
        {placement === 'above' ? '两页都好了,' : null}
        <mark className="quote-sel" style={{ position: 'relative' }}>
          {placement === 'above' ? '商品卡已经抽成共享组件' : '改一处两页都跟着变'}
          <QuoteBarView
            placement={placement}
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              ...(placement === 'above'
                ? { bottom: 'calc(100% + 7px)' }
                : { top: 'calc(100% + 6px)' }),
            }}
          />
        </mark>
        {placement === 'above' ? ',改一处两页都跟着变。' : ',后面再加页也是同一张卡。'}
      </p>
    </div>
  </div>
);

const quoteChip = (count: number) => (
  <div className={CAGE_QUOTE}>
    <QuotedRefs
      quotes={Array.from({ length: count }, (_, i) => ({
        id: `q${i}`,
        messageId: 'm1',
        text: [
          '商品卡已经抽成共享组件',
          '改一处两页都跟着变',
          '截图是 4 列、24px 沟槽',
          '价格和标签抽成参数',
          '两页共用同一套间距和圆角',
        ][i] ?? `第 ${i + 1} 段`,
      }))}
      onClear={() => undefined}
    />
  </div>
);

/**
 * Plan 卡的收起态(组件 6-2):钉在输入框上方的那枚「第 N / M 步」药丸。
 *
 * 数据走**产品那条链路**:一份 TodoWrite 快照 → `parseTodoWriteInput` → `PlanPill`。
 * `ChatPane` 那边多一步 `latestTodoWriteInputFromMessages`(在整个会话里倒着找最新一份),
 * 那一步找的是消息数组,这一格本来就只有一份快照,所以从解析这一步接上。
 *
 * 头顶那 136px 是**陈列页的脚手架**,不是组件的一部分:浮层往上开,静态格子上方没有
 * 空处它就被切掉。稿子自己也留了同一层(`.pdemo`),并写明「真实场景里药丸钉在流水底部,
 * 上方本来就是空的,不需要这一层」—— 所以产品那边一个像素都没有搬。
 */
const planPill = (items: Array<[string, string]>) => (
  <div className={CAGE_PLAN} style={{ padding: '136px 0 0' }}>
    <PlanPill
      todos={parseTodoWriteInput({ todos: items.map(([content, status]) => ({ content, status })) })}
      running
    />
  </div>
);

/** 升级卡(组件 18):流水里的一张卡,余额决定走哪一档 */
const upgrade = (balanceUsd: number) => (
  <div className={CAGE_UPGRADE}>
    <UpgradeCard balanceUsd={balanceUsd} onUpgrade={() => undefined} />
  </div>
);

/**
 * 下一步引导(组件 16,第 41 / 42 格)——**三条建议由 agent 现写**。
 *
 * 稿子那三句就是这里的入参:它们不是目录里的条目,也不是语言包里的文案,
 * 而是这一轮 agent 按「刚才到底做了什么」写出来的一句可编辑草稿。
 * 产线上它们走 `<od-next key="…">` → daemon 解析 → `next_steps` 事件 →
 * `AssistantMessage` 读事件;陈列页只是把最后那一段的入参摆上来。
 */
const NEXT_STEP_SUGGESTIONS = ['再加一页订单列表', '把商品卡换成两列布局', '补一套深色模式'];

const nextSteps = () => (
  <div className={CAGE_NEXT_STEP}>
    <NextStepActions suggestions={NEXT_STEP_SUGGESTIONS} onSuggestion={() => {}} />
  </div>
);

const OUTRO: Cell[] = [
  {
    gid: 28, sub: '13-1', cmp: '总结文案', state: '生成中 · 逐字流式', family: '产出收尾',
    node: () => prose(SUMMARY_SHORT, true),
    notes: [
      '挂的是产品里那条正文渲染链路的纯函数 `renderMarkdown`(`ProseBlocks` 未导出,但它内部调的就是这一个)',
      '**逐字化开在这一页上看不到**:`chat/useCharReveal.ts` 是在**真实 DOM** 上按节点切字、逐个入场(W9),SSR 出来的标记里没有 `.rv` 这一层。**没有**为了让它出现去改组件 —— 要看它得起真实页面',
      '**这处差异 2026-08-27 已经关掉**:稿子 21:02 版把流式光标(`.caret`)整个删了,产品当时仍挂着 `data-stream-cursor` 的闪烁 `::after`;用户指着表单加载态那一格拍板「把这个光标干掉,什么地方都不准出现」,于是两枚光标(正文的 `::after` 和实时代码的 `.live-code-caret`)连同 `@keyframes` 一起删了。钉在 `tests/components/chat/stream-cursor-removed.test.tsx`',
      // 注:这里**故意不写 daemon 的目录字面量** —— `scripts/guard.ts` 的
      // 「daemon core boundary」会把「web 测试里同时出现 node:fs 与那条路径」判成越界消费。
      '「总结」这个身份本身依赖 D43 的 `<done/>` 分界,而 daemon 侧的 prompt 目录里没有任何 agent 会发这个标记 —— 28 / 29 两格今天在产品里**渲染上零区分**,差的不是画法',
    ],
  },
  {
    gid: 29, sub: '13-2', cmp: '总结文案', state: '结束 · 输出完成', family: '产出收尾',
    node: () => prose(SUMMARY_FULL),
    notes: [
      '与第 28 格**同一个 DOM**,只是内容更长、多一处加粗;结束态不追加勾、不换底 —— 收尾的宣告归第 34 格那一行',
      '稿子的 `.say b` 只加字重不改色(两者已同色);我们走 markdown 默认的 `<strong>`,取色跟着 prose 全局规则 —— **逐条核色是这一格要比的事**',
    ],
  },
  {
    gid: 30, sub: '14-1', cmp: '产物卡片', state: '默认 · 卡面只有图,不写文件名;动作在右上角', family: '产出收尾',
    node: () => arts(['商品列表页.html', '设置页.html']),
    notes: [
      '**这一族已经做了**:`FileOpsSummary` 里的 `ArtifactCards` / `ArtifactCard`。卡面只有缩略图,不写文件名、不摆工具条、没有「预览」也没有「⋯」,动作在右上角(D28 / B19)',
      '哪些文件进卡由 `artifactCardKind()` 判(html / image / video 三种);`.md` `.csv` 那类留在下面的文本行里 —— 这一格全是 html,所以只剩两张卡',
      '**缩略图取不到**:html 卡走 `HtmlProjectCoverFrame` 的 iframe,`src` 指向 `/api/projects/:id/raw/…`,离开 daemon 是打不开的。要比的宽高比(16/10)、圆角、两列栅格、按钮位置照样都在',
      '⚠️ **排布未拍板**:D38 定的轮末顺序是「产物卡 → 总结正文 → 回合状态行 → 下一步引导」,D37 又说卡「落在出卡那一刻的位置」。产品今天是钉在正文之后 —— 两者在「先写产物再说总结」时一致,顺序本身待产品确认',
      '**卡还在写的时候(D37)不在陈列格里** —— 稿子没有这一态。产品 2026-08-26:「任何产物卡片加载期间不能用灰色卡片代替,都要用动画」,所以 `pending` 的卡面现在是第 9 格那套**像素液体**,原来那层灰底 + 呼吸 opacity(`artifact-card-pulse`)已经撤掉。同样地,陈列页是静态渲染,`<canvas>` 在这里出不来 —— 这一态要看真 runtime',
    ],
  },
  {
    gid: 31, sub: '14-2', cmp: '产物卡片', state: 'HTML 产物 · 发布 / 导出 两枚都在', family: '产出收尾',
    node: () => arts(['商品列表页.html']),
    notes: [
      '「发布」只有 html 卡有(`canPublish` 判 `item.kind === "html"` 且宿主给了 `onPublish`),这条与稿子一致',
      '**D39 那枚上传图标已经补上了**(稿子里「发布」是纯文字;设计 2026-08-21 口头答复要加,稿子至今未更新)—— 两边不一致是**有意的**,请设计确认后回写稿子',
      '⚠️ **「导出」点下去开的是一个选格式的菜单**(PDF / 图片 / zip / standalone HTML),稿子说明只写「下载到本地」。一次点击直接下载还是仍开菜单,**待产品拍板**',
    ],
  },
  {
    gid: 32, sub: '14-3', cmp: '产物卡片', state: '非 HTML 产物 · 右上角只剩一枚「导出」', family: '产出收尾',
    node: () => arts(['商品卡对齐稿.png']),
    notes: [
      '同一份 `onPublish` 照样传了,卡上仍然只出一枚「导出」—— 少的那一枚是组件自己按 `kind` 判掉的,不是这一格没给回调',
      '`.acts` 用 flex 靠右,所以少一枚时整排自己往右收、右缘齐(稿子点名的那条)',
    ],
  },
  {
    gid: 33, sub: '14-4', cmp: '产物卡片', state: '视频产物 · 卡面上什么都不压,右上角同样没有「发布」', family: '产出收尾',
    node: () => arts(['走查录屏.mp4', '交互演示.mp4']),
    notes: [
      '`artifact-card--video` 变体:竖片按 9/16 居中、两边留白,不拉满变形',
      '**卡面什么都不压**(不压播放键、不压「查看」)—— 稿子那段 CSS 里有两条互相矛盾的注释,DOM / 状态标题 / cmp-ops 三处都站「什么都不压」这一条,我们跟的是这一条',
      '`<video>` 的 `src` 同样指向 daemon,静态页里放不出画面。组件写的是 `width:auto` + `object-fit:contain` —— **9/16 那条留白是真片子的内在尺寸撑出来的**,加载不了时 `width:auto` 会落回 `<video>` 的默认 300px。所以这一页替它补了竖片的长宽比(只补在陈列格里,组件一个字没改),同 `data-hover` / `data-expand` 一个性质',
    ],
  },
  {
    gid: 34, sub: '15-1', cmp: '回合状态行', state: '默认 · 回合状态 + 图标组 + 时间', family: '产出收尾',
    node: () => fbRow(null, { createdAt: Date.UTC(2026, 0, 1, 6, 32) }),
    notes: [
      '**已按稿子改**:顺序 赞 → 踩 → 复制 → Fork(原来是 复制 → Fork → 赞 → 踩)、状态标记从 5px 灰点换成绿勾(复用全局 `--tick-img`)、按钮 22 → 26px、分隔线换成弹簧',
      '绿勾**现在是 16px**,不是这条注记原来写的 13px:状态词后来从 `--t-cap`(12)提到 `--font-size-14`,勾跟着从 13 提到 16 —— 两个数是一对(14px 中文的字面高度约等于 16,勾和字这才读成一个词),只改一个就是半迁移',
      '**稿子右端那个 `14:32` 已经补上了**:原来 `AssistantMessage.tsx` 只在「没有反馈按钮」那条分支传 `createdAt`,走 `AssistantFeedback` 的分支(也就是任何一轮正常跑完的回复)那份 `footerProps` 里没有它,所以最常见的路径上时间根本不出。现在两条分支都传了,这一格的夹具也跟着补上 —— 陈列页不该再报一个已经不存在的问题',
      '**「时间贴不到右端」那条也修好了**:`.assistant-feedback-wrap` 原来是 `inline-flex` + `max-width: min(360px,100%)`,整行缩成 220.6px、弹簧撑不开;现在是 `flex` + `width: 100%`(下面那块原因面板改成自己限宽),`.assistant-footer-gap{flex:1}` 撑得开了,`footer-time.test.tsx` 钉着这条。**这条注记原来写着「没有顺手改」,那是旧话**',
      '整行在产线上是 hover 才显形的(`.assistant-footer{opacity:0}`),这一页靠 `data-last="true"` 那条既有规则常驻 —— 组件一个字没改',
      '⚠️ **`hideRunStatus` 待拍板**:这一轮有执行记录或 todo 快照时,产品把整个状态词都不渲染(「run 状态已经在答案顶部了」);稿子里壳头与这一行是**同时存在、各说各的**。这一格给的是 `hideRunStatus=false`,也就是「恢复之后」的样子',
    ],
  },
  {
    gid: 35, sub: '15-2', cmp: '回合状态行', state: 'hover · 出 Tooltip,把图标翻译成一句话', family: '产出收尾',
    node: () => fbRow(null),
    notes: [
      '**静态页里出不了那个气泡**:产品的 tooltip 是 `.od-tooltip` + `TooltipLayer.tsx` 的 **portal**,由 pointer / keyboard modality 驱动;它不是一条 `::after`,没有「原样重放一遍」的规则可抄(第 51 格那招在这儿不成立)。机制比稿子的 `[data-tip]::after` 更完整,不是缺口',
      '**四条文案已按稿子改**:「有帮助 / 没帮助 / 复制 / 新会话」,落在按钮的 `aria-label` 与 `data-tooltip` 上(19 语全改)。第四条**有意不取稿子字面**:稿子这里写「新开会话」,面板头那颗写「新会话」,两处稿子自己就不一致 —— 产品裁决 2026-09-03「聊天面板内只说一句」,取「新会话」,依据同在稿子里(`body-components.html:1243` 的 `aria-label="新会话从这里开始"`)。同一颗按钮的三个态一并统一成 新会话 / 正在开始新会话… / 无法开始新会话。守卫见 `w118-feedback-row-icons-and-tips.test.tsx` 与 `w129-new-session-single-entry.test.tsx`',
      '**气泡材质已按稿改,而且是全站改的**(产品裁决 2026-09-03:「全站都改成稿子这套」):圆角 4 → 8(`--radius`)、内距 `5px 8px` → `5px 9px`、行高 1.2 → 1.4、磨砂 → 实底 `--bg-elevated`(顺带摘掉 `backdrop-filter`)、边色 `--material-separator` → `--border`、`--shadow-sm` → `--shadow-md`、字色 `--vibrancy-label` → `--text-strong`、离按钮 7 → 6px。**这条注记原来写着「待拍板」,那是旧话**;守卫见 `styles/w126-tooltip-design-parity.test.ts`',
      '**淡入淡出也按稿子接上了**(产品裁决 2026-09-03:做重构):稿子的气泡挂在一个一直存在的 `::after` 上,`opacity: 0` 起手、`transition: opacity var(--duration-faster) var(--ease-out)`;产品原来 hide 时把 portal 卸载,元素根本没机会从 0 走到 1,加 `transition` 是死规则。现在 `TooltipLayer` 常驻挂载、只切 opacity。**代价是那个 `role="tooltip"` 节点一直在 DOM 里**,所以隐藏态挂 `aria-hidden="true"` 把它从可访问性树里摘掉;按下按钮那一路则一刀切(`visibility: hidden`,不淡)—— 否则 100ms 的淡出会被「截图到对话」抓进画面。守卫见 `components/w129-tooltip-fade.test.tsx`',
      '⚠️ **换行那一条有意没跟稿子,仍待产品拍板**:稿子是 `white-space: nowrap` 且不设 max-width,那是为「两三个字的图标名」量身的。这条 primitive 全站共享,上面挂着 202 字符的长描述(`fileViewer.publishSingleFileDescription` 法语)和一批长度无上限的用户数据(工作目录路径、标签页标题),单行会横穿屏幕 —— 所以限宽 260px 换行留着',
      '⚠️ **顺手要收的一处**:产品同时还挂着原生 `title=`,会和自绘 tip 叠在一起;稿子只有 `aria-label` + `data-tip`。`TooltipLayer` 目前在 pointerover 时把 `title` 摘下来暂存,所以真机上不会真的叠出两个气泡 —— 是否仍要去掉 `title` 待拍板',
    ],
  },
  {
    gid: 36, sub: '15-3', cmp: '回合状态行', state: '踩被选中 · 用红不用绿,它跟赞不是一回事', family: '产出收尾',
    node: () => fbRow('negative'),
    notes: [
      '**已按稿子改**:踩选中走 `--red` / `--red-bg` 一套,不再和赞共用 accent(`theater.css` 的 `[data-selected="true"][data-rating="down"]`)',
      '⚠️ **稿子这一格有一处疏漏**:被选中的那颗踩**丢了 `data-tip`**,其余几颗还在。看着是疏漏不是设计意图 —— 我们保留了 tip,**请确认**',
    ],
  },
  {
    gid: 37, sub: '15-4', cmp: '回合状态行', state: '已选 · 图标变填充,再点取消', family: '产出收尾',
    node: () => fbRow('positive'),
    notes: [
      '⚠️ **状态标题与稿子自己的 DOM 打架**:标题写「图标变填充」,但 37 格 DOM 里 `.is-on` 那颗仍是 `thumb-up-line` 的路径、只换了底色,`cmp-ops` 也只写「单击切换,互斥」。产品今天是 `svg{fill:currentColor}` **真的填成了实心** —— **待拍板**(这条会连着第 36 格一起改)',
      '⚠️ **稿子这一格没有 Fork 按钮**(34 / 35 / 36 / 38 四格都有),大概率是疏漏 —— 我们保留了 Fork',
      '图标本身不用改:`thumbs-up → thumb-up-line` 等四条路径与稿子逐字相同,尺寸同为 13px',
    ],
  },
  {
    gid: 38, sub: '15-5', cmp: '回合状态行', state: '点过「新开会话」· 原地落一条分界,标题承接原会话', family: '产出收尾',
    node: () => (
      <>
        <div className="fork-sep">
          <i aria-hidden />
          <span>把商品列表页复刻成能跑的原型</span>
          <i aria-hidden />
        </div>
        <div className="fork-note">
          <Icon name="fork" size={12} />
          上文已带过来,接着说就行
        </div>
      </>
    ),
    notes: [
      '**已接线**:`handleForkFromMessage` 在分叉成功之后给源会话那条助手消息盖上 `forkedInto`(承接过来的标题 + 新会话 id)并 PUT 回去;daemon 侧新增 `messages.forked_into_json` 落库,所以**刷新之后分界还在**',
      '两侧的线都从外沿透明化到贴着字的实色 —— 稿子的理由是让它读起来像「一段的开头」,而不是把这一列切成两半的硬横线',
      '脚注跟着线【居中】:它是这条线的注解,不是新会话里的第一句话(左对齐会读成「新会话已经开口说了一句」)。文案 `assistant.forkNote`,19 语已补齐',
      '⚠️ **还差半步**:分界今天只落在**源会话**那条消息上,新会话消息流末尾还没有。点完之后页面是跳到新会话的,所以「原地」这一半要等新会话末尾也盖上标记才完整',
    ],
  },
  {
    gid: 39, sub: '15-6', cmp: '回合状态行', state: '这轮被中断 · 状态词说清有没有剩余,绿点转灰', family: '产出收尾',
    node: () => stoppedRow(),
    notes: [
      '**文案已按稿子换**:`assistant.canceledLabel` 从「已取消」改成「已手动停止」——「说清是谁停的」,19 语已补齐。稿子在 CSS 注释里点名反对「仍有未完成任务」那种限定语:剩没剩、剩几步,上面那段执行记录本来就写着',
      '**赞 / 踩已经不出了**:中断的一轮没有「答得好不好」可评 —— 它压根没答完。判据落在 `isFeedbackEligible` 的 `userStoppedTheTurn` 上,所以这一格挂的是产线真正走的那条分支(`AssistantFooter`,没有 `AssistantFeedback` 那层壳)。**跑挂了的那一轮不在此列**:那是结果,评得动',
      '**灰点 + 中性字已经对上了**:这一格量出来是 5px 圆点 `--text-faint`(#bdbdbd)+ 状态词 `--text-muted`(#5c5c5c),和稿子逐值相同。字色原来输在层叠上 —— `routines.css` 的 `.app .assistant-footer .assistant-label` 与 theater 的中断档同为 (0,3,0),而 routines 排在后面,旧皮肤那份 `--text-faint` 赢;那条规则的每一句都和 composio 逐字相同,已整条删掉',
      '右端的 `14:32` 在这一格是**真的贴到右端的**:没有赞踩就没有 `.assistant-feedback-wrap`,整行直接满宽,中间那根弹簧撑得开',
      '第 81 格(组件 20 · 暂停任务)画的是同一件事在流水里的另一半;两格要一起看',
    ],
  },
  {
    gid: 40, sub: '15-7', cmp: '回合状态行', state: '反馈弹窗 · 点踩后选原因 + 补充', family: '产出收尾',
    node: () => assistantMsg(
      <AssistantFeedbackReasons
        rating="negative"
        options={feedbackReasonOptions('negative', T, false)}
        selected={new Set(['weak_visual'])}
        onToggle={() => undefined}
        customReason=""
        onCustomReasonChange={() => undefined}
        canSubmit
        onSubmit={() => undefined}
        onCancel={() => undefined}
        t={T}
      />,
    ),
    notes: [
      '**已抽成组件**:`AssistantFeedbackReasons`。原来它长在 `AssistantFeedback` 里、由 React state `reasonRating` 驱动 —— 静态陈列页永远够不着,那一格只能空着',
      '**已按稿子重做**:复选框列 → 胶囊组(`aria-pressed` 承担多选语义)、补充框从「勾了『其他』才出」改成**常驻**且只留一条底线、右下补上「取消」、标题在点踩这一路换成稿子的问句「哪里不对?」(新键 `assistant.feedbackReasonTitleNegative`,19 个语言包已补齐)',
      '连带放开了提交口径:**只写补充、一个原因都没勾**现在也能提交,而且那句话会真的带走 —— 原来它必须勾中「其他」才算数,人把话打完了却被丢掉',
      '原因项严格按稿子收敛为 4 项:没按我说的改 / 视觉不一致 / 跑不起来 / 太慢；新增 code 只用于后两项,旧 code 继续保留以兼容历史反馈数据',
      '选中态使用稿子的品牌绿底与深绿文字；夹具使用真实 code `weak_visual`,不再传一个永远选不中的 `visual` 假值',
      '标题不附加表情,输入框后直接接取消 / 提交；产品实现不再插入稿子没有的社区引流行',
    ],
  },
  {
    gid: 41, sub: '16-1', cmp: '下一步引导', state: '默认 · 3 条可点击建议', family: '产出收尾',
    node: () => nextSteps(),
    notes: [
      '**T12 已结**(产品裁决 2026-08-26):固定的设计工具箱目录不要了,换成 agent 现写的三条行为引导。这一格挂的就是对齐后的样子,三句用的是稿子原文',
      '**内容链路**:agent 在回合末尾吐一枚 `<od-next key="…">`(密钥与 D43 的 `<od-done>` 同一枚,每轮一次性)→ daemon 在可见文本流上剥离并校验 → 下发 / 落库为 `next_steps` 事件 → `AssistantMessage` 读事件。**标记本身客户端从来看不到**,所以不可能漏进正文、也不会被复制 / 导出带走',
      '**形态**:容器无框无内距、行与行不留缝、行内距 `9px 11px`、gap `8px`、字号 12、行高 35px —— 逐值和稿子相同(浏览器里量的,不是 diff 规则文本)',
      '**行的构成也对上了**:每行是**同一枚箭头**(12px、`--text-soft`,hover 时和字一起转 `--text-strong`)+ 一句话;**分类图标和行尾 chevron 都已删掉** —— 点一条是往 Composer 填草稿,不会打开下一层菜单,所以行尾不需要另一枚 chevron',
      '⚠️ **点击只起草,不发送**:现在走 `composerRef.setDraft(prompt)`;用户可以先改写,只有显式点发送才会创建消息和 run。',
      '⚠️ **旧会话**:历史消息里没有 `next_steps` 事件,这一块**整块不出**(不退回目录、不出空壳)。陈列页照不出这一态,它钉在 `tests/components/NextStepActions.test.tsx`',
      '⚠️ **归属未决**:「投稿社区」原来只藏在这个组件的三级菜单里,`default` 档换掉之后它在常规交付回合上没有落点了。分享 / 下载 / 创建设计系统在别处都还有入口(文件查看器工具条、文件面板「…」菜单)',
    ],
  },
  {
    gid: 42, sub: '16-2', cmp: '下一步引导', state: 'hover · 只高亮被指的那一条', family: '产出收尾',
    hover: true,
    node: () => nextSteps(),
    notes: [
      '这一格由陈列页**替设计师按住第二行**(`data-hover`)—— 稿子的 `is-hover` 就落在「把商品卡换成两列布局」那一条上;产线上仍旧是鼠标停上去才变',
      '**hover 照稿子**:`--bg-panel` 打底,字与箭头一起转 `--text-strong`,边框不动(本来就没有)。过渡是 `background-color / color × var(--duration-faster) var(--ease-out)`',
      '🐞 **这条只有在真客户端上才看得见,陈列页天生照不出来**:全局 `button:hover:not(:disabled) { background: var(--bg-subtle) }` 是 (0,2,1),裸写 `.suggestionRow:hover` 是 (0,2,0) —— **输了**,量出来会是 `rgb(237,237,237)` 而不是稿子的 `rgb(250,250,250)`。所以选择器带上 `.suggestions` 这个祖先凑到 (0,3,0),和稿子里 `.nexts` 承担的是同一份层叠职责。**这一页把 module 关进 `.cage-next-step` 的笼子,选择器凭空多一个祖先,这个坑正好被盖住**',
      '**detail 说明卡没了**:它服务的是「固定目录需要解释」这个前提,目录既然撤了,卡也跟着删了(品牌那一档还留着自己的那张)',
    ],
  },
  {
    gid: 43, sub: '24-1', cmp: '音频产物', state: '默认 · 停着,整条波形都还没播', family: '产出收尾',
    node: () => audio(0, false),
    notes: [
      '**已建**:`components/chat/AudioArtifact.tsx` + 采样规则 `runtime/chat/audio-wave.ts`(有单测)。建之前 chat 面板里零音频 UI',
      '⚠️ 波形采样契约里没有(T17),这里用**按时长生成的稳定伪采样** —— 同一段音频每次画出同一条,不用随机数',
      '⚠️ 要让音频真的进产物列表,还要放开 `artifactCardKind()` 对 .mp3 / .wav 直接返回 null 的判断(T41)'
    ],
  },
  {
    gid: 44, sub: '24-2', cmp: '音频产物', state: '播放中 · 已播那截变实,波形跟着起伏', family: '产出收尾',
    node: () => audio(12, true),
    notes: [
      '播放中:已播那截的竖条换成实色(`playedBars` 决定点亮到第几条,有单测)',
      '**摆在第 12 秒**:稿子这一格的静态标记写的是 `data-at="12" data-play`(时间那处的 `0:00` 只是脚本跑起来之前的初值,`audio-wave.js` 一上来就按 `data-at` 点亮前 7 条)。原来这里摆 0:00,于是波形前 7 条**永远差一片颜色** —— 那是夹具对不上,不是画法对不上',
      '静态页照不出「跟着起伏」的动画 —— 稿子那一档是 `wave-pulse` 动画,要看得起真实页面'
    ],
  },
];


/* ── 输入(组件 1 / 2 / 21 / 23,第 45–69 格)────────────────────────────
 * 同理:这一族产品里也早就有实现(`ChatPane.tsx` 的 `UserMessageImpl`)。
 * 组件 1(文本)与组件 2(附件)已经做完,挂在下面;组件 21(待发送附件)与
 * 组件 23(取词)还没做,等做到再补。 */

/** 稿子第 51 格上写着 `14:31`。用固定 epoch 会随跑测机器的时区漂,所以按本地时间构造。 */
const SENT_AT = new Date(2026, 7, 20, 14, 31).getTime();

const userMsg = (text: string, attachments?: unknown[]) => ({
  id: 'm1', role: 'user' as const, content: text, createdAt: SENT_AT,
  ...(attachments ? { attachments } : {}),
});

/** 附件夹具照抄稿子里那几张卡的名字与体积 —— 夹具一变就没法逐格比。 */
const img = (name: string, order: number) =>
  ({ path: `uploads/${name}`, name, kind: 'image' as const, order });
const doc = (name: string, sizeKb: number, order: number) =>
  ({ path: `uploads/${name}`, name, kind: 'file' as const, size: sizeKb * 1024, order });

/**
 * 陈列页里的 `t`:走**真的 zh-CN 语言包**。
 *
 * 原来这里是 `(k) => k`,理由写的是「比的是排布与形态,不是文案」。这个理由不成立 ——
 * 键名(`chat.record.retry`)比译文(「重试」)长得多,它把那一行撑宽、把邻居推走,
 * **排布本身就被桩带歪了**;逐属性比对拿到的宽高也跟着失真。
 * 而且验收的人看到的是一屏英文点号串,只会以为这个功能没做完。
 */
// `tForLanguageTag` 在语言标签取不到时返回 null;这里的 'zh-CN' 是常量,一定解得出,
// 所以用非空断言。原来写的是 `as never` —— 那是把返回值断言成了「不可能存在的值」,
// 于是任何一次调用都报「Type 'never' has no call signatures」。
const T = tForLanguageTag('zh-CN')!;

/** 稿子里附件永远可点,所以这里给一个空的打开回调 —— 不给的话卡片会被判 disabled。 */
const msg = (message: unknown) => (
  <UserMessageImpl
    message={message as never}
    projectId="p1"
    onRequestOpenFile={() => {}}
    t={T}
    appliedContextItems={[]}
  />
);

/** 第 46 格的正文,逐字取自稿子那一格 —— 换一段字数不同的话就比不出 6 行切在哪儿。 */
const LONG = '把这一屏重做成能跑的原型,再加一个视觉风格一致的设置页,两页共用同一套间距和圆角。'
  + '列表页的商品卡要能复用到设置页里那两处小卡上,间距按 8 的倍数走,圆角统一 12px。'
  + '另外结算页那张缩略图也一起换掉,价格行的字号调大一档 —— 现在两页放一起看着不像一套。'
  + '跨端那边先不用管,等这两页定了再说。断点按 md 里写的来,880 以下换成两列;'
  + '列表为空时先别管,等有数据的那版定了再补。做完把两页放一起截张图给我看。';

/** 静态页里量不出来的那三件事,措辞统一,免得逐格各写一套。 */

/* ── 组件 21 · 待发送附件(第 60–64 格)────────────────────────────────
 * 与组件 2 **共用同一张卡**,发送前只多两样东西:右上角一枚 hover 才出的「×」,
 * 和上传中 / 失败的叠加物。托盘自己占一个容器、从左排。
 *
 * 卡片数据走一遍**真实的合并规则**(`buildStagedAttachmentCards`)——「已经传上去的」
 * 和「还在传 / 传失败的」是两条列表,合并与排序本身就是这一族最容易出错的地方。 */
const trayImg = (name: string, order: number) =>
  ({ path: `uploads/${name}`, name, kind: 'image' as const, order });
const trayDoc = (name: string, sizeKb: number, order: number) =>
  ({ path: `uploads/${name}`, name, kind: 'file' as const, size: sizeKb * 1024, order });
const trayPending = (
  name: string, order: number, state: 'uploading' | 'failed', kind: 'image' | 'file' = 'image',
) => ({ id: `pu-${order}`, name, kind, order, state });

const tray = (
  staged: Parameters<typeof buildStagedAttachmentCards>[0],
  pending: Parameters<typeof buildStagedAttachmentCards>[1] = [],
  width?: number,
) => {
  const node = (
    <StagedAttachmentTray
      cards={buildStagedAttachmentCards(staged, pending)}
      projectId="p1"
      onRemoveStaged={() => {}}
      onRemovePending={() => {}}
      onRetryPending={() => {}}
      t={T}
    />
  );
  // 稿子第 64 格特意把托盘卡到 406px —— 460 面板里输入框的净内宽,量出来的。
  // 不卡宽度就看不见「滚」这一态:陈列格比输入框宽,再多几张也溢不出来。
  return width ? <div style={{ width, maxWidth: '100%' }}>{node}</div> : node;
};

const TRAY: Cell[] = [
  {
    gid: 60, sub: '21-1', cmp: '待发送附件', state: '发送前 · 输入框内待发,静止时不摆「×」', family: '输入',
    node: () => tray([trayImg('首页.png', 1), trayDoc('跨端适配检查清单.pdf', 96, 2), trayDoc('走查录屏.mov', 8600, 3)]),
    notes: [
      '**已按稿子改**:待发送附件从 `.staged-row`(和 plugin / skill / MCP 芯片混排的那一行)搬进**自己的托盘**,从左排、单行横滚;卡片与已发送那一侧**共用同一份 CSS 规则**,不另抄一套模板',
      '「×」是右上角 18px 的圆形浮标(原来是行内右端 14px 的方钮),**默认 `opacity: 0`,逐张 hover / `:focus-visible` 才出**,并补了 `@media (hover: none)` 常驻 —— 这一页是静态的,看不到 hover,要看得起真实页面',
      '序号徽标 `.staged-order` 已按稿子去掉',
      '⚠️ **这一格与稿子有一处有意分歧**:稿子把三张都画成 57px 方卡(`.pdf` / `.mov` 也算「能出预览」),产品的 `looksLikeImage()` 只认 7 种位图,所以这里 `.pdf` / `.mov` 走文档宽卡。**准入名单是盘点 §5 第 7 条的待拍板项,没有自己改**',
      '⚠️ **另一处有意分歧**:稿子这一格的卡是不可点的 `<span>`,而产品现有「点缩略图看大图」的弹层是**已经在用的能力**。删掉一个已有入口要产品拍板,所以卡壳仍是 `<span>`、但缩略图本身可点',
    ],
  },
  {
    gid: 61, sub: '21-2', cmp: '待发送附件', state: '发送前 · 上传中,进度走在描边上,不另占一行', family: '输入',
    node: () => tray([trayImg('首页.png', 2)], [trayPending('走查录屏.png', 1, 'uploading')]),
    notes: [
      '**从零做的**:原来 `uploadFiles()` 是**原子**的 —— 一次把整批打包发,成功之后芯片才出现,上传的那几秒界面上一张卡都没有。现在改成**一个文件一个请求**(`uploadProjectFiles` 本来就收 `File[]`,给它长度为 1 的数组走的是同一个端点、同一份契约,**后端和 `packages/contracts` 都没动**),并发上限 4',
      '描边上那圈流光是 `@property --att-up-angle` + `conic-gradient` 的两层背景(padding-box 盖内部、border-box 只在 1px 描边区露出来)。**它是「在忙」的不定式指示,不是百分比进度** —— 57px 的卡上读不出「62%」,那就别假装',
      '**静态页里它不转**:陈列页会整段丢掉 `@media` / `@keyframes` / `@property` 这类 at 规则(不丢的话条件会丢、里面的规则无条件生效,踩过一次)。所以这里看到的是流光停在 0° 的那一帧;为此 `conic-gradient(from var(--att-up-angle, 0deg), …)` 特意写了兜底,否则整条 background 会被判无效、卡片变成一个没边没底的白块',
      '缩略图压暗到 .45,「×」的 aria 换成「取消上传 X」。**取消目前等于「把这张卡撤掉」**:`uploadProjectFiles` 不收 `AbortSignal`,真中止请求要改 `providers/registry.ts`,这次没动 —— 撤掉之后结果就地丢弃,不进待发列表',
      '⚠️ **说明文字里那句「这几秒发送键不可用」没做**:那是一条**已知的现网 bug**(上传期间发送键可点,点下去这批文件不跟着发),按分工要另起红测 + 独立 PR。这一轮**没有碰** `sendDisabled`,行为与改动前逐字一致',
      '⚠️ **稿子缺口 S13**:文档宽卡的上传中态没画。这里按图卡同一条规则给了描边流光,轮廓不变',
    ],
  },
  {
    gid: 62, sub: '21-3', cmp: '待发送附件', state: '发送前 · 文档同在一行,「×」位置不变', family: '输入',
    node: () => tray([trayDoc('商品卡组件规格说明终稿.md', 12, 1), trayImg('首页.png', 2)]),
    notes: [
      '两种卡在**同一行、同高不同宽**:文档卡 180px、图卡 57px 见方,高度靠 flex 默认的 stretch 跟住,只有一个数字要维护',
      '「×」的偏移**两张卡不一样**:图卡 `top/end: 4px`,文档卡 `5px`(两张卡的边框 / 内边距不同,稿子给的就是两个值,**照抄,没统一成一个**);文档卡在托盘里额外 `padding-inline-end: 28px` 给它让位',
      '文件名拆成【主名 + 后缀】,后缀 `flex: none` 永不被吃掉;中间省略的量法与第 59 格同一份纯函数,**静态页里量不出来**,这里是没截过的整串',
    ],
  },
  {
    gid: 63, sub: '21-4', cmp: '待发送附件', state: '发送前 · 上传失败,重试或直接移除', family: '输入',
    node: () => tray([], [trayPending('规范.png', 1, 'failed')]),
    notes: [
      '**从零做的**:原来失败只出一行全局英文提示(`Attachment upload failed for N file(s)…`),**无法针对某一个文件重试** —— `uploadProjectFiles` 的 `failed[]` 只有 `name`,同名文件根本对不回去。改成逐文件之后每张卡各自记着自己的本地 `File`,「重试」只重发那一个',
      '失败卡**不描红框**:红只留给「可以点的那一下」。卡上画面是空的、中间摆着「↻ 重试」,已经够说明失败;再描一道红边,人先看到的是「这张卡跟旁边不一样」,还得再看一眼才知道不一样在哪',
      '「重试」竖排两行铺满整块缩略图 —— 横排的「↻ 重试」要 60px 出头,会顶出 57px 的卡外',
      '**「重试」两个字用的 i18n 键(`chat.att.retry`)还没落地**,已单独交出去;这一页按稿子逐字摆出来,键一落地就把陈列页里的临时文案删掉',
      '⚠️ **稿子缺口 S13**:文档宽卡的失败态没画,「重试」放哪没说。所以**文档卡失败时没有卡上重试**,只把名字标红 + 留「×」,同时**保留了那一行全局提示** —— 收掉它等于让「.txt 传失败」变成完全无声。等设计补一态再改',
    ],
  },
  {
    gid: 64, sub: '21-5', cmp: '待发送附件', state: '发送前 · 附件多到装不下,一行横滚',
    scroll: 'next', family: '输入',
    node: () => tray([
      trayImg('首页.png', 1), trayImg('设置页.png', 2), trayDoc('商品卡组件规格说明终稿.md', 12, 3),
      trayImg('走查录屏.png', 4), trayDoc('埋点清单-v3.csv', 4, 5), trayImg('会员中心.png', 6),
    ], [], 406),
    notes: [
      '**已按稿子改**:原来是 `flex-wrap: wrap` + `max-height: min(108px,18vh)` + `overflow-y: auto` ——**纵向长高再纵向滚**,输入框高度会跟着附件数变。现在单行 + 横滚 + 藏滚动条,**输入框高度因此是常量**(说明文字点名的那句收益)',
      '**这一格特意卡到 406px** —— 460 面板里输入框的净内宽(460 − 两侧 20 边距 − 输入框 2 边框 − 托盘左右 9 内边距 ×2),稿子量过的。不卡宽度就看不见这一态:陈列格比输入框宽,再多几张也溢不出来',
      '托盘靠左(`margin-inline-start: 0`),与已发送那一侧的贴右正好相反 —— 已发送那行压在用户气泡上方要跟气泡右对齐,而托盘在满宽的输入框里,内容当然从左边起',
      NO_LAYOUT('两枚翻页箭头')
        + '判据**直接复用组件 2 那份纯函数**(`runtime/chat/attachment-nav.ts`),没有重写:两处底色相同,`--att-fade` 那套渐变和箭头也共用。出没出的行为断言在 `tests/components/chat/staged-attachment-tray.test.tsx`',
    ],
  },
];

/* ── 组件 23 · 回答正文取词(第 65–69 格)────────────────────────────────
 * 本族里**唯一从零做**的组件,而且卡在技术方案之前(盘点 §4-C)。五格全部出不来,
 * 逐格写清楚卡在哪一层 —— 不是「还没排上」。 */
const NO_SELECTION = '产品里**没有任何针对聊天正文的选区监听**:全仓 `apps/web/src` 搜不到对回答正文的'
  + ' `window.getSelection` / `selectionchange`(只有 Lexical 编辑器内部的 `$getSelection`,'
  + '和 `edit-mode/bridge.ts` 注进 iframe 的那一段,都不是这条链路)。';

const TAKE: Cell[] = [
  {
    gid: 65, sub: '23-1', cmp: '正文取词', state: '默认 · 浮在选区上方,居中于选区', family: '输入',
    node: () => quoteBar('above'),
    notes: [
      '**这一格已经建出来了**:`components/chat/QuoteBar.tsx` + 纯判据 `runtime/chat/quote-selection.ts`',
      '浮条**居中于被划线的那几个字**,不是居中于整段。稿子靠 `.sel { position: relative }` + `.selbar { left:50%; translate:-50% 0 }`;产品里按选区矩形 `position: fixed`,落点是同一个。浮条根节点也跟着稿子改成了 `<span>` —— `<div>` 放进 `<p>` 会被浏览器当场截断,DOM 一重排浮条就整个不见'
    ],
  },
  {
    gid: 66, sub: '23-2', cmp: '正文取词', state: '选区贴着面板顶边 · 浮条翻到下方', family: '输入',
    node: () => quoteBar('below'),
    notes: [
      '翻面判据是「上方放不下就翻」——浮条高度 + 那道 7px 缝,不是拍脑袋的阈值(`quoteBarPlacement`,有单测)'
    ],
  },
  {
    gid: 67, sub: '23-3', cmp: '正文取词', state: '点完之后 · 输入框里多一枚芯片,不占写字的地方', family: '输入',
    node: () => quoteChip(1),
    notes: [
      '**已建**:`components/chat/QuotedRefs.tsx`,挂在输入框**上方**,不占写字的地方'
    ],
  },
  {
    gid: 68, sub: '23-4', cmp: '正文取词', state: 'hover 芯片 · 上方浮出全文,右侧露出移除', family: '输入',
    node: () => quoteChip(1),
    notes: [
      'hover 才露「×」、才浮出全文 —— 静态页照不出 hover,规则在 CSS 里(`.refs:hover .del/.pop`)'
    ],
  },
  {
    gid: 69, sub: '23-5', cmp: '正文取词', state: '选了好几段 · 只是数字变,一条和五条一样高', family: '输入',
    node: () => quoteChip(5),
    notes: [
      '这一格的意义是**证明一条和五条一样高**:条数只改芯片里的数字,全文在浮层里按 counter 列号',
      '⚠️ **条数是故意和稿子不一样的**:稿子摆 3 条,这里摆 5 条 —— 摆一样就证明不了「条数只改数字」。代价是逐格比对会在 `texts` 一列念出「稿 3 条注释 / 我 5 条注释」、浮层里也多两个 `<li>`,那两处**不是差异**',
    ],
  },
];

/*
 * 同意图澄清那一族:`sub` 是**指向稿子哪一态**的指针。当前基线的交付稿(`729fa43ce7`)在组件 1 的
 * 第二位插了「设计系统工作区 · 自动创建」(本页第 85 格),1-2 之后的状态号整体后移一位,
 * 下面的 `sub` 已经跟着改到新号 —— 早先写的 1-2…1-7 会把看页的人指错一格。
 */
const INPUT: Cell[] = [
  {
    gid: 45, sub: '1-1', cmp: '用户消息-文本', state: '成功 · 发送完成', family: '输入',
    node: () => msg(userMsg('把导出按钮做大一点,配色换暖一档')),
    notes: ['**已按稿子改**:深底白字、缺口挪到右下、行高 1.7、最大宽 380 —— 原来是浅底深字、缺口在右上'],
  },
  {
    gid: 46, sub: '1-3', cmp: '用户消息-文本', state: '超长消息 · 折到 6 行,文末留「…」', family: '输入',
    node: () => msg(userMsg(LONG)),
    notes: [
      '6 行的裁切是纯 CSS(`-webkit-line-clamp: 6`,折在里层 `.user-text-txt` 上而不是气泡上),这一格能比',
      NO_LAYOUT('文末那枚「…」和气泡内的「查看全部」')
        + '它们只在【真的被截断】时才挂 —— 同一段话在宽一点的面板里可能六行就说完了,那时候挂一枚「…」是在说一句不存在的下文。'
        + '⚠️ **这一页上那个省略号是 `-webkit-line-clamp` 自带的,不可点**;稿子那枚是个能点的按钮,左边还垫着一段 26px 的渐变。',
      '展开入口按 DOM / CSS / 规格 W7 走「气泡内一行『查看全部』」,不是稿子说明文字里那句「hover 浮出箭头」(盘点 §5 第 2 条,**待设计确认**)',
      '第 47 格(稿子 `1-4` hover)在稿子样式表里没有任何匹配规则,与本格无可见差异 —— 它**后来还是出了格**(并排看才证明得了「稿子这一态是空的」),见那一格的注记',
    ],
  },
  {
    gid: 47, sub: '1-4', cmp: '用户消息-文本', state: 'hover ·「…」后面浮出箭头,点开看全文', family: '输入',
    hover: true,
    node: () => msg(userMsg(LONG)),
    notes: [
      '**这一格在稿子里是死的**:`.bub.mod-clamp.is-hover` 在整张样式表里没有任何匹配规则,而气泡内的「查看全部」是常驻的 —— 所以它相对第 46 格没有任何可见差异',
      '原来这一格整个不摆(写着「出不来」)。其实按同一态渲染就行:这一页替设计师按住了 hover(`data-hover`),两格并排看正好能证明「稿子这一态是空的」',
      '⚠️ 请设计确认「折起来的长消息 hover 时到底变不变」',
    ],
  },
  {
    gid: 48, sub: '1-5', cmp: '用户消息-文本', state: '长链接 · 没有空格也要断开,不能冲出气泡', family: '输入',
    node: () => msg(userMsg('照这个页面做:https://powerformer.feishu.cn/wiki/QeXWwN6XFi8rOLk8EjScz6u9n7d?from=from_copylink&token=eyJhbGciOiJIUzI1NiJ9')),
    notes: ['`overflow-wrap: anywhere`(不是 `break-word`)—— 差别正好落在这一格:没有空格的一长串必须断开'],
  },
  {
    gid: 49, sub: '1-6', cmp: '用户消息-文本', state: '失败 · 网络或服务异常', family: '输入',
    node: () => msg({ ...userMsg('等一下,价格行的字号先别动'), sendFailed: true }),
    notes: [
      '**已建**:`ChatMessage.sendFailed`(contracts)+ 气泡下方那一行(`.msg-fail`)。原来契约里没有「这条发失败了」,所以这一格根本画不出来',
      '「重试」**常驻**,不跟着 hover 出没 —— 第 50 格的状态名就写着这一条。它**长在动作行里**(稿子 `.msg-act .keep`),和时间 / 复制并排;原来我把它另起了一行,于是那条隐藏的动作行照样占 30px,气泡到「重试」之间空出一大截',
      '⚠️ **这一态在产品里还没有人产生**:契约有 `sendFailed`、UI 也画得出来,但没有任何代码把它置上,`onResend` 也没有上游传进来 —— 这一格照的是一个还没接线的状态。接线要动 run 生命周期的错误分支,记在 `specs/current/chat-panel-feedback.md` 的 B13'
    ],
  },
  {
    gid: 50, sub: '1-7', cmp: '用户消息-文本', state: 'hover · 时间与复制浮出,重试常驻(不变色)', family: '输入',
    hover: true,
    node: () => msg({ ...userMsg('等一下,价格行的字号先别动'), sendFailed: true }),
    notes: [
      '同第 49 格的数据,这一页替设计师按住了 hover(`data-hover`):时间与复制浮出、「重试」照旧常驻',
      '**气泡 hover 不变色**(2026-08-26 用户裁决)。稿子里那条 `.msg-row:hover .bub` 在交付稿自己那一页上是**死规则** —— 普通气泡的祖先是 `.msg-me`,全文只有两格摆拍用了 `.msg-row.is-hover`,所以在原稿上 hover 本来就没有任何反应。顺带解掉了它自带的矛盾:状态名写「背景加深」,值却是 `#202020 → #494949`,白底上是变浅'
    ],
  },
  {
    gid: 51, sub: '1-8', cmp: '用户消息-文本', state: 'hover · 多行同理,复制仍在气泡下方', family: '输入',
    hover: true,
    node: () => msg(userMsg('把这一屏重做成能跑的原型,再加一个视觉风格一致的设置页,两页共用同一套间距和圆角')),
    notes: [
      '这一格由陈列页**替设计师按住 hover**(`data-hover`),和 `data-expand` 替它点开抽屉是同一个手法;产线上仍旧是鼠标停上去才浮出',
      '时间排在复制**之后**(最右):稿子的说明文字与 CSS 注释都这么写,DOM 里 `.tm` 排第一是旧的(盘点 §5 第 4 条,**待设计确认**)',
      '气泡底色 hover 时从 `--text-strong`(#202020)换成 `--text`(#494949)。⚠️ 稿子状态标题写的是「背景**加深**」,而这两个值在白底上其实是变浅 —— 按值实现,矛盾已回报(盘点 §5 第 5 条)',
      '**这一格没有常驻的「重试」,是夹具的取向不是缺口**:重试跟着 `sendFailed` 走(见第 49 / 50 格,契约字段与 `.msg-fail` 那一行都已经建好),这一格喂的是一条正常发出去的长消息,所以不该有它。**还没接线的是「谁来把 `sendFailed` 置上」**,记在 `specs/current/chat-panel-feedback.md` 的 B13',
    ],
  },
  {
    gid: 52, sub: '2-1', cmp: '用户消息-附件', state: '发送后 · 图只有缩略图,不挂文件名', family: '输入',
    node: () => msg(userMsg('', [img('首页.png', 1), img('设置页.png', 2)])),
    notes: [
      '**已按稿子改**:57px 见方、不挂文件名、也不挂序号徽标(名字只进 `aria-label`);原来两种附件都是同一张带序号和文件名的小药丸',
      '**点击语义仍是产品现有的「在编辑器里打开这个文件」**,稿子写的是「弹层看大图,多附件左右键切换」—— **待产品拍板**(盘点 §5 第 8 条),没有自己改',
      '缺第 55 格的 hover 眼睛浮层 —— 它和上一条是同一件事的两半(hover 提示 + 点击行为),一起拍',
    ],
  },
  {
    gid: 53, sub: '2-2', cmp: '用户消息-附件', state: '文字 + 附件 · 最常见的一条,附件在上文字在下',
    scroll: 'next', family: '输入',
    node: () => msg(userMsg('照这两张图把商品列表页复刻出来,规格按 md 里写的走', [
      img('首页.png', 1), img('设置页.png', 2), doc('跨端适配检查清单-v3.md', 12, 3),
    ])),
    notes: [
      '**已按稿子补上 `.msg-stack` 这一层**:附件行锁 412、气泡锁 380,两条上限各管各的,右边界照样对齐;壳子刻意不设 `width: 100%`',
      '文档卡的名字在这一页是**没截过**的整串(中间省略要量宽度,见第 59 格)',
    ],
  },
  {
    gid: 54, sub: '2-3', cmp: '用户消息-附件', state: '失败 · 重试', family: '输入',
    node: () => msg({ ...userMsg('照这两张图把商品列表页做出来', [img('首页.png', 1), doc('跨端适配检查清单.pdf', 96, 2)]), sendFailed: true }),
    notes: [
      '带附件的消息发失败,同一行「重试」;附件卡本身不变',
      '⚠️ 稿子没画文档宽卡的失败态,重试按钮放哪没有说法(S13)—— 我们统一放在气泡下方那一行'
    ],
  },
  {
    gid: 55, sub: '2-4', cmp: '用户消息-附件', state: 'hover · 浮出预览', family: '输入',
    hover: true,
    node: () => msg(userMsg('照这张图做', [img('首页.png', 1)])),
    notes: [
      '**角标已经建出来了**:卡右上角那枚眼睛(`.msg-att-eye`),hover 才浮出、触屏常驻 —— 和待发送托盘那枚「×」同一条规矩',
      '⚠️ **点击语义仍是「在编辑器里打开文件」**,不是稿子的「弹层看大图」。换语义要产品拍板(已记),所以 `aria` 照实写成「打开」',
    ],
  },
  {
    gid: 56, sub: '2-5', cmp: '用户消息-附件', state: '文档 · 出不了预览的换一张更宽的卡,不硬塞缩略图',
    scroll: 'next', family: '输入',
    node: () => msg(userMsg('', [
      doc('商品卡组件规格说明终稿.md', 12, 1), doc('埋点清单-v3.csv', 4, 2),
    ])),
    notes: [
      '**已按稿子改**:180px 宽卡、两行(主名 + 体积)、15px 文件图标;体积取 `ChatAttachment.size`(数据本来就在,只是从来没渲染过)',
      '后缀 `flex: none` 永不被吃掉 —— 原来是 CSS 尾部省略,被吃掉的正好是扩展名',
      '「哪些后缀算能出预览」**待拍板**:产品的 `looksLikeImage()` 只认 7 种位图,而稿子把 `.pdf` `.mov` 也画成 57px 方卡(盘点 §5 第 7 条)',
    ],
  },
  {
    gid: 57, sub: '2-6', cmp: '用户消息-附件', state: '图 + 文档 · 同一行,同高不同宽', family: '输入',
    node: () => msg(userMsg('', [
      img('首页.png', 1), doc('跨端适配检查清单-v3.md', 12, 2), img('设置页.png', 3),
    ])),
    notes: [
      '这一格是「57px 这个数字对不对」的判据:文档卡的自然高度(9 + 18 + 1 + 18 + 9 + 2 = 57)必须真的等于图卡边长。实现上图卡写死 57、文档卡靠 flex 默认的 stretch 跟住它,**只有一个数字要维护**',
    ],
  },
  {
    gid: 58, sub: '2-7', cmp: '用户消息-附件', state: '多附件 · 永远单行,超出横向滚动',
    scroll: 'next', family: '输入',
    node: () => msg(userMsg('', ['首页', '设置页', '列表页', '详情页', '结算页', '搜索页', '我的']
      .map((n, i) => img(`${n}.png`, i + 1)))),
    notes: [
      '**已按稿子改**:`nowrap` + `overflow-x: auto` + 藏滚动条,右对齐靠首个子元素的 `margin-inline-start: auto`(不能用 `justify-content: flex-end`,溢出内容会跑到左边滚不回去;也不能用 `width: fit-content`,叠加 `overflow-x` 会算塌成 0)',
      '行宽 412 = 6 × 64 + 28,**刻意错开卡片节拍**(卡 57 + 缝 7 = 一格 64):写 380 的话切点正好落在缝里,7 张卡看起来就是整整齐齐的 6 张。412 把切点挪到第 7 张卡的腰上 —— 这一页上能看见它被切开',
      NO_LAYOUT('两枚翻页箭头')
        + '它们**只在真的被遮住时才出**,要量 `scrollLeft / scrollWidth / clientWidth`(`scroll` + `ResizeObserver` + `resize` + `fonts.ready` 四路重算)。判据的单测在 `tests/runtime/chat/attachment-nav.test.ts`,出没出的行为在 `tests/components/chat/attachment-row-nav.test.tsx`',
    ],
  },
  {
    gid: 59, sub: '2-8', cmp: '用户消息-附件', state: '文件名过长 · 省略号切在中间,末尾保留一个词',
    scroll: 'next', family: '输入',
    node: () => msg(userMsg('', [
      doc('商品卡组件规格说明终稿-第三轮评审后.md', 18, 1), doc('埋点.csv', 2, 2),
    ])),
    notes: [
      NO_LAYOUT('中间省略的结果')
        + '`text-overflow` 只认两端,中间省略必须按可用宽度倒推 + 对头段二分,而那要量 `.msg-att-nm` 的 `clientWidth` 和文字宽度。这一页上看到的是**没截过**的整串,右侧被 `overflow: hidden` 硬切 —— 稿子那一格该是 `商品卡组件…评审后` + `.md`',
      '切法本身是纯函数、已经单测过(`tests/runtime/chat/attachment.test.ts`:中文留最后 2–3 字、拉丁留最后一个单词、`-v3` 这种版本尾巴算一个词)',
      '**阈值仍是 S12 待决**:稿子没定截断阈值、也没给拉丁名样例。现在按宽度量,字数预算只当量不到时的兜底',
      '`埋点.csv` 这张是对照组:放得下就原样不截',
    ],
  },
  ...TRAY,
  ...TAKE,
];


/* ── 边界(第 70–84 格)────────────────────────────────────────────────
 * 五个组件性质各不相同,别拿同一把尺子看:
 *  · 6 Plan 卡(70–71)—— #70 展开态**拍板不做**(D33 / S9),出格是为了让「不做」这件事留痕;
 *    #71 收起态的药丸**已实现**(2026-08-26 用户点名要),挂的是真组件
 *  · 17 Queue(72–74)—— 产品里早就有(`QueuedSendStrip`),已按稿子改过版式
 *  · 18 升级(75–77)/ 19 报错(78–80)—— 能力都在,但**都不在稿子那个形态上**,
 *    而且承载它们的实现要么 portal 到 body、要么绑死在 5000 行的 `ChatPane` 上,单挂不了
 *  · 20 暂停 / 22 重连(81–84)—— 产品里原来完全没有 UI,这一轮从零建的,可以独立挂载 */

/** 稿子第 72–74 格的三条队列文案,逐字取自稿子 —— 换一段就比不出两行 line-clamp 切在哪。 */
type QueueItems = Parameters<typeof QueuedSendStrip>[0]['items'];
const queued = (prompts: string[]): QueueItems =>
  prompts.map((prompt, i) => ({ id: `q${i + 1}`, prompt }));

/*
 * `onSteer` 必须给。第三颗动作键是**二选一**的:`onSteer` 有值才画稿子那颗
 * 74px 带字的「引导对话」(`.chat-queued-send-action-steer`),没有就退回 22px
 * 的纯图标「立即发送」。不给它,这一族三格摆出来的永远是**退回态** ——
 * 稿子画的那颗键在陈列页上一次都没出现过,也就永远量不到。
 * 判据在 `ChatPane.tsx` 的 `steerableRow`:`onSteer` 有值且这一条不带附件 / 标记。
 * 稿子第 17 组三条全是纯文本,所以三行都该是引导态,和这里的夹具一致。
 */
const queue = (prompts: string[]) => (
  <QueuedSendStrip
    items={queued(prompts)}
    onEdit={() => {}}
    onRemove={() => {}}
    onReorder={() => {}}
    onSendNow={() => {}}
    onSteer={() => {}}
  />
);

const EDGE: Cell[] = [
  {
    gid: 70, sub: '6-1', cmp: 'Plan 卡', state: '执行中 · 随进度逐条打勾', family: '边界',
    missing: '**这一格已经拍板不做,不是没做完**。D33 原话:「场景稿里那张『执行中 2/4』清单式任务进度卡不用,'
      + '不实现、不模拟」;S9 又补了一句「展开态的独立卡不做」。清单的正式落点是**组件 7 执行记录内的分段**(B17)——'
      + '也就是本页第 1 / 2 格壳里那一段「执行计划 · N 步」。'
      + '⚠️ T18 那条冲突(S9「只做胶囊 + 悬停清单」 vs B17「清单归执行记录」)**已由用户 2026-08-26 裁定**:'
      + '收起态的药丸(下一格)做,展开态这张卡照旧不做。两处读的是**同一份 TodoWrite 快照**,'
      + '但形态不同 —— 执行记录里是可展开的分段(每一步下面挂本轮的工具行),药丸浮层里是一份只读一览。',
  },
  {
    gid: 71, sub: '6-2', cmp: 'Plan 卡', state: '收起 · 只留「第 N / M 步」,悬停浮出整张清单', family: '边界',
    hover: true,
    node: () => planPill([
      ['复刻商品列表页结构与栅格', 'completed'],
      ['抽出商品卡为共享组件', 'completed'],
      ['按同一套间距做设置页', 'in_progress'],
      ['接上两页之间的跳转', 'pending'],
    ]),
    notes: [
      '**已实现**(`components/chat/PlanPill.tsx` + `runtime/chat/plan-pill.ts`),钉在 `ChatPane` 输入框上方、'
        + '排在发送队列**之前** —— 队列有内容时把药丸往上顶,两者不互相压。',
      '**计数口径按稿子来**:「第 N / M 步」的 N 是*当前正在做第几步*,不是产品 `TodoCard` 那个 `{done}/{total}`(已完成几步)。'
        + '清单里一条 `in_progress` 都没有时,第一条未完成的算当前(D36 隐式进行中)——'
        + 'codex 原生清单只有做完 / 没做完两档,没有这条规则它整份清单指不出「第几步」。',
      '**出没判据**:run 在跑 **且** 清单里还有没干完的。全做完 / 全作废、或者 run 结束,药丸整枚消失 ——'
        + '所以稿子没画的「全做完时胶囊写什么」(S17)不再是待答项:那一刻它不在屏幕上。'
        + '「还有没干完的」用的是 `todoStatusIsUnfinished`,和 daemon 盖 `endedWithUnfinishedWork` 同一个谓词。',
      '浮层里那份清单**复用 `StatusMark` 的四态圆**,没有另画一套:做完打勾并划掉、当前一颗绿球、没开始一圈虚线。'
        + '稿子每个 `<li>` 里同时写了 `.tk`(SVG 四态)和 `.mk.is-run`(绿球),靠 `li` 的类名二选一显示 ——'
        + '实测 `li.is-now` 显示绿球、其余显示 SVG,`StatusMark` 的 `running` / `ok` / `pending` 正好是同一组判据。',
      '⚠️ **两处没照抄,都是接宿主的取舍**:'
        + '① 浮层水平方向改成贴药丸左边缘开(稿子是 `left:50%` 居中)—— 产品里药丸钉在输入框的左内缩线上,'
        + '而 `.pane` 是 `overflow: hidden`,居中会被面板左边切掉约 50px(稿子那张演示卡不裁,所以看不出来);'
        + '② 「做完了」那条的划线用执行记录的 `.struck`(直接 `text-decoration`),不是稿子那条 `::after` 描出来的动效线 ——'
        + '同一件事不在两个文件里各画一遍,代价是少了「一笔划过去」的落定感。',
      '`--chat-shadow-lg` 其实**早就有了**(`ChatRoot.module.css` 亮暗两档都定义了),上一版注记说只到 `-md` 是记错了。',
      NO_LAYOUT('悬停本身')
        + '这一格由陈列页**替设计师按住**(`data-hover`),同第 42 / 51 格的手法;产线上仍旧是鼠标停上去才浮出,'
        + '键盘 Tab 到药丸也会浮出(`:focus-within`,产品这一侧补的 a11y,稿子没有)。'
        + '头顶那 136px 也是这一页的脚手架 —— 稿子自己那层 `.pdemo` 同理,产品里一个像素没搬。',
    ],
  },
  {
    gid: 72, sub: '17-1', cmp: 'Queue', state: '排队中 · 生成中按发送即进入', family: '边界',
    node: () => queue([
      '设置页也加上深色模式开关',
      '商品卡换成两列',
      '结算页那张商品缩略图也一起换掉,顺便把价格行的字号调大一档 —— 现在两页放一起看着不像一套',
    ]),
    notes: [
      '**已按稿子改**:删掉了卡头(原来是「N Queued ↩ to Send」那一行)、补了行首 mono 序号、文字从「58 字单行截断」改成 CSS 两行 `line-clamp`、去掉外框与底色只留条间发丝线、顶对齐',
      '**那条「三条轨道装四个孩子」的错位已经修好了**:`.chat-queued-send-row` 现在是 `display: flex`(把手 / 序号 / 动作 `flex: none`,正文 `flex: 1; min-width: 0`),和稿子 `.queue .q` 同一套排版模型。**这条注记原来写着「这一格现在是坏的」,那是旧话**',
      '第三条特意用稿子那句长的 —— **两行切在哪儿是这一格唯一能比的事**;原来 `summarizeQueuedPrompt` 会先把它压成一行截断,那样人认不出自己要取消的是哪一条',
      '**第三枚动作已经是稿子那颗「引导对话」**:它是二选一的 —— 真能引导(有在跑的一轮、agent 中途还读 stdin、且这一条不带附件 / 标记)时画 74px 带字的引导键,不能引导时才退回 22px 纯图标的「立即发送」并把原因挂进 tooltip。这一格的夹具给了 `onSteer`,所以摆的是引导态,和稿子对得上',
      '⚠️ **两副面孔里「立即发送」那一副稿子没画**:它是已上线能力(会 `handleStop()` 打断当前 run),照稿删掉等于砍功能。什么时候允许退回、退回时那颗键长什么样,**待产品裁**',
      '⚠️ **产品多一样稿子没有的东西**:`QueuedSendMetaChips`(附件 / 标记 / 插件 / 技能 / MCP / 连接器计数)。这一格的夹具照稿子给的是纯文本,所以芯片没出现;真实队列里带附件时它会多一行。它是「所见即所发」的信任面,删掉是能力回退',
      '拖动手柄的 tooltip 走 `od-tooltip` + `TooltipLayer` portal(稿子是 `data-tip` + `::after`)—— 静态页里两者都看不见',
    ],
  },
  {
    gid: 73, sub: '17-2', cmp: 'Queue', state: '条数多 · 限高约三行半,其余滚动', family: '边界',
    node: () => queue([
      '设置页也加上深色模式开关',
      '商品卡换成两列',
      '结算页那张商品缩略图也一起换掉',
      '搜索结果页里那张窄版卡同步改',
      '价格行的字号调大一档',
      '我的页面顶部加个头像区',
    ]),
    notes: [
      '**已按稿子改**:原来是「固定显示 4 条 + 一行『+N more queued』」,现在是 `max-height` + 滚动。稿子把 122px 的来历写死了(7×2 内边距 + 20 行高 = 34,加 1px 分隔线,3.5 × 35 ≈ 122),**露出的半行就是「下面还有」的提示**',
      '限的是**高度不是条数** —— 两行的条目多占一行时,可见条数不足三条半是对的',
      '⚠️ **这一格量的是像素,静态页只能看个大概**:`overflow-y` 的裁切在这一页上是成立的(实测列表高度正好 122px),但滚不动',
      '**行高那笔账已经重新对过**:第 72 格那条错位(轨道三条、孩子四个)修成 flex 之后,`min-height` 的地板也撤了,行高回到「7 + 20 + 7 = 34」加 1px 分隔线,「3.5 行 ≈ 122px」重新算得平。**这条注记原来写着「现在算不平」,那是旧话**',
    ],
  },
  {
    gid: 74, sub: '17-3', cmp: 'Queue', state: '出队 · 变成一条普通消息,队列少一条', family: '边界',
    node: () => (
      <>
        {msg(userMsg('设置页也加上深色模式开关'))}
        <div style={{ marginTop: 10 }}>
          {queue(['商品卡换成两列', '结算页那张商品缩略图也一起换掉'])}
        </div>
      </>
    ),
    notes: [
      '两个真组件拼在一格里:上面是 `UserMessageImpl`(出队后那条已经发出去的消息),下面是剩下两条的队列 —— 稿子这一格画的就是这两样',
      '**这一族最接近对齐的一格**:自动出队本来就实现了(空闲即取队首重放),序号重排是数组下标的自然结果,零形态差、零数据差',
      '下半截队列的行内排布同第 72 格 —— 那条错位已经修成 flex 了;上半截的用户气泡一直是对的',
      '⚠️ **一条稿子没画的边界**:AMR 余额闸门会**暂停**队列自动出队(`amrGatePausedQueueConversationsRef`),此时队列就停在那儿不动,界面上没有任何解释',
    ],
  },
  {
    gid: 75, sub: '18-1', cmp: '升级', state: '额度不足 · < 5 美金', family: '边界',
    node: () => upgrade(3.2),
    notes: [
      '**这一格已经建出来了**:`components/chat/UpgradeCard.tsx` —— 流水里的一张卡,不是弹窗、不挡发送(D4 的取向)',
      '出现时机按用户 2026-08-26 的裁决:**一轮跑完之后**(D58)',
      '⚠️ 产品原有的 `AmrLowBalanceDialog` 是居中硬阻断弹窗,两者不是一个东西 —— 那个的去留另记(T40)',
      '⚠️ 阈值:稿子这一档写的是 < 5 美金,产品现在的 `AMR_LOW_BALANCE_WARN_USD` 是 2,放大触发面要产品确认',
    ],
  },
  {
    gid: 76, sub: '18-2', cmp: '升级', state: '额度耗尽 · = 0 美金', family: '边界',
    node: () => upgrade(0),
    notes: [
      '**这一格已经建出来了**:`components/chat/UpgradeCard.tsx` —— 流水里的一张卡,不是弹窗、不挡发送(D4 的取向)',
      '出现时机按用户 2026-08-26 的裁决:**一轮跑完之后**(D58)',
      '⚠️ 产品原有的 `AmrLowBalanceDialog` 是居中硬阻断弹窗,两者不是一个东西 —— 那个的去留另记(T40)',
      '⚠️ 阈值:稿子这一档写的是 < 5 美金,产品现在的 `AMR_LOW_BALANCE_WARN_USD` 是 2,放大触发面要产品确认',
    ],
  },
  {
    gid: 77, sub: '18-3', cmp: '升级', state: '点 Upgrade 后 · 跳 Web 端,按身份分四种弹窗', family: '边界',
    node: () => (
      <div className={CAGE_UPGRADE} style={{ display: 'grid', gap: 0 }}>
        {[
          ['非 Max · Team Owner', '升级弹窗', ''],
          ['非 Max · 非 Owner', '提醒弹窗', ' — 提示联系管理员'],
          ['Max · Team Owner', '自动充值弹窗', ''],
          ['Max · 非 Owner', '提醒弹窗', ''],
        ].map(([who, kind, tail]) => (
          <div key={who} style={{ display: 'flex', gap: 9, padding: '7px 0', fontSize: 12 }}>
            <span style={{ flex: '0 0 44%', color: 'var(--text-muted)' }}>{who}</span>
            <span><b>{kind}</b>{tail}</span>
          </div>
        ))}
      </div>
    ),
    notes: [
      '⚠️ **稿子这一格本身不是 UI,是一张说明表**(四行身份 × 该出什么弹窗)—— 这里把同一张表摆出来,好让产品逐行确认,而不是留一格空白',
      '点 Upgrade 之后跳 Web 端,按身份分四种弹窗;**这四种弹窗都不在 chat 面板里**,归属在账号 / 订阅那一侧',
      '⚠️ 产品要确认:这张表今天在产品里是不是这么分的',
    ],
  },
  {
    gid: 78, sub: '19-1', cmp: '报错', state: '通用错误 · 白卡,红只留在标题那一行', family: '边界',
    node: () => errCard('任务失败', '构建到设置页时找不到商品卡组件 —— 前面抽组件那一步没落盘成功。已生成的列表页不受影响。', [['联系支持','secondary'],['导出日志','secondary'],['从失败处重试','primary']]),
    notes: [
      '**已抽成组件**:`components/chat/RunErrorCard.tsx` —— 原来是 `ChatPane.tsx` 里 200 多行内联 JSX,样式没法集中对齐、陈列页也照不出来',
      '这一层只管长什么样;「该出哪几颗按钮」是策略(授权失败 / 余额不够 / 本地跑不动各不一样),留在 ChatPane 以 `actions` 传进来',
      '⚠️ 差异清单:①产品今天是「复制详情」,稿子是「导出日志」—— chat 里根本没有导出(真正的导出挂在设置的 `ExportDiagnosticsButton`);②动作集合待产品定'
    ],
  },
  {
    gid: 79, sub: '19-2', cmp: '报错', state: '特殊错误 · 运行环境为 CLI / BYOK', family: '边界',
    node: () => errCard('本地环境跑不动这一步', '当前运行在 CLI / BYOK 环境,这一步需要云端算力。切到 Cloud 可以接着跑,已完成的部分会带过去。', [['导出日志','secondary'],['切换到 Cloud','primary']]),
    notes: [
      '同一张卡的另一档:两颗动作,主动作是「切换到 Cloud」',
      '产品里这一档走的是 `AmrGuidance`,文案与动作集合与稿子不同 —— 对齐时要合并成同一张卡'
    ],
  },
  {
    gid: 80, sub: '19-3', cmp: '报错', state: '联系支持 · 全局弹窗', family: '边界',
    node: () => supportDialog(),
    notes: [
      '**已建**:`components/chat/SupportDialog.tsx`。渠道由调用方给,组件本身不硬编任何社群地址',
      'Discord 用的是产品里已有的邀请链接;⚠️ **飞书社群的地址产品还没给**,这里先留空 —— 有了填进去即可',
      '⚠️ 归属:它不只服务 chat(设置 / 帮助菜单也要能进),落在 `components/chat/` 下是临时位置,要跟产品确认最终归属'
    ],
  },
  {
    gid: 81, sub: '20-1', cmp: '暂停任务', state: '默认 · 一句话,到此为止', family: '边界',
    node: () => <div className={CAGE_EDGE}><PauseLine /></div>,
    notes: [
      '**只展示真正的 paused-task 状态**:`runStatus: canceled` / `cancelOrigin: user_stop` 是 run 终止,由回合 footer 报「已手动停止」,不能拿来驱动这一行',
      '当前产品运行路径不挂载这一行;保留组件 20 的设计形态,等独立 paused-task 领域事实接入',
    ],
  },
  {
    gid: 82, sub: '22-1', cmp: '重连', state: '重连中 · 第几次 / 共几次,可展开看详情', family: '边界',
    node: () => <div className={CAGE_EDGE}><Reconnect attempt={2} max={5} /></div>,
    notes: ['展开箭头默认不渲染:传输层今天分不出断因,摆一颗点开是空的箭头更糟 —— 传了 `onShowDetail` 才出'],
  },
  {
    gid: 83, sub: '22-2', cmp: '重连', state: '最后一次 · 5/5,下一格就是失败', family: '边界',
    node: () => <div className={CAGE_EDGE}><Reconnect attempt={5} max={5} /></div>,
    notes: ['读数在一段掉线里单调递增,不跟着传输层的重连预算倒退(预算认 keepalive,读数只认真事件)'],
  },
  {
    gid: 84, sub: '22-3', cmp: '重连', state: '重连失败 · 次数用尽,交回给人', family: '边界',
    node: () => <div className={CAGE_EDGE}><Reconnect attempt={5} max={5} exhausted onReconnect={() => undefined} /></div>,
    notes: [
      '**纠正一条盘点里的错**:失败行不是红边红底 —— 稿子里后面的规则把 `.tool.is-fail` 压掉了,实测三态都是透明边透明底,失败唯一的颜色是那枚图标',
      '「重新连接」按钮比稿子矮 1px(26 vs 27):它用的是共享 primitive,不为 1px 分叉',
    ],
  },
];

/* ── 稿子新增(第 85–90 格)──────────────────────────────────────────────
 *
 * 当前基线的交付稿(`729fa43ce7`,`build-matrix.mjs` 的 `DRAFT_COMMIT` 是它唯一的出处)
 * 比镜像页原来照的那一版多了六态:组件 1 多一个「设计系统工作区 · 自动创建」,
 * 组件 5 多了下拉单选 / 颜色 / 数值滑杆各自的待答与已答态。
 *
 * **它们排在前 84 格之后,不插回各自家族里**:`diff-cells.mjs` 按 `.cell` 的**下标**配
 * gid,插回中间会让后面每一格整体错位,连带上面所有注记里的「第 N 格」全部指错。
 * 稿子那一侧的编号由 `docs/design/chat-mirror/build-matrix.mjs` 的 `ORDER` 给,
 * 两边同序 —— 那份 `ORDER` 的末六项正是这六格。
 */

/** 交付稿 5-2 的十六种语言,逐字取自 `data-language` / `.language-code`。 */
const LANGS: Array<[string, string, string]> = [
  ['简体中文', 'ZH-CN', '常用语言'],
  ['English', 'EN', '常用语言'],
  ['日本語', 'JA', '常用语言'],
  ['Español', 'ES', '常用语言'],
  ['繁體中文', 'ZH-TW', '更多语言'],
  ['Português', 'PT', '更多语言'],
  ['Français', 'FR', '更多语言'],
  ['Deutsch', 'DE', '更多语言'],
  ['Italiano', 'IT', '更多语言'],
  ['한국어', 'KO', '更多语言'],
  ['Русский', 'RU', '更多语言'],
  ['العربية', 'AR', '更多语言'],
  ['हिन्दी', 'HI', '更多语言'],
  ['ไทย', 'TH', '更多语言'],
  ['Tiếng Việt', 'VI', '更多语言'],
  ['Bahasa Indonesia', 'ID', '更多语言'],
];
const ASK_LANG: QuestionForm = {
  id: 'q6',
  title: '还需要确认一件事',
  questions: [{
    id: 'lang',
    label: '这次对话使用哪种语言?',
    type: 'select',
    allowCustom: false,
    // `group` + `trailingLabel` 就是「查找型单选」的开关(见 question-form.ts 的
    // `usesLookupLayout`):第一组直接摊开并带组名,其余各自收在一枚开关后面
    // (开关上的字是 host 的「更多选项」,组名显示在展开后的列表里)。
    // 稿子的「常用语言 / 更多语言」正好落在这条规则上。
    options: LANGS.map(([label, code, group]) => ({ label, value: label, group, trailingLabel: code })),
  }],
};
/** 交付稿 5-7 的八枚预设色,逐字取自 `.color-swatch[data-color]`。 */
const COLOR_PRESETS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'];
const ASK_COLOR: QuestionForm = {
  id: 'q7',
  title: '还需要确认一件事',
  questions: [{
    id: 'theme',
    label: '工作区的主题色用哪一个?',
    type: 'color',
    // 预设色走 `options`(`colorPresetsFor` 从这里取);不给就落到组件自带的八枚,
    // 值恰好同一套 —— 显式给出来是为了让「稿子换一枚色我们就跟着红」这件事成立。
    options: COLOR_PRESETS.map((hex) => ({ label: hex, value: hex })),
  }],
};
const ASK_AMOUNT: QuestionForm = {
  id: 'q8',
  title: '还需要确认一件事',
  questions: [{
    id: 'density',
    label: '版面密度调到哪一档?',
    type: 'range',
    min: 1,
    max: 5,
    step: 1,
  }],
};

const DRAFT_NEW: Cell[] = [
  {
    gid: 85, sub: '1-2', cmp: '用户消息-文本', state: '设计系统工作区 · 自动创建', family: '稿子新增',
    // 照抄产品的调用点(`ChatPane.tsx` 的 `UserStatusCard`),两个字串走同一份语言包
    node: () => (
      <div className={CAGE_STATUS}>
        <UserStatusCard
          title={T('chat.designSystemStatus.title')}
          description={T('chat.designSystemStatus.description')}
        />
      </div>
    ),
    notes: [
      '**这张卡有过两次相反的决定**:先被主动删掉(改走类型化语言字典 + 标准用户气泡),**2026-09-02 用户裁决要求按稿子 1:1 对齐**,于是又建了回来(`components/chat/UserStatusCard.tsx`)',
      '⚠️ **触发条件还没接线**:`ChatPane.tsx` 的调用点现在写的是 `{false ? <UserStatusCard …> : <UserBubble …>}` —— 组件在、文案在、样式在,但产线上还没有任何一条路会把它渲染出来。这一格照的是组件本身',
      '⚠️ **一条反向断言还锁着旧版**:`ChatPane.streaming.test.tsx` 里那句「`.user-status-card` 必须为 null」钉的是被撤掉的那一版,和新裁决直接冲突,接线时要一起翻转',
      '⚠️ **稿子这一格的文案是英文**(「Creating design system workspace」),而整页别的格子都是中文;这一格挂的是真语言包的中文译文,所以逐字比会差 —— 是稿子那一格没跟着换语言,不是我们译错',
    ],
  },
  askCell(86, '5-2', '下拉单选 · 常用语言先展示,点「更多语言」展开;超过 6.5 行可上下滚动', ASK_LANG, {
    notes: [
      '**产品已有这一路**:`select` + 选项带 `group` / `trailingLabel` 就走「查找型单选」的版式,组名与行尾语言代码都是契约里的字段,不是为这一格现编的',
      NO_LAYOUT('「更多语言」展开与 6.5 行之后的滚动')
        + '展开由组件内部 state 驱动(点一下才开),静态陈列页点不了;限高滚动要量像素,这一页也量不了。两条都要起真实页面看',
      '⚠️ **开关上那句字不一样,而且是有意的**:稿子写「更多语言」,产品写「更多选项」(`qf.moreOptions`)—— 这个折叠器是**任意选项列表**共用的(时区 / 国家 / 字体走同一条路),把语言那一档的措辞焊进通用组件就错了,产品原话「更多语言 改成 更多选项」。组名「更多语言」仍旧显示在展开后的列表里,模型的编排意图没有丢',
    ],
  }),
  askCell(87, '5-7', '颜色选择 · 预设颜色、自定义色值与实时预览', ASK_COLOR, {
    draft: { theme: '#3b82f6' },
    notes: [
      '**产品已有这一路**:`ColorChoice`(预设色 / 系统取色器 / Hex 输入三条路共用同一个答案值,预览由 `--qf-choice-color` 驱动)',
      '⚠️ **色块的可读名不一样**:稿子写「红色 #ef4444」那种「颜色名 + 值」,我们只念 hex —— 我们没有一份 19 语的颜色名表,现编一份等于凭空造一套产品文案。hex 是这颗色块准确的名字,不是近似',
      '默认值摆稿子那一格的 `#3b82f6`(蓝),所以第五枚色块是按下态',
    ],
  }),
  askCell(88, '5-8', 'Amount Slider · 可编辑数值与滑动同步,无刻度点', ASK_AMOUNT, {
    draft: { density: '2' },
    notes: [
      '**产品已有这一路**:`AmountChoice`(上方数字可直接编辑,与滑杆双向同步;轨道里只有滑杆,稿子这一版把上一版的刻度光点整排删掉了)',
      '⚠️ **单位「档」出不来**:稿子读数是 `2` + 一枚 `.amount-unit` 的「档」,契约里**没有 unit 这个字段**,所以我们只念数字。补一个字段要产品裁一次(它会跟着进已回答那一行,见第 90 格)',
      '⚠️ **上下限那一行稿子还带一句人话**:稿子写 `1 · 疏朗` / `5 · 紧凑`,我们只念 `1` / `5` —— 同 unit,契约里没有「给两端配一个说法」这个字段。摆的档位与稿子同为 2',
    ],
  }),
  askCell(89, '5-14', '已回答 · 颜色保留色块和 Hex 值', ASK_COLOR, {
    answered: { theme: '#3b82f6' },
    notes: [
      '**产品已有这一路**:颜色答案单独走一条,带一块真色块回去(`AnsweredValue` 的 `--answer-color`),并按 `isShortValueAnswer` 落在稿子的 `.ab.mod-value` 那一档行内垂直居中上',
      '⚠️ **标签念的是问题原文**:稿子这一行写「主题色」,我们写「工作区的主题色用哪一个?」—— 契约里一道题只有一个 `label`,没有「短标签」这一档。要对上得给 `FormQuestion` 加字段,**待产品裁**',
    ],
  }),
  askCell(90, '5-15', '已回答 · 数值滑杆收成标签与档位', ASK_AMOUNT, {
    answered: { density: '2' },
    notes: [
      '**产品已有这一路**:`numeric: true` 让数值答案和颜色同归稿子说的「短答案」,一起走 `.ab.mod-value`',
      '⚠️ 同第 89 格:标签念的是问题原文而不是稿子的「版面密度」',
      '⚠️ 同第 88 格:值只有 `2`,稿子是 `2 档` —— 单位在契约里不存在',
    ],
  }),
];

const CELLS: Cell[] = [
  ...EXECUTION.map((c) => ({ ...c, family: c.family ?? '执行记录' })),
  ...UNDERSTANDING,
  ...OUTRO,
  ...INPUT,
  ...EDGE,
  ...DRAFT_NEW,
];

/* ── 端到端 · 真实形态回归(**不在交付稿的陈列格之内**)────────────────────
 *
 * 上面陈列格是**逐个组件摆拍**:一格一个实体、一份夹具、一条分支。
 * 产品负责人 2026-08-26 指认它会骗人 ——「compare 里看起来都实现了,为什么本地跑起来
 * 还是旧的?你的 compare 是假的吗?」两个盲区,这一族是冲着第一个建的:
 *
 *  1. **只照得到「我喂了夹具的那条分支」**。真实运行时可能走另一条,而那条在陈列格里
 *     没有格子,就永远照不到。活例子包括带附件的完整用户消息、`producedFiles`、
 *     「一轮两张壳」、失败轮的报错卡、done 密钥协议。runContext / applied plugin
 *     数据仍由夹具携带,但产品当前明确不在历史消息上展示对应标签。
 *  2. **摆拍的宿主曾经是理想的**。这一条已经由上一个提交(旧聊天皮肤那次)收掉了 ——
 *    陈列格现在也套在 `.app` 里、`routines.css` 那一层也内联进来了。这一族沿用同一条祖先链,
 *     并且在它下面再补一层 `.chat-log`:消息之间的间距、气泡与执行记录壳的相对位置,
 *     都是**摆一个组件看不见、摞成一条会话才看得见**的东西。
 *
 * 所以它们**不是「第 85 格」**:没有对应的交付稿截图,不参与逐格比对。
 * `diff-cells.mjs` 按 `.cell` 取格、`build-compare.mjs` 按 `<header>` 无属性那条正则
 * 取表头 —— 这一族的类名(`e2ecell` / `e2ehead`)两条都不命中,而且整段排在陈列格之后,
 * 位置索引也动不到。
 */

/** 产品的祖先链上那一层(和陈列格现在用的是同一个)。`.app .msg…` 那一族规则靠它生效。 */
const LIVE_HOST = 'app';
/**
 * 这一族**自己的笼子**,和 `.app` 分开。
 *
 * 别拿 `.app` 当笼子:陈列格现在也在 `.app` 底下,而它们外面那层接缝的类名正是 `root` ——
 * `NextStepActions.module.css` 摘掉哈希之后也有一个 `.root`,`scope(css, 'app')` 会让
 * **每一格**都套上一圈下一步引导的边框和渐变底(`scope()` 的注释里记着这个坑)。
 * 端到端这一族的接缝走 `vars`,笼子走这个类,两边都不会撞。
 */
const CAGE_LIVE = 'cage-live';

interface LiveCell {
  /** 页面上的编号 —— 刻意不用 `#N`,免得看着像陈列格里的一格 */
  id: string;
  title: string;
  state: string;
  /** 这一格专门去照陈列格照不到的哪几条分支 */
  covers: string[];
  node: () => ReactElement;
  notes?: string[];
}

const LIVE_SENT_AT = new Date(2026, 7, 26, 14, 31).getTime();
const LIVE_REPLY_AT = LIVE_SENT_AT + 4_000;

/** 一条真实的用户消息。字段名与 `ChatMessage` 一一对应,不另造形状。 */
const liveUser = (over: Record<string, unknown> = {}) => ({
  id: 'live-u1',
  role: 'user' as const,
  content: '照这两张图把商品列表页复刻出来,规格按 md 里写的走',
  createdAt: LIVE_SENT_AT,
  ...over,
});

/**
 * 一条真实的助手消息。`events` 是唯一的内容来源,和产线一样。
 *
 * 产线上产物卡是 agent 用 `<od-focus show="…">` **声明**出来的,不再从产出清单
 * 推断;所以带产出的格子这里替它把声明补上,陈列页照的才是产线上真会出现的样子。
 */
const liveAssistant = (events: PersistedAgentEvent[], over: Record<string, unknown> = {}) => {
  const message = {
    id: 'live-a1',
    role: 'assistant' as const,
    content: '',
    runId: 'live-r1',
    agentId: 'claude',
    agentName: 'Claude Code',
    runStatus: 'succeeded' as const,
    startedAt: LIVE_REPLY_AT,
    endedAt: LIVE_REPLY_AT + 72_000,
    createdAt: LIVE_REPLY_AT + 72_000,
    producedFiles: [] as unknown[],
    events,
    ...over,
  };
  const produced = message.producedFiles as { name?: string }[];
  if (produced.length > 0) {
    message.events = [
      ...message.events,
      {
        kind: 'artifact_focus',
        show: produced.map((file) => file.name).filter(Boolean),
      } as unknown as PersistedAgentEvent,
    ];
  }
  return message;
};

/** `ProjectFile` 形状的产出条目 —— `producedFiles` 走的就是这一份。 */
const producedFile = (name: string, kind: string, mime: string, sizeKb: number) => ({
  name, path: name, size: sizeKb * 1024, mtime: LIVE_REPLY_AT + 60_000, kind, mime,
});

/**
 * 一整轮:用户消息 → 助手消息 →(可选)ChatPane 挂在消息列表之后的东西。
 *
 * **不手捏中间层**:两个组件都是产品的调用点原样搬过来的,连 `errorCardOwnerId`
 * 这种只有 `ChatPane` 才算得出来的字段也照抄语义(见 E2E-5)。
 */
const liveTurn = (
  user: unknown,
  assistant: unknown,
  opts: {
    applied?: unknown[];
    errorCardOwnerId?: string | null;
    /** 产品把报错卡挂在消息列表**之后**,不在 `AssistantMessage` 里面 */
    trailing?: ReactElement;
    /** 产物卡上的「发布 / 导出」由宿主给回调才出;不给就是产品没给的那条分支 */
    artifactActions?: boolean;
  } = {},
) => (
  <div className="chat-log">
    <UserMessageImpl
      message={user as never}
      projectId="p1"
      onRequestOpenFile={() => {}}
      onRequestPluginDetails={() => {}}
      onRequestDesignSystemDetails={() => {}}
      t={T}
      appliedContextItems={(opts.applied ?? []) as never}
    />
    <AssistantMessage
      message={assistant as never}
      streaming={false}
      projectId="p1"
      conversationId="c1"
      isLast
      errorCardOwnerId={opts.errorCardOwnerId ?? null}
      onRequestOpenFile={() => {}}
      onFeedback={() => {}}
      onForkFromMessage={() => {}}
      {...(opts.artifactActions
        ? { onArtifactShare: () => {}, onArtifactDownload: () => {} }
        : {})}
    />
    {opts.trailing}
  </div>
);

/*
 * 本轮的 done 密钥。**走产线的那条协议**:daemon 每轮铸一个 nonce,先发一条
 * `done_key` 事件,再让 agent 在正文里吐 `<od-done key="…"/>` —— 那一枚才是
 * 「过程到此为止、下面是结论」的分界(`packages/contracts/src/api/done-marker.ts`)。
 *
 *陈列格里**一条 `done_key` 都没有**,所以那边跑的一直是「没有 key」的老判据分支。
 * 这一族喂真的密钥,顺手把新协议也照进来。
 */
const LIVE_DONE_KEY = 'a7f3c91ed2b40561';
const doneKey = (): PersistedAgentEvent => ({ kind: 'done_key', key: LIVE_DONE_KEY });
/** 结论段:标记和正文在同一条 text 事件里,和 agent 真实吐字的样子一致 */
const conclusion = (text: string): PersistedAgentEvent =>
  ({ kind: 'text', text: `<od-done key="${LIVE_DONE_KEY}"/>${text}` });

/** 一轮里最常见的那段执行记录:想一下 → 出清单 → 逐条干活 → 收尾说一句。 */
const LIVE_TURN_EVENTS: PersistedAgentEvent[] = [
  doneKey(),
  { kind: 'thinking', text: '两张图是同一套栅格,先复刻列表页,再拿它的商品卡去拼设置页。' },
  ...todos('lt1', [
    ['复刻商品列表页', 'in_progress'],
    ['抽出商品卡为共享组件', 'pending'],
  ]),
  ...call('lt-r0', 'Read', { file_path: '首页.png' }, { startedAt: 0, completedAt: 1_200 }),
  ...call('lt-w0', 'Write', { file_path: '商品列表页.html', content: LINES }),
  ...todos('lt2', [
    ['复刻商品列表页', 'completed'],
    ['抽出商品卡为共享组件', 'in_progress'],
  ]),
  ...call('lt-w1', 'Write', { file_path: '商品卡.html', content: LINES64 }),
  ...call('lt-b0', 'Bash', { command: 'npm run build', description: '跑一遍,看两页能不能通' },
    { content: '✓ built in 2.14s (2 pages)', startedAt: 60_000, completedAt: 72_000 }),
  // 收尾那一次清单快照。**不省**:省掉之后最后一条 todo 停在 `in_progress`,
  // 回合状态行会说「已停止,仍有未完成任务」—— 那是 E2E-4 专门去照的那一态,
  // 这一格要的是干干净净跑完的样子,两格并排才看得出差在哪
  ...todos('lt3', [
    ['复刻商品列表页', 'completed'],
    ['抽出商品卡为共享组件', 'completed'],
  ]),
  conclusion('商品列表页做完了,商品卡已经抽成共享组件,改一处两页都跟着变。'),
];

const LIVE: LiveCell[] = [
  {
    id: 'E2E-1',
    title: '一整轮 · 带上下文数据的设计请求',
    state: '成功 · 用户消息(附件 + 气泡,上下文标签隐藏)→ 执行记录 → 结论 → 回合状态行',
    covers: [
      '用户消息仍携带 `appliedContextItems`,但历史流水不再渲染 `msg-applied-context` / `msg-run-context-row`',
      '一条消息上附件行 + 气泡同时在,且隐藏的上下文数据不改变两者布局',
      '执行记录壳与它上下两条消息的**间距**(`.chat-log` 的 gap)—— 单摆一个壳看不见这件事',
    ],
    node: () => liveTurn(
      liveUser({
        content: '照这两张图把商品列表页复刻出来,规格按插件里那套走',
        sessionMode: 'design',
        attachments: [img('首页.png', 1), img('设置页.png', 2)],
      }),
      liveAssistant(LIVE_TURN_EVENTS),
      {
        applied: [
          { kind: 'plugin', title: '像素风组件库', pluginId: 'pixel-kit' },
          { kind: 'skill', title: '前端交付规范' },
          { kind: 'design-system', title: 'Nexu Design' },
        ],
        artifactActions: true,
      },
    ),
    notes: [
      '**上下文标签按产品裁决隐藏**:这里只验证数据存在时正文、附件与回复仍正常渲染',
      '✅ **气泡这一条是「已经修好了」的现场**:浏览器里量到 `background rgb(32,32,32)` / `color rgb(255,255,255)` / '
        + '`border-radius 12px 12px 4px`,和第 45 格逐值相同 —— 上一个提交(旧聊天皮肤那次)删掉了 `routines.css` 里'
        + '那条把气泡刷成 `#ededed` 的规则,这一格是它在**一整条会话里**也成立的证据。'
        + '这一族存在的意义正是这个:同一件事在摆拍里对上,不等于串起来也对得上',
      '🐞 **这一轮出了两张壳,而开头只有一句 thinking**:分张的判据是「清单之前那张壳里有没有东西」,而一句想法就算「有东西」。'
        + '也就是说**产线上绝大多数轮次都会摞两张卡**(agent 先想一句几乎是常态)。陈列格看不到这件事 —— `renderCell` 只取 `shells[shells.length - 1]`,'
        + '第 2 格的夹具其实也分了张,那一句 thinking 在陈列页上从来没出现过。要不要按「只有一句 thinking 时不分张」收一收,**待产品裁**',
      '🐞 **两张壳头写着同一个耗时(都是 1m 12s)**:`thinking` 事件不带时刻,第一张壳因此一件带时刻的事都没有,'
        + '`shellElapsed` 按注释里写的「没有自己的跨度就退回轮次跨度」把整轮的耗时给了它。'
        + '回退本身是有意的,但它在**最常见的那条路径**上正好制造出 `build-turn-blocks` 自己点名反对的画面 ——'
        + '「两张都写『已完成』、耗时还都是同一个数,读起来像同一件事说了两遍」。这一轮**没有顺手改**',
    ],
  },
  {
    id: 'E2E-2',
    title: '一整轮 · 消息带工作区上下文数据',
    state: '成功 · CURRENT / Using 标签隐藏,正文与 agent 上下文数据保留',
    covers: [
      '用户消息带 `runContext.workspaceItems`,但不再渲染 `ActiveWorkspaceContextChip`',
      '工作区与设计系统条目仍保留在消息数据中,不会因为 UI 隐藏而被删除',
      '历史消息没有 `msg-run-context-row`,避免 CURRENT / Using 标签占用纵向空间',
    ],
    node: () => liveTurn(
      liveUser({
        content: '照现在打开的这个预览调一下价格行的字号',
        sessionMode: 'design',
        runContext: {
          workspaceItems: [
            { id: 'w1', kind: 'file', label: '商品列表页.html', path: '商品列表页.html', tabId: 'tab-1' },
            { id: 'w2', kind: 'browser', label: '商品列表页 · 预览', url: 'https://example.com/list' },
            { id: 'w3', kind: 'design-system', label: 'Nexu Design' },
          ],
        },
      }),
      liveAssistant([
        doneKey(),
        { kind: 'thinking', text: '先看一眼现在的字号阶梯,别把标题和价格行拉到同一档。' },
        ...call('w-r0', 'Read', { file_path: '商品列表页.html' }, { startedAt: 0, completedAt: 900 }),
        ...call('w-e0', 'Edit', { file_path: '商品列表页.html', old_string: LINES2, new_string: LINES4 },
          { startedAt: 900, completedAt: 6_300 }),
        conclusion('价格行调到 15px 了,和标题差一档,行高没动。'),
      ]),
      {
        // 仍然喂入 applied context,验证隐藏只发生在呈现层。
        applied: [{ kind: 'design-system', title: 'Nexu Design' }],
        artifactActions: true,
      },
    ),
    notes: [
      '喂了三条 `workspaceItems` 和一条 applied design-system,页面仍不出现 CURRENT / Using；数据链由独立 provider / daemon 测试守住',
    ],
  },
  {
    id: 'E2E-3',
    title: '一整轮 · 本轮产出三张卡(含拿不出预览图的 .md)',
    state: '成功 · 生图轮:没有 Write/Edit 工具行,产出全靠 producedFiles',
    covers: [
      '助手消息带 `producedFiles` —— 走的是 `ProducedFiles` 那条分支,陈列格的第 30–33 格走的是另一条(`FileOpsSummary`)',
      '`.md` 这种拿不出预览图的产出 —— `producedArtifactCardKind` 给它 `doc` 档卡',
      '同一行里 html / image / doc **三种卡混排**,陈列格每格只摆一种',
    ],
    node: () => liveTurn(
      liveUser({ content: '把这三样东西一起产出来:列表页、一张对齐稿、一份交接说明' }),
      liveAssistant(
        [
          doneKey(),
          { kind: 'thinking', text: '交接说明写 md 就行,不用做成页面。' },
          ...call('p-g0', 'Bash', { command: 'od media generate 商品卡对齐稿' },
            { content: gen('商品卡对齐稿.png'), startedAt: 0, completedAt: 9_600 }),
          conclusion('三样都产出来了,交接说明里写了两页共用的那套间距。'),
        ],
        {
          producedFiles: [
            producedFile('商品列表页.html', 'html', 'text/html', 48),
            producedFile('商品卡对齐稿.png', 'image', 'image/png', 320),
            producedFile('交接说明.md', 'md', 'text/markdown', 6),
          ],
        },
      ),
      { artifactActions: true },
    ),
    notes: [
      '**两条产出分支的准入名单不一样,这一格是特意去照另一条的**:有 Write/Edit 工具行时走 `FileOpsSummary`,它用严格的 `artifactCardKind()`,`.md` **进不了卡**、掉到下面那条文本行里;没有工具行时走 `ProducedFiles`,它用 `producedArtifactCardKind()`,`.md` 出 `doc` 档卡。同一个 `.md`、同一轮产出,画法取决于 agent 用没用 Write —— **待产品裁一次**',
      '缩略图与 html 卡的 iframe 都指向 daemon 的 `/api/projects/:id/raw/…`,离开 daemon 打不开,格子里是占位底色。要比的是三张卡的尺寸、圆角、栅格与右上角动作',
    ],
  },
  {
    id: 'E2E-4',
    title: '一整轮 · 两张壳(先散活、后清单)',
    state: '成功 · 第一张壳装「还没出清单时干的活」,第二张装清单',
    covers: [
      '一轮里**两张 `ExecutionShell` 摞在一起**的形态 ——陈列格每格只出一张壳(`renderCell` 只取 `shells[shells.length - 1]`),这条分支在陈列页上从来没出现过',
      '**第一张壳里装着真的工具行**(Read + Grep),不只是一句 thinking —— 和 E2E-1 那种「只说了一句就分张」并排看,才看得出分张判据宽到什么程度',
      '两张壳**各自的耗时**(每张壳定死在自己结束的那一刻,不是共用一个轮次计时),以及第一张转「已完成」、第二张接着跑时两个壳头并排的样子',
    ],
    node: () => liveTurn(
      liveUser({ content: '先看看现在这套代码怎么组织的,然后按同一套间距把设置页做出来' }),
      liveAssistant([
        doneKey(),
        { kind: 'thinking', text: '先摸清楚现有结构再动手,免得清单写歪。' },
        ...call('s-r0', 'Read', { file_path: '商品列表页.html' }, { startedAt: 0, completedAt: 2_400 }),
        ...call('s-s0', 'Grep', { pattern: '商品卡' },
          { content: 'a.css:1\nb.css:2\nc.css:3', startedAt: 2_400, completedAt: 3_100 }),
        ...todos('s-p1', [
          ['按同一套间距做设置页', 'in_progress'],
          ['接上两页之间的跳转', 'pending'],
        ]),
        ...call('s-w0', 'Write', { file_path: '设置页.html', content: LINES140 }),
        ...todos('s-p2', [
          ['按同一套间距做设置页', 'completed'],
          ['接上两页之间的跳转', 'in_progress'],
        ]),
        ...call('s-e0', 'Edit', { file_path: '商品列表页.html', old_string: LINES2, new_string: LINES4 },
          { startedAt: 40_000, completedAt: 72_000 }),
        conclusion('设置页做好了,两页之间的跳转也接上了。'),
      ]),
      { artifactActions: true },
    ),
    notes: [
      '分张的判据是「**清单之前那张壳里有没有东西**」(T34 / 2026-08-26 裁决):这一格清单之前跑了 Read + Grep,所以分张;光有清单不分张',
      '两张壳都**默认收起**(D18),这一格没有替设计师点开 —— 端到端那一族要照的是「产线上打开会话第一眼看到什么」,替它摊开就不是第一眼了',
      '⚠️ **这一格的回合状态行说的是「已停止,仍有未完成任务」,而 `runStatus` 是 succeeded**:'
        + 'agent 最后那次 Edit 之后没再发一次清单快照(注释里写着「有的干脆整轮只发一次」),'
        + '最后一条 todo 停在 `in_progress`,`unfinishedTodosFromEvents` 就据此判定「还有没干完的」。'
        + 'E2E-1 补了收尾快照,状态行是「已完成」—— **两格并排看的就是这个差**。'
        + '这条路径在产线上很常见,状态行要不要以 `runStatus` 为准,**待产品裁**',
    ],
  },
  {
    id: 'E2E-5',
    title: '一整轮 · 失败轮 + 报错卡',
    state: '失败 · 壳头转失败态、回合状态行让位、报错卡挂在消息之后',
    covers: [
      '`runStatus: "failed"` 的一整轮 ——陈列格的第 3 格只有壳,没有它上下文里的用户消息与报错卡',
      '`errorCardOwnerId` 这条**只有 `ChatPane` 才算得出来**的分支:命中时消息内的错误药丸不出、回合状态行 `hideRunStatus`',
      '报错卡与上面那条助手消息的间距、以及「一件事到底谁来说」的分工',
    ],
    node: () => liveTurn(
      liveUser({ content: '把商品卡抽成共享组件,两页都换过去' }),
      liveAssistant(
        [
          doneKey(),
          { kind: 'thinking', text: '先把卡抽出来,再逐页替换引用。' },
          ...todos('f-p1', [['按现有结构重做这一屏', 'in_progress']]),
          ...call('f-r0', 'Read', { file_path: '商品列表页.html' }, { startedAt: 0, completedAt: 700 }),
          ...call('f-b0', 'Bash', { command: 'npm run build', description: '构建产物,看能不能跑通' },
            { content: '✗ Could not resolve "./ProductCard" from src/pages/List.tsx', isError: true, startedAt: 700, completedAt: 4_000 }),
          { kind: 'status', label: 'error', detail: 'Could not resolve "./ProductCard"' },
        ] as PersistedAgentEvent[],
        { runStatus: 'failed' as const },
      ),
      {
        errorCardOwnerId: 'live-a1',
        trailing: (
          <RunErrorCard
            dataKind="run-recovery"
            title="任务没能跑完"
            description="构建在替换商品卡引用那一步失败了,已经写好的两个文件还在。"
            actions={(
              <>
                <button type="button" className="chat-error-action">导出日志</button>
                <button type="button" className="chat-error-action">从失败处重试</button>
              </>
            )}
          />
        ),
      },
    ),
    notes: [
      '`errorCardOwnerId` 传的是这条助手消息自己的 id —— 产品里 `ChatPane` 只在「最后一条失败的助手消息」上这么传。命中之后消息内那枚灰色错误药丸不渲染(避免和卡说两遍),回合状态行也把状态词让给卡',
      '**报错卡的样式在这一族里是另挂一份的**:陈列格第 78–80 格把 `RunErrorCard.module.css` 关进 `cage-err` 笼子,这一族关进 `cage-live`(两边互不影响,见 `scope()` 那段注释)',
      '⚠️ 卡上那两颗动作是**照抄 `ChatPane` 的裸 `<button class="chat-error-action">`**,不是稿子第 78 格那套带图标的 `Button` —— 产品今天就是这两套并存,对齐时要收成一套',
    ],
  },
];

function renderLive(cell: LiveCell): string {
  return dehash(renderToStaticMarkup(
    <I18nProvider initial="zh-CN">
      {/* 产品的祖先链:`.app`(ProjectView)→ 接缝(ChatPane 的 `chatSeam`)→ `.chat-log`。
          接缝这里用 `vars` 而不是 `root`:`root` 会和几份 CSS Module 摘掉哈希后的
          `.root` 撞名(见 `scope()`),而产品里接缝本来就是抹在已有元素上的那一种。 */}
      <div className={`${LIVE_HOST} ${CAGE_LIVE}`}>
        <div className="vars" data-chat-root="">
          {cell.node()}
        </div>
      </div>
    </I18nProvider>,
  ));
}

function renderCell(cell: Cell): string {
  if (cell.node) {
    return dehash(renderToStaticMarkup(
      <I18nProvider initial="zh-CN"><div className="app"><div className="root" data-chat-root="">{cell.node()}</div></div></I18nProvider>,
    ));
  }
  const blocks = buildTurnBlocks({ events: cell.events ?? [], runStatus: cell.run, nowMs: 31_000 });
  const shells = blocks.filter((b): b is ShellData => b.kind === 'shell');
  const shell = shells[shells.length - 1];
  if (!shell) return '';
  return dehash(renderToStaticMarkup(
    <I18nProvider initial="zh-CN">
      {/* `.app` 这一层是**真实产品的祖先**。不套它,陈列页就看不见那一整层
          `.app .msg…` 的旧皮肤规则(它们靠多一个祖先把特异性拔高,稳压按稿子写的那些)——
          于是同一个组件在陈列页里是一个样、在产品里是另一个样。
          用户连着截了四次图问「这个消息怎么还是这个样式」,根因就在这儿。 */}
      <div className="app"><div className="root" data-chat-root="">
        <ExecutionShell shell={shell} deferCollapsedBodies={false} />
      </div></div>
    </I18nProvider>,
  ));
}

describe('镜像陈列页', () => {
  it('每一格都真的渲染出了东西,编号与 matrix-82.html 对得上', () => {
    for (const cell of CELLS) {
      const html = renderCell(cell);
      if (cell.missing) continue;              // 出不来的格子只出说明,不断言实体
      expect(html.length, `#${cell.gid} ${cell.sub} 渲染为空`).toBeGreaterThan(120);
      // 走事件流的那族必须出壳;挂现成组件的那族没有壳,只要不是空的就行
      if (cell.events) expect(html, `#${cell.gid} 没有壳`).toContain('details');
    }
    // 编号是整页的全局编号,不要求连续 —— 还没做到的格子就先不上页
    const gids = CELLS.map((c) => c.gid);
    expect(gids).toEqual([...gids].sort((a, b) => a - b));
    expect(new Set(gids).size).toBe(gids.length);
  });

  it('类名摘掉了哈希 —— 不摘的话内联的源样式一条都命中不了,页面会是一堆裸标签', () => {
    const html = renderCell(CELLS[0] as Cell);
    expect(html).toMatch(/class="fold flat[ "]/);
    expect(html).not.toMatch(/_fold_/);
  });

  it('组件 11 / 12 的实体确实由我们的组件产出(而不是抄了一段稿子里的 HTML)', () => {
    expect(renderCell(CELLS[6] as Cell)).toContain('npm run build');
    expect(renderCell(CELLS[9] as Cell)).toContain('生成配套插图');
    // 理解段挂的是产品里已有的组件,不是这次新写的
    expect(renderCell(CELLS[15] as Cell)).toContain('设置页要不要沿用列表页的商品卡组件');
    expect(renderCell(CELLS[25] as Cell)).toContain('已记住 3 条偏好');
  });

  /**
   * 端到端那一族**真的照到了那几条分支**。
   *
   * 这几条断言不是「渲染出了东西」那种活性检查 —— 它们钉住的是这一族存在的理由:
   * 每一条都是陈列格里**没有任何一格**会经过的分支。夹具哪天被改瘦了(比如
   * `appliedContextItems` 又变回 `[]`),这几条会红,而页面照样能生成、看着还挺好。
   */
  it('端到端那一族照到了陈列格照不到的分支', () => {
    const byId = new Map(LIVE.map((c) => [c.id, renderLive(c)]));
    const html = (id: string): string => {
      const found = byId.get(id);
      expect(found, `${id} 不见了`).toBeTruthy();
      return found ?? '';
    };

    // 上下文数据仍在夹具里,但产品历史流水不展示 CURRENT / Using 标签。
    expect(html('E2E-1')).not.toContain('msg-applied-context');
    expect(html('E2E-1')).not.toContain('msg-run-context-row');
    // 同一条消息上附件行 + 气泡仍同时在。
    expect(html('E2E-1')).toContain('msg-att');
    expect(html('E2E-1')).toContain('user-bubble');

    // workspaceItems / applied context 只隐藏 UI,不在陈列页留下旧标签。
    const chips = html('E2E-2').match(/msg-plugin-chip--workspace /g) ?? [];
    expect(chips).toHaveLength(0);
    expect(html('E2E-2')).not.toContain('msg-plugin-chip--workspace-design-system');
    expect(html('E2E-2')).not.toContain('msg-applied-context');
    expect(html('E2E-2')).not.toContain('msg-run-context-row');

    // producedFiles → `ProducedFiles` 那条分支:`.md` 走 `doc` 档卡
    expect(html('E2E-3')).toContain('data-kind="doc"');
    expect(html('E2E-3')).toContain('data-kind="html"');
    expect(html('E2E-3')).toContain('data-kind="image"');

    /*
     * 一轮**一张**壳(2026-08-26 最终裁决:卡片边界由「卡外落过东西」决定,不由清单
     * 决定;而 TodoWrite 必然在 done 之前,卡外那时还什么都没有)。
     * `.fold.flat` 是**壳**那一层(抽屉是 `.fold`,不带 `flat`),数它就等于数壳。
     *
     * 这一格原本是拿来照「分张」的,裁决之后它照的变成了「不分张」—— 断言跟着改,
     * 因为它现在守的正是那条裁决:先散活、后清单,前后都在同一张卡里。
     */
    const shells = html('E2E-4').match(/class="fold flat[ "]/g) ?? [];
    expect(shells, '先散活、后清单应当在同一张卡里').toHaveLength(1);

    // 失败轮 + 报错卡;`errorCardOwnerId` 命中时消息内那枚错误药丸不出
    expect(html('E2E-5')).toContain('chat-run-error-card');
    expect(html('E2E-5')).not.toContain('status-pill');

    /*
     * **协议标记一个字都不许上屏**(`done-marker.ts` 的原话:「标记任何情况下都不许
     * 出现在正文里」,`<od-title>` 当年就是这么漏进线上聊天的)。
     *陈列格一条 `done_key` 都没喂过,这条只有端到端这一族守得住。
     */
    for (const [id, out] of byId) {
      expect(out, `${id} 把 done 标记漏到正文里了`).not.toContain('od-done');
      expect(out, `${id} 把 done 标记漏到正文里了`).not.toContain(LIVE_DONE_KEY);
    }
  });

  /**
   * 裁决之后「一轮一张卡」—— 连带把 `renderCell` 的一个**隐患**也解掉了。
   *
   * `renderCell` 只取 `shells[shells.length - 1]`(它一格只摆一个实体)。在
   * 「清单一到就分张」的旧规则下,第 2 格那份夹具其实是**两张壳**,开头那句 thinking
   * 在陈列页上从来没出现过 —— 摆拍看到的和产线看到的不是一回事。
   * 2026-08-26 最终裁决把分张取消之后,那句 thinking 回到了唯一那张壳里,摆拍才照得全。
   *
   * 这一条现在钉的是**裁决本身**:同一份夹具在摆拍和端到端两条路上都必须是一张壳,
   * 而且那句 thinking 两边都看得见。哪天又冒出第二张壳,这里会红。
   */
  it('先说一句、再出清单:摆拍与端到端都是一张壳,那句 thinking 不再被吞', () => {
    const shellsOf = (events: PersistedAgentEvent[]): number =>
      buildTurnBlocks({ events, runStatus: 'succeeded', nowMs: 31_000 })
        .filter((b) => b.kind === 'shell').length;
    // 第 2 格(gid 2)喂的就是 PLAN_DONE:开头一句 thinking,然后才出清单
    expect(shellsOf(PLAN_DONE)).toBe(1);
    const cell2 = CELLS[1] as Cell;
    expect(cell2.gid).toBe(2);
    expect(renderCell(cell2).match(/class="fold flat[ "]/g) ?? []).toHaveLength(1);
    expect(renderLive(LIVE[0] as LiveCell).match(/class="fold flat[ "]/g) ?? []).toHaveLength(1);
  });

  /**
   * 把每一格的**夹具**导出成 JSON,供「真实运行时」那一列用。
   *
   * 为什么需要:陈列页是 `renderToStaticMarkup` 出来的静态 HTML,每格外面还由它自己
   * 包了一层 `.root`(接缝)—— 也就是说**陈列页永远长在理想宿主里**。
   * 2026-08-25 撞过一次:应用里 `ChatRoot` 根本没挂、壳头那句字是透明的,
   * 而陈列页那一格从头到尾都是好的。所以验收不能只看陈列页。
   *
   * 事件驱动的格子(`events`)可以把同一份事件种进 daemon、开真页面截图;
   * 直接挂组件的格子(`node`)种不进去,导出时标出来,由驱动脚本如实记「真运行时未覆盖」。
   */
  it('写出每格的夹具(给了 OD_WRITE_CELLS 落点时)', () => {
    const out = process.env.OD_WRITE_CELLS;
    if (!out) return;
    mkdirSync(dirname(out), { recursive: true });
    const rows = CELLS.map((c) => ({
      gid: c.gid,
      sub: c.sub,
      cmp: c.cmp,
      state: c.state,
      family: c.family ?? null,
      kind: c.node ? 'node' : 'events',
      run: c.run ?? null,
      events: c.node ? null : (c.events ?? []),
    }));
    writeFileSync(out, JSON.stringify(rows, null, 1), 'utf-8');
    expect(rows).toHaveLength(CELLS.length);
  });

  /**
   * 端到端那一族**不许碰下游那两条脚本**。
   *
   * 它们都按陈列格取数,而且都是硬的:
   *  · `build-compare.mjs` 用一条**无属性 `<header>`** 的正则解表头,条数对不上
   *    直接 `process.exit(1)`;
   *  · `diff-cells.mjs` 用 `querySelectorAll('.cell')` 取格,再按**下标**配 gid
   *    (`ours[gid - 1]`)—— 多一个 `.cell` 混进陈列格中间,后面全部错位。
   * 这一族换了类名、给 `<header>` 加了属性、整段排在陈列格之后,三条一起保这件事。
   * 在这儿钉住,免得以后有人为了「统一样式」把类名改回去。
   *
   * **条数一律从 `CELLS.length` 取,不写死**:这一页从 84 格长到 90 格时,
   * 写死的那三个 84 全都成了「说谎的读数」——数量是派生量,派生量不许有第二个出处。
   */
  it('端到端那一族不会破坏陈列格的两条下游脚本', () => {
    const page = buildPage();
    // build-compare.mjs 里那条正则,一字不差搬过来
    const heads = [...page.matchAll(
      /<header>\s*<span class="no">#(\d+)<\/span><span class="sub">([^<]*)<\/span>\s*<span class="cmp">([^<]*)<\/span><span class="st">([^<]*)<\/span>/g,
    )];
    expect(heads).toHaveLength(CELLS.length);
    // diff-cells.mjs 按 `.cell` 取格:数量与顺序都不能被新格子动到
    const cellOpens = [...page.matchAll(/<section class="cell"/g)];
    expect(cellOpens).toHaveLength(CELLS.length);
    // 新格子全部排在陈列格之后
    const lastCell = page.lastIndexOf('<section class="cell"');
    expect(page.indexOf('<section class="e2ecell">')).toBeGreaterThan(lastCell);
    // 页面上写清楚了它们不是陈列稿那几格里的一格
    expect(page).toContain(`不是交付稿的 ${CELLS.length} 格`);
  });

  /**
   * **没内联的规则不许静静表现成差异。**
   *
   * 这一页是挑着内联的(`pick()`),漏挑一族的后果不是「少了点样式」,而是那一格的
   * 元素退回浏览器默认值 —— 逐格比对会把整条规则的每个属性都报成「实现没对上」。
   * 第 38 格那五条(flex / 6px / 2px / 12px / 静音色)在 `chat.css` 里一个不差,
   * 就这么被当成实现缺陷读了很久。
   *
   * 这条断言钉的是**对账结果为空**:哪天有人加了一族新组件、忘了给它补一条 `pick`,
   * 这里会红并且把类名逐个念出来,而不是让页面悄悄多出一批假差异。
   * (页面上也会在那一格的注记里明写,见 `buildPage()` 里的 `missedRules`。)
   */
  it('每一格用到的全局规则都真的内联进了页面', () => {
    const page = buildPage();
    const flagged = [...page.matchAll(/<li class="audit">([\s\S]*?)<\/li>/g)].map((m) => m[1] ?? '');
    expect(flagged, `有格子的规则没内联,读数不可信:\n${flagged.join('\n')}`).toHaveLength(0);
  });

  it('写出陈列页(给了 OD_WRITE_MIRROR 落点时)', () => {
    const out = process.env.OD_WRITE_MIRROR;
    if (!out) return;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, buildPage(), 'utf-8');
    expect(readFileSync(out, 'utf-8').length).toBeGreaterThan(1000);
  });
});

/* ── 页面 ─────────────────────────────────────────────────── */

const read = (p: string): string => readFileSync(resolve(WEB, p), 'utf-8');

/**
 * 从一大张全局表里挑出选择器命中 `want` 的规则。
 * `composio.css` 有 94KB,而我们只要其中 `.qf-*` 那 149 条 —— 整张塞进去会把陈列页撑成一坨,
 * 也会把别的页面的样式带进来干扰比对。
 *
 * **别给 `want` 加「类名前必须是边界」那种前提**:标签限定的规则(`button.qf-chip-other`)
 * 里类名紧贴标签名,加了前提就漏掉 —— 而漏掉的恰恰是让它左对齐的那三条,
 * 于是陈列页把它画成居中,看着像实现有 bug,产品里其实是好的。
 * 同族的坑已经三次:base.css 的变量没内联、`.answered` 没进 want、这一条。
 */
function pick(css: string, want: RegExp): string {
  const nodes = splitRules(css.replace(/\/\*[\s\S]*?\*\//g, ''));
  const out: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'rule') {
      if (want.test(node.selector)) out.push(`${node.selector}{${node.body}}`);
      continue;
    }
    if (node.kind !== 'at-block') continue;
    // 动画帧原样留着:它只在被 `animation` 引用时起作用,留着不会串味
    if (/^@keyframes/i.test(node.prelude)) {
      out.push(`${node.prelude}{${node.body}}`);
      continue;
    }
    const inner = splitRules(node.body)
      .filter((n): n is Extract<CssNode, { kind: 'rule' }> => n.kind === 'rule' && want.test(n.selector))
      .map((n) => `${n.selector}{${n.body}}`);
    if (inner.length) out.push(`${node.prelude}{${inner.join('\n')}}`);
  }
  return out.join('\n');
}

/* ── 漏内联对账 ───────────────────────────────────────────────────────
 *
 * 这一页是**挑着内联**的:`pick()` 只把选择器命中正则的那些规则搬进来。
 * 漏挑一族的后果不是「少了点样式」,而是**整格读数作废** —— 那些元素退回浏览器
 * 默认值,逐格比对会把整条规则的每个属性都报成「实现没对上」。
 *
 * 危险就在于它**长得和真差异一模一样**:第 38 格那五条(flex / 6px / 2px / 12px / 静音色)
 * 在 `chat.css` 里一个不差,却被当成实现缺陷读了很久。所以这里加一道对账,
 * 让「没内联」这件事**在页面上自己说出来**,而不是伪装成差异。
 *
 * 判据:这一格用到的类名里,凡是**在产品全局表里写过规则、却没有任何一条规则进到这一页**的,
 * 逐个列进那一格的注记。CSS Module 走 `scope()` 整份内联,不会被部分漏掉,所以只审全局表。
 */
const GLOBAL_SHEETS = [
  'src/styles/chat.css',
  'src/styles/primitives.css',
  'src/styles/viewer/code.css',
  'src/styles/viewer/tools.css',
  'src/styles/viewer/composio.css',
  'src/styles/viewer/theater.css',
  'src/styles/viewer/routines.css',
];

/**
 * 对账里**故意不算漏**的那几条。每一条都要写清楚为什么 ——
 * 这张单子是给「明知故犯」用的,不是用来把红灯调绿的。
 *
 * · `.app` —— 那是**陈列页自己的祖先脚手架**。`routines.css` 的裸 `.app` 只有一句
 *   `background: var(--veil-shell, var(--bg-panel))`(应用外壳的底);这一页把 `.app`
 *   套在每一格里只为让 `.app .msg…` 那一族旧皮肤规则生效,内联它等于给九十格
 *   各刷一层应用底色,而稿子那一侧的载体是 `var(--bg)`。
 */
const AUDIT_IGNORE = new Set(['.app']);

/**
 * 一份 CSS 拆成**逗号分完的单条选择器**。
 *
 * 判据必须落在**逐条选择器**上,不能只看类名在不在:`.fork-note` 就栽在这上面 ——
 * 它在 `chat.css` 里有一条 `.msg, .fork-note { --chat-message-muted-ink }`,
 * 那条被 `.msg` 的正则顺带挑进来了,于是「这个类名内联过」成立;
 * 而它自己那七条(布局、字号、图标间距)一条都没进来。按类名判会给它盖绿章。
 *
 * 只收**顶层**规则:`@media` 里的暗色 / 打印分支这一页用不上,收进来只会刷噪音。
 */
function topLevelSelectors(css: string): string[] {
  const out: string[] = [];
  for (const node of splitRules(css.replace(/\/\*[\s\S]*?\*\//g, ''))) {
    if (node.kind !== 'rule') continue;
    for (const one of node.selector.split(',')) {
      const sel = one.trim().replace(/\s+/g, ' ');
      if (sel) out.push(sel);
    }
  }
  return out;
}

/** 一段选择器里出现过的类名。 */
function classesIn(selector: string): string[] {
  return [...selector.matchAll(/\.(-?[_A-Za-z][\w-]*)/g)].map((m) => m[1] as string);
}

/** 一段标记里出现过的类名。 */
function markupClasses(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    for (const one of (m[1] ?? '').split(/\s+/)) if (one) out.add(one);
  }
  return out;
}

/**
 * 这一格里**真的有元素命中、却没有被内联进页面**的选择器。
 *
 * 先用类名做必要条件筛一遍(单条选择器里的每个类名都得在这一格出现过),
 * 剩下的才真的拿 jsdom 去 `querySelector` —— 不筛的话是几千条规则 × 九十格。
 */
function tally(selectors: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const sel of selectors) out.set(sel, (out.get(sel) ?? 0) + 1);
  return out;
}

/**
 * 数的是**条数不是有没有**。
 *
 * `.fork-note` 就栽在「有没有」上:`chat.css` 里 `.msg, .fork-note { --chat-message-muted-ink }`
 * 那一条被 `.msg` 的正则顺带挑走了,于是「这条选择器内联过」成立;而同名选择器
 * 在同一份表里还有七条(布局、字号、图标间距)一条都没进来。按「有没有」判会盖绿章。
 */
function missedSelectors(
  stage: string, source: Map<string, number>, inlined: Map<string, number>,
): string[] {
  const used = markupClasses(stage);
  const host = document.createElement('div');
  host.innerHTML = stage;
  const out: string[] = [];
  for (const [sel, count] of source) {
    if (AUDIT_IGNORE.has(sel) || (inlined.get(sel) ?? 0) >= count) continue;
    const classes = classesIn(sel);
    if (classes.length === 0 || !classes.every((c) => used.has(c))) continue;
    try { if (host.querySelector(sel)) out.push(sel); } catch { /* jsdom 认不了的选择器跳过 */ }
  }
  return out.sort();
}

/**
 * 把一整份 CSS Module 关进一个笼子里。
 *
 * 摘掉哈希之后 CSS Module 的类名会变成 `.root` / `.card` / `.title` / `.label` 这种大路名字,
 * 而陈列页把 80 格摞在同一张页面上。踩到过一次:`NextStepActions.module.css` 的 `.root`
 * 正好和每一格外面那层 `<div class="root">`(它是 `ChatRoot.module.css` 的接缝,负责给
 * `--chat-*` 变量)撞名 —— 撞上之后**每一格**都套上了一圈下一步引导的边框和渐变底,
 * 而且 `max-width: min(360px,100%)` 那类规则还会把别的格子挤窄,看着像是我们做错了版式。
 *
 * 所以名字不独占的那几份 module 一律加一层笼子选择器,只在自己那一格生效;
 * 已经在页面上的几份(ChatRoot / record / OdCard / Reconnect / PauseLine)类名互不相撞,不动它们。
 */
function scope(css: string, cage: string): string {
  const caged = (selector: string): string => selector.split(',')
    .map((one) => one.trim()).filter(Boolean)
    .map((one) => `.${cage} ${one}`)
    .join(',');
  const out: string[] = [];
  for (const node of splitRules(css.replace(/\/\*[\s\S]*?\*\//g, ''))) {
    if (node.kind === 'rule') {
      const sel = caged(node.selector);
      if (sel) out.push(`${sel}{${node.body}}`);
      continue;
    }
    if (node.kind !== 'at-block') continue;
    if (/^@keyframes/i.test(node.prelude)) {
      out.push(`${node.prelude}{${node.body}}`);
      continue;
    }
    const inner = splitRules(node.body)
      .filter((n): n is Extract<CssNode, { kind: 'rule' }> => n.kind === 'rule')
      .map((n) => `${caged(n.selector)}{${n.body}}`)
      .filter((one) => !one.startsWith('{'));
    if (inner.length) out.push(`${node.prelude}{${inner.join('\n')}}`);
  }
  return out.join('\n');
}

/**
 * 把一段 CSS 切成「普通规则 / 带块的 at 规则 / 无块的 at 规则」三种。
 *
 * 以前这里是**整段丢掉 at 规则**。丢的理由是对的:扁平正则会把 `@media` 里面那条
 * 规则单独捞出来、条件却丢了,于是它无条件生效(踩过:`@media (hover: none)` 里的
 * `opacity: 1` 被捞成裸规则,每一格的用户消息都摊着 hover 才该露的东西)。
 * 但**丢掉**同样是错的:稿子那张页面是原样跑的,它的 `@media` 一条不少;
 * 我们这边整段没有 —— 两边根本不在同一套媒体条件下,逐格量出来十几处
 * 「稿子 opacity:0 / 我们 opacity:1」的假差异,而实现其实一模一样。
 *
 * 正确做法是**连条件一起搬过来**:同一个浏览器、同一套媒体条件,两边才算对等。
 */
type CssNode =
  | { kind: 'rule'; selector: string; body: string }
  | { kind: 'at-block'; prelude: string; body: string }
  | { kind: 'at-simple'; text: string };

function splitRules(css: string): CssNode[] {
  const out: CssNode[] = [];
  let i = 0;
  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i] ?? '')) i += 1;
    if (i >= css.length) break;
    if (css[i] === '@') {
      let j = i;
      while (j < css.length && css[j] !== '{' && css[j] !== ';') j += 1;
      if (j >= css.length || css[j] === ';') {
        out.push({ kind: 'at-simple', text: css.slice(i, j + 1) });
        i = j + 1;
        continue;
      }
      let depth = 0;
      let k = j;
      for (; k < css.length; k += 1) {
        if (css[k] === '{') depth += 1;
        else if (css[k] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      out.push({ kind: 'at-block', prelude: css.slice(i, j).trim().replace(/\s+/g, ' '), body: css.slice(j + 1, k) });
      i = k + 1;
      continue;
    }
    const brace = css.indexOf('{', i);
    if (brace < 0) break;
    const end = css.indexOf('}', brace);
    if (end < 0) break;
    out.push({
      kind: 'rule',
      selector: css.slice(i, brace).trim().replace(/\s+/g, ' '),
      body: css.slice(brace + 1, end).trim(),
    });
    i = end + 1;
  }
  return out;
}



/**
 * `base.css` 的 `:root` 变量块。**只取变量,不取元素规则** —— 元素规则会动这一页自己的排版。
 *
 * 为什么必须补:字号那几个 token(`--font-size-12` 等)住在 `base.css`,而这一页原来只内联了
 * `tokens.css` + 几份组件样式。少了它们,任何 `font-size: var(--font-size-12)` 在这一页**静默失效**、
 * 退回继承值 —— 于是逐格比样式时会报出一堆「字号对不上」的**假差异**,而产品里根本是好的。
 * 踩过一次:记忆卡按稿子改成 12px 之后,陈列页仍然量出 13px,差点让我去改一个没坏的地方。
 */
function baseVars(): string {
  const css = read('src/styles/base.css');
  const m = /:root\s*\{([\s\S]*?)\}/.exec(css);
  if (!m) throw new Error('base.css 里找不到 :root —— 变量内联会缺,先修这里');
  return `:root{${(m[1] ?? '').trim()}}`;
}

function buildPage(): string {
  const tokens = read('src/styles/tokens.css');
  const seam = read('src/components/chat/ChatRoot.module.css');
  const record = read('src/components/chat/primitives/record.module.css');
  // 理解段挂的是产品里已有的组件,它们的样式也得跟着进来,不然照出来是一堆裸标签:
  //  · 意图澄清的 `.qf-*` 是**全局**样式,住在 styles/viewer/composio.css(位置有点怪,但确实在那儿)
  //  · 记忆卡是 CSS Module,和上面几份一样靠摘哈希对上
  const qform = pick(read('src/styles/viewer/composio.css'), /\.(qf-|question-form|accordion-collapsible|answered)/);
  const odcard = read('src/components/OdCard.module.css');
  // `sr-only` 这类共享 primitive 也要带上:不带的话「已回答」这种只给读屏的字会直接露在页面上,
  // 设计会以为我们多画了一行
  const primitives = read('src/styles/primitives.css');
  /*
   * `Button` 的 CSS Module 也得进来 —— 但只挑 `.sm` / `.secondary` 这两族。
   *
   * 别的档(`.primary` `.ghost` `.subtle` `.icon`)在 `primitives.css` 里有一份
   * 标签限定的旧全局孪生(`button.primary` …),陈列页靠它们已经画对了;
   * 而 `sm` 和 `secondary` 是**只有 Module 版**的(Button.tsx 里写明新变体不再挂旧全局类),
   * 不内联的话陈列页就永远是 36px / 14px / 500 的默认档 ——
   * 我把意图澄清底栏改成稿子的 `.btn.mod-sm` 之后,量出来一点没变,就是卡在这儿。
   * 整份内联不行:`.button` 这种大路名字会和页面上别的东西撞(见 `scope()` 的教训)。
   */
  const buttonSizes = pick(
    readFileSync(resolve(WEB, '../../packages/components/src/button.module.css'), 'utf-8'),
    // `^\.primary,` 只命中「这几档不占描边宽度」那条组规则;
    // 不放 `^\.ghost` 之类的单档规则进来 —— 那几个类名太大路,会误伤页面上别的元素。
    // `.button` 基底也要进来 —— 描边宽度就在它身上。不内联的话陈列页里
    // 共享 Button 的描边由全局 `button` 规则决定,和产线不是一回事(第 84 格就这么假红过)。
    /^\.button\b|^\.(sm|secondary)\b|^\.primary,/,
  );
  // 用户气泡的样式在全局 chat.css 里,只挑用得上的那几条(整张塞进来会串味)
  const userMsg = pick(read('src/styles/chat.css'), /(^|[\s,>+~])\.(msg|user-text|user-attachments|user-bubble|composer-att|msg-att)/);
  /*
   * 「新开会话」那条分界(第 38 格)。
   *
   * 原来**一条都没内联**:上面几条 `pick` 的正则里没有 `fork-`,而 `.fork-sep` / `.fork-note`
   * 只住在 `chat.css`。后果不是「少了点样式」,是**整格读数作废** —— 那五个值
   * (flex / 6px / 2px / 12px / 静音色)在 `chat.css` 里一个不差,陈列页却量到裸 div 的
   * 浏览器默认值,于是逐格报出五条「实现没对上」的假差异。
   * 这类漏挑是这一页的系统性风险,不是这一格的偶然:所以下面还有一道 {@link auditInlined} 对账。
   */
  const forkCss = pick(read('src/styles/chat.css'), /(^|[\s,>+~])\.fork-/);
  // 产出收尾 / 边界两族的样式全是**全局类名**,分散在四张表里。挑的顺序照 index.css 的
  // 导入顺序来 —— 这一族有真实的覆盖关系(`.assistant-footer` 的底子在 composio,
  // 稿子改掉的那几条在 theater),顺序一错照出来的就是旧版那一行。
  const queueCss = pick(read('src/styles/chat.css'), /(^|[\s,>+~])\.chat-queued-send/);
  // 稿子那套裸按钮 reset(`:where([data-chat-root]) button`)也要带上 —— 面板里
  // 几十颗没有类名的按钮靠它才不是 36px 高、14px、带描边的默认档
  const bareButtonCss = pick(read('src/styles/chat.css'), /^:where\(\[data-chat-root\]\)/);
  const amrCss = pick(read('src/styles/chat.css'), /(^|[\s,>+~])\.(amr-card|run-error|chat-error)/);
  /*
   * `assistant-label` 也从 code.css 里带上 —— 它是状态词的**底子**
   * (`font-weight:500; color:var(--text-muted); font-size:11px`)。footer 那一档
   * 特异性更高、把三条都压掉了,但漏内联对账没法知道「反正会被压掉」,
   * 而且哪天 footer 那条被改窄一点,这个底子就是产品里真正生效的那一份。
   */
  const proseCss = pick(read('src/styles/viewer/code.css'), /(^|[\s,>+~])\.(prose-block|md-|assistant-label\b)/);
  const artifactCss = pick(read('src/styles/viewer/tools.css'), /(^|[\s,>+~])\.(artifact-card|file-ops)/);
  const footerBase = pick(read('src/styles/viewer/composio.css'), /(^|[\s,>+~])\.assistant-footer/);
  const footerSkin = pick(read('src/styles/viewer/theater.css'), /(^|[\s,>+~])\.assistant-(footer|feedback|copy-button)/);
  /*
   * 旧聊天皮肤 —— 这一页长期照不出真相的**系统性原因**,不是某一格的疏忽。
   *
   * `styles/viewer/routines.css` 里有一整块 `.app …` / `.chat-skin …` 的聊天皮肤(451 条),
   * `index.css` 把它排在**最后**(第 31 行,chat.css 是第 13 行、theater 是第 24 行)——
   * 于是它对同一个元素既赢特异性(0,2,0 对 0,1,0)又赢顺序,产品里真正生效的是**它**。
   * 而这一页原来一条都没内联,量出来的「和稿子一致」是**假的**:
   * 用户连续四次截图反馈用户气泡是灰底圆角,这一页却一直显示对齐 —— 差就差在这一层。
   *
   * 不整份塞:451 条里绝大多数够不着这一页(工作区页签、交接菜单、设计文件表…),
   * 塞进来只会把别的格子弄花。按**这一页实际渲染出来的类名**求交集,真正会命中的只有下面
   * 这几族(msg / user-text / user-copy-btn / prose-block / md-p / assistant-footer)。
   * 位置也照生产:排在 footerSkin(theater)之后,顺序错了照出来的还是旧版那一行。
   *
   * 这些格子照出差异之后,修法是**删掉旧皮肤里和稿子冲突的那一条**,不是在新组件上加特异性
   * 去压它 —— 后者会把同一场层叠战争再打一遍。
   */
  const legacySkin = pick(
    read('src/styles/viewer/routines.css'),
    /(^|[\s,>+~])\.(msg|user-text|user-copy-btn|prose-block|md-p|assistant-footer|assistant-flow|chat-log|msg-time)\b/,
  );
  // 下一步引导是本族唯一已经 Module 化的;报错那张附卡的壳也是 Module。
  // 这两份的类名(`.root` `.card` `.title` `.label` …)太大路,必须关进笼子,见 `scope()`
  const nextStepCss = scope(read('src/components/NextStepActions.module.css'), CAGE_NEXT_STEP);
  const actionCardCss = scope(read('src/components/UserActionCard.module.css'), CAGE_ACTION_CARD);
  // 升级卡的类名(`.up` / `.head` / `.why` / `.cta`)也是大路名字,同样关笼子
  const upgradeCss = scope(read('src/components/chat/UpgradeCard.module.css'), CAGE_UPGRADE);
  // 正文取词的两份 module 同样关笼子(`.bar` / `.refs` / `.pop` 都是大路名字)
  const errCss = scope(read('src/components/chat/RunErrorCard.module.css'), CAGE_ERR);
  const audioCss = scope(read('src/components/chat/AudioArtifact.module.css'), CAGE_AUDIO);
  const supportCss = scope(read('src/components/chat/SupportDialog.module.css'), CAGE_SUPPORT);
  const quoteCss = scope(read('src/components/chat/QuoteBar.module.css'), CAGE_QUOTE)
    + '\n' + scope(read('src/components/chat/QuotedRefs.module.css'), CAGE_QUOTE);
  /*
   * 暂停 / 重连也要**关笼子**。
   * 它们的 `.name` / `.row` 摘掉哈希之后,和执行记录 `record.module.css` 的同名类撞在一起:
   * `Reconnect` 的 `.name > * { max-width: 100% }` 就这么套到了工具行的文件名按钮上 ——
   * 逐格量出 24 条「maxWidth 稿 none / 我 100%」,而产品里两份哈希不同、根本不会撞。
   */
  const edge = scope(read('src/components/chat/Reconnect.module.css'), CAGE_EDGE) + '\n'
    + scope(read('src/components/chat/PauseLine.module.css'), CAGE_EDGE);
  /*
   * Plan 药丸也关笼子:它的 `.pill` / `.pop` / `.steps` / `.wrap` 摘掉哈希之后全是大路名字,
   * 而这一页上 `.pop`(正文取词的全文浮层)、`.steps` 都另有主人。
   * 里面那几枚状态记号走的是 `record.module.css`(没关笼子,全页共用),不受影响。
   */
  const planCss = scope(read('src/components/chat/PlanPill.module.css'), CAGE_PLAN);
  const statusCardCss = scope(read('src/components/chat/UserStatusCard.module.css'), CAGE_STATUS);
  /*
   * ── 端到端那一族要用、而陈列格用不上的几张表 ──────────────────────────
   *
   * 全部**另起一组 style**,不去改上面那几条 `pick` 的正则:改了会把新规则混进
   *陈列格的样式里,逐格比对的基线跟着动,而这一族的收益一格都收不到。
   * 这几组选择器陈列格一条都没用到,追加在后面对它们是**零影响**。
   * 组内顺序照 `index.css`:chat.css → code.css → tools.css → composio.css → routines.css。
   */
  const liveLogCss = pick(read('src/styles/chat.css'), /(^|[\s,>+~])\.chat-log/);
  const liveFlowCss = pick(read('src/styles/viewer/code.css'), /(^|[\s,>+~])\.(assistant-flow|status-pill|status-label|status-detail)/);
  const liveProducedCss = pick(read('src/styles/viewer/tools.css'), /(^|[\s,>+~])\.produced-file/);
  const liveCompletionCss = pick(read('src/styles/viewer/composio.css'), /(^|[\s,>+~])\.assistant-completion-row/);
  /*
   * 旧聊天皮肤(`legacySkin`)**不在这里重来一遍**:上面那份是按「这一页实际渲染出来的
   * 类名」求的交集,端到端这一族用的正是同一批(`.msg` / `.user-text` / `.assistant-footer`
   * / `.prose-block` / `.chat-log` …),照单全收就够。多挑一份只会让同一条规则出现两次,
   * 以后改 `legacySkin` 的人还得记得这儿也有一份。
   *
   * 端到端那一族里出场的两份 CSS Module,笼子用 `CAGE_LIVE`。
   * **不能用 `.app`**:陈列格现在也在 `.app` 底下,而它们的接缝类名就是 `root`,
   * 和 `NextStepActions.module.css` 摘完哈希的 `.root` 正好撞上(见 `scope()` 的注释)。
   */
  const liveModuleCss = scope(read('src/components/chat/RunErrorCard.module.css'), CAGE_LIVE) + '\n'
    + scope(read('src/components/NextStepActions.module.css'), CAGE_LIVE);
  // 打包后的 ESM 把内部名字压缩过(`vt as MODE_FRAMES`),内联进页面后
  // 那些**导出名**在模块作用域里并不存在。把尾部的 export 换成一个具名对象,
  // 下面的画笔通过它取引擎;引擎代码本身一个字没改。
  const engine = read('node_modules/thinking-orbs/dist/engine.es.js')
    .replace(/export\s*\{([\s\S]*?)\};?\s*$/, (_m: string, body: string) => {
      const pairs = body.split(',').map((piece) => piece.trim()).filter(Boolean).map((piece) => {
        const parts = piece.split(/\s+as\s+/);
        const local = (parts[0] ?? '').trim();
        const name = (parts[1] ?? local).trim();
        return `${name}: ${local}`;
      });
      return `const ORB = { ${pairs.join(', ')} };`;
    });

  let lastFamily = '';
  const familyNote: Record<string, string> = {
    '理解段': `<div class="famnote">
<p><b>意图澄清:现有实现能用,但和稿子有 7 处不一样</b> —— 逐条列在这儿,好判断要改哪些、哪些是稿子该跟实现走。</p>
<table>
<tr><th>项</th><th>现在的实现</th><th>稿子</th></tr>
<tr><td>卡头文案</td><td>圆形「?」头像 + <b>agent 给的表单标题</b></td><td>图标 + <b>固定一句</b>「还需要确认一件事」</td></tr>
<tr><td>选项排布</td><td><b>横排胶囊</b>,一行排开</td><td><b>竖排一列</b>,每项左边一个选择框</td></tr>
<tr><td>自己填</td><td>末尾一枚虚线「其他」胶囊</td><td>和其它选项<b>同列</b>的一条「自己填」</td></tr>
<tr><td>主按钮</td><td>发送答案</td><td>下一步</td></tr>
<tr><td>次按钮</td><td>一键跳过</td><td>跳过 · 你来判断</td></tr>
<tr><td>脚注</td><td>有一行提示语</td><td>没有,只有两个按钮</td></tr>
<tr><td><b>已回答</b></td><td>整张表单<b>锁住</b>(灰掉的原表单 + 「已回答」角标)</td><td><b>收成一条陈述</b>:「已确认 · 商品卡 — 沿用列表页那张」</td></tr>
</table>
<p>最后一条不是样式问题,是形态问题:锁住的表单和一句陈述,占的高度差好几倍 —— 一轮里问过三次,差别很明显。</p>
<p><b>记忆卡</b>:现在是一行 chip(条目直接铺在行内);稿子是可折叠的,收起只留「已记住 3 条偏好」,展开才看内容。</p>
</div>`,
    '产出收尾': `<div class="famnote">
<p><b>这一族在产品里全部有生产实现</b>(音频那两格除外),所以下面挂的都是<b>现成组件</b> ——
总结文案是 <code>renderMarkdown</code>、产物卡是 <code>FileOpsSummary</code> 里的 <code>ArtifactCards</code>、
回合状态行是 <code>AssistantFooter</code> / <code>AssistantFeedback</code>、下一步引导是 <code>NextStepActions</code>。
照出来的是「现有实现离稿子有多远」,要做的是对齐,不是再造。</p>
<p><b>这一族现在没有出不来的格子</b> —— 早先那张「三格出不来」的表已经过期,三格后来都上了页;
留在下面的是各自还欠着的那一半,别把它们当成「画不出来」:</p>
<table>
<tr><th>格</th><th>还欠着哪一层</th></tr>
<tr><td>#38 分叉分界</td><td>形态画出来了;<b>行为</b>还没接 —— Fork 今天是跳走,原地不留痕迹,要留还缺「从哪条消息分叉 + 源会话标题」两个字段(要动契约 + daemon)</td></tr>
<tr><td>#40 反馈弹窗</td><td>面板已抽成 <code>AssistantFeedbackReasons</code>,能单挂;<b>真实触发仍由 React state 驱动</b>,静态页点不出来</td></tr>
<tr><td>#43 / #44 音频</td><td>组件与采样规则已建;<b>数据</b>那一半还欠 —— 音频进不了产物卡(<code>artifactCardKind</code> 对 <code>.mp3</code> 返回 null),波形与时长契约里也没有(T17)</td></tr>
</table>
<p><b>第 41 / 42 格挂的是「现状」不是对齐后的样子</b>:内容被 T12 卡住 —— 稿子要的是「跟本轮相关的三条建议」,
而<b>事件流与契约里没有任何这样的字段</b>,产品渲染的是固定的设计工具箱目录。挂现状是为了让人看见这个差。</p>
<p>✅ <b>建页时照出的三条实现缺陷,现在三条都修好了</b> —— 这一段以前写的是「都没有改」,那是旧话:
①<code>14:32</code> 只传给「没有反馈按钮」那条分支 → 现在两条分支都传;
②<code>.assistant-feedback-wrap</code> 的 <code>inline-flex</code> + <code>max-width</code> 把整行缩成 220.6px、弹簧撑不开
→ 现在是 <code>flex</code> + <code>width:100%</code>,时间贴得到右端(<code>footer-time.test.tsx</code> 钉着);
③第 39 格(中断)照出<b>绿勾 + 绿字</b> → 换勾那条规则现在也排除了 <code>data-canceled</code>,中断档是灰点 + <code>--text-muted</code>。</p>
</div>`,
    '输入': `<div class="famnote">
<p><b>这一页是 SSR 出来的静态标记,没有布局</b> —— 组件里凡是要<b>量像素</b>才成立的东西,在这一页上一次都没跑:
第 46 格的「查看全部」、第 58 格的两枚翻页箭头、第 59 格的中间省略。三处都在各自那格的注记里写明了,
要看它们得起真实页面(<code>pnpm tools-dev run web</code>)。<b>没有</b>为了让它们在这一页出现去改组件。</p>
<p><b>缩略图取不到</b>:图卡的 <code>src</code> 指向 <code>/api/projects/:id/raw/…</code>,离开 daemon 就是一张打不开的图,
格子里是 57px 的占位灰块。要比的尺寸、圆角、间距、一行里两种卡是否同高,照样都在。</p>
<p><b>这一族现在全部上了页</b> —— 早先写的「还没上页:第 47 / 49 / 50 / 54 / 55 格」是旧话,
那五格(hover 无差异、发送失败态、附件失败与 hover 预览)后来都补齐了。
还欠着的是<b>接线</b>不是画法:<code>ChatMessage.sendFailed</code> 与那张失败卡都建好了,
但产品里没有任何代码去把它置上(见第 49 格注记的 B13),而「同一个失败到底显示在哪」
仍要产品裁一次(盘点 §4-B)。组件 23 的第 65–69 格(回答正文取词)五格也全部出了格。</p>
<p><b>组件 21(第 60–64 格)已上页</b>:盘点 §4-A 把「逐文件上传状态」列为形态级风险,实测<b>不用改契约、不用改后端</b> ——
<code>uploadProjectFiles</code> 本来就收 <code>File[]</code>,一个文件一个请求走的是同一个端点,失败因此能落到具体那张卡上。
唯一没做的是说明文字里那句「这几秒发送键不可用」:那是一条<b>已知的现网 bug</b>,按分工另起红测 + 独立 PR,这一轮没碰。</p>
</div>`,
    '边界': `<div class="famnote">
<p><b>这一族五个组件性质各不相同,别拿同一把尺子看</b>:</p>
<table>
<tr><th>组件</th><th>状态</th></tr>
<tr><td>6 Plan 卡(#70–71)</td><td><b>#70 拍板不做</b> —— D33「不实现、不模拟」、S9「展开态的独立卡不做」;清单的正式落点是执行记录内的分段(B17)。出格是为了让「不做」这件事留痕。<b>#71 已实现</b>:收起态的「第 N / M 步」药丸钉在输入框上方,悬停浮出整张清单(T18 那条冲突已由用户 2026-08-26 裁定:只做收起态)</td></tr>
<tr><td>17 Queue(#72–74)</td><td><b>早就有</b>(<code>QueuedSendStrip</code>),已按稿子改过版式。这一族最接近对齐的三格</td></tr>
<tr><td>18 升级(#75–77)</td><td><b>能力在,形态不是这个</b> —— 稿子要流水内的一张卡,产品是两个居中弹窗;而且它们 <code>createPortal</code> 到 <code>document.body</code>,SSR 渲染不了 portal,这一页拿不到标记</td></tr>
<tr><td>19 报错(#78–80)</td><td><b>主卡拆不出来</b> —— 200 多行内联 JSX 绑在 <code>ChatPane</code> 上;#79 挂的是产品今天承接「切到 Cloud」的那张<b>附卡</b>,照出「一件事被拆成两张卡」这个差</td></tr>
<tr><td>20 / 22(#81–84)</td><td>产品里原来<b>完全没有 UI</b>,这一轮从零建的,可以独立挂载</td></tr>
</table>
<p>✅ <b>第 72–74 格那条错位已经修好了</b> —— 这一段以前写的是「现在是坏的」,那是旧话:
<code>.chat-queued-send-row</code> 原来是三条轨道的 grid 装着四个孩子(拖动手柄独占 517px 中间列、
正文被挤到右边、动作排掉到第二行、行高 34 → 38px);现在整行换成 <code>display: flex</code>,
和稿子 <code>.queue .q</code> 同一套排版模型,行高也回到 34。</p>
<p><b>两条要产品裁的</b>:①#76 与已定口径直接冲突 —— <code>error-ux-design.md</code> §3 写「付费用户余额 0 = 不限量,不拦」,
稿子写「= $0 → 无法开始新任务」;②#78 稿子的「从失败处重试」是<b>常驻</b>动作,而报错设计方案原则 4 写「重试只在有用时出现」。</p>
</div>`,
  };
  /*
   * 漏内联对账的两份底表(见 `selectorClasses` 上面那段)。
   * `inlinedClasses` 收的是**真正进了这张页面**的每一条 `<style>`;`sourceClasses` 收的是
   * 产品全局表里写过规则的类名。两者一减,就是「产品有、这一页没有」的那一批。
   */
  const inlinedSelectors = tally(topLevelSelectors([
    tokens, seam, record, qform, odcard, primitives, buttonSizes, userMsg, forkCss,
    bareButtonCss, queueCss, amrCss, proseCss, artifactCss, footerBase, footerSkin, legacySkin,
    nextStepCss, actionCardCss, upgradeCss, quoteCss, errCss, audioCss, supportCss, edge, planCss,
    statusCardCss, liveLogCss, liveFlowCss, liveProducedCss, liveCompletionCss, liveModuleCss, PAGE_CSS,
  ].join('\n')));
  const sourceSelectors = tally(topLevelSelectors(GLOBAL_SHEETS.map((p) => read(p)).join('\n')));
  const auditTotals: string[] = [];

  const cells = CELLS.map((cell) => {
    const family = cell.family ?? '';
    const header = family && family !== lastFamily
      ? `<h2 class="fam">${esc(family)}</h2>${familyNote[family] ?? ''}` : '';
    lastFamily = family;
    const stage = cell.missing ? '' : renderCell(cell);
    const body = cell.missing
      ? `<div class="gap"><b>本实现出不来这一态</b>${inline(cell.missing)}</div>`
      : `<div class="stage">${stage}</div>`;
    /*
     * 这一格用到、产品全局表里写过规则、却一条都没进这张页面的类名。
     * 有就**明写在格注里**:这一格的读数不是「实现没对上」,是量法没把规则搬进来。
     */
    const missedRules = stage ? missedSelectors(stage, sourceSelectors, inlinedSelectors) : [];
    if (missedRules.length) auditTotals.push(`#${cell.gid} ${cell.sub}: ${missedRules.join(' | ')}`);
    const auditNote = missedRules.length
      ? `<li class="audit">⚠️ <b>这一格有 ${missedRules.length} 条规则没内联进来,读数不可信</b>:`
        + `${missedRules.map((c) => `<code>${esc(c)}</code>`).join('、')} ——`
        + '这几条选择器在产品的全局样式表里真的命中了这一格的元素,却没被搬进这张页面,'
        + '于是量到的是浏览器默认值,看着像实现没对上。'
        + '修法是给 <code>buildPage()</code> 里对应的 <code>pick()</code> 补一条,<b>不是</b>去改组件。</li>'
      : '';
    const notes = (cell.notes ?? []).map((n) => `<li>${inline(n)}</li>`).join('') + auditNote;
    return `${header}<section class="cell"${cell.expand ? ` data-expand="${cell.expand}"` : ''}${cell.hover ? ' data-hover' : ''}${cell.crop ? ` data-crop="${cell.crop}"` : ''}${cell.scroll ? ` data-scroll="${cell.scroll}"` : ''}>
  <header><span class="no">#${cell.gid}</span><span class="sub">${cell.sub}</span>
    <span class="cmp">${esc(cell.cmp)}</span><span class="st">${esc(cell.state)}</span></header>
  ${body}
  ${notes ? `<ul class="notes">${notes}</ul>` : ''}
</section>`;
  }).join('\n');
  // 生成的时候也喊一声 —— 让人不必先打开页面才知道有格子的读数不可信
  if (auditTotals.length) console.warn(`⚠️ 漏内联(读数不可信)共 ${auditTotals.length} 格:\n  ${auditTotals.join('\n  ')}`);

  /*
   * 端到端那一族的格子。**刻意不复用 `.cell` / `<header>`**:
   *  · `diff-cells.mjs` 按 `document.querySelectorAll('.cell')` 取格并按下标配 gid;
   *  · `build-compare.mjs` 按 `<header><span class="no">#N</span>…` 那条**无属性**的正则
   *    取表头,解不出 84 条就直接 `process.exit(1)`。
   * 换个类名、给 `<header>` 加个属性,两条都稳稳落空;整段又排在陈列格之后,下标也动不到。
   */
  const liveCells = LIVE.map((cell) => {
    const covers = cell.covers.map((c) => `<li>${inline(c)}</li>`).join('');
    const notes = (cell.notes ?? []).map((n) => `<li>${inline(n)}</li>`).join('');
    return `<section class="e2ecell">
  <header class="e2ehead"><span class="tag">${esc(cell.id)}</span>
    <span class="cmp">${esc(cell.title)}</span><span class="st">${esc(cell.state)}</span></header>
  <div class="covers"><b>这一格专门去照陈列格照不到的:</b><ul>${covers}</ul></div>
  <div class="stage e2estage">${renderLive(cell)}</div>
  ${notes ? `<ul class="notes">${notes}</ul>` : ''}
</section>`;
  }).join('\n');

  const liveSection = `<h2 class="fam e2efam">端到端 · 真实形态回归<span class="e2etag">不是交付稿的 ${CELLS.length} 格</span></h2>
<div class="famnote e2enote">
<p><b>这一族没有对应的交付稿截图,不参与逐格比对。</b>上面陈列格是<b>逐个组件摆拍</b> ——
一格一个实体、一份夹具、一条分支;这一族喂的是<b>一整条真实会话</b>,回答的是另一个问题:
<b>串起来之后还是那个样子吗</b>。</p>
<p>建它是因为陈列格有一个结构性盲区:<b>它只照得到「喂了夹具的那条分支」</b>。
真实运行时可能走另一条,而那条在陈列格里没有格子,就永远照不到。活例子:</p>
<table>
<tr><th>照不到的分支</th><th>为什么</th></tr>
<tr><td>用户消息上方那块灰色的「本条消息带了哪些上下文」(<code>.msg-applied-context</code>)</td>
<td>陈列格的 <code>msg()</code> 传的是 <code>appliedContextItems={[]}</code> —— 这条分支从头到尾没被照过一次</td></tr>
<tr><td><code>runContext.workspaceItems</code> 的「Current」芯片</td><td>陈列格从没喂过这个字段</td></tr>
<tr><td><code>producedFiles</code> 的产物卡(含拿不出预览图的 <code>.md</code>)</td>
<td>第 30–33 格走的是另一条产出分支(<code>FileOpsSummary</code>),两条的准入名单不一样</td></tr>
<tr><td>一轮里<b>两张执行记录壳</b></td><td><code>renderCell</code> 只取 <code>shells[shells.length - 1]</code>,一格只摆一个实体</td></tr>
<tr><td>失败轮的报错卡</td><td>它由 <code>ChatPane</code> 挂在消息列表之后,不在 <code>AssistantMessage</code> 里,单摆一个组件够不着</td></tr>
<tr><td>done 密钥协议(<code>done_key</code> + <code>&lt;od-done key=…/&gt;</code>)</td>
<td>陈列格一条 <code>done_key</code> 都没有,那边跑的一直是「没有 key」的老判据分支</td></tr>
</table>
<p>这一族按产品的祖先链渲染:<code>.app</code>(<code>ProjectView</code>)→ 接缝(<code>ChatPane</code> 的 <code>chatSeam</code>)→
<code>.chat-log</code> → 消息。<b>组件一个字没改</b>,也没有替设计师点开 / 按住任何东西 ——
这一族要照的是「产线上打开会话第一眼看到什么」。</p>
<p><b>挂上去当场的收获</b>:</p>
<table>
<tr><th>照出什么</th><th>机制</th></tr>
<tr><td>✅ <b>用户气泡在一整条会话里也对上了</b> —— 量到 <code>rgb(32,32,32)</code> / <code>rgb(255,255,255)</code> /
<code>12px 12px 4px</code>,和第 45 格逐值相同</td>
<td>上一个提交删掉了 <code>routines.css</code> 里那条把气泡刷成 <code>#ededed</code> 的旧皮规则。
摆拍对上不等于串起来也对上,这一族是那次修复在真实形态下的复核</td></tr>
<tr><td>🐞 <b>一轮摞两张壳比想象中常见得多</b> —— E2E-1 开头只有一句 thinking,照样分了张</td>
<td>分张判据是「清单之前那张壳里有没有东西」,一句想法就算「有东西」。
陈列格看不到:第 2 格的夹具其实也分了张,那一句 thinking 在陈列页上从来没出现过。要不要收一收<b>待产品裁</b></td></tr>
<tr><td>🐞 <b>那两张壳头写着同一个耗时</b>(E2E-1 都是 1m 12s;E2E-4 第一张壳有工具行,就是 3.1s / 32s 两个数)</td>
<td><code>thinking</code> 事件不带时刻,第一张壳因此没有自己的跨度,<code>shellElapsed</code> 退回轮次跨度。
回退本身是有意的,但它在最常见的路径上正好制造出 <code>build-turn-blocks</code> 自己点名反对的画面</td></tr>
<tr><td>🐞 <b>回合状态行会说「已停止,仍有未完成任务」,而 <code>runStatus</code> 是 succeeded</b>(E2E-4 对 E2E-1)</td>
<td>agent 收尾时没再发一次清单快照,最后一条 todo 停在 <code>in_progress</code>。这条路径在产线上很常见,<b>待产品裁</b></td></tr>
</table>
</div>
${liveCells}`;

  return `<!doctype html>
<html lang="zh-CN" data-theme="light"><head><meta charset="utf-8">
<title>执行记录 · 镜像陈列页</title>
<style>${baseVars()}
${tokens}</style>
<style>${seam}</style>
<style>${record}</style>
<style>${qform}</style>
<style>${odcard}</style>
<style>${primitives}</style>
<style>${buttonSizes}</style>
<style>${userMsg}</style>
<style>${forkCss}</style>
<style>${bareButtonCss}</style>\n<style>${queueCss}</style>
<style>${amrCss}</style>
<style>${proseCss}</style>
<style>${artifactCss}</style>
<style>${footerBase}</style>
<style>${footerSkin}</style>
<style>${legacySkin}</style>
<style>${nextStepCss}</style>
<style>${actionCardCss}</style>
<style>${upgradeCss}</style>
<style>${quoteCss}</style>
<style>${errCss}</style>
<style>${audioCss}</style>
<style>${supportCss}</style>
<style>/* 稿子的 .sel:选中那截的高亮底(这段在模板串里,不能带反引号) */
.quote-sel{background:var(--selected-soft);border-radius:var(--radius-xs)}</style>
<style>${edge}</style>
<style>${planCss}</style>
<style>${statusCardCss}</style>
<!-- 端到端那一族专用,追加在最后;选择器陈列格一条都没用到 -->
<style>${liveLogCss}</style>
<style>${liveFlowCss}</style>
<style>${liveProducedCss}</style>
<style>${liveCompletionCss}</style>
<style>${liveModuleCss}</style>
<style>${PAGE_CSS}</style>
</head><body>
<h1>执行记录 · 镜像陈列页</h1>
<p class="lead">这一页里的每一格都是<b>我们的组件</b>渲染的,数据全部走一遍真实事件流。
编号与 <code>docs/design/chat-matrix/matrix-82.html</code> 一致,两页并排开着逐格对照即可。
覆盖<b>执行记录</b>(组件 7 / 9 / 10 / 11 / 12,第 1–11 格)、<b>理解段</b>(组件 3 / 4 / 5 / 8,第 12–27 格)、
<b>产出收尾</b>(组件 13 / 14 / 15 / 16 / 24,第 28–44 格)、<b>输入</b>(组件 1 / 2 / 21 / 23,第 45–69 格里的 20 格)与
<b>边界</b>(组件 6 / 17 / 18 / 19 / 20 / 22,第 70–84 格)。</p>
<p class="lead"><b>各族性质不同,别拿同一把尺子看</b>:执行记录、暂停、重连是这次新建的,每格数据都走一遍真实事件流;
<b>意图澄清 / 记忆卡 / 总结文案 / 产物卡 / 回合状态行 / 下一步引导 / Queue</b> 在产品里<b>已经有生产实现</b>,
这里挂的就是那些现成组件 —— 那几格照出来的是「现有实现离稿子有多远」,要做的是对齐,不是再造。</p>
<p class="lead"><b>出不来的格子照样出格</b>,每一格都写清是卡在<b>行为</b>、<b>数据 / 契约</b>、<b>产品裁决</b>,
还是<b>这一页本身够不着</b>(静态标记没有布局、没有 React state、渲染不了 portal)。
<b>没有</b>为了让某一格好看去改组件的行为、样式或默认值,也没有拿近似糊过去。
平铺形态下工具行的缩进(S7)与壳内叙述的颜色档(S22)在下面逐格标了。</p>
<p class="lead"><b>页面最后还有一段「端到端 · 真实形态回归」</b> —— 那几格<b>不是</b>交付稿那几格里的格子,
没有对应的设计稿截图、也不参与逐格比对。它们喂的是<b>一整条真实会话</b>,
用来照「逐格摆拍照不到的分支」和「组件单摆好看、串起来不对」。</p>
${cells}
${liveSection}
<script type="module">
/* ══ 这一页**自己重写产品逻辑**的地方,只有下面四处 ══════════════════════
   (这段在模板串里,所以整段不能带反引号。)
   这是一类和「漏内联」同级的风险:重写错了,量出来一样长得像实现走样,
   而且守卫看不见 —— 漏内联对账只管 CSS 规则,管不了脚本。所以在这里立一份清单,
   加第五处之前先想清楚能不能不加。

   ① 画球(下面这段)—— 重写的是 Orb.tsx 的 useEffect。**出过事**:
      它把 DOM 上的 data-orb-box 丢了、写死 15 / 20 两档,壳头那颗 24 被画成 20,
      壳头高度 36 → 32,逐格报成「壳头比稿子矮」。已修,兜底也写清楚了。
   ② data-expand 替设计师点开抽屉 —— **不是重写**,是这一页刻意的三处不同之一
      (稿子的实体本身就是点开后的样子);产线上跑完默认收起(D18)。
   ③ data-broken 藏掉打不开的缩略图 —— 只发生在离开 daemon 的静态页上。
   ④ details.leaf 点了不许开 —— 重写的是组件里由 React 拦的那条。判据是同一个类名,
      逻辑只有一句,风险比 ① 小,但它同样是「产品行为的第二份实现」。

   构建期还有三处**变换**(不是重写,但同样是「和产线不完全一样」):dehash() 摘 CSS
   Module 哈希、scope() 给大路名字的 module 加笼子、pick() 挑规则内联 ——
   最后这一处由 missedSelectors() 的对账守着。 */
${engine}
/* 陈列页专用的球:与 Orb.tsx 同一份引擎、同一套上色规则。
   静态页没有 React,所以在这里把 useEffect 里那段重写一遍;几何与墨色映射一字不差。 */
const GEOM = 20, STILL = 0.6;
function ink(host){
  const raw = getComputedStyle(host).getPropertyValue('--chat-anim-ink').trim();
  if(!raw) return null;
  const p = document.createElement('canvas').getContext('2d');
  if(!p) return null;
  p.fillStyle = '#000'; p.fillStyle = raw;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(p.fillStyle);
  return m ? [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)] : null;
}
function shade(c, white, alpha){
  if(!c){ const l = Math.round(white*255); return \`rgba(\${l},\${l},\${l},\${alpha})\`; }
  return \`rgba(\${c[0]},\${c[1]},\${c[2]},\${(alpha*(1-white)).toFixed(3)})\`;
}
for (const host of document.querySelectorAll('[data-orb]')) {
  /* 尺寸**读 DOM 上写着的那个数**,不要自己猜。
     产品的 Orb 把 box 写进 data-orb-box(壳头那颗传的是 24),这段脚本原来只认
     15 / 20 两档,于是壳头那颗被画成 20 —— 壳头高度跟着 36 掉到 32,
     逐格量出来像是「壳头比稿子矮 4px」,其实是这一页自己把产品的参数丢了。
     兜底仍是 15 / 20:没写 data-orb-box 的那两颗(思考 composing / 步骤 solving)
     产品里用的就是默认 20。 */
  const box = Number(host.dataset.orbBox) || (host.classList.contains('mark') ? 15 : 20);
  const cv = document.createElement('canvas');
  cv.style.width = box+'px'; cv.style.height = box+'px'; cv.style.display='block';
  host.appendChild(cv);
  const ctx = cv.getContext('2d'); if(!ctx) continue;
  const dpr = Math.min(2, devicePixelRatio||1);
  cv.width = Math.round(box*dpr); cv.height = Math.round(box*dpr);
  const preset = ORB.resolvePreset(host.dataset.orb, GEOM), frameOf = ORB.MODE_FRAMES[preset.mode], c = ink(host);
  const paint = (t) => {
    const f = frameOf(GEOM, t, preset.opts), k = dpr*box/GEOM;
    ctx.setTransform(k,0,0,k,0,0); ctx.clearRect(0,0,GEOM,GEOM);
    for(const l of f.lines){ ctx.strokeStyle = shade(c,l.white,l.a??1); ctx.lineWidth=l.w;
      ctx.beginPath(); ctx.moveTo(l.x1,l.y1); ctx.lineTo(l.x2,l.y2); ctx.stroke(); }
    for(const d of f.dots){ ctx.fillStyle = shade(c,d.white,d.a??1);
      ctx.beginPath(); ctx.arc(d.x,d.y,d.r,0,Math.PI*2); ctx.fill(); }
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const tick = () => { if(reduce.matches){ paint(STILL); return; }
    paint(performance.now()/1000*preset.speed); requestAnimationFrame(tick); };
  tick();
}
/* 替设计师点开:稿子里的实体就是「点开之后」的样子,收着没法逐格比。
   产线上跑完是默认收起的(D18),这一步只发生在陈列页。 */
for (const cell of document.querySelectorAll('[data-expand]')) {
  const shell = cell.querySelector('details');
  if (!shell) continue;
  shell.open = true;
  if (cell.dataset.expand === 'deep') {
    // 摊开**最后**一个抽屉,不是第一个:第一个是「执行计划 · N 步」,
    // 稿子那一格里没有它;要比的是干了活的那条 todo
    const inner = [...shell.querySelectorAll(':scope > .body > details')].pop();
    if (inner && !inner.classList.contains('leaf')) inner.open = true;
  }
}
/* 附件缩略图与 agent 头像取不到就藏起来 —— 见 PAGE_CSS 里 [data-broken] 那条。
   两者的 src 都指向真实运行时(项目文件的 raw 端点、以及 agent 图标目录),
   离开 dev server 就是打不开的图;浏览器画的「碎图」图标会盖住要比的那件事。
   (这段在模板串里,所以不能带反引号。) */
for (const im of document.querySelectorAll('.stage .msg-att-mini, .stage .role-agent-icon')) {
  const mark = () => im.setAttribute('data-broken', '');
  if (im.complete && !im.naturalWidth) mark();
  im.addEventListener('error', mark);
}
/* 没有内容的抽屉点了也不该开 —— 组件里由 React 拦,静态页里这样拦 */
for (const d of document.querySelectorAll('details.leaf')) {
  d.addEventListener('toggle', () => { if (d.open) d.open = false; });
}
</script>
</body></html>`;
}

/** 注记里的 `**粗**` 与 反引号 —— 页面上要出效果,不能把星号原样印出来 */
function inline(s: string): string {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const PAGE_CSS = `
body{margin:0;padding:32px 28px 80px;background:var(--bg);color:var(--text);
  font-family:var(--sans);font-size:13px;line-height:1.5;}
h1{margin:0 0 6px;font-size:20px;}
.lead{max-width:78ch;margin:0 0 12px;color:var(--text-muted);}
.lead code{font-family:var(--mono);font-size:12px;}
.famnote{max-width:760px;margin:12px 0 0;padding:12px 15px;border:1px solid var(--border);
  border-radius:10px;background:var(--bg-subtle);font-size:12px;line-height:1.65;}
.famnote p{margin:0 0 8px;}
.famnote p:last-child{margin-bottom:0;}
.famnote table{border-collapse:collapse;width:100%;margin:0 0 8px;}
.famnote th,.famnote td{border-bottom:1px solid var(--border);padding:5px 8px;text-align:left;vertical-align:top;}
.famnote th{color:var(--text-muted);font-weight:600;}
.famnote td:first-child{white-space:nowrap;color:var(--text-muted);}
.fam{max-width:760px;margin:34px 0 0;padding-bottom:6px;border-bottom:2px solid var(--text-strong);
  font-size:15px;letter-spacing:.02em;}
.cell{max-width:760px;margin:22px 0;border:1px solid var(--border);border-radius:12px;overflow:hidden;
  background:var(--bg-panel);}
.cell header{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;padding:9px 14px;
  border-bottom:1px solid var(--border);background:var(--bg-subtle);}
.no{font-family:var(--mono);font-weight:700;color:#059669;}
.sub{font-family:var(--mono);font-size:12px;color:var(--text-soft);}
.cmp{font-weight:600;}
.st{color:var(--text-muted);font-size:12px;}
.stage{padding:14px;background:var(--bg);
  /* 展位宽度**对齐交付稿**:稿子那张矩阵页每格的 .ent-b 实测 440px(内距 14 → 内容 412)。
     原来这里是 760px,于是所有按百分比撑开的元素两边天生对不上 ——
     逐属性比对看不见这件事(属性值一样),逐位置比对会把它当成上千处差异报出来,
     真正的错位淹在里面。宽度一致之后,量到的位置差才都是实现差。
     (这段在模板串里,所以不能带反引号。) */
  width:440px;max-width:100%;}
/* 产品那条全局 box-sizing: border-box 住在 styles/base.css,而这一页只内联了
   tokens / 接缝 / 那几份组件样式 —— 少了这一条,所有带边框的盒子都按 content-box 量:
   57px 的图卡量出来是 59、180px 的文档卡量出来是 221,「57 = 文档卡的自然高度」
   这条判据在页面上就对不上。只补在陈列格里面,页面自己的排版不受影响。 */
.stage,.stage *{box-sizing:border-box;}
.gap{margin:14px 16px;padding:11px 13px;border:1px dashed var(--border-strong);border-radius:8px;
  color:var(--text-muted);background:var(--bg);}
.gap b{display:block;margin-bottom:3px;color:var(--red);}
.notes{margin:0;padding:9px 16px 11px 32px;border-top:1px dashed var(--border);
  color:var(--text-muted);font-size:12px;background:var(--bg-subtle);}
.notes li+li{margin-top:3px;}
.notes code{font-family:var(--mono);}
/* 替设计师按住 hover(data-hover):稿子的 hover 格画的就是「鼠标停在上面」的样子,
   静态页里没有鼠标,所以把 :hover 的那两条规则在这儿原样重放。
   产线上仍旧只有真的 hover / focus 才浮出,组件一个字没改。 */
/* 附件行「还能往哪边翻」是量出来的,静态页量不到 —— 陈列页替它摆出那个状态 */
.cell[data-scroll="next"] .msg-att-nav.mod-next,
.cell[data-scroll="both"] .msg-att-nav.mod-next,
.cell[data-scroll="prev"] .msg-att-nav.mod-prev,
.cell[data-scroll="both"] .msg-att-nav.mod-prev{display:flex;}
/* 藏的是行里的时间和复制,不是整行(重试常驻,见 chat.css 那段长注释),
   所以重放 hover 的目标也要跟着落到那两样身上 —— 打在整行上等于没打。 */
.cell[data-hover] .msg.user .user-actions-time,
.cell[data-hover] .msg.user .user-actions button:not(.user-keep-btn){
  opacity:1;pointer-events:auto;}
/* 图卡的缩略图指向 daemon 的 /api/projects/:id/raw/…,离开 daemon 就是一张打不开的图。
   取不到就把 <img> 藏掉,露出卡自己的底色当占位(标记由下面那段脚本打)——
   浏览器画的「碎图」图标会盖住要比的那件事:卡多大、圆角多少、一行里两种卡同不同高。 */
.stage .msg-att-mini[data-broken],
.stage .role-agent-icon[data-broken]{visibility:hidden;}
/* 第 42 格同理:稿子的 hover 格画的就是「鼠标停在**第二条**上」的样子
   (matrix-82 的 is-hover 落在「把商品卡换成两列布局」那一行)。
   这里把 NextStepActions.module.css 里 .suggestions .suggestionRow:hover 那两条
   原样重放到第二行 —— 底、字、箭头三样一起转,和组件里写的一字不差。
   (类名的哈希由 dehash 摘掉了,所以选择器就是源文件里写的那个。) */
.cell[data-hover] .stage .suggestions .suggestionRow:nth-of-type(2){background:var(--bg-panel);color:var(--text-strong);}
.cell[data-hover] .stage .suggestions .suggestionRow:nth-of-type(2) svg{color:var(--text-strong);}
/* 第 71 格同理:稿子那一格画的就是「鼠标停在药丸上」的样子(它的 DOM 自带 .is-hover)。
   这里把 PlanPill.module.css 里 .wrap:hover 那两条原样重放到笼子里。
   产线上仍旧只有真的 hover / focus 才浮出,组件一个字没改。 */
.cell[data-hover] .cage-plan .pop{opacity:1;}
.cell[data-hover] .cage-plan .pill{border-color:var(--border-strong);}
/* 产物卡的缩略图 / 视频同样指向 daemon 的 /api/projects/:id/raw/…,离开 daemon 打不开。
   这里给它们铺一层占位底色而不是藏掉 —— 第 33 格要比的正是「竖片按 9/16 居中、两边留白」,
   把 <video> 藏了那条留白就看不见了。html 卡走的是 iframe,about:blank 本来就是白的。 */
.stage .artifact-card-media{background:var(--bg-muted);}
.stage .artifact-card-frame{background:var(--bg-subtle);}
/* 视频卡:组件写的是 width:auto + object-fit:contain —— 竖片的 9/16 留白是**真片子**
   自带的内在尺寸撑出来的。这一页上 <video> 加载不了,width:auto 就落回 <video> 的默认
   300px,看到的会是一块横的占位,第 33 格要比的那条留白正好消失。所以这里替它补上竖片的
   长宽比(只补在陈列格里,组件一个字没改)——同 data-hover / data-expand 一个性质。 */
.stage .artifact-card--video .artifact-card-media{position:absolute;inset:0;margin:auto;
  width:auto;height:100%;aspect-ratio:9/16;}
/* ── 端到端那一族 ────────────────────────────────────────────────────
   长得**和陈列格明显不一样**是有意的:它们没有设计稿可对,验收的人不该把它们
   当成第 85 格去逐格比。所以换一套边框色、换一枚标签,编号也从井号数字换成 E2E-N。
   (这段在模板串里,所以不能带反引号。) */
.e2efam{margin-top:52px;border-bottom-color:#7c3aed;color:#5b21b6;
  display:flex;align-items:center;gap:10px;}
.e2etag{padding:1px 8px;border:1px solid #ddd0fb;border-radius:999px;
  background:#f6f2ff;color:#6d28d9;font-size:11px;font-weight:600;letter-spacing:0;}
.e2enote{border-color:#e4daff;background:#faf7ff;}
/* 上面 .famnote 的第一列是「#38 分叉分界」那种短标签,所以写死了 nowrap。
   这一族第一列是整句话,不放开的话表格会撑到 1667px,整页横向出条。 */
.e2enote table{table-layout:fixed;}
.e2enote td:first-child{white-space:normal;color:var(--text);width:34%;}
.e2ecell{max-width:760px;margin:22px 0;border:1px solid #e4daff;border-radius:12px;overflow:hidden;
  background:var(--bg-panel);}
.e2ehead{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;padding:9px 14px;
  border-bottom:1px solid #e4daff;background:#faf7ff;}
.e2ehead .tag{font-family:var(--mono);font-weight:700;color:#6d28d9;}
.e2ehead .cmp{font-weight:600;}
.e2ehead .st{color:var(--text-muted);font-size:12px;}
.covers{padding:9px 16px 10px;border-bottom:1px dashed #e4daff;background:#fdfcff;
  color:var(--text-muted);font-size:12px;}
.covers b{color:#6d28d9;}
.covers ul{margin:4px 0 0;padding-inline-start:16px;}
.covers li+li{margin-top:3px;}
/* 展位比陈列格宽一点:这里装的是一整条会话,而 440 是交付稿单格的宽度。
   460 是产品里聊天面板的默认宽度(split-chat-slot 的初值),照它来。
   (这段在模板串里,所以不能带反引号。) */
.e2estage{width:460px;}
`;
