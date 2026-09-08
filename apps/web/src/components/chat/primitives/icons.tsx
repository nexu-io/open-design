/**
 * chat 用到的图标。**路径数据逐字取自设计稿**(`docs/design/chat-panel-next.html`),
 * 不手抄、不换库 —— 手抄一次就会和稿子漂移,后面再也对不上。
 *
 * 尺寸和颜色一律由 CSS 决定(`.ti > svg` / `.mk svg`),这里只给形状,
 * 所以每个图标都不写 width/height。
 *
 * 笔画则相反 —— 见 `STROKE_ICON` 的注释。
 *
 * 稿子里有**两族**字形,别把它们混成一族:描边的摊 `STROKE_ICON`,
 * 实心的摊 `FILL_ICON`(「新建」、失败记号、重试箭头)。两族各有各的判据,
 * 见 `tests/components/chat/icon-stroke-weight.test.tsx`。
 */
import type { ReactElement } from 'react';
import type { ToolKind } from '../../../runtime/chat/tool-kind';
import { REMIX_ICON_PATHS } from '../../remix-icon-paths';

/**
 * chat 描边图标的**笔画基线**。所有描边图标都摊开这一份。
 *
 * ## 为什么值在这里,不在一条全局 CSS 规则里
 *
 * 稿子(`docs/design/chat-panel-next.html` 第 476 行)是一条全局重置:
 *
 *     svg { stroke-width: 1.75px; stroke-linecap: round; stroke-linejoin: round; }
 *
 * 本仓库不能照搬这一条:CSS 声明**恒赢** SVG 表现属性(表现属性属于优先级更低的
 * "author presentational hints" 层),而 `apps/web/src` 里有 115 处写死的
 * `strokeWidth={…}`。一条全局 `svg { stroke-width }` 会把它们**全部**盖掉,
 * 而且是静默的。所以基线走表现属性:它只在「这枚图标自己没说」时生效,
 * 任何一条 CSS 规则想为某一格单独调粗细,照样能赢 —— 和稿子里
 * `.tk .ring { stroke-width: 1.5 }` 压过全局 1.75 是同一套层叠关系。
 *
 * 共享的 `components/Icon.tsx` 早就是这个写法(它的 `common` 里带
 * `strokeWidth` + 两个 round),这里跟的是仓库既有的路子,不是新发明。
 *
 * ## 1.75 是**用户单位**,不是设备像素
 *
 * SVG 的 `stroke-width` 跟着 viewBox 缩放。这一族都是 `0 0 24 24`,
 * 所以屏幕上实际画出来的粗细 = 1.75 × 显示边长 ÷ 24:
 *
 *     14px 的行首格   → 1.021px      11px 的折叠箭头 → 0.802px
 *     13px 的引用气泡 → 0.948px
 *
 * 三个数都和真机量稿子的结果逐值相同(无头 Chrome,`getComputedStyle().strokeWidth`
 * × `getScreenCTM().a`)。**不要**给它加 `vector-effect: non-scaling-stroke` ——
 * 稿子只在 `.ck` 和 `.tool .wifi` 两处钉了它,其余一律跟着缩放;钉上之后
 * 1.75 会变成 1.75 设备像素,比稿子粗 1.7 倍。
 *
 * 端头和拐角同样照稿子走 round:1px 以下的线,butt 端头会让笔画两头更淡,
 * miter 拐角在这个粗细上则会甩出毛刺。
 */
export const STROKE_ICON = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

/**
 * chat **填充**图标的基线。和 `STROKE_ICON` 是并列的两族,不是它的变体。
 *
 * 稿子里不是所有字形都描边:`729fa43ce7` 把「新建」那一格换成了实心节点字形
 * (`docs/design/chat-panel/src/body-components.html:909`),同族的还有失败记号和
 * 重试箭头。实心字形**上色靠 `fill`,压根没有 stroke** —— 把 `STROKE_ICON` 摊给
 * 它会得到 `fill="none"`(整枚看不见)外加一组永远画不出来的 `stroke-*`。
 *
 * 所以两族各有各的基线,共存而不互相拆台:
 *
 *   描边族 `fill="none"` + `stroke="currentColor"` + 1.75 那一套
 *   填充族 `fill="currentColor"`,**一个 stroke-* 都不带**
 *
 * 「一个都不带」是有意的:带着 `stroke-width` 却不描边是死属性,会让下一个人
 * 以为这一枚也吃 1.75、照着调却看不出任何变化。判据在
 * `tests/components/chat/icon-stroke-weight.test.tsx` —— 那里按族分别提问,
 * 并且把两族的**成员名单**也钉住,免得哪一格悄悄换族之后从此没人守。
 *
 * 尺寸和颜色仍然由 CSS 决定(`.icon > svg { width: 16px; color: … }`),
 * `currentColor` 让填充族跟着同一个 `color` 走,和描边族在一列里色号一致。
 */
export const FILL_ICON = {
  viewBox: '0 0 24 24',
  fill: 'currentColor',
  'aria-hidden': true,
} as const;

/** 读取 —— 眼睛 */
export const ReadIcon = (): ReactElement => (
  <svg {...STROKE_ICON}>
    <path d="M2 12s3.6-6.4 10-6.4S22 12 22 12s-3.6 6.4-10 6.4S2 12 2 12z" />
    <circle cx="12" cy="12" r="2.6" />
  </svg>
);

/**
 * 改写 —— 笔。**只归改写**,新建另有一枚(见 `CreateIcon`)。
 *
 * 设计 2026-09-02 在 `e8726686ae`(建成品)/ `b51302425b`(源文件)把「新建」
 * 换成了实心节点字形,同一行里的「改写」原样留着这支铅笔。两个 commit 的标题
 * 说的都是别的事,所以判据取的是**稿子里真实的字形**,不是说明文字。
 */
export const WriteIcon = (): ReactElement => (
  <svg {...STROKE_ICON}>
    <path d="M17 3a2.83 2.83 0 014 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

/**
 * 新建 —— 实心的「节点 + 加号」。
 *
 * 路径逐字取自稿子 `729fa43ce7`
 * (`docs/design/chat-panel/src/body-components.html:909`,建成品
 * `docs/design/chat-panel-next.html:5214`)。那一行里「新建」出现四次、字形完全相同,
 * 「改写」出现一次、仍是铅笔 —— 4 : 1 就是「这两格分家」的全部证据。
 *
 * ## 这枚字形不是「设计还在犹豫」
 *
 * 上一版稿子 `361b78253e` 里,四处「新建」**已经有一处**是这枚实心字形了
 * (`settings.html` 那一行),另外三处还是铅笔 —— 稿子当时自己是花的。所以
 * `b51302425b`「sync create-file icon source」不是改设计,是**把早就定下来的
 * 那一枚补齐到剩下三处**。计数就是证据:`361b78253e` 是 1 新 : 4 铅笔,
 * `729fa43ce7` 是 4 新 : 1 铅笔 —— 少掉的三支铅笔正好是那三处「新建」。
 *
 * ## 为什么没照抄 `xmlns`
 *
 * 稿子这枚 `<svg>` 上带 `xmlns="http://www.w3.org/2000/svg"`,同族其它图标没有。
 * 那是建成品从独立 svg 文件内联进来的残留,不是设计意图 —— React 挂到 HTML
 * 文档里的 `<svg>` 不需要它(HTML 解析器本来就把它放进 SVG 命名空间)。
 *
 * 这一枚走 `FILL_ICON` 而不是 `STROKE_ICON`:它是实心字形,`fill="none"` 会让它
 * 整枚消失。逐字节判据在 `tests/components/chat/w72-create-icon-glyph.test.tsx`。
 */
export const CreateIcon = (): ReactElement => (
  <svg {...FILL_ICON}>
    <path d="M2.5 7C2.5 9.48528 4.51472 11.5 7 11.5C9.48528 11.5 11.5 9.48528 11.5 7C11.5 4.51472 9.48528 2.5 7 2.5C4.51472 2.5 2.5 4.51472 2.5 7ZM2.5 17C2.5 19.4853 4.51472 21.5 7 21.5C9.48528 21.5 11.5 19.4853 11.5 17C11.5 14.5147 9.48528 12.5 7 12.5C4.51472 12.5 2.5 14.5147 2.5 17ZM12.5 17C12.5 19.4853 14.5147 21.5 17 21.5C19.4853 21.5 21.5 19.4853 21.5 17C21.5 14.5147 19.4853 12.5 17 12.5C14.5147 12.5 12.5 14.5147 12.5 17ZM9.5 7C9.5 8.38071 8.38071 9.5 7 9.5C5.61929 9.5 4.5 8.38071 4.5 7C4.5 5.61929 5.61929 4.5 7 4.5C8.38071 4.5 9.5 5.61929 9.5 7ZM9.5 17C9.5 18.3807 8.38071 19.5 7 19.5C5.61929 19.5 4.5 18.3807 4.5 17C4.5 15.6193 5.61929 14.5 7 14.5C8.38071 14.5 9.5 15.6193 9.5 17ZM19.5 17C19.5 18.3807 18.3807 19.5 17 19.5C15.6193 19.5 14.5 18.3807 14.5 17C14.5 15.6193 15.6193 14.5 17 14.5C18.3807 14.5 19.5 15.6193 19.5 17ZM16 11V8H13V6H16V3H18V6H21V8H18V11H16Z" />
  </svg>
);

/** 删除 —— 垃圾桶。删除不能继续复用「写入」的铅笔图标。 */
export const DeleteIcon = (): ReactElement => (
  <svg {...STROKE_ICON}>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6.5 7l.8 13h9.4l.8-13" />
    <path d="M10 11v5.5M14 11v5.5" />
  </svg>
);

/** 搜索 —— 放大镜(D23:搜索是一等类别,有自己的图标) */
export const SearchIcon = (): ReactElement => (
  <svg {...STROKE_ICON}>
    <circle cx="10.8" cy="10.8" r="6.8" />
    <path d="M20.5 20.5l-4.9-4.9" />
  </svg>
);

/** 执行 —— 命令提示符 */
export const ExecIcon = (): ReactElement => (
  <svg {...STROKE_ICON}>
    <path d="M4.5 6.5l5 5.5-5 5.5" />
    <path d="M12.5 18h7" />
  </svg>
);

/** 生成 —— 图片 */
export const ImageIcon = (): ReactElement => (
  <svg {...STROKE_ICON}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <circle cx="8.6" cy="10" r="1.4" />
    <path d="M21 15.5L16 10.5 7.5 19" />
  </svg>
);

/**
 * 生成 —— 音频(OPEND-2625)。
 *
 * 和 `ImageIcon` 是并列的一枚,不是它的变体:同一条 `od media generate` 出音频、
 * 出视频、出图,行首那一格必须能一眼分出是哪一类。原来只有 `ImageIcon` 一枚,
 * 一次 `--surface audio` 于是顶着图片图标出现在记录里。
 *
 * 字形是**波形**(中间高两侧低的一组竖线),不是喇叭 —— 喇叭说的是「播放 / 音量」,
 * 这一行说的是「生成了一段声音」。粗细、圆角、24 视框跟着 `STROKE_ICON` 那一族走。
 */
export const AudioIcon = (): ReactElement => (
  <svg {...STROKE_ICON}>
    <path d="M4 10.5v3" />
    <path d="M8 7.5v9" />
    <path d="M12 4.5v15" />
    <path d="M16 7.5v9" />
    <path d="M20 10.5v3" />
  </svg>
);

/**
 * 生成 —— 视频(OPEND-2625)。见 `AudioIcon` 的同一条理由。
 *
 * 字形是**画面框 + 播放三角**:框说「这是一帧画面」,三角说「它会动」。
 * 不用胶片齿孔 —— 16px 上那排小孔会糊成一条锯齿边。
 */
export const VideoIcon = (): ReactElement => (
  <svg {...STROKE_ICON}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M10.5 9.5l4.5 2.5-4.5 2.5z" />
  </svg>
);

/**
 * 认不出类别时的兜底 —— 一个中性的「工具」记号(六边螺帽 + 中心孔)。
 *
 * 为什么不硬塞进已有的五类:归错比「我认不出来」更糟。把一次子 agent 调度画成
 * 「读取」是**谎报**,而这一格的全部作用就是让人一眼知道刚才干了哪一类事。
 * 为什么不留圆点:产品 2026-08-25 裁决「不许出现圆点,每一格都要能指到图标」——
 * 这推翻了交付稿的 `.ti:empty::before` 兜底。
 *
 * 笔画粗细、圆角、24 视框都跟着同族其它五枚走,放在一列里不会显得是外来的。
 */
export const ToolFallbackIcon = (): ReactElement => (
  <svg {...STROKE_ICON}>
    <path d="M12 3.2l7 4v9.6l-7 4-7-4V7.2l7-4z" />
    <circle cx="12" cy="12" r="2.6" />
  </svg>
);

/**
 * 折叠箭头。展开时由 CSS 旋转 180°,不换图标。
 *
 * 这一枚**自己给尺寸**(稿子 `.chev` 是 11px),所以在摊开基线之后再补 width/height。
 */
export const ChevronIcon = (): ReactElement => (
  <svg {...STROKE_ICON} width="11" height="11">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/**
 * 出错 —— 生图失败格在**轮次还没停**的时候摆的那枚(OPEND-2544)。
 *
 * ## 路径为什么从 `REMIX_ICON_PATHS` 取,不像同族那样写在这里
 *
 * 产品交付的 `error-warning-line.svg` 是 remix 图标集的 `error-warning-line`,
 * 而仓库**早就有**这一枚:`REMIX_ICON_PATHS['error-warning-line']` 的那条 `d`
 * 和交付件逐字节相同(#5517 起 remix 字形一律内联,打包版 `od://` 加载不了
 * url() 字体)。再抄一份进来就是同一条 380 字符的路径存两处,以后 remix 升版
 * 只会改到其中一处 —— 这一族的文件头写着「不手抄」,正是同一条理由。
 *
 * 表里查不到时 `d` 会是 `undefined`,`<path>` 静默消失、组件不报错,
 * 所以这一枚由 `image-fail-cell-two-states.test.tsx` 逐字节钉住那条 `d`。
 *
 * ## 为什么不直接用共享的 `<Icon name="alert-triangle">`
 *
 * 那个名字映射到的确实是这一枚,但**名字是骗人的**(它画的是圆形感叹号,
 * 不是三角),而且 `Icon` 会挂上 `od-icon` —— 全仓约 35 条选择器盯着这个类,
 * 把它带进执行记录里等于给这一格开一扇没人预料的样式后门。
 */
export const FailIcon = (): ReactElement => (
  <svg {...FILL_ICON}>
    <path d={REMIX_ICON_PATHS['error-warning-line']} />
  </svg>
);

/** 重试 —— 生图失败格上那枚 */
export const RetryIcon = (): ReactElement => (
  <svg {...FILL_ICON}>
    <path d="M5.46257 4.43262C7.21556 2.91688 9.5007 2 12 2C17.5228 2 22 6.47715 22 12C22 14.1361 21.3302 16.1158 20.1892 17.7406L17 12H20C20 7.58172 16.4183 4 12 4C9.84982 4 7.89777 4.84827 6.46023 6.22842L5.46257 4.43262ZM18.5374 19.5674C16.7844 21.0831 14.4993 22 12 22C6.47715 22 2 17.5228 2 12C2 9.86386 2.66979 7.88416 3.8108 6.25944L7 12H4C4 16.4183 7.58172 20 12 20C14.1502 20 16.1022 19.1517 17.5398 17.7716L18.5374 19.5674Z" />
  </svg>
);

/**
 * 调色盘 —— 「设计系统工作区 · 自动创建」那张状态卡左边那一格。
 *
 * 路径逐字取自稿子 `729fa43ce7`
 * (`docs/design/chat-panel/src/body-components.html:47`,建成品
 * `docs/design/chat-panel-next.html:4352` 与它逐字节相同)。
 *
 * 走 `FILL_ICON`:稿子这枚写的就是 `fill="currentColor"` 的实心字形,
 * 摊 `STROKE_ICON` 会得到 `fill="none"`,整枚看不见。
 *
 * ## 两处**没有**照抄
 *
 * · `xmlns` —— 建成品从独立 svg 文件内联进来的残留(`CreateIcon` 同款理由):
 *   React 挂到 HTML 文档里的 `<svg>` 不需要它。
 * · `focusable="false"` —— 那是 IE / 旧 Edge 时代给 `<svg>` 挡 Tab 的补丁;
 *   这一族里没有第二枚带它,而且外层那个 `aria-hidden` 的格子已经把它挡在
 *   辅助技术之外了。
 *
 * ⚠️ 它**不是** `ToolKind` 的一员,所以不进 `toolIcon()`,也不属于
 * `icon-stroke-weight.test.tsx` 里 `DESIGN_FILL_KINDS` 那份名单 ——
 * 那份名单钉的是「行首那一格里谁走填充」,和这枚卡片图标是两件事。
 */
export const PaletteIcon = (): ReactElement => (
  <svg {...FILL_ICON}>
    <path d="M12 2C17.5222 2 22 5.97778 22 10.8889C22 13.9556 19.5111 16.4444 16.4444 16.4444H14.4778C13.5556 16.4444 12.8111 17.1889 12.8111 18.1111C12.8111 18.5333 12.9778 18.9222 13.2333 19.2111C13.5 19.5111 13.6667 19.9 13.6667 20.3333C13.6667 21.2556 12.9 22 12 22C6.47778 22 2 17.5222 2 12C2 6.47778 6.47778 2 12 2ZM10.8111 18.1111C10.8111 16.0843 12.451 14.4444 14.4778 14.4444H16.4444C18.4065 14.4444 20 12.851 20 10.8889C20 7.1392 16.4677 4 12 4C7.58235 4 4 7.58235 4 12C4 16.19 7.2226 19.6285 11.324 19.9718C10.9948 19.4168 10.8111 18.7761 10.8111 18.1111ZM7.5 12C6.67157 12 6 11.3284 6 10.5C6 9.67157 6.67157 9 7.5 9C8.32843 9 9 9.67157 9 10.5C9 11.3284 8.32843 12 7.5 12ZM16.5 12C15.6716 12 15 11.3284 15 10.5C15 9.67157 15.6716 9 16.5 9C17.3284 9 18 9.67157 18 10.5C18 11.3284 17.3284 12 16.5 12ZM12 9C11.1716 9 10.5 8.32843 10.5 7.5C10.5 6.67157 11.1716 6 12 6C12.8284 6 13.5 6.67157 13.5 7.5C13.5 8.32843 12.8284 9 12 9Z" />
  </svg>
);

/* ============================================================================
 * 聊天面板里那几枚**按钮**图标(W126,产品裁决 2026-09-03)
 * ============================================================================
 *
 * 上面那一族画的是「执行记录行首那一格」;下面这一族画的是**按钮**——
 * 发送键、加号键、设计系统键、队列的移除、附件卡的文件与 ×、音频的播放。
 * 它们原来一律走共享的 `<Icon name="…">`,而那个组件凡是命中 `REMIX_ICON`
 * 映射表的名字**一律走实心 remix 路径**,所以和稿子画的描边图几乎必然对不上。
 *
 * ## 为什么补在这里,而不是去改 `components/Icon.tsx`
 *
 * 产品裁决 2026-09-03 明确:「**只让聊天面板走描边版**」,不动全站。改 `Icon.tsx`
 * 的默认 `strokeWidth` 或摘掉 `REMIX_ICON` 里的名字,影响的是**全站**几百个调用点
 * —— 那正是被否掉的那个方案。所以这一族补在 chat 自己的 primitives 里,
 * 由聊天面板的调用点单独指过来,面板外一个字不动。
 *
 * ## 尺寸仍然由调用点给,和换之前逐值相同
 *
 * 每一枚都收一个 `size`,原样写成 `width` / `height` —— 换的**只有字形**。
 * 加号 16、设计系统 16、队列移除 13、附件 × 10、文件 15、播放 12
 * 都是产品当前的值,这一轮一个都不动。
 *
 * 发送键是例外:W126 当时把它连着盒子(28 vs 产品的 36)、描边(产品多了 1px,
 * 稿子没有)和 `--shadow-xs`(产品有,稿子没有)一起标成「另一件事」,推迟给
 * 后续处理。W134 把这件事结了 —— 发送键跟着稿子改回 16(`styles/chat.css` 的
 * `.composer-send` 同一轮改回 28×28、去掉描边和阴影,理由见那条规则上方的注释)。
 *
 * 判据:`tests/components/chat/w126-chat-stroke-icons.test.tsx`,逐枚断言真 DOM 上的
 * `d` / `viewBox` / `fill` / `stroke` / `stroke-width`。
 */
interface ChatButtonIconProps {
  /** 写成 svg 的 width/height。CSS 若另有规则(如 `.msg-att-fi`)照样赢。 */
  size?: number;
  className?: string;
}

/**
 * 发送 —— 朝上的描边箭头。
 * 稿 `729fa43ce7:docs/design/chat-panel/src/body-scene.html:46`
 * (= `src/body-components.html:375`,两页逐字节相同)。
 *
 * ⚠️ `components/Icon.tsx` 里那段描边 `arrow-up` 和这一枚**不是**逐字节相同:
 * 它写的是 `m5 12 7-7 7 7`(小写相对指令 + 省略逗号),稿子写的是 `M5 12l7-7 7 7`。
 * 两者几何等价,但这一族的判据是字节,所以照稿子写。何况那段分支根本走不到 ——
 * `arrow-up` 命中 `REMIX_ICON` 映射表,永远走实心那条路。
 */
export const ChatSendArrowIcon = ({ size = 16, className }: ChatButtonIconProps = {}): ReactElement => (
  <svg {...STROKE_ICON} width={size} height={size} className={className}>
    <path d="M12 19V5" />
    <path d="M5 12l7-7 7 7" />
  </svg>
);

/**
 * 加号 —— 输入框那颗「添加附件」键。
 * 稿 `729fa43ce7:docs/design/chat-panel/src/body-scene.html:42`。
 *
 * 稿子是一条描边十字(1.75 圆头);remix 的 `add-line` 是实心方角十字
 * (`M11 11V5H13V11H19V13H13V19H11V13H5V11H11Z`),两者形状不是一回事。
 */
export const ChatPlusIcon = ({ size = 16, className }: ChatButtonIconProps = {}): ReactElement => (
  <svg {...STROKE_ICON} width={size} height={size} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/**
 * 调色盘 —— 输入框那颗「设计系统」键。
 * 稿 `729fa43ce7:docs/design/chat-panel/src/body-scene.html:43`。
 *
 * ⚠️ 这**不是**上面那枚 `PaletteIcon`。稿子里有**两枚**调色盘:
 *
 *   · `src/body-components.html:47` —— 状态卡左边那一格,`fill="currentColor"`
 *     的实心 remix 字形 → 上面的 `PaletteIcon`
 *   · `src/body-scene.html:43`     —— 输入框的设计系统键,描边外壳 + 三颗点
 *     → 这一枚
 *
 * 三颗点的位置 7.3 / 10.6 / 15 是**非对称**的,和 remix 那枚对称三点
 * (7.5 / 12 / 16.5)不同;半径也是 1.15 不是 1.5。它们各自把外壳的 stroke 关掉、
 * 单独填实 —— 稿子逐字如此,不要「统一」成一族。
 */
export const ComposerPaletteIcon = ({ size = 16, className }: ChatButtonIconProps = {}): ReactElement => (
  <svg {...STROKE_ICON} width={size} height={size} className={className}>
    <path d="M12 3.2a8.8 8.8 0 100 17.6c.9 0 1.6-.73 1.6-1.6 0-.42-.16-.79-.42-1.07a1.6 1.6 0 011.18-2.68h1.84a4.6 4.6 0 004.6-4.6c0-4.26-3.94-7.65-8.8-7.65z" />
    <circle cx="7.3" cy="11.4" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="10.6" cy="7.9" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="15" cy="8.4" r="1.15" fill="currentColor" stroke="none" />
  </svg>
);

/**
 * 垃圾桶 —— 消息队列那一行的「移除」。
 * 稿 `729fa43ce7:docs/design/chat-panel/src/body-components.html:1342`。
 *
 * ⚠️ 这**不是**上面那枚 `DeleteIcon`。那一枚是工具行的 delete 动词格
 * (`M4 7h16` / `M9 7V4h6v3` / …),而稿子的 `.ti` 压根没画 delete 这一行 ——
 * 那一枚是产品自己补的。队列这一枚的四条 `d` 和它完全不同(桶口 `M3.5 6h17`
 * 更宽、桶身带 1.7 圆角、盖钮是 1.2 圆角),两枚并存,谁也不替换谁。
 */
export const QueueTrashIcon = ({ size = 13, className }: ChatButtonIconProps = {}): ReactElement => (
  <svg {...STROKE_ICON} width={size} height={size} className={className}>
    <path d="M3.5 6h17" />
    <path d="M8.5 6V4.2A1.2 1.2 0 019.7 3h4.6a1.2 1.2 0 011.2 1.2V6" />
    <path d="M18.5 6l-.8 13.4a1.7 1.7 0 01-1.7 1.6H8a1.7 1.7 0 01-1.7-1.6L5.5 6" />
    <path d="M10 10.5v6M14 10.5v6" />
  </svg>
);

/**
 * 文件 —— 附件文档卡左边那一格(已发送的和输入框托盘里的是同一枚)。
 * 稿 `729fa43ce7:docs/design/chat-panel/src/body-components.html:141`
 * (`<svg class="fi" …>`)。
 *
 * 尺寸这里给默认 15,但真正说了算的是 CSS:`chat.css` 的
 * `.msg.user .msg-att-fi, .composer-att .msg-att-fi { width:15px; height:15px }`
 * ——和稿 `components.css:866` 的 `.att-d .fi` 同值。
 */
export const ChatFileIcon = ({ size = 15, className }: ChatButtonIconProps = {}): ReactElement => (
  <svg {...STROKE_ICON} width={size} height={size} className={className}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
);

/**
 * × —— 输入框附件托盘上那颗「移除」角标。
 * 稿 `729fa43ce7:docs/design/chat-panel/src/body-components.html:255`(`.del`)。
 *
 * 只给托盘那一颗用。面板里其它几处 ×(暂存 chip、会话搜索的清除、对话框关闭)
 * 稿子里没有对应物,继续走共享的 `<Icon name="close">`。
 */
export const ChatCloseIcon = ({ size = 10, className }: ChatButtonIconProps = {}): ReactElement => (
  <svg {...STROKE_ICON} width={size} height={size} className={className}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

/**
 * 播放 —— 音频产物那颗播放键。
 * 稿 `729fa43ce7:docs/design/chat-panel/src/body-components.html:1153`
 * (`<svg class="ic-play" viewBox="0 0 24 24" fill="currentColor">`)。
 *
 * ⚠️ **这一枚稿子画的是实心,所以它走 `FILL_ICON`,不进描边族。**
 * 「这一批叫描边图标」不是把每一枚都改成描边的理由 —— 换的是字形:
 * remix 的 `play-line` 是一枚带轮廓的双层播放图形
 * (`M16.3944 12.0001L10 7.7371V16.263L16.3944 12.0001ZM19.376 12.4161L8.77735 19.4818…`),
 * 稿子是一枚干净的实心三角 `M8 5v14l11-7z`。
 */
export const ChatPlayIcon = ({ size = 12, className }: ChatButtonIconProps = {}): ReactElement => (
  <svg {...FILL_ICON} width={size} height={size} className={className}>
    <path d="M8 5v14l11-7z" />
  </svg>
);

/**
 * 「这件事过了」那枚勾。**不用 svg**:设计稿把它做成了一整张图
 * (`--chat-tick-img`,盘绿勾挖空),这样深浅两套主题不用各挑一个勾色。
 * 全稿凡是「过了」的记号(折叠块行首、Plan 里打完勾的一步、Plan 卡头)都指同一张图。
 */
export const TICK_IMAGE_VAR = 'var(--chat-tick-img)';

/**
 * 工具类别 → 图标。**每一类都有,永远不返回 null**。
 *
 * 交付稿的兜底是空格子画一颗 5px 圆点;产品 2026-08-25 裁决不许出现圆点,
 * 所以「认不出来」那一档也给图标(`ToolFallbackIcon`)。
 * 相应地 `record.module.css` 里那条 `.icon:empty::before` 已经撤掉 ——
 * 留着会变成一条永远走不到的死规则,以后有人加了新类别忘了配图标,
 * 圆点会悄悄回来(所以改由 `tool-icon.test.tsx` 逐类断言守着)。
 */
export function toolIcon(kind: ToolKind): ReactElement {
  switch (kind) {
    case 'read': return <ReadIcon />;
    /* 新建和改写**不共用图标** —— 稿子 729fa43ce7 只换了新建那一格(W72) */
    case 'write': return <CreateIcon />;
    case 'edit': return <WriteIcon />;
    case 'delete': return <DeleteIcon />;
    case 'search': return <SearchIcon />;
    case 'exec': return <ExecIcon />;
    case 'image': return <ImageIcon />;
    default: return <ToolFallbackIcon />;
  }
}
