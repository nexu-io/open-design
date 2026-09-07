// 聊天记录滚动冻结 —— 两个未证伪假设的运行时 A/B 开关。
//
// ═══════════════════════════════════════════════════════════════════
// 操作说明(真机上照这个敲)
// ═══════════════════════════════════════════════════════════════════
//
// 打开开发者工具的 Console,敲下面这行,然后**刷新/重开窗口**:
//
//   // H2:滚动盒不再观察自己
//   localStorage.setItem('open-design:disable-chat-log-self-resize-observe', '1')
//
//   // H3:消息不再跑 msg-enter 入场动画
//   localStorage.setItem('open-design:disable-msg-enter-animation', '1')
//
// 关掉(回到出厂行为),同样要刷新:
//
//   localStorage.removeItem('open-design:disable-chat-log-self-resize-observe')
//   localStorage.removeItem('open-design:disable-msg-enter-animation')
//
// 看当前状态:
//
//   localStorage.getItem('open-design:disable-chat-log-self-resize-observe')
//   localStorage.getItem('open-design:disable-msg-enter-animation')
//   document.documentElement.hasAttribute('data-od-msg-enter-disabled')  // H3 生效了没
//
// 两个开关**互不相干**,可以单独开、也可以同时开,四种组合都成立。
// 只有字面量 `'1'` 算「开」—— `'true'` / `'on'` / `'0'` 一律按关处理,
// 所以手滑打错不会意外改变行为。
//
// 生效时机:
//   · H3 在**启动时**读一次(`installChatScrollExperiments()`,见 client-app.tsx),
//     所以必须刷新。中途改 localStorage 不会有任何反应。
//   · H2 在 `.chat-log` 那条 effect 挂载时读(实际就是进聊天页 / 切回 Chat 标签)。
//     刷新是唯一可靠的翻转方式,不要靠切标签去试 —— 那会让 A/B 的边界说不清。
//
// ═══════════════════════════════════════════════════════════════════
// 打开之后**会失去什么**(这两条是真代价,不是零成本开关)
// ═══════════════════════════════════════════════════════════════════
//
// ── H2:滚动盒不再观察自己 ──
//
// 摘掉的是「只改**可视高度**、不改内容高度」这一整类变化的唯一通知源。
// `.chat-log` 的子元素各自还在被观察,所以内容长高/变矮照常;丢的是这些:
//
//   · 输入框长高(多行输入、贴了一大段文字)把可视区挤矮 —— 正在跟随的对话
//     不会重新贴底,最新那条会被长高的输入框压在下面。
//   · 移动端/触屏软键盘弹起收起,同上。
//   · 窗口**竖向**缩放。(横向拖分栏会让子元素重排,那条还在。)
//   · `chatLogScrollable`(滚动遮罩那个状态类)和「回到最新」浮标的判据会停在
//     旧读数上,直到下一次真的有 scroll 事件、内容变化、切标签或者换会话把它们
//     推一把。
//     ⚠️ 这一行**故意不写出那个类名的字面量**:
//     `tests/components/chat/queue-dead-rules.test.tsx` 会逐行扫 `src/` 找它的
//     「全部产地」,连注释一起算 —— 在注释里提一句就会把那条护栏弄红。
//
// 也就是说:开着 H2 的这一版,**跟随和浮标在「窗口/输入框变高矮」这一类时刻会失准**。
// 内容驱动的跟随(流式输出把对话拉长)不受影响。这也正是 `origin/main` 的行为
// —— 那边本来就只观察子元素,这条自观察是本分支加的。
//
// ── H3:msg-enter 不再作用于消息 ──
//
//   · 视觉上少掉每条消息的入场动画:200ms 的淡入 + 6px 上移。消息会**直接出现**。
//     和系统「减弱动态效果」下的表现一致(那条 media query 早就把它关了)。
//   · 顺带没有的还有动画收尾时留在元素上的 `transform: matrix(1,0,0,1,0,0)`。
//     这正是要测的那件事;但要注意它不是纯粹的「没有视觉差别」——
//     一个非 none 的 transform 会让元素成为绝对定位后代的包含块、并新建层叠上下文。
//     `.msg` 里如果有依赖这一点的绝对定位元素,开关打开后它们的定位基准会变。
//     真机 A/B 时如果看到消息内部有东西错位,先怀疑这条,别记成新缺陷。
//
// ═══════════════════════════════════════════════════════════════════
//
// 形状照抄 `runtime/chat-scroll-takeover.ts`:`open-design:` 前缀的 localStorage
// 键 + 刷新生效 + 读不到就当关。**不要**为这两个开关另起一套机制。
//
// 这两个开关只是**观察工具**,不是修复。H2 / H3 都还没有被证明是滚动冻结的成因,
// 所以这里只提供「把它摘掉」的能力,不改这两处代码本身的写法。
// 哪一条真被坐实了,再单独开 PR 去改。

/**
 * H2 —— `.chat-log` 不再把自己挂进那条 ResizeObserver 的观察名单。
 * 子元素和 QueuedSendStrip 的观察保持不变。
 */
export const CHAT_LOG_SELF_RESIZE_OBSERVE_DISABLED_KEY =
  'open-design:disable-chat-log-self-resize-observe';

/** H3 —— `.msg` 上的 `msg-enter` 入场动画整条摘掉(含它的 `fill: both`)。 */
export const MSG_ENTER_ANIMATION_DISABLED_KEY = 'open-design:disable-msg-enter-animation';

/**
 * H3 的落点。CSS 关不掉 localStorage,所以开关在启动时翻译成根节点上的一个属性,
 * 由 `styles/chat.css` 里那条 `:root[data-od-msg-enter-disabled] .msg` 接住。
 *
 * 挂在 `<html>` 而不是某个组件上:动画是**入场**动画,类名必须在第一帧之前就位,
 * 否则开着开关也会先闪一次动画。`client-app.tsx` 在 React 挂载之前调用。
 */
export const MSG_ENTER_DISABLED_ATTRIBUTE = 'data-od-msg-enter-disabled';

/**
 * 只有字面量 `'1'` 算开。
 *
 * 读不动一律当关 —— 隐私模式、被屏蔽的源、打包版 `od:` 页面禁了存储,
 * 这几种情况下一个读不到的开关就是一个关着的开关(和 takeover 同一套判据)。
 */
function flagSet(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

/** H2 开着吗。由 `ChatPane` 在挂 ResizeObserver 之前问一次。 */
export function chatLogSelfResizeObserveDisabled(): boolean {
  return flagSet(CHAT_LOG_SELF_RESIZE_OBSERVE_DISABLED_KEY);
}

/** H3 开着吗。只有下面的 install 会问 —— 其余地方一律看根节点属性。 */
export function msgEnterAnimationDisabled(): boolean {
  return flagSet(MSG_ENTER_ANIMATION_DISABLED_KEY);
}

let installed = false;
let attributeApplied = false;

/**
 * 启动时读一次开关,把需要 CSS 配合的那个(H3)翻译成根节点属性。
 *
 * 两个开关都关的时候**什么都不做**:不挂属性、不留监听、不排帧。没开开关的用户
 * 不该有任何办法看出这个模块存在 —— 这一条由 spec 钉着。
 *
 * 幂等:重复调用返回空操作的 teardown,不会把第一次挂上的属性摘掉。
 */
export function installChatScrollExperiments(): () => void {
  if (installed) return () => undefined;
  if (typeof document === 'undefined') return () => undefined;

  installed = true;
  if (msgEnterAnimationDisabled()) {
    document.documentElement.setAttribute(MSG_ENTER_DISABLED_ATTRIBUTE, '1');
    attributeApplied = true;
  }

  return () => {
    installed = false;
    if (!attributeApplied) return;
    attributeApplied = false;
    document.documentElement.removeAttribute(MSG_ENTER_DISABLED_ATTRIBUTE);
  };
}

/** 测试专用 —— 把模块状态冲干净。 */
export function __resetChatScrollExperimentsForTest(): void {
  installed = false;
  attributeApplied = false;
  if (typeof document !== 'undefined') {
    document.documentElement.removeAttribute(MSG_ENTER_DISABLED_ATTRIBUTE);
  }
}
