/**
 * 执行记录里的一行 —— 这一次调用干了什么。
 *
 * 五种写法(逐条对设计稿,不是我编的排列):
 *   读 / 写 / 改文件   动词 + 文件名按钮 + 改动量(跑完的行:有改动量就显示改动量,
 *                     没有才显示耗时;**还在跑的行两个都显示** —— 见下面写文件那一支)
 *   搜索              「搜索 <模式>」+ 命中数(D23:搜索是一等类别)
 *   跑命令 · 有人话     折叠块:标题是 agent 给的 description,展开是命令与输出(组件 11)
 *   跑命令 · 没人话     「执行 <命令>」单行,输出不在行里(S8;codex 全程没有 description)
 *   失败              两种写法:只给「失败」按钮,或把原因跟在名字后面 —— 是否有意区分 = S1 待设计答
 *
 * ⚠️ **「执行中」这一档 2026-09-02 加回来了**(OPEND-2419,D3 作废)。原来是「调用跑完
 * 才落行」,代价是一次卡住 14.1 分钟的下载在界面上完全不存在,用户看到「转了 40 分钟
 * 什么都没出来」。现在 `row.pending` 为真就先把行画出来:
 *   行首  转着的球(轮次还在跑)/ 中性灰(轮次已经停了 —— 不许继续转圈)
 *   耗时  槽照旧留着,而且**填上实时递增的秒数**(见下面那一段)
 *
 * ── 进行中的行也报耗时(**有意偏离设计稿**,产品 2026-09-02)─────────────
 *
 * 稿子明确**不给**进行中的行挂耗时,理由逐字写在 Thinking 那一格:
 *   「**不挂耗时**:这一行**只活到第一个字落地为止**,给一个马上要消失的状态配一个
 *     跳动的秒数,只会把注意力钉在一个从此不再相关的数字上;总耗时在任务进度那一格里。」
 * 所以上一轮(G2)只按稿子留了个**空的** `.ms` 槽(`<span class="ms"></span>`),
 * 目的是数值落地那一刻箭头不横跳。
 *
 * 产品推翻的是它的**前提**:「只活到第一个字落地为止」对推理模型不成立。真实数据里
 * 有**单轮思考 28.5 分钟**、**单个 Bash 卡住 14.1 分钟**的案例(诊断包 run `3fc3b3ae`)。
 * 一个要持续半小时的状态,说它「马上要消失」是错的 —— 用户的实感正是
 * 「跑了 40 分钟什么都没出来」,而那 40 分钟里执行记录上一个数字都没有。
 * 产品原话:「为啥思考中不会有计时?我感觉**进行中的 toolrow 都得有计时**吧?」
 * 裁决覆盖三类行:思考中 / 工具行 / 步骤行。稿子留的那个空槽正好接住这个值,
 * 箭头一格都不用挪。
 *
 * 秒数**不在这一层算**,也没有新起定时器:`build-turn-blocks` 用轮次共用的实时终点
 * (`liveEndMs`)把它算进 `row.elapsedMs`,这里照旧只画。
 * ⚠️ 那个 span 不许挂 `aria-live` —— 挂了读屏会每秒念一遍。
 * 判据钉在 `tests/components/chat/live-row-elapsed.test.tsx`。
 */
import { memo, type ReactElement, type ReactNode } from 'react';
import { useT } from '../../../i18n';
import type { ToolRow as ToolRowData } from '../../../runtime/chat/contract';
import { formatElapsed } from '../../../runtime/chat/format';
import { openableRecordFilePath, type RecordFileScope } from '../../../runtime/chat/record-file-open';
import { FileButton } from './FileButton';
import { Foldable } from './Foldable';
import { StatusMark } from './StatusMark';
import { TerminalOutput } from './TerminalOutput';
import { toolIcon } from './icons';
import styles from './record.module.css';

/**
 * 终端输出的记忆化边界**落在这一层**,不在 `TerminalOutput` 自己身上 ——
 * 要挡的正是这一层的重渲:轮次跑着的时候 `AssistantMessage` 每秒 tick 一次
 * (`useTickingNow`),整棵树跟着重渲一遍。装依赖的输出能有几百行、一行一个节点,
 * 一个跟输出无关的秒数跳动不该把它们全部重算。`text` 没变就整块跳过。
 * 数字钉在 `tests/components/chat/terminal-render-cost.test.tsx`。
 */
const Terminal = memo(TerminalOutput);

export interface ToolRowProps {
  row: ToolRowData;
  onOpenFile?: (path: string) => void;
  /**
   * 判「这个文件名该不该做成打开入口」需要的作用域。不传 = 只有相对路径的写 / 改
   * 还能成链接;判据与理由全在 `runtime/chat/record-file-open.ts`。
   */
  fileScope?: RecordFileScope;
  /** 点「失败」看原因;不传就不出那颗按钮 */
  onShowFailure?: (row: ToolRowData) => void;
  /** Static mirrors can keep collapsed command bodies in the emitted HTML. */
  deferBody?: boolean;
  /**
   * 这一轮还在跑吗 —— 只决定**没回来的调用**画成哪一档标记。
   * 默认 false:轮次停了还转圈是新 bug,拿不到上下文时宁可画中性灰。
   */
  running?: boolean;
}

export function ToolRow({
  row,
  onOpenFile,
  fileScope,
  onShowFailure,
  deferBody = true,
  running = false,
}: ToolRowProps): ReactElement {
  const t = useT();
  const elapsed = formatElapsed(row.elapsedMs);
  /*
   * 行首那一格。没回来的调用换成状态标记 —— 轮次还在跑是转着的球,轮次停了退成
   * 中性灰(和 `markFor` 的「中断时正在跑的:中性灰,红要留给真的错误」同一条规矩;
   * 绿勾是假成功、红叉是假错误,两个都不能用)。
   */
  const icon = row.pending
    ? <StatusMark status={running ? 'running' : 'pending'} />
    : <span className={styles.icon}>{toolIcon(row.tool)}</span>;
  /*
   * 耗时槽。进行中时**已经有值了**(实时递增,见文件头那一段偏离设计稿的说明);
   * 只有连起点都拿不到的那一档才留空 —— 空槽照旧吃掉 `.meta + .chev { margin-left: 0 }`
   * 那条,数值落地时箭头不会横跳。
   */
  const metaSlot = elapsed
    ? <span className={styles.meta}>{elapsed}</span>
    : row.pending ? <span className={styles.meta} /> : null;

  /**
   * 这一行该不该**自动**摊开 —— 只回答生命周期那一半。
   *
   * 「自动」的对家是**用户自己掀的**:那一半归 `Foldable` 的 `userToggled` 闩,
   * 一旦用户动过手,下面这个值就再也拨不动它。
   *
   * 两条各有各的理由,而且**判据不同**:
   *
   *  · **此刻真的在跑** → 摊开。输出正一行行长出来,收着就等于让用户对着一行静止的
   *    字干等几十秒(稿子 `body-components.html:1010` 的 `<details class="fold" open>`)。
   *
   *    判据是 `row.pending && running`,**两个都要**。`row.pending` 的定义是
   *    `result == null` —— 「这次调用**从来没有回来过**」,不是「它此刻还在跑」。
   *    用户按停止时那条在飞的调用永远等不到 `tool_result`,`pending` 就永远为真;
   *    只看它,那一行会**永远摊着**,而且以后每次重载这条老会话都还摊着(装依赖那种
   *    几百行输出的,一条顶掉整屏)。`running` 才是「此刻」——
   *    `ExecutionShell:78` 的 `shell.status === 'running' && !shell.stopped`。
   *
   *    ⚠️ 别改成「轮次终止时把 `row.pending` 清掉」:行首那一格靠它分档
   *    (见上面 `icon`),清掉就等于给一次没跑完的调用画上跑完的工具图标 ——
   *    `build-turn-blocks` 的 `closeRunningSegments` 把这条规矩写在 todo 那一半上,
   *    逐字是「标成完成是替 agent 说了它没说过的话」。工具行同理。
   *
   *  · **失败** → 摊开。报错原文是这时候唯一要读的东西(稿子 `:1018` 的
   *    `fold is-fail open`)。这一条和轮次跑没跑**无关**:失败是结算过的终态。
   *
   * 判据钉在 `tests/components/chat/stopped-run-row-collapse.test.tsx`。
   */
  const lifecycleOpen = (row.pending && running) || row.failed;

  /**
   * 这次失败**有没有原文可给**。
   *
   * `build-turn-blocks` 那一端已经把「整段是空白」回落成 `null` 了,这里再挡一次
   * 是因为**判据落在这一层**:下面用它决定这一行是折叠块还是单行,而
   * 「画一个展不开的折叠块」比「画一个空原因」更难发现。两层都不贵。
   */
  const failText = row.failReason?.trim() ? row.failReason : null;

  /*
   * 这一行的文件名能不能打开,以及打开的是**哪个项目相对路径**(不是 agent 给的
   * 那个绝对路径 —— 打开回调按项目相对文件名匹配)。算不出来就不做链接:
   * 读取一律不做,写 / 改要拿得到「这个路径属于当前项目」的正面证据。
   */
  const openPath = openableRecordFilePath(row, fileScope);
  const fileName = (): ReactElement | null => (row.file
    ? (
      <FileButton
        path={openPath ?? row.file.path}
        label={row.file.label}
        onOpen={openPath ? onOpenFile : undefined}
        elide
      />
    )
    : null);

  const failButton = row.failed && onShowFailure
    ? <button type="button" className={styles.why} onClick={() => onShowFailure(row)}>{t('chat.record.failed')}</button>
    : row.failed
      ? <span className={styles.why}>{t('chat.record.failed')}</span>
      : null;

  const rowClass = `${styles.tool}${row.failed ? ` ${styles.fail}` : ''}`;

  /* 搜索:显示搜了什么、命中几处。命中数取代耗时 —— 用户关心的是找到没有,不是快不快 */
  if (row.tool === 'search' && row.pattern && !row.failed) {
    return (
      <div className={rowClass}>
        {icon}
        <span className={styles.name}>
          {t('chat.record.verb.search')}{' '}
          <FileButton path={row.pattern} label={row.pattern} />
        </span>
        {row.hits != null
          ? <span className={`${styles.meta} ${styles.num}`}>{t('chat.record.hits', { count: row.hits })}</span>
          : metaSlot}
      </div>
    );
  }

  /*
   * 文件类:动词 + 文件名。**跑完**的行改动量和耗时二选一(设计稿:写文件不挂耗时,
   * 挂改动量)——稿子里每一行要么 `.dst` 要么 `.ms`,从来没有同时出现过。
   *
   * ⚠️ **在途那一行两个都挂**(有意偏离设计稿,产品 2026-09-03)。稿子根本没画过
   * 「正在写文件」这一态:它假设写文件是一瞬间的事,行一出现就已经写完了,所以
   * 只需要一个结果数字。真机把这个前提推翻了 —— 一个 27.6KB 的页面,入参逐字符
   * 流过来花了 140 秒,那一百多秒里行上只有一个秒表在转。产品原话:
   * 「写入的行数能否动态增加,外加一个增长的计时?」两个数字回答的是两个问题:
   * 行数说「写到哪了」,秒数说「还在动」。少任何一个都答不完整。
   *
   * 排布不用新写:`.delta` 自带 `margin-inline-end: auto`、`.meta` 自带
   * `margin-left: auto`,两个 auto 把空白让给中间 —— 改动量贴着文件名,耗时靠右,
   * 正好是稿子里那两格各自本来的位置。
   */
  const verb = fileVerb(row, t);
  if (verb && row.file && !row.failed) {
    return (
      <div className={rowClass}>
        {icon}
        <span className={styles.name}>
          {verb} {fileName()}
        </span>
        {row.delta
          ? (
            <>
              <span className={styles.delta}><i>+{row.delta.added}</i><i>−{row.delta.removed}</i></span>
              {row.pending ? metaSlot : null}
            </>
          )
          : metaSlot}
      </div>
    );
  }

  /*
   * Bash 已能确认动作、但目标是多文件 / glob / 动态变量时,不能伪造一个
   * 可点文件。动词仍然应该如实显示,只把剩下的命令摘要当普通文字。
   */
  const semanticVerb = row.tool === 'search' ? t('chat.record.verb.search') : verb;
  if (semanticVerb && row.command && row.rawTitle && !row.failed) {
    return (
      <div className={rowClass}>
        {icon}
        <span className={styles.name}>
          {semanticVerb} <FileButton path={row.command} label={row.title} />
        </span>
        {row.tool === 'search' && row.hits != null
          ? <span className={`${styles.meta} ${styles.num}`}>{t('chat.record.hits', { count: row.hits })}</span>
          : metaSlot}
      </div>
    );
  }

  /*
   * 失败的文件行:**有报错原文就做成折叠块**,原文进正文(T49)。
   *
   * ⚠️ **稿子画的是另一样,这是产品口述裁决**。稿子 `body-components.html:917`
   * 的文件类失败逐字是单行 + 一颗按钮 + 耗时:
   *     <div class="tool is-fail">…<button class="why">失败</button><span class="ms">1.2s</span></div>
   * 只有 `:1018-1019` 的**命令**类失败是 `<details class="fold is-fail" open>`。
   * 产品 2026-09-03 指着后者说:「**能下拉展开吗?像这样**」—— 把命令类那一档的
   * 待遇给到文件类。别把这一段当照稿实现来读。
   *
   * ── 为什么这个偏离站得住 ─────────────────────────────────────────────
   *
   * `failReason` **有意不截断**(`build-turn-blocks` 的注释:「一次 stderr 可能
   * 几百字符,截到多长是产品的事」)。而原来那段原文被拼进**单行**
   * (`{动词} {文件名} · {原因}`),几百字符靠 CSS 省略号截掉 —— 递出来了,却读不到。
   *
   * ── 顺带合掉了稿子那两种写法(规格 S1)───────────────────────────────
   *
   * 原来是两支:带 `failReason` 的那支把原因拼在名字后面**且没有**「失败」标记;
   * 不带的那支给「失败」标记。S1 一直开着(「两种写法是否有意区分」)。现在摘要
   * **恒是**稿子 `:917` 那一行(动词 + 文件名 + 「失败」+ 耗时),原文进正文,
   * 两支的差别只剩**有没有原文可给** —— 有就能展开,没有就是单行(见下)。
   * 摘要不再拼原文:展开之后同一段话出现两遍。
   *
   * 「收起时看不到原因」不是代价 —— 失败行默认就是展开的(共用上面那个
   * `lifecycleOpen`,稿子 `:1018` 的 `open`),原文一上屏就在,只是落在第二行。
   *
   * 正文复用 `Terminal`(`.term`:`max-height: 104px` + `overflow-y: auto` +
   * 贴底跟随),不另写一套:一段几百字符的 stderr 和一段命令输出在这一层是同一件
   * 东西 —— agent 原样回给我们的文本。
   */
  if (row.failed && row.file && failText) {
    return (
      <Foldable
        summary={(
          <>
            {icon}
            <span className={styles.name}>
              {verb ?? t('chat.record.verb.write')}{' '}
              {fileName()}
            </span>
            {failButton}
          </>
        )}
        elapsed={elapsed ?? undefined}
        lifecycleOpen={lifecycleOpen}
        deferBody={deferBody}
        className={styles.fail}
      >
        <div className={styles.code}>
          <Terminal text={failText} />
        </div>
      </Foldable>
    );
  }

  /*
   * 没有原文可给:回到稿子 `:917` 那一行。
   * **不做成折叠块** —— 一个展不开的折叠块比单行更糟(多一枚骗人的箭头)。
   */
  if (row.failed && row.file) {
    return (
      <div className={rowClass}>
        {icon}
        <span className={styles.name}>
          {verb ?? t('chat.record.verb.write')}{' '}
          {fileName()}
        </span>
        {failButton}
        {metaSlot}
      </div>
    );
  }

  /*
   * 跑命令 · 有人话标题:折叠块(组件 11)。
   *
   * 默认状态逐字照稿子(`docs/design/chat-panel/src/body-components.html:1002-1021`
   * 的 `cmp-meta`):「**执行中展开 → 完成收起**」。三格样例各自是:
   *   · `:1010-1011` 执行中 —— `<details class="fold" open>`,正文是命令 + 实时输出
   *   · `:1014-1015` 成功   —— `<details class="fold">`,不带 `open`
   *   · `:1018-1019` 失败   —— `<details class="fold is-fail" open>`,报错原文是这时候唯一要读的东西
   *
   * ⚠️ 这里原来是 `defaultOpen={row.failed}` —— **只有失败展开,执行中漏了**。
   * 叠上 `deferBody`(收起的折叠块连 body 都不挂载),后果是一条跑了 57 秒的命令,
   * 这 57 秒里 DOM 上一个字的输出都没有 —— 哪怕在途输出此刻已经躺在 `row.terminal` 里
   * (`build-turn-blocks.ts` 的 `inFlightOutputOf`)。用户看到的就是「跑了一分钟什么都没有」。
   *
   * 而且 `defaultOpen` **修不了「跑完收起」**:它只是初始值,状态翻面时没人再看它一眼
   * (同 `Foldable` 的 `lifecycleOpen` 那段)。所以走 `lifecycleOpen` —— 它还顺带
   * 保住了用户的手:跑的时候手动收起的,跑完不许替他打开;手动展开的,不许替他收走。
   */
  if (row.command && !row.rawTitle) {
    return (
      <Foldable
        summary={<>{icon}<span className={styles.name}>{row.title}</span>{failButton}</>}
        elapsed={elapsed ?? (row.pending ? '' : undefined)}
        lifecycleOpen={lifecycleOpen}
        deferBody={deferBody}
        /*
         * 失败标记要落在**这一行自己**身上,和 `div.tool` 那几支一致
         * (稿子同样是 `class="fold is-fail"`)。少了它,CSS 只能靠 summary 里
         * 那枚「失败」标记反推,而「整行静音灰」的例外(稿子 `:not(.is-fail)`)
         * 正是挂在这个类上的。
         */
        className={row.failed ? styles.fail : undefined}
      >
        <div className={styles.code}>
          <div className={`${styles.term} ${styles.cmd}`}><div>{row.command}</div></div>
          {row.terminal ? <Terminal text={row.terminal} /> : null}
        </div>
      </Foldable>
    );
  }

  /*
   * 跑命令 · 没有人话标题:**同一个折叠块**(产品 2026-09-03)。
   *
   * ⚠️ **稿子没画过这一态,这是按产品裁决补的** —— 依据与边界都写在这里,别当成
   * 照稿实现。原话:「(AMR 那种没标题的命令行)AMR 要的吧?**统一一下**?并且
   * **要支持流式**?」
   *
   * ── 为什么原来是单行,而这恰好是最坏的错配 ─────────────────────────────
   *
   * 分流判据是 `isRawCommandTitle = isCommandTool(name) && !input.description`。
   * **谁落在哪一支是量出来的**(179 条 langfuse 录音 + W123 那次 vela 实录),不是推的:
   *
   * | 链路 | bash 带 description | 落在哪一支 |
   * |---|---|---|
   * | claude(stream-json) | 47 / 48 带 | 上面那支(有标题) |
   * | opencode **直连 CLI** | 71 / 71 带 | 上面那支 |
   * | **codex** | **0 / 569 带** | **这一支** |
   * | **AMR / ACP(vela → opencode)** | **不带** | **这一支** |
   *
   * ⚠️ 两条容易搞反的:
   *  · 我一度把这一支写成「opencode 一类的 bash 入参只有 `{ command }`」。**直连的
   *    opencode 正好相反**,71 次全带 description。不带的是**走 ACP 那一跳**的时候 ——
   *    `apps/daemon/tests/fixtures/w123-acp-inflight-frames.json` 里 vela 实录的 bash
   *    `rawInput` 逐字是 `{"command": …, "timeout": 180000}`,没有 description。
   *    也就是说同一个 opencode,直连与经 vela 走的是**两条不同的支**。
   *  · 这一支**最大的住户是 codex**(569 次调用 / 36 条录音,100% 不带),不是 AMR。
   *    这个文件开头那句「S8;codex 全程没有 description」本来就写着,别再漏掉它。
   *
   * 于是修之前是「有输出的看不见,看得见的没输出」:
   *   · Claude 家族  有折叠块可以放输出,但 **daemon 拿不到在途输出** ——
   *     stream-json 里 `tool_use` 与 `tool_result` 之间没有任何携带部分输出的帧;
   *   · AMR / ACP  `tool_in_flight` **一直在发**在途输出(封顶 2000 字符,
   *     `ACP_IN_FLIGHT_TOOL_OUTPUT_LIMIT`),却只有一行字可以放它 —— 唯一一条
   *     真的有实时输出的链路,全程没有地方显示。
   *   · codex 两头都没有:既没有在途输出,也没有放它的盒子。统一之后它至少拿到了盒子,
   *     结算的输出终于有地方读(在此之前 569 次调用的输出**一次都没上过屏**)。
   *
   * ── 稿子里能拿到的两条线索 ─────────────────────────────────────────────
   *
   * 全稿 `执行 <命令>` 单行**只有 1 处**(`body-components.html:909`),而那一处是
   * **已完成态**:行首是静态终端图标不是转圈球,右侧是结算过的 `8.4s`。稿子**会**
   * 画进行中的单行(`:1037` 生图那条是转圈球 + `2/4`),所以不是「稿子不画进行中
   * 单行」,而是**专门没画过 exec 的进行中形态**。
   *
   * 第二条线索在同一行里:`:909` 那颗按钮的 `aria-label` 逐字是
   * **「查看 npm run build 的输出」** —— 稿子自己就把这一行的用途写成「看输出」,
   * 只是没画出「看」之后长什么样。这次补的就是那一半。
   *
   * ── 补法:与上面那支逐字同构,不另发挥 ─────────────────────────────────
   *
   * summary 保留稿子 `:909` 的原样(动词 + 等宽命令 + 秒数槽),正文直接复用同一个
   * `div.code`;开合规则用**同一个** `lifecycleOpen`,所以「执行中展开 → 完成收起」
   * 和「用户手动开合优先」两条一次都不用重写。
   *
   * 两个刻意的克制:
   *  · **命令不做 `elide`** —— `FileButton` 的省略是给文件名设计的(保后缀、中间省),
   *    拿去截命令会把 `wc -l a.md transcript.html` 截成 `wc -l a.md tr….html`,
   *    读起来像另一条命令。收起时的截断归 CSS 的 `text-overflow`。
   *  · **开合走上面那个共用的 `lifecycleOpen`** —— 和有标题那支同一个值,不在这里
   *    另写一份。它的 `row.failed` 那一项在这一支上永假(条件里带 `!row.failed`,
   *    失败的命令行落到下面的兜底单行),但共用一个量比复制一个"这里刚好用不到"的
   *    简化版更难写歪:两支的开合规则从此只有一处可改。
   */
  if (row.command && row.rawTitle && !row.failed) {
    return (
      <Foldable
        summary={(
          <>
            {icon}
            <span className={styles.name}>
              {t('chat.record.verb.exec')} <FileButton path={row.command} label={row.title} />
            </span>
          </>
        )}
        elapsed={elapsed ?? (row.pending ? '' : undefined)}
        lifecycleOpen={lifecycleOpen}
        deferBody={deferBody}
      >
        <div className={styles.code}>
          <div className={`${styles.term} ${styles.cmd}`}><div>{row.command}</div></div>
          {row.terminal ? <Terminal text={row.terminal} /> : null}
        </div>
      </Foldable>
    );
  }

  /* 兜底:标题原样一行。元工具(ToolSearch 等)走这里,按工具名显示,不硬归类(T4) */
  return (
    <div className={rowClass}>
      {icon}
      <span className={styles.name}>
        {row.tool === 'other' ? `${row.name} ` : null}
        {row.rawTitle ? <code>{row.title}</code> : row.title}
      </span>
      {failButton}
      {metaSlot}
    </div>
  );
}

type Translate = ReturnType<typeof useT>;

function fileVerb(row: ToolRowData, t: Translate): ReactNode {
  if (row.tool === 'write') return t('chat.record.verb.write');
  if (row.tool === 'edit') return t('chat.record.verb.edit');
  if (row.tool === 'delete') return t('common.delete');
  if (row.tool === 'read') return t('chat.record.verb.read');
  return null;
}
