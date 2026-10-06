/**
 * 组件 22 · 重连(84 格状态矩阵第 82–84 格)· S29「网络连接中断 / 正在重连」。
 *
 * 这里测的是**流水尾部那一行的状态机**,不是它长什么样(长相在
 * `tests/components/chat-reconnect.test.tsx`)。三条硬要求全在这一层成立:
 *
 *   1. 恢复后整行消失,不留「已恢复」          → `cleared` / `succeeded` 归 null
 *   2. 次数用尽换成「重新连接」交回给人          → `exhausted` 立住,不被随后的 failed 抹掉
 *   3. run 落终态后不残留重连行                 → 落到 `canceled` 立刻归 null
 *
 * 第 3 条保证 run 的终态由回合 footer 接管,不在流水尾部残留另一条状态。
 * 所以「掉线那一行在 canceled 上必须让位」就是这条约束的**结构性**保证:
 * 两者的显示条件在数据层就交不上,不靠调用方记得写 else。
 */
import { describe, expect, it } from 'vitest';
import {
  type ChatReconnectView,
  nextChatReconnectView,
  reconnectViewForConversation,
  settledSignalFromMessages,
} from '../../../src/runtime/chat/reconnect-state';

const RUN = 'run-1';
const CONV = 'conv-1';

const reconnecting = (attempt: number, over: Partial<{ runId: string; conversationId: string }> = {}) =>
  ({
    kind: 'transport',
    runId: over.runId ?? RUN,
    conversationId: over.conversationId ?? CONV,
    attempt,
    max: 5,
    phase: 'reconnecting',
  }) as const;

describe('nextChatReconnectView · 82 重连中', () => {
  it('starts from nothing on screen', () => {
    expect(reconnectViewForConversation(null, CONV)).toBeNull();
  });

  it('carries the transport reading straight through', () => {
    const view = nextChatReconnectView(null, reconnecting(2));
    expect(view).toEqual<ChatReconnectView>({
      // 这一行现在还要说清它在说哪一件自救 —— 传输层重连,还是 daemon 重跑了
      // 一轮(见 `ChatSelfHealReason`)。整形状断言留着:多长出一个字段就该
      // 在这里被看见。
      reason: 'transport',
      runId: RUN,
      conversationId: CONV,
      attempt: 2,
      max: 5,
      exhausted: false,
      // 传输层的原话永远不是「按下之后的乐观读数」。这个字段是那把到期闸的钥匙,
      // 见 `ChatReconnectView.manualRetry`。
      manualRetry: false,
      // 也不是浏览器那一档:传输层接管之后 `online` 不该再撤这一行(见 `network` 信号)。
      offline: false,
    });
  });

  it('counts up inside one dropped stretch', () => {
    let view = nextChatReconnectView(null, reconnecting(1));
    view = nextChatReconnectView(view, reconnecting(2));
    view = nextChatReconnectView(view, reconnecting(3));
    expect(view?.attempt).toBe(3);
  });
});

describe('nextChatReconnectView · 恢复后自动消失', () => {
  it('drops the row when the transport says the drop is over', () => {
    const dropped = nextChatReconnectView(null, reconnecting(3));
    const back = nextChatReconnectView(dropped, {
      kind: 'transport',
      runId: RUN,
      conversationId: CONV,
      attempt: 0,
      max: 5,
      phase: 'cleared',
    });
    // 「恢复后整行消失,不留『已恢复』」—— 不是换一句话,是没有这一行。
    expect(back).toBeNull();
  });

  it('drops the row when the turn finishes', () => {
    const dropped = nextChatReconnectView(null, reconnecting(3));
    expect(nextChatReconnectView(dropped, { kind: 'settled', runId: RUN, status: 'succeeded' })).toBeNull();
  });

  it('ignores a clear that belongs to some other run', () => {
    // 后台重挂的另一条流恢复了,不该把当前这一轮的读数抹掉。
    const dropped = nextChatReconnectView(null, reconnecting(3));
    const after = nextChatReconnectView(dropped, {
      kind: 'transport',
      runId: 'run-other',
      conversationId: CONV,
      attempt: 0,
      max: 5,
      phase: 'cleared',
    });
    expect(after).toBe(dropped);
  });
});

describe('nextChatReconnectView · 84 次数用尽', () => {
  it('turns the row over to the user instead of counting further', () => {
    const dropped = nextChatReconnectView(null, reconnecting(5));
    const out = nextChatReconnectView(dropped, {
      kind: 'transport',
      runId: RUN,
      conversationId: CONV,
      attempt: 5,
      max: 5,
      phase: 'exhausted',
    });
    expect(out).toMatchObject({ attempt: 5, max: 5, exhausted: true });
  });

  it('survives the failed status the transport stamps on its way out', () => {
    // 传输层用尽预算时的顺序是 onRunStatus('failed') → emitReconnect('exhausted')
    // → onError(...)。晚到的 failed(报错卡那条路上还会再来一次)不能把
    // 已经交回给人的那一行抹掉,否则「重新连接」按钮会一闪而过。
    let view = nextChatReconnectView(null, reconnecting(5));
    view = nextChatReconnectView(view, { kind: 'settled', runId: RUN, status: 'failed' });
    view = nextChatReconnectView(view, {
      kind: 'transport',
      runId: RUN,
      conversationId: CONV,
      attempt: 5,
      max: 5,
      phase: 'exhausted',
    });
    view = nextChatReconnectView(view, { kind: 'settled', runId: RUN, status: 'failed' });
    expect(view).toMatchObject({ exhausted: true });
  });
});

describe('nextChatReconnectView · 交回给人之后又接上了', () => {
  const exhausted = () =>
    nextChatReconnectView(nextChatReconnectView(null, reconnecting(5)), {
      kind: 'transport',
      runId: RUN,
      conversationId: CONV,
      attempt: 5,
      max: 5,
      phase: 'exhausted',
    });

  it('steps aside as soon as the same run reports itself alive again', () => {
    // 用尽之后由外层(ProjectView 的重挂扫描 / 用户点〔重新连接〕)再试一次。
    // 那次重挂自己的读数从 0 起,所以它**不会**发 `cleared` —— 恢复的证据只有
    // 「这一轮又在跑了」。收到它就必须撤掉「连接失败」,否则正文一边流进来、
    // 底下一边挂着一句已经不成立的话。
    expect(nextChatReconnectView(exhausted(), { kind: 'settled', runId: RUN, status: 'running' })).toBeNull();
    expect(nextChatReconnectView(exhausted(), { kind: 'settled', runId: RUN, status: 'queued' })).toBeNull();
  });

  it('does not let a mid-drop status ping wipe the count', () => {
    // 还在数(没用尽)的时候,一条 running 只是状态回声,不是恢复 ——
    // 真正的恢复由传输层的 `cleared` 说了算。
    const counting = nextChatReconnectView(null, reconnecting(3));
    expect(nextChatReconnectView(counting, { kind: 'settled', runId: RUN, status: 'running' })).toBe(counting);
  });
});

describe('nextChatReconnectView · run 落终态后撤掉重连行', () => {
  it('yields the row the moment the run lands on canceled', () => {
    // 用户在掉线期间按了停:终态由回合 footer 报,重连行必须同时消失。
    const dropped = nextChatReconnectView(null, reconnecting(3));
    expect(nextChatReconnectView(dropped, { kind: 'settled', runId: RUN, status: 'canceled' })).toBeNull();
  });

  it('yields even from the exhausted state', () => {
    const out = nextChatReconnectView(nextChatReconnectView(null, reconnecting(5)), {
      kind: 'transport',
      runId: RUN,
      conversationId: CONV,
      attempt: 5,
      max: 5,
      phase: 'exhausted',
    });
    expect(nextChatReconnectView(out, { kind: 'settled', runId: RUN, status: 'canceled' })).toBeNull();
  });

  it('keeps a stale settled signal from another run out of it', () => {
    const dropped = nextChatReconnectView(null, reconnecting(3));
    expect(
      nextChatReconnectView(dropped, { kind: 'settled', runId: 'run-other', status: 'canceled' }),
    ).toBe(dropped);
  });
});

describe('nextChatReconnectView · 不残留', () => {
  it('is wiped when the local side stops following the stream', () => {
    const dropped = nextChatReconnectView(null, reconnecting(3));
    expect(nextChatReconnectView(dropped, { kind: 'dropped' })).toBeNull();
  });

  it('never leaks into another conversation', () => {
    // 后台重挂发生在别的会话上:当前会话的流水尾部不该长出一行别人的重连。
    const other = nextChatReconnectView(null, reconnecting(2, { conversationId: 'conv-2' }));
    expect(reconnectViewForConversation(other, CONV)).toBeNull();
    expect(reconnectViewForConversation(other, 'conv-2')).toBe(other);
  });
});

describe('nextChatReconnectView · 按下〔重新连接〕要有回音,而且不许留下死胡同', () => {
  /**
   * 真机量到的两件事(2026-08-27),它们互相牵制,所以写在同一族里:
   *
   *   甲、daemon 还没回来时按那颗按钮,**屏幕上一点变化都没有** —— 记账被清掉、
   *      重挂扫描被叫醒、扫描失败、一切回到原样。用户原话「点击 reconnect 咋没啥
   *      反应」。从用户视角,「点了没变化」和「按钮坏了」长得一模一样。
   *   乙、更早一版曾经乐观地把整行撤掉,结果重挂起不来时屏幕上只剩壳头一句
   *      「运行失败」,连再按一次的入口都没有。
   *
   * 于是这一层的规矩是:按下**无条件**进入重连态(甲),而这个乐观读数**必须**
   * 有一个到期回落(乙)—— 到期由 `manual-retry-expired` 说了算,`ProjectView`
   * 按下时同步支起那把闸(`MANUAL_RECONNECT_FEEDBACK_MS`)。
   *
   * 撤整行的唯一正当时机仍然只有一个:**重挂真的开始了**(`dropped`)。
   */
  const exhausted = () =>
    nextChatReconnectView(null, {
      kind: 'transport',
      runId: RUN,
      conversationId: CONV,
      attempt: 5,
      max: 5,
      phase: 'exhausted',
    });

  it('flips the handed-back row straight back into 正在重新连接 1/5', () => {
    const handedBack = exhausted();
    expect(handedBack?.exhausted).toBe(true);

    const afterPress = nextChatReconnectView(handedBack, { kind: 'manual-retry', runId: RUN });
    expect(afterPress, '按下没有任何读数变化 = 和按钮坏了长得一样').not.toBe(handedBack);
    expect(afterPress).toEqual<ChatReconnectView>({
      reason: 'transport',
      runId: RUN,
      conversationId: CONV,
      // 从 1 起:这是**这次人按的**第一次,不是接着传输层那 5 次数下去。
      attempt: 1,
      max: 5,
      exhausted: false,
      manualRetry: true,
      // 这一行本来就是传输层数出来的,一次按压不会把它变成浏览器那一档。
      offline: false,
    });
  });

  it('falls back to 22-3 when the press did not take', () => {
    const afterPress = nextChatReconnectView(exhausted(), { kind: 'manual-retry', runId: RUN });
    const expired = nextChatReconnectView(afterPress, {
      kind: 'manual-retry-expired',
      runId: RUN,
    });
    expect(expired?.exhausted, '卡在「正在重连」永远转 = 第二种死胡同').toBe(true);
    expect(expired?.manualRetry).toBe(false);
    expect(expired?.attempt).toBe(5);
  });

  it('does not resurrect the row when the press actually reconnected', () => {
    // 重挂真的起来了 → `dropped` 把整行撤掉。此后那把到期闸不许再画回来。
    const afterPress = nextChatReconnectView(exhausted(), { kind: 'manual-retry', runId: RUN });
    const started = nextChatReconnectView(afterPress, { kind: 'dropped', runId: RUN });
    expect(started).toBeNull();
    expect(nextChatReconnectView(started, { kind: 'manual-retry-expired', runId: RUN })).toBeNull();
  });

  it('does not let the expiry gate touch a reading the transport layer owns', () => {
    // 按下之后传输层自己重新数起来了 —— 那把闸是给乐观读数准备的,不许动真读数。
    const afterPress = nextChatReconnectView(exhausted(), { kind: 'manual-retry', runId: RUN });
    const real = nextChatReconnectView(afterPress, reconnecting(3));
    expect(real?.manualRetry).toBe(false);
    expect(nextChatReconnectView(real, { kind: 'manual-retry-expired', runId: RUN })).toBe(real);
  });

  it('holds the optimistic row when the daemon answers "still failed"', () => {
    /*
     * 掉线期间传输层写的正是 `failed`,而没交回给人的那一行遇到 `failed` 是要
     * 归 null 的。乐观窗口里绝不能走那条 —— 那就等于「按一下整行消失」,回到
     * 乙那个死胡同。收场由到期闸统一判。
     */
    const afterPress = nextChatReconnectView(exhausted(), { kind: 'manual-retry', runId: RUN });
    const stillFailed = nextChatReconnectView(afterPress, {
      kind: 'settled',
      runId: RUN,
      status: 'failed',
    });
    expect(stillFailed, '乐观窗口被 failed 抹掉 = 按一下整行消失').toBe(afterPress);
  });

  it('still disappears for real when the run turns out to have succeeded', () => {
    const afterPress = nextChatReconnectView(exhausted(), { kind: 'manual-retry', runId: RUN });
    expect(
      nextChatReconnectView(afterPress, { kind: 'settled', runId: RUN, status: 'succeeded' }),
    ).toBeNull();
  });

  it('ignores a press while the transport layer is still counting', () => {
    // 还在数的那一行没有按钮(22-3 才有),所以这条不该被按到。真被按到也不许
    // 把传输层的真实读数改写成 1。
    const counting = nextChatReconnectView(null, reconnecting(3));
    expect(nextChatReconnectView(counting, { kind: 'manual-retry', runId: RUN })).toBe(counting);
  });

  it('ignores a press aimed at some other run', () => {
    const view = nextChatReconnectView(null, reconnecting(2));
    expect(nextChatReconnectView(view, { kind: 'manual-retry', runId: 'run-other' })).toBe(view);
  });

  it('ignores an expiry aimed at some other run', () => {
    const afterPress = nextChatReconnectView(exhausted(), { kind: 'manual-retry', runId: RUN });
    expect(
      nextChatReconnectView(afterPress, { kind: 'manual-retry-expired', runId: 'run-other' }),
    ).toBe(afterPress);
  });
});

describe('settledSignalFromMessages · 结局从别的门进来时也要撤那一行', () => {
  const exhaustedView = () =>
    nextChatReconnectView(null, {
      kind: 'transport',
      runId: RUN,
      conversationId: CONV,
      attempt: 5,
      max: 5,
      phase: 'exhausted',
    });

  it('reports a run that finished while nobody was listening to the stream', () => {
    const view = exhaustedView();
    const signal = settledSignalFromMessages(view, [
      { runId: 'run-other', runStatus: 'failed' },
      { runId: RUN, runStatus: 'succeeded' },
    ]);
    expect(signal).toEqual({ kind: 'settled', runId: RUN, status: 'succeeded' });
    expect(nextChatReconnectView(view, signal!), '收场了还挂着 = 稿子说的残影').toBeNull();
  });

  it('leaves the handed-back row alone while the run is still failed-and-disconnected', () => {
    const view = exhaustedView();
    // 掉线时传输层写的正是 'failed' —— 拿它当「收场」会把 22-3 那颗按钮一闪而过。
    expect(settledSignalFromMessages(view, [{ runId: RUN, runStatus: 'failed' }])).toBeNull();
  });

  it('says nothing when there is no row on screen', () => {
    expect(settledSignalFromMessages(null, [{ runId: RUN, runStatus: 'succeeded' }])).toBeNull();
  });
});

/**
 * 第二个上膛口:浏览器自己说这一屏没网了(`network` 信号)。
 *
 * 传输层那条梯子只认「socket 真的断掉」;daemon 跑在本机回环上时,页签断网
 * 常常一点事都不出 —— 流没断、keepalive 照旧到,预算从头到尾是 0。所以这一档
 * 不是锦上添花,它是那种断法**唯一**的证据来源。它自己的三条边界都在这里。
 */
describe('nextChatReconnectView · 这一屏没网了', () => {
  const offline = { kind: 'network', runId: RUN, conversationId: CONV, online: false } as const;
  const online = { kind: 'network', runId: RUN, conversationId: CONV, online: true } as const;

  it('puts the row up with no fraction — there is no ladder counting', () => {
    const view = nextChatReconnectView(null, offline);
    expect(view).toEqual<ChatReconnectView>({
      reason: 'transport',
      runId: RUN,
      conversationId: CONV,
      attempt: 1,
      // `Reconnect` 的 showCount = max > 1,所以这一档只画那句话。
      // 写「1/5」是假话:背后没有任何东西在数。
      max: 1,
      exhausted: false,
      manualRetry: false,
      offline: true,
    });
  });

  it('takes the row away when the tab is back online', () => {
    const view = nextChatReconnectView(nextChatReconnectView(null, offline), online);
    // 「恢复后整行消失,不留『已恢复』」—— 文件头第 1 条。
    expect(view).toBeNull();
  });

  it('does not let online retract a reading the transport layer is still counting', () => {
    const counting = nextChatReconnectView(null, reconnecting(3));
    // 这一屏有网了,不代表浏览器 ↔ daemon 那条流通了。撤它等于替传输层宣布已接上。
    expect(nextChatReconnectView(counting, online)).toBe(counting);
  });

  it('lets the transport reading take over the offline row, never the other way round', () => {
    const offlineRow = nextChatReconnectView(null, offline);
    const taken = nextChatReconnectView(offlineRow, reconnecting(2));
    expect(taken).toMatchObject({ attempt: 2, max: 5, offline: false });
    // 反过来:传输层在数的时候再报一次 offline,不许把 2/5 降级成没有分数的那一档。
    expect(nextChatReconnectView(taken, offline)).toBe(taken);
  });

  it('survives a reattach starting — a fresh stream does not bring the network back', () => {
    const offlineRow = nextChatReconnectView(null, offline);
    expect(nextChatReconnectView(offlineRow, { kind: 'dropped', runId: RUN })).toBe(offlineRow);
    // 整屏级的全清(切会话 / 卸载)照旧连它一起撤。
    expect(nextChatReconnectView(offlineRow, { kind: 'dropped' })).toBeNull();
  });

  it('goes away with the turn it belonged to', () => {
    const offlineRow = nextChatReconnectView(null, offline);
    expect(
      nextChatReconnectView(offlineRow, { kind: 'settled', runId: RUN, status: 'succeeded' }),
    ).toBeNull();
  });
});
