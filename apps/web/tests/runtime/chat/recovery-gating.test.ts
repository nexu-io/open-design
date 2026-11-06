// 纯函数单测(不启 jsdom):恢复动作的门控分档。
//
// 这一页最重要的一条是**等价性** —— 分档不许悄悄放宽或收紧原来那个布尔。
// 原式(`ProjectView`):
//
//   currentConversationActionDisabled =
//     (loading || streaming || hasActiveRun)          // busy
//     || readOnly || !billable || loading
//     || messagesUnavailable || awaitingAttach        // sendDisabled
//
// 下面用穷举把「有没有原因」和这条原式逐位比一遍。

import { describe, expect, it } from 'vitest';

import {
  recoveryActionBlockMessageKey,
  resolveRecoveryActionBlockReason,
} from '../../../src/runtime/chat/recovery-gating';

const NOTHING_BLOCKS = {
  readOnly: false,
  messagesUnavailable: false,
  billingPrincipalResolved: true,
  conversationBusy: false,
};

describe('resolveRecoveryActionBlockReason', () => {
  it('什么都不挡的时候没有原因', () => {
    expect(resolveRecoveryActionBlockReason(NOTHING_BLOCKS)).toBeNull();
  });

  it('每一档单独成立时给出自己那一档', () => {
    expect(
      resolveRecoveryActionBlockReason({ ...NOTHING_BLOCKS, readOnly: true }),
    ).toBe('read-only');
    expect(
      resolveRecoveryActionBlockReason({ ...NOTHING_BLOCKS, messagesUnavailable: true }),
    ).toBe('messages-unavailable');
    expect(
      resolveRecoveryActionBlockReason({
        ...NOTHING_BLOCKS,
        billingPrincipalResolved: false,
      }),
    ).toBe('billing-unresolved');
    expect(
      resolveRecoveryActionBlockReason({ ...NOTHING_BLOCKS, conversationBusy: true }),
    ).toBe('conversation-busy');
  });

  it('多档同时成立时取最具体的那一档,说明才不会随无关抖动换来换去', () => {
    expect(
      resolveRecoveryActionBlockReason({
        readOnly: true,
        messagesUnavailable: true,
        billingPrincipalResolved: false,
        conversationBusy: true,
      }),
    ).toBe('read-only');
    expect(
      resolveRecoveryActionBlockReason({
        readOnly: false,
        messagesUnavailable: true,
        billingPrincipalResolved: false,
        conversationBusy: true,
      }),
    ).toBe('messages-unavailable');
  });

  /**
   * 穷举六个原始条件的 64 种组合,拿原式当基准。
   *
   * `awaitingAttach ⊆ hasActiveRun`(定义里就带着 `hasActiveRun`),所以
   * 只枚举合法的组合;`loading` 同时出现在 busy 和 sendDisabled 两侧,
   * 这里照原样各算一次,证明并起来没有多也没有少。
   */
  it('和原来那个布尔逐位等价 —— 分档不放宽也不收紧', () => {
    const flags = [false, true];
    for (const readOnly of flags)
      for (const billable of flags)
        for (const loading of flags)
          for (const messagesUnavailable of flags)
            for (const streaming of flags)
              for (const hasActiveRun of flags)
                for (const awaitingAttachRaw of flags) {
                  const awaitingAttach = hasActiveRun && awaitingAttachRaw;
                  const busy = loading || streaming || hasActiveRun;
                  const sendDisabled =
                    readOnly
                    || !billable
                    || loading
                    || messagesUnavailable
                    || awaitingAttach;
                  const original = busy || sendDisabled;
                  const reason = resolveRecoveryActionBlockReason({
                    readOnly,
                    messagesUnavailable,
                    billingPrincipalResolved: billable,
                    conversationBusy: busy || awaitingAttach,
                  });
                  expect(reason !== null).toBe(original);
                }
  });
});

describe('recoveryActionBlockMessageKey', () => {
  it('四档各说各的话 —— 「正忙」和「不可发送」不许共用一句', () => {
    const keys = (
      ['read-only', 'messages-unavailable', 'billing-unresolved', 'conversation-busy'] as const
    ).map(recoveryActionBlockMessageKey);
    expect(new Set(keys).size).toBe(4);
  });
});
