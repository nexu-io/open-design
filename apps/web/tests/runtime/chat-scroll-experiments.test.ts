// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHAT_LOG_SELF_RESIZE_OBSERVE_DISABLED_KEY,
  MSG_ENTER_ANIMATION_DISABLED_KEY,
  MSG_ENTER_DISABLED_ATTRIBUTE,
  __resetChatScrollExperimentsForTest,
  chatLogSelfResizeObserveDisabled,
  installChatScrollExperiments,
  msgEnterAnimationDisabled,
} from '../../src/runtime/chat-scroll-experiments';

/*
 * 两个滚动冻结假设的 A/B 开关本体。
 *
 * 这个文件盯的是**开关的形状**,不是被开关的行为(那两条分别在
 * `tests/components/chat-log-self-resize-observe-flag.test.tsx` 和
 * `tests/styles/msg-enter-animation-flag.test.ts`)。形状里有三件事是硬要求:
 *
 *  1. 默认必须是「关」。不设开关的包,行为要和今天一模一样。
 *  2. 键名是**操作契约**:真机上是人手敲 `localStorage.setItem(...)` 的,
 *     常量改名不能悄悄换掉那串字符串,所以这里写死字面量对比。
 *  3. 两个开关互相独立 —— 开一个不能把另一个也带上。
 */

beforeEach(() => {
  window.localStorage.clear();
  __resetChatScrollExperimentsForTest();
});

afterEach(() => {
  __resetChatScrollExperimentsForTest();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('开关键名(操作契约,改名 = 破坏真机操作说明)', () => {
  it('两个键名和文档里写给操作者的字符串一致', () => {
    expect(CHAT_LOG_SELF_RESIZE_OBSERVE_DISABLED_KEY).toBe(
      'open-design:disable-chat-log-self-resize-observe',
    );
    expect(MSG_ENTER_ANIMATION_DISABLED_KEY).toBe('open-design:disable-msg-enter-animation');
  });
});

describe('默认必须是关', () => {
  it('什么都不设时两个开关都读作关', () => {
    expect(chatLogSelfResizeObserveDisabled()).toBe(false);
    expect(msgEnterAnimationDisabled()).toBe(false);
  });

  it('值不是 "1" 时按关处理', () => {
    for (const value of ['true', 'on', 'yes', '0', '', ' 1']) {
      window.localStorage.setItem(CHAT_LOG_SELF_RESIZE_OBSERVE_DISABLED_KEY, value);
      window.localStorage.setItem(MSG_ENTER_ANIMATION_DISABLED_KEY, value);
      expect(chatLogSelfResizeObserveDisabled()).toBe(false);
      expect(msgEnterAnimationDisabled()).toBe(false);
    }
  });

  it('localStorage 读不动时(隐私模式 / 打包版无源页)也按关处理', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    expect(chatLogSelfResizeObserveDisabled()).toBe(false);
    expect(msgEnterAnimationDisabled()).toBe(false);
    spy.mockRestore();
  });

  it('install 在两个开关都关时什么都不做 —— 根节点上不留任何痕迹', () => {
    const before = document.documentElement.getAttributeNames().slice().sort();
    const teardown = installChatScrollExperiments();
    expect(document.documentElement.hasAttribute(MSG_ENTER_DISABLED_ATTRIBUTE)).toBe(false);
    expect(document.documentElement.getAttributeNames().slice().sort()).toEqual(before);
    teardown();
  });
});

describe('H3:msg-enter 开关落到根节点属性上', () => {
  it('开着的时候 install 会挂上属性,teardown 摘掉', () => {
    window.localStorage.setItem(MSG_ENTER_ANIMATION_DISABLED_KEY, '1');
    const teardown = installChatScrollExperiments();
    expect(document.documentElement.getAttribute(MSG_ENTER_DISABLED_ATTRIBUTE)).toBe('1');
    teardown();
    expect(document.documentElement.hasAttribute(MSG_ENTER_DISABLED_ATTRIBUTE)).toBe(false);
  });

  it('重复 install 不会重复挂,teardown 一次就干净', () => {
    window.localStorage.setItem(MSG_ENTER_ANIMATION_DISABLED_KEY, '1');
    const first = installChatScrollExperiments();
    const second = installChatScrollExperiments();
    second();
    // 第二次 install 是空操作,它的 teardown 也必须是空操作 —— 不能把第一次挂上的摘掉。
    expect(document.documentElement.getAttribute(MSG_ENTER_DISABLED_ATTRIBUTE)).toBe('1');
    first();
    expect(document.documentElement.hasAttribute(MSG_ENTER_DISABLED_ATTRIBUTE)).toBe(false);
  });
});

describe('两个开关互相独立', () => {
  it('只开 H2 不会带上 H3', () => {
    window.localStorage.setItem(CHAT_LOG_SELF_RESIZE_OBSERVE_DISABLED_KEY, '1');
    expect(chatLogSelfResizeObserveDisabled()).toBe(true);
    expect(msgEnterAnimationDisabled()).toBe(false);
    const teardown = installChatScrollExperiments();
    expect(document.documentElement.hasAttribute(MSG_ENTER_DISABLED_ATTRIBUTE)).toBe(false);
    teardown();
  });

  it('只开 H3 不会带上 H2', () => {
    window.localStorage.setItem(MSG_ENTER_ANIMATION_DISABLED_KEY, '1');
    expect(msgEnterAnimationDisabled()).toBe(true);
    expect(chatLogSelfResizeObserveDisabled()).toBe(false);
  });

  it('两个一起开也各自成立', () => {
    window.localStorage.setItem(CHAT_LOG_SELF_RESIZE_OBSERVE_DISABLED_KEY, '1');
    window.localStorage.setItem(MSG_ENTER_ANIMATION_DISABLED_KEY, '1');
    expect(chatLogSelfResizeObserveDisabled()).toBe(true);
    expect(msgEnterAnimationDisabled()).toBe(true);
    const teardown = installChatScrollExperiments();
    expect(document.documentElement.getAttribute(MSG_ENTER_DISABLED_ATTRIBUTE)).toBe('1');
    teardown();
  });
});
