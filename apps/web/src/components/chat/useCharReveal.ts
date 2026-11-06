/**
 * 逐字化开 —— 壳外正文、壳内叙述、思考流共用的那一个入场(设计稿组件 4 / 13,规格 W9 / W13)。
 *
 * 稿子把流式光标整个删了 —— 流式期间没有任何标记,**新到的字自己化开**就是流式的样子。
 *
 * ## 值从哪来(别改,改之前先回去读稿子)
 *
 * 交付稿 `docs/design/chat-panel-next.html` @ `1bbdce0b06`(md5 `28ea4c65…`)第 1605–1631 行,
 * 照搬 motion-primitives 的 `TextEffect(per='char')`:
 *
 *   · 单字 `0.4s var(--ease-out) both`,`opacity 0 + blur(10px) + brightness(0%)`
 *     化到 `opacity 1 + blur(0) + brightness(100%)`
 *   · 字与字错开 `--i * 0.01s`(= 10ms)
 *   · **只有进场,没有退场** —— 「这段话是这一轮交给人的结论,出来了就该一直在」
 *   · 起手那个 `brightness(0%)` 是上游的写法:配着 blur 一起,字是从一团化不开的墨里
 *     浮出来,而不是单纯地由淡变浓
 *   · 元素子节点**整块算一个单位**,不钻进去拆 —— `<b>12px</b>` 拆开的话,四个
 *     inline-block 之间就有了断行机会,一行末尾能把它劈成「12p」和「x」
 *   · 空白**不裹**:包成 inline-block 会吃掉正常的断行位置
 *   · 不做 `startOnView`(稿子踩过:观察器不回调时整段停在 opacity:0,一片空白)
 *
 * keyframes 与 `.rv` 那两条在 `styles/chat.css`,这里只负责**谁在什么时候开始开**。
 *
 * ## 稿子没有、用户给的那一条:整段 2s 铺完
 *
 * 用户 2026-08-27:「如果不是真正流式的, 可能背后 daemon 还是一次性出来, 但展示的时候,
 * 也保留一个流式的效果, 可能完整走完这个流式输出效果 2s 左右的动画, 加速一下」。
 *
 * 稿子的 0.4s 是**单字时长**,10ms 是**字间隔**,两者都不封顶整段时间 ——
 * 一段 34,731 字的推理按 10ms 排要 347 秒。所以这里加一层预算:
 *
 *   **单位数封顶在 `MAX_UNITS`,一个单位里塞几个字随长度长。**
 *
 * 于是错开值永远是稿子的 10ms、单字时长永远是稿子的 0.4s,而整段总时长
 * `(units - 1) × 10ms + 400ms` 天然被压在 2s 以内。五十来字的一句话仍然是稿子说的
 * 0.89s(49 × 10 + 400),这一点没有被预算改动。
 *
 * 顺带把 DOM 也封住了:一次最多 `MAX_UNITS` 个 span,而不是一字一个。
 * 同时在开的更少 —— `0.4s / 10ms = 40` 个,合成层不会爆。
 *
 * ## 为什么不能照抄参考实现
 *
 * 模拟器的 `player.js` 是每帧把整段 HTML 重画,然后把文本节点**替换**成一串 span。
 * 那是它自己的 DOM,想怎么换都行。这里不行:这段正文是 React 渲染的,**React 还握着
 * 那些文本节点的引用**,下一帧它会往里写新文字。把节点换掉之后,React 写进的是一个
 * 已经脱离文档的节点 —— 表现是**流式正文中途某一段就不再更新了**(有测试钉住:
 * `char-reveal.test.tsx` 里那条嵌套结构的用例,改回替换写法立刻转红)。
 *
 * 所以这里的做法是:**永远不动 React 建的节点**。只把它的内容截短到「已经显示完的那一段」,
 * 把还在化开的几个字拆成 span **追加在它后面**。节点身份没变,React 照常能更新它;
 * 下一帧我们先把自己加的 span 收走,再重新算。
 *
 * ## 四个曾让「已经显示的字」整块一起闪的坑
 *
 *  ① **不能按这一帧 delta 的长度判断新字**。delta 可能整条落在被藏起来的
 *     `<question-form>` / `<artifact>` 里,可见文本一个字没变,却把段尾几个字当成新字重放。
 *     → 只看**可见文本**前后两帧的长度差(`measure()` 数的是真的挂在树上的文本节点)。
 *  ② **每帧要先把上一帧加的 span 收走**,否则越堆越多,每堆一层动画重放一次。
 *  ③ **不能用前缀比较判断新字**。markdown 一闭合(`**` → `<b>`)可见文字会变短,
 *     前缀对不上就把整段当成新字。→ 只认**长度的增量**,变短时把「已显示」直接压到新长度。
 *  ④ **没有新字进来时必须原地不动**。壳头的秒数每秒跳一次,每一跳都是一次重渲染;
 *     若每次重渲染都重排一遍延时,还在开的那几个字每秒重播一次。
 *     → 这一帧长度没变、上一批还没开完 ⇒ **直接 return,一个节点都不碰**。
 *
 * ## 光比字符串判不出来的坑(2026-09-03)
 *
 *  · **不能用「值还是那个前缀」来判断 React 没写过这个节点**。收尾时要把截短过的节点
 *     还原成完整值,判据原来是 `nodeValue === full.slice(0, kept)`。可 React 这一帧写进去的
 *     新值**可能正好等于那个前缀** —— markdown 一闭合就常常如此:
 *
 *       上一帧  `<p>` = 文本「先看一下**规」 → 截短成「先看一下」+ span「**」「规」
 *       这一帧  React 把同一只文本节点写成「先看一下」,并在后面挂上 `<strong>规格</strong>`
 *
 *     两者一模一样,判据认成「React 没动过」,于是把陈的「先看一下**规」盖了回去,
 *     屏幕上留下「先看一下**规规格」。**而且它不会自愈**:下一帧 React 认为那只节点
 *     已经是「先看一下」,值没变就不再写,那几个多出来的字**永久留在正文里**
 *     (`say-text-markdown.test.tsx` 钉着这条;发现时思考流那一格也在踩)。
 *     → 判据换成**观察**:挂一只 `MutationObserver` 专门看文本节点的值被谁改过。
 *       我们自己写完就把记录抽干,于是下一帧抽出来的就只剩 React 的那些写入;
 *       名单里的节点一律**不还原**,它现在的值是 React 的新意图。
 *
 * ## 挂载即落定(用户 2026-09-04)
 *
 * 用户:「然后这个**已经输出过的**,**刷新页面**或者**从设置页面返回**,还是会有流式的效果」。
 * 说的是一张已经答完的问题表单摘要卡(绿色「已确认」+ 三行问答)重挂之后又化开了一遍。
 *
 * 立成不变式:**逐字化开只属于「本次挂载中正在到达的字」。一只 host 挂上来时已经在
 * 里头的字是历史,首帧就是落定态 —— 一个 span 都不拆,一只定时器都不排。**
 *
 * 两条用户路径落到 DOM 上是同一件事,所以一条判据就够:
 *   · 刷新页面 —— 整个应用重挂,历史从 GET 拉回来后一次性渲染;
 *   · 从设置页返回 —— 应用没重载,但 `ChatPane` 的 React `key` 含 `chatSeed`,清它就是强制重挂。
 * 判据钉在 `reveal-mount-settled.test.tsx`(两条路径各一组,每组都带反向对照)。
 *
 * 光靠 `streaming=false` 挡不住:刷新时 run 往往还活着(`runStatus: 'running'`),
 * `isAssistantMessageStreaming` 于是照旧给 `streaming: true`,而正文早已经是完整的历史。
 * `markHistoryReplayLanded` 也挡不住:它只认 daemon 从缓冲重推的**增量**,
 * 挂载时就已经在 DOM 里的那一段根本不经过那条路。
 *
 * ⚠️ **待产品拍板**:这条和 2026-08-27 那条(「后端一次性给的一大段,展示时也要走完
 * 流式效果」)在**唯一能观察到的那个形态上是冲突的** —— 「历史带着完整正文进场」和
 * 「非流式 agent 一次性吐出整段」在 DOM 上一模一样,渲染层分不出来。这里按**较晚的
 * 那条裁决**执行:挂载即落定。代价是非流式 agent 整段一次到货时不再化开(它的正文
 * 是随着 host 一起进场的)。要两条都要,得由数据侧告诉渲染层「这一段是刚到的」——
 * 那是 `ProjectView` 的活,不在这只 hook 里。
 */
import { useLayoutEffect, type RefObject } from 'react';

/** 字间错开 10ms(稿子的 `--i * 0.01s`) */
export const STAGGER_MS = 10;
/** 单字 0.4s,与稿子一致 */
export const CHAR_MS = 400;
/** 一整段最多铺多久(用户 2026-08-27 给的总时长目标;稿子里没有这个量) */
export const REVEAL_BUDGET_MS = 2000;
/**
 * 一批最多拆几个单位。
 * `(MAX_UNITS - 1) × STAGGER_MS + CHAR_MS ≤ REVEAL_BUDGET_MS` ⇒ 161。
 * 超过这个数就把单位加粗(一个 span 装多个字),而不是把间隔压到看不见。
 */
export const MAX_UNITS = Math.floor((REVEAL_BUDGET_MS - CHAR_MS) / STAGGER_MS) + 1;

const OWNED = 'data-char-reveal';

/**
 * 上一次「历史整段落地」的时刻(`performance.now()` 同一时钟),0 = 没有待认领的。
 *
 * OPEND-2590:重挂一个还在跑的 Run 时,daemon 会把缓冲里的旧事件从第 0 条重推一遍。
 * 那一段字用户早就看过了,不该再化开一次 —— 但它和直播走的是同一条流、同一个
 * `updateMessage`,渲染层分不出来。所以由攒住这段历史的那一侧(`ProjectView` 的
 * `createBufferedTextUpdates` 重放窗口)在提交前打一个标记,下一次化开计算认领掉它。
 */
let historyReplayLandedAt = 0;
/**
 * 标记的有效期。正常路径上「打标记 → 提交 → React 渲染 → layout effect」就在同一
 * 拍里走完,这个窗口只是兜底:万一那条消息此刻根本没在渲染(切走了、被卸载了),
 * 标记也不能一直挂着,否则它会去吃掉后面某一段**真正**该化开的直播。
 */
const HISTORY_REPLAY_CLAIM_WINDOW_MS = 1_000;

/**
 * 「接下来这一次落地是重放的历史,不是模型此刻在吐字」。
 *
 * 必须在那一次 `updateMessage` **之前**同步调用:中间不能插进别的渲染,
 * 标记才认得准那一次提交。
 */
export function markHistoryReplayLanded(): void {
  historyReplayLandedAt = performance.now();
}

/** 认领标记:属于这一次化开计算就返回 true,并把标记消掉(只认一次)。 */
function claimHistoryReplayLanded(now: number): boolean {
  if (historyReplayLandedAt === 0) return false;
  const fresh = now - historyReplayLandedAt < HISTORY_REPLAY_CLAIM_WINDOW_MS;
  historyReplayLandedAt = 0;
  return fresh;
}

/** 打了这个标记的子树整个不参与化开(流式 artifact 的代码面板那种) */
const SKIP = '[data-no-reveal]';

export interface RevealPlan {
  /** 会拆出多少个 span */
  units: number;
  /** 一个 span 里装几个字 */
  unitSize: number;
  /** 单位与单位之间错开多久 */
  staggerMs: number;
  /** 最后一个单位开完时,距这一批开始过了多久 */
  totalMs: number;
}

/**
 * 把 `pending` 个还没露面的字排进时间里。
 *
 * 短段落走稿子的原值(一字一单位、错开 10ms);长到排不下时**加粗单位**,
 * 让总时长停在 `REVEAL_BUDGET_MS` 以内,而不是把错开值压到零。
 */
export function planReveal(pending: number): RevealPlan {
  const chars = Math.max(1, pending);
  const unitSize = Math.ceil(chars / Math.min(chars, MAX_UNITS));
  const units = Math.ceil(chars / unitSize);
  return { units, unitSize, staggerMs: STAGGER_MS, totalMs: (units - 1) * STAGGER_MS + CHAR_MS };
}

/**
 * 我们截短过的一个文本节点:`node.nodeValue === full.slice(0, kept)`,
 * 尾巴那一段被拆成 `inserted` 里那些节点挂在它后面。
 *
 * ⚠️ `inserted` 里**不只是 span**:单字单位时空白是裸文本节点(稿子那条,包进
 * inline-block 会吃掉断行位置)。收尾必须按这份名单删,不能只 `querySelectorAll`
 * 那些带标记的 span —— 裸空白删不掉,再把节点还原成完整值,空白就被复制了一份。
 * (中文测不出来:中文没有空格。英文 34,731 字实测多出 5,869 个字符,正好是空格数。)
 */
interface Touched { node: Text; full: string; kept: number; inserted: ChildNode[] }

interface RevealState {
  /** 已经露过面(开完或正在开)的可见字数 */
  shown: number;
  /** 上一帧的可见字数 —— 用来判断这一帧有没有新字 */
  len: number;
  /** 这一批开完的时刻(`performance.now()` 同一时钟) */
  until: number;
  touched: Touched[];
  /** 到点自己把 span 收回去的定时器 —— 理由见下面那段注释 */
  timer: ReturnType<typeof setTimeout> | 0;
}

const states = new WeakMap<HTMLElement, RevealState>();

/**
 * 每只 host 一台观察器,**只为 `takeRecords()` 而存在** —— 回调永远是空的,
 * 我们从不异步地对变更做反应,只在需要判断的那一刻把积压的记录同步抽出来。
 *
 * 为什么非它不可(细节见文件头「光比字符串判不出来的坑」):「这只文本节点的值是我截短的,
 * 还是 React 刚写的」光比字符串**判不出来**(两者可能一模一样),只有真的看着 DOM 才知道。
 * React 的 DOM 变更发生在 layout effect **之前**,所以我们这一帧抽到的记录
 * 正好就是 React 这一帧的写入。
 */
const watchers = new WeakMap<HTMLElement, MutationObserver>();

function watcher(host: HTMLElement): MutationObserver | null {
  if (typeof MutationObserver === 'undefined') return null;
  let mo = watchers.get(host);
  if (!mo) {
    mo = new MutationObserver(() => {});
    mo.observe(host, { characterData: true, subtree: true });
    watchers.set(host, mo);
  }
  return mo;
}

/** 把积压的记录抽干并丢掉 —— 「我们自己刚写的那几笔不算 React 写的」。 */
function forgetOwnWrites(host: HTMLElement): void {
  watchers.get(host)?.takeRecords();
}

/** 抽出并清空:自上次抽取以来,值被**别人**(= React)改过的那些文本节点。 */
function foreignWrites(host: HTMLElement): Set<Node> {
  const out = new Set<Node>();
  for (const record of watchers.get(host)?.takeRecords() ?? []) {
    if (record.type === 'characterData') out.add(record.target);
  }
  return out;
}

export function useCharReveal(ref: RefObject<HTMLElement | null>, streaming: boolean): void {
  // 用 layout effect:DOM 改完到浏览器画之前做掉,不会闪
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;

    if (!streaming) {
      const stale = states.get(host);
      if (stale?.timer) clearTimeout(stale.timer);
      restore(host);
      states.delete(host);
      watchers.get(host)?.disconnect();
      watchers.delete(host);
      return;
    }
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    // 观察器要在**第一次截短之前**就挂上,否则第一帧的写入没人记录
    watcher(host);

    const now = performance.now();
    const prev = states.get(host);

    /*
     * ⑥ **挂载即落定**(用户 2026-09-04,详见文件头)。
     *
     * 没有上一帧的状态 = 这只 host 是刚进 DOM 的。它此刻装着的字**不是新到的字**,
     * 是历史 —— 刷新页面、从设置页返回、切会话,都会带着完整正文重挂一次。
     * 直接记成「已经显示过」,`return` 得比 `restore()` / `collect()` 还早:
     * 挂载那一帧连一次 DOM 改写都没有,更不会排收尾定时器。
     *
     * 重放标记顺手认领掉:这一次落地本来就是历史,别把它留给后面某一段真正的直播。
     */
    if (!prev) {
      claimHistoryReplayLanded(now);
      const landed = measure(host);
      host.removeAttribute('data-reveal');
      states.set(host, { shown: landed, len: landed, until: 0, touched: [], timer: 0 });
      forgetOwnWrites(host);
      return;
    }

    // ④ 没有新字 + 上一批还没开完 ⇒ 原地不动,让正在开的那几个字自己开完
    if (prev.until > now && measure(host) === prev.len) return;

    if (prev.timer) clearTimeout(prev.timer);

    restore(host);                                    // ② 先把上一帧加的 span 收走
    const nodes = collect(host);
    const len = nodes.reduce((n, t) => n + (t.nodeValue ?? '').length, 0);

    /*
     * ⑤ 这一次长出来的字是**重放的历史**,不是模型此刻在吐字 —— 直接算成「已经显示过」,
     *    一个 span 都不拆(OPEND-2590)。
     *
     *    光靠攒住重放、一次性提交是**不够的**:整段一次到货时,这里看到的仍然是一次
     *    巨大的长度增量,预算会把它铺成一批(实测 144 个单位、约 2 秒),用户看到的
     *    还是「历史又流了一遍」,只是从几十次变成一次。判据必须来自「这段字是哪来的」,
     *    而不是「它有多长」——长度判不得:非流式的 agent 本来就是整段一次吐出来的,
     *    那种才正是要保留化开效果的场景(用户 2026-08-27)。
     */
    if (claimHistoryReplayLanded(now)) {
      host.removeAttribute('data-reveal');
      states.set(host, { shown: len, len, until: 0, touched: [], timer: 0 });
      return;
    }

    // ③ 只认长度增量。markdown 闭合会让可见文字变短,那时把「已显示」压到新长度即可
    const shown = Math.min(prev.shown, len);
    const grew = len - shown;
    if (grew <= 0) {
      host.removeAttribute('data-reveal');
      states.set(host, { shown: len, len, until: 0, touched: [], timer: 0 });
      return;
    }

    const plan = planReveal(grew);

    /*
     * 从**末尾**往回取 `grew` 个字:新字总是落在树的最后。跨节点也照取 ——
     * 新起一段时,增量会横跨「上一段的尾巴」和「新一段」两个节点。
     */
    const pieces: { node: Text; full: string; kept: number }[] = [];
    let remaining = grew;
    for (let i = nodes.length - 1; i >= 0 && remaining > 0; i -= 1) {
      const node = nodes[i];
      if (!node) continue;
      const full = node.nodeValue ?? '';
      if (full.length === 0) continue;
      const take = Math.min(full.length, remaining);
      remaining -= take;
      pieces.push({ node, full, kept: full.length - take });
    }
    pieces.reverse();                                 // 回到文档顺序,单位序号才是从左往右

    host.setAttribute('data-reveal', '');
    const touched: Touched[] = [];
    let cursor = 0;                                   // 这一批里第几个字,用来算单位序号
    for (const piece of pieces) {
      const { node, full, kept } = piece;
      node.nodeValue = full.slice(0, kept);           // 只截短,**不换节点**
      const frag = document.createDocumentFragment();
      const inserted: ChildNode[] = [];
      let span: HTMLSpanElement | null = null;
      let unit = -1;
      /*
       * 空白裹不裹,**看单位有多大**:
       *
       *  单字单位  照稿子:空白裸着放,不进 span。`inline-block` 的单字之间必须留出
       *            断行位置,不然一个拉丁词会被劈成两半。
       *  多字单位  空白进 span。多字单位本来就走 `display: inline`,而 inline 盒子
       *            自己会裂成多个行框(真 Chrome 量过 `getClientRects().length === 6`),
       *            断行位置一个都不少。
       *            **必须这么做**:按空白切的话,英文一段 34,731 字会拆出 5,976 个 span
       *            (≈ 词数),预算就白封了 —— 实测 p95 从 9.2ms 掉到 83.3ms、
       *            29 帧超过 33ms。中文没有空格,所以这条只有英文照得出来。
       */
      const bareSpace = plan.unitSize === 1;
      for (const ch of full.slice(kept)) {
        if (bareSpace && !ch.trim()) {
          span = null;
          const ws = document.createTextNode(ch);
          frag.append(ws);
          inserted.push(ws);
          cursor += 1;
          continue;
        }
        const next = Math.floor(cursor / plan.unitSize);
        if (!span || next !== unit) {
          unit = next;
          span = document.createElement('span');
          span.className = 'rv';
          span.setAttribute(OWNED, '');
          if (!bareSpace) span.style.display = 'inline';
          span.style.animationDelay = `${unit * plan.staggerMs}ms`;
          frag.append(span);
          inserted.push(span);
        }
        span.append(ch);
        cursor += 1;
      }
      node.after(frag);
      touched.push({ node, full, kept, inserted });
    }

    /*
     * **开完就撒手。** 收 span 不能只等「下一次重渲染」—— 流最后一批字落地之后可能
     * 一次渲染都没有,那 161 个 span 会一直挂在树上,每个都带着 `filter`
     * (末帧是 `blur(0) brightness(100%)`,值是空操作,但它仍然给每个 span 立一个
     * 层叠上下文)。到点自己收,树就干净了。
     * 这一批还没开完就来了新字时,上面那句 `clearTimeout` 会把它撤掉重排。
     */
    const timer = setTimeout(() => {
      restore(host);
      states.set(host, { shown: len, len, until: 0, touched: [], timer: 0 });
    }, plan.totalMs + 16);

    forgetOwnWrites(host);   // 这一批的截短是我们写的,不算 React 的写入
    states.set(host, { shown: len, len, until: now + plan.totalMs, touched, timer });
  });
}

/** 把我们加过的节点全收走(span **和**裸空白),并把截短过的节点还原成完整值 */
function restore(host: HTMLElement): void {
  const state = states.get(host);
  // 上一次抽取之后 React 改过值的那些文本节点 —— 它们身上的 `full` 已经作废
  const rewritten = foreignWrites(host);
  for (const t of state?.touched ?? []) {
    for (const node of t.inserted) node.remove();
    // React 若已经重写过这个节点,它的值就是新的 —— 那时不能拿旧的盖回去。
    // 值比对**判不出** React 恰好写回同一个前缀的那一种,所以先认观察到的名单。
    if (rewritten.has(t.node)) continue;
    if (t.node.isConnected && t.node.nodeValue === t.full.slice(0, t.kept)) t.node.nodeValue = t.full;
  }
  // 兜底:状态丢了(热更新、组件换了个 host)时留下的 span 也扫掉。
  // 裸空白扫不到 —— 所以上面那份名单才是主路,这里只是别让 span 永远挂着。
  for (const span of [...host.querySelectorAll(`[${OWNED}]`)]) span.remove();
  if (state) state.touched = [];
  host.removeAttribute('data-reveal');
  forgetOwnWrites(host);   // 刚才那几笔还原是我们写的,别留到下一帧冒充 React
}

/** 参与化开的文本节点,文档顺序 */
function collect(host: HTMLElement): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  let node = walker.nextNode();
  while (node) {
    if ((node.nodeValue ?? '').length > 0) out.push(node as Text);
    node = walker.nextNode();
  }
  return out;
}

/**
 * 可见字数。**不建整串** —— 34,731 字的推理每帧拼一次 `textContent` 就是每秒几 MB 的
 * 垃圾;这里只把每个文本节点的长度加起来。
 */
function measure(host: HTMLElement): number {
  let n = 0;
  for (const node of collect(host)) n += (node.nodeValue ?? '').length;
  return n;
}
