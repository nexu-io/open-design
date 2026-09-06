/**
 * OPEND-2613 —— 队列那一族文案统一用产品术语:英文 steer,中文「引导」。
 *
 * 屏幕上那两句(按钮的可见标签 `chat.queuedSteer`、hover 的
 * `chat.queuedSteerInterrupts`)由 `tests/components/chat/w117-queue-steer-interrupt.test.tsx`
 * 逐字钉着,那一页量的是**渲染结果**。这一页管的是同一族里**当下没有消费方**
 * 的那几条:`chat.queuedSteerUnsupported` / `Closed` / `Failed` / `TextOnly`。
 *
 * 为什么没有消费方还要钉:`QueuedSendStrip` 的 `steerBlockedReason` 是**故意
 * 留着没删**的(见 `ChatPane.tsx` 那条 docblock —— 这句解释该摆在界面哪里
 * 还没裁决)。也就是说这几条随时可能被接回屏幕上。等它接回来的那天才发现
 * 中文写的是「插话」,就晚了。
 *
 * ⚠️ **这是一条对文案数据的 lint,不是行为测试。** 它读词典、断言词典,
 * 证明不了任何用户在屏幕上看到的事 —— 屏幕那一半在 w117 那一页。
 * 它能挡住的只有一件事:有人在这一族里重新写下「插话」。
 *
 * 为什么只钉中文两档:这条术语裁决给的是一个**具体的词**(中文「引导」/
 * 英文 steer)。其余 16 种语言里这一族用的是「这个 agent 中途收不了消息」
 * 这类描述性说法,没有一个对应的错词可以查;拿机器翻译去统一它们,换来的是
 * 一批没人能校对的字符串,而屏幕上今天一个字都不显示。
 */
import { describe, expect, it } from 'vitest';

import { zhCN } from '../../src/i18n/locales/zh-CN';
import { zhTW } from '../../src/i18n/locales/zh-TW';
import { en } from '../../src/i18n/locales/en';
import type { Dict } from '../../src/i18n/types';

/** 队列「引导对话」那一族的全部文案键。 */
const STEER_KEYS = [
  'chat.queuedSteer',
  'chat.queuedSteerInterrupts',
  'chat.queuedSteerUnsupported',
  'chat.queuedSteerClosed',
  'chat.queuedSteerFailed',
  'chat.queuedSteerTextOnly',
] as const satisfies ReadonlyArray<keyof Dict>;

const CHINESE: ReadonlyArray<readonly [string, Dict]> = [
  ['zh-CN', zhCN],
  ['zh-TW', zhTW],
];

describe('OPEND-2613:队列「引导对话」一族的术语', () => {
  it('先证明这把尺子够得着 —— 每一条都真的存在且非空', () => {
    // 键写错时 `dict[key]` 是 undefined,而 `undefined` 既不含「插话」也不含
    // 「引导」—— 下面两条断言会一起变成看不出问题的空断言。
    for (const [locale, dict] of CHINESE) {
      for (const key of STEER_KEYS) {
        expect(typeof dict[key], `${locale} ${key}`).toBe('string');
        expect((dict[key] ?? '').length, `${locale} ${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('中文这一族一个「插话」都不许有', () => {
    for (const [locale, dict] of CHINESE) {
      for (const key of STEER_KEYS) {
        expect(dict[key], `${locale} ${key}`).not.toMatch(/插话|插話/);
      }
    }
  });

  it('说得出这个动作的那几条,中文用「引导」、英文用 steer', () => {
    // 只挑「这个动作本身叫什么」的三条:按钮名、hover、以及不可用时的解释。
    // `Closed` / `TextOnly` 说的是这一轮的状态,不是动作名,不在此列。
    const NAMES_THE_ACTION = [
      'chat.queuedSteer',
      'chat.queuedSteerInterrupts',
      'chat.queuedSteerUnsupported',
    ] as const satisfies ReadonlyArray<keyof Dict>;

    for (const key of NAMES_THE_ACTION) {
      expect(zhCN[key], `zh-CN ${key}`).toContain('引导');
      expect(zhTW[key], `zh-TW ${key}`).toContain('引導');
    }
    // 英文侧:动作名那两条已经用 steer,不可用那条今天说的是「收不了消息」——
    // 描述的是同一件事,没有错词可查,所以这里只钉屏幕上会出现的两条。
    expect(en['chat.queuedSteer']).toMatch(/steer/i);
    expect(en['chat.queuedSteerInterrupts']).toMatch(/steer/i);
  });
});
