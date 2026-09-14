// Concurrency budgets for preview iframes.
//
// Why this exists: a sandboxed preview iframe is a full document load against
// the local daemon — its own parse, style, layout, script execution and its
// own fetches for whatever the artifact links to. Profiling a real packaged
// client (evidence/electron-project-waterfall-20260727) showed 52 thumbnail
// documents still in flight when the user clicked a project card, pushing
// initial concurrency to 65 and contending with the opened project's own
// metadata/files/preview reads for Chromium, web, daemon and socket capacity.
//
// The cover HEAD probes already run through a small queue in
// RecentProjectsStrip; this module budgets the *document loads* themselves.
//
// ── 两条泳道,不是一条 ──────────────────────────────────────────────────
//
// 「有预算」和「进项目就让位」是两件事。以前它们被同一个开关捆在一起,于是
// 住在项目路由上的产物卡只能整条绕开预算(2026-09-02 之前的 `ungated`)。
// 现在分成两条各自独立的泳道:
//
// - **background** (`useThumbnailLoadSlot`) —— 首页/设计页那几个项目网格。
//   预算 `THUMBNAIL_LOAD_BUDGET`,并且**响应挂起**:`suspendThumbnailLoads()`
//   会收回所有已授予但还没加载完的槽位(组件卸载 iframe 并重新排队),已经
//   加载完的不动。`App.tsx` 一进项目路由就挂起它,免得背景封面跟前台抢;
//   `resumeThumbnailLoads()` 在回到首页时重新放水。
//
// - **foreground** (`useArtifactCardLoadSlot`) —— 会话里的产物卡。它**就是**
//   当前路由的前台内容,所以永远不响应挂起;但它同样要有上限,理由在
//   `ARTIFACT_CARD_LOAD_BUDGET` 那条注释里。
//
// 两条泳道按路由天然互斥(网格那条在项目路由上是挂起的),所以它们不会同时
// 抽水;分开只是为了让「让位」和「限流」不再是同一个开关。

import { useCallback, useEffect, useReducer, useRef } from 'react';

// Start-of-range budget from the handoff (§4.2 recommends probing 6-8): six
// keeps the classic per-host HTTP/1.1 connection pool from being fully
// occupied by background covers.
export const THUMBNAIL_LOAD_BUDGET = 6;

/**
 * 会话里产物卡 live iframe 的并发上限。
 *
 * **不是抄上面那个 6。** 那个 6 的理由是「别把每主机 HTTP/1.1 连接池占满」,
 * 而产物卡这条泳道有三点不同,得单独算:
 *
 * ① **它在项目路由上跑,网格那条是挂起的。** 6 是给一条「用户开项目时就该
 *    整体让位」的泳道定的上限;产物卡不让位,所以必须给项目自己的元数据、
 *    文件、预览、SSE 留出余量,取值只能比 6 低。
 *
 * ② **打包客户端没有 6 连接这回事。** `apps/packaged/src/index.ts` 和
 *    `apps/desktop/src/main/index.ts` 都对 127.0.0.1/localhost 开了
 *    `ignore-connections-limit`。所以在打包路径上限流限的不是 socket,是
 *    **渲染器文档数和外链请求数**:每个 iframe 都是独立文档,各自把页面脚本
 *    再跑一遍、各自去拉它 `<head>` 里那些外链。2026-09-02 实测的那份产物挂着
 *    一条 `https://cdn.tailwindcss.com`,那个域名在测试机上打不通 —— N 张卡
 *    就是 N 条各自卡死的请求。
 *
 * ③ **同一个文件的多张卡不会互相省。** daemon 的 raw 路由发的是
 *    `Cache-Control: no-cache`,实测 8 张同文件卡 = 8 次文档请求
 *    (1×200 + 7×304)+ 8 次外链请求。内存缓存省的是响应体,不是往返,
 *    更不是脚本执行。
 *
 * 取 4 的依据:产物卡栅格是 `grid-template-columns: repeat(2, 1fr)`,4 正好是
 * **整两行**,所以密集那一档是一行一行地画出来,而不是留半行液体;同时它高于
 * 实测的常见量(45 个带卡会话里 p50 = 2 张,单卡布局本来就是整幅一列),
 * 所以常见形状根本不排队。而实测最坏情况——一条消息 28 张卡、900px 视口下
 * 一次起飞 16 个——被压到 4。
 */
export const ARTIFACT_CARD_LOAD_BUDGET = 4;

// How far outside the viewport a card may be and still start loading. Small
// on purpose: one row of overscan, not the whole grid.
//
// ⚠️ 对**聊天里的产物卡**这条 margin 是不生效的,别拿它当缓冲区。产物卡住在
// `.chat-log`(`overflow-y: auto`)里,IntersectionObserver 的相交矩形要先被祖先
// 裁剪框裁一刀再跟 root 比,而 `rootMargin` 撑的是 root(视口),撑不开中间那一刀。
// 2026-09-03 真机实测:同一批卡同时挂 `0px` / `160px` / `3000px` 三个观察器,滚到
// 三个位置,三条读数一模一样。所以产物卡的「缓冲」只能按**最近可见时间**做,
// 见下面的 `ARTIFACT_CARD_RETAIN_BUFFER`。
export const THUMBNAIL_OVERSCAN_MARGIN = '160px';

/**
 * 已经加载完的产物卡 iframe,**离开视口后还留几张**。
 *
 * 为什么需要它:`useInView` 默认 `once: true`,进过一次视口 iframe 就永远挂着。
 * 2026-09-02 真机滚一条 4 张卡的会话,数量是 2→3→4 —— **只增不减**。一条 assistant
 * 消息实测最多产出 28 张卡(13 张 html),而 `ChatPane` 的虚拟化要到 80 条消息才
 * 启动,所以 79 条以内的会话滚到底,前面每一张卡的 live 文档全都还活在渲染器里。
 *
 * ── 为什么按「最近可见」而不是按「离视口多远」 ──────────────────────────
 * 按距离**量不了**,理由写在上面 `THUMBNAIL_OVERSCAN_MARGIN` 那条注释里:聊天里的
 * 裁剪框把 rootMargin 整个吃掉了。按最近可见时间做 LRU 只需要「现在看得见吗」这一个
 * 信号,裁剪反而正好给出这个语义;而且它天然带迟滞 —— 在视口边缘抖动的卡每次都刷新
 * 自己的时间戳,永远排在淘汰队尾,不会被抖出去。
 *
 * ── 这 8 张是怎么来的 ────────────────────────────────────────────────
 * ① **一屏**。2026-09-03 真机量的产物卡栅格:`.chat-log` 594×476,卡 275×173,
 *    行距 181px,一屏 2.6 行 ≈ 5~6 张(行错位时最多 8 张)。取 8 就是**整整一屏
 *    的缓冲**:看完卡下面那段文字再滚回来,一张都不用重新加载。
 * ② **p90 的会话根本不会触发回收**。实测 45 个带卡会话:p50 = 2 张、p90 = 7 张。
 *    7 ≤ 8,所以十个会话里有九个从头到尾一张都不卸 —— 谁也不会为这条策略付出
 *    重新加载的代价,它只为那条长尾存在。
 * ③ **= 2 × `ARTIFACT_CARD_LOAD_BUDGET`**。缓冲区整个凉掉时,正好两轮排队就能重新
 *    填满,不会出现一次几十个文档的重挂潮。
 *
 * ── 卸载的代价,以及为什么不敢再小 ────────────────────────────────────
 * 卸掉再挂回来 = **完整重走一遍文档加载**:daemon 的 raw 路由发 `Cache-Control:
 * no-cache`,一次往返;页面脚本从头再跑;`<head>` 里的外链重新拉。2026-09-02 现场
 * 那份产物挂着一条 `https://cdn.tailwindcss.com`,那个域名在测试机上打不通,卡面
 * 因此空白了 6~59 秒 —— 回收太激进的话,「滚回去看一眼」就会变成一次几十秒的空白,
 * 比内存问题刺眼得多。所以这里的取舍是**偏保守**:只有真的走远了(整整一屏之外
 * 且被更新的卡挤出去了)才卸,而 LRU 的「最近」语义保证了刚看过的那批永远排在最后。
 *
 * ⚠️ 这个数只管**离开视口的**卡。视口里的一律钉住不卸(大屏一次能看见更多,那就
 * 留更多),所以它是「缓冲区大小」,不是「总上限」—— 没有任何一屏会因为这个数而
 * 被拆掉。
 */
export const ARTIFACT_CARD_RETAIN_BUFFER = 8;

type SlotPhase = 'idle' | 'queued' | 'granted' | 'settled';

interface Lane {
  /** 这条泳道同时允许多少个文档在飞。 */
  readonly budget: number;
  loadingCount: number;
  /**
   * 只有 `suspendThumbnailLoads()` 会把它设成 true,而那个函数**只认
   * `backgroundLane`**。前台泳道「不会被挂起」就是这么实现的 —— 没有第二个
   * 开关。曾经这里还有一个 `suspendable: boolean` 字段,把它翻成 true 全部
   * 测试照样绿:它谁也没管着,是个会骗下一个人的摆设,所以删了。
   */
  suspended: boolean;
  queue: ThumbnailLoadSlot[];
  slots: Set<ThumbnailLoadSlot>;
}

interface ThumbnailLoadSlot {
  phase: SlotPhase;
  lane: Lane;
  notify: () => void;
}

function makeLane(budget: number): Lane {
  return { budget, loadingCount: 0, suspended: false, queue: [], slots: new Set() };
}

/** 首页/设计页的项目网格:背景封面,进项目要让位。 */
const backgroundLane = makeLane(THUMBNAIL_LOAD_BUDGET);
/** 会话里的产物卡:前台主内容,限流但不让位。 */
const foregroundLane = makeLane(ARTIFACT_CARD_LOAD_BUDGET);

function drain(lane: Lane): void {
  while (!lane.suspended && lane.loadingCount < lane.budget && lane.queue.length > 0) {
    const slot = lane.queue.shift()!;
    if (slot.phase !== 'queued') continue;
    slot.phase = 'granted';
    lane.loadingCount += 1;
    slot.notify();
  }
}

function removeFromQueue(slot: ThumbnailLoadSlot): void {
  const index = slot.lane.queue.indexOf(slot);
  if (index >= 0) slot.lane.queue.splice(index, 1);
}

function requestSlot(slot: ThumbnailLoadSlot): void {
  if (slot.phase !== 'idle') return;
  slot.phase = 'queued';
  slot.lane.queue.push(slot);
  drain(slot.lane);
}

function releaseSlot(slot: ThumbnailLoadSlot): void {
  if (slot.phase === 'granted') {
    slot.phase = 'idle';
    slot.lane.loadingCount -= 1;
    drain(slot.lane);
    return;
  }
  if (slot.phase === 'queued') {
    removeFromQueue(slot);
    slot.phase = 'idle';
    return;
  }
  /*
   * 已经加载完的槽位也要还回来。
   *
   * `settled` 的意思是「这一份文档已经画完了,不再占预算」,不是「这张卡从此
   * 免检」。被回收掉的产物卡如果留着 settled,滚回去时 `canLoad` 一直是 true,
   * 一整屏冷卡会**同时**重挂,把 `ARTIFACT_CARD_LOAD_BUDGET` 整条绕过去。
   * 计数在 settle 那一刻已经减过,这里只改状态,不再动 `loadingCount`。
   *
   * 注意这条路只有「组件自己不要槽位了」才会走到(`wanted` 变 false 或卸载);
   * `suspendThumbnailLoads()` 走的是另一条路,它只收 granted,已加载完的网格
   * 封面照旧不动。
   */
  if (slot.phase === 'settled') slot.phase = 'idle';
}

function settleSlot(slot: ThumbnailLoadSlot): void {
  if (slot.phase !== 'granted') return;
  slot.phase = 'settled';
  slot.lane.loadingCount -= 1;
  drain(slot.lane);
}

function disposeSlot(slot: ThumbnailLoadSlot): void {
  releaseSlot(slot);
  slot.lane.slots.delete(slot);
}

/**
 * Stop granting thumbnail load slots and revoke every granted slot that has
 * not settled yet. Owning components re-render with `canLoad === false`,
 * unmount their still-loading iframes, and wait in the queue. Already-loaded
 * (settled) frames are left alone.
 */
export function suspendThumbnailLoads(): void {
  const lane = backgroundLane;
  if (lane.suspended) return;
  lane.suspended = true;
  for (const slot of lane.slots) {
    if (slot.phase !== 'granted') continue;
    slot.phase = 'queued';
    lane.loadingCount -= 1;
    lane.queue.unshift(slot);
    slot.notify();
  }
}

/** Resume granting slots after `suspendThumbnailLoads()`. */
export function resumeThumbnailLoads(): void {
  if (!backgroundLane.suspended) return;
  backgroundLane.suspended = false;
  drain(backgroundLane);
}

export function thumbnailLoadsSuspended(): boolean {
  return backgroundLane.suspended;
}

/**
 * Reserve one of the shared thumbnail load slots.
 *
 * `wanted` should become true when the card is near the viewport and its
 * cover is ready to render. While the gate is saturated (or suspended) the
 * hook returns `canLoad === false`; the component keeps its lightweight
 * placeholder mounted. Call `settle()` from the iframe's load/error handler —
 * a settled slot stays renderable for the component's lifetime and no longer
 * counts against the budget.
 */
export function useThumbnailLoadSlot(wanted: boolean): {
  canLoad: boolean;
  settle: () => void;
} {
  return useLoadSlot(backgroundLane, wanted);
}

/**
 * Reserve one of the **foreground** (chat artifact card) load slots.
 *
 * 和 `useThumbnailLoadSlot` 同一套排队语义,只差两点:预算是
 * `ARTIFACT_CARD_LOAD_BUDGET`,并且**不响应 `suspendThumbnailLoads()`** ——
 * 产物卡就住在项目路由上,让它继承那条挂起等于永远拿不到槽位。
 */
export function useArtifactCardLoadSlot(wanted: boolean): {
  canLoad: boolean;
  settle: () => void;
} {
  return useLoadSlot(foregroundLane, wanted);
}

// ── 产物卡的保留策略(LRU 缓冲区)──────────────────────────────────────
//
// 上面那两条泳道管的是「**同时在加载**几个」;这一段管的是「**总共留着**几个」。
// 两件事不要混:一张卡可以早就加载完(不占任何泳道预算)却仍然占着一份文档。

interface RetainedCard {
  /** 此刻在不在视口里。视口里的一律钉住,永远不会被挤出去。 */
  visible: boolean;
  /** 宿主该不该挂着 iframe。 */
  retained: boolean;
  /**
   * 最近一次**可见性变化**的序号 —— LRU 里的「最近」。
   *
   * ⚠️ 关键在于它在**离开视口那一刻**也要重新打戳,而不是只在进入时打。只在进入
   * 时打的话,一张「一直在屏幕上没动过」的卡永远停在它入场时那个很老的号上;等它
   * 终于滚出去,它会以「最老」的身份排在淘汰队头,**刚看过的反而第一个被拆**。
   * 这条踩过:小幅来回滚动时,视口里待得最久的那两张先被卸掉。
   */
  seenAt: number;
  notify: () => void;
}

const retainedCards = new Set<RetainedCard>();
let retainClock = 0;
let evictionScheduled = false;

/**
 * 把离开视口的卡按「最近可见」排队,超出缓冲区的那些从队头卸掉。
 *
 * 只挑 `visible === false` 的下手:屏幕上正显示的东西不许被拆,所以留下的总数
 * 是「这一屏 + 缓冲区」,大屏自然留得多,而不是把用户正在看的卡拆掉去凑数。
 */
function evictColdCards(): void {
  const cold: RetainedCard[] = [];
  for (const card of retainedCards) {
    if (card.retained && !card.visible) cold.push(card);
  }
  if (cold.length <= ARTIFACT_CARD_RETAIN_BUFFER) return;
  cold.sort((a, b) => a.seenAt - b.seenAt);
  for (const card of cold.slice(0, cold.length - ARTIFACT_CARD_RETAIN_BUFFER)) {
    card.retained = false;
    card.notify();
  }
}

/**
 * 一次滚动 = 一个淘汰决定。
 *
 * 一次滚动会让一整批卡同时改变可见性,而 React 是**一张卡一个 effect**依次跑的。
 * 如果每个 effect 都当场淘汰一次,前几个 effect 看到的是一份「后面那些卡还没来得及
 * 报告」的残缺快照,会先超额卸一批再由后面的补回来。推迟到微任务,让这一轮所有卡
 * 都报告完再一次性算 —— 决定只做一次,依据是完整快照。
 */
function scheduleEviction(): void {
  if (evictionScheduled) return;
  evictionScheduled = true;
  queueMicrotask(() => {
    evictionScheduled = false;
    evictColdCards();
  });
}

/**
 * 这张产物卡现在该不该留着它的 iframe。
 *
 * `active` 为 false(首页/设计页的项目网格)时整条策略不参与,永远返回 true ——
 * 网格那条泳道有自己的「进项目就挂起」,不需要也不该被这里回收。
 *
 * `visible` 必须是**实时**的可见性(不是 `useInView` 那种进过一次就锁死的),
 * 否则 LRU 拿不到「最近」。
 */
export function useArtifactCardRetention(active: boolean, visible: boolean): boolean {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const cardRef = useRef<RetainedCard | null>(null);
  if (cardRef.current === null) {
    // 新卡按「刚刚看过」入场:它是因为进了视口才挂载的,不能一出生就排在淘汰队头。
    cardRef.current = { visible: false, retained: true, seenAt: ++retainClock, notify: force };
  }
  const card = cardRef.current;

  useEffect(() => {
    if (!active) return;
    retainedCards.add(card);
    return () => {
      retainedCards.delete(card);
      scheduleEviction();
    };
  }, [active, card]);

  useEffect(() => {
    if (!active) return;
    card.visible = visible;
    // 进和出**都**打戳:出的那一下才是「最后看见它是什么时候」,见 `seenAt`。
    card.seenAt = ++retainClock;
    if (visible && !card.retained) {
      card.retained = true;
      force();
    }
    scheduleEviction();
  }, [active, visible, card]);

  return !active || card.retained;
}

function useLoadSlot(
  lane: Lane,
  wanted: boolean,
): {
  canLoad: boolean;
  settle: () => void;
} {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const slotRef = useRef<ThumbnailLoadSlot | null>(null);
  if (slotRef.current === null) {
    slotRef.current = { phase: 'idle', lane, notify: () => force() };
  }
  const slot = slotRef.current;

  useEffect(() => {
    lane.slots.add(slot);
    if (wanted) {
      requestSlot(slot);
      // `requestSlot` may grant synchronously; the render that scheduled this
      // effect predates the grant, so reflect it.
      force();
    } else {
      // 包括 `settled` —— 理由在 `releaseSlot` 的最后一段。
      releaseSlot(slot);
      force();
    }
  }, [wanted, slot, lane]);

  useEffect(() => () => disposeSlot(slot), [slot]);

  const settle = useCallback(() => {
    settleSlot(slot);
  }, [slot]);

  return {
    canLoad: slot.phase === 'granted' || slot.phase === 'settled',
    settle,
  };
}

/** Test-only: drop all gate state so cases start from an empty budget. */
export function resetThumbnailLoadGateForTests(): void {
  for (const lane of [backgroundLane, foregroundLane]) {
    lane.loadingCount = 0;
    lane.suspended = false;
    lane.queue.length = 0;
    lane.slots.clear();
  }
  retainedCards.clear();
  retainClock = 0;
  evictionScheduled = false;
}
