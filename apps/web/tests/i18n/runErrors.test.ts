import { describe, expect, it } from 'vitest';

import { localizeRunFailureReason } from '../../src/i18n/runErrors';
import { en } from '../../src/i18n/locales/en';
import { zhCN } from '../../src/i18n/locales/zh-CN';
import type { Dict } from '../../src/i18n/types';

const t = ((key: keyof Dict) => {
  if (key === 'routines.errorAgentEmptyOutput') {
    return '代理已完成运行但未产生任何输出。';
  }
  return key;
}) as (key: keyof Dict) => string;

describe('localizeRunFailureReason', () => {
  it('passes through the updated daemon empty-output guidance', () => {
    const reason =
      'Agent completed without producing any output. The model or provider may have returned an empty response. Check the agent logs for upstream errors, then try re-authenticating the agent, checking quota, or switching models.';

    expect(localizeRunFailureReason(reason, t)).toBe(reason);
  });

  it('maps legacy daemon empty-output errors to i18n', () => {
    const reason =
      'Agent completed without producing any output. The model or provider may have returned an empty response — check the agent logs for upstream errors.';

    expect(localizeRunFailureReason(reason, t)).toBe(
      '代理已完成运行但未产生任何输出。',
    );
  });

  it('passes through unknown errors unchanged', () => {
    expect(localizeRunFailureReason('Network timeout', t)).toBe('Network timeout');
  });
});

// 《Open Design 报错体验设计方案》§5 场景卡, verbatim:
//   「超时：等了 10 分钟没有新的输出，先停下来了 —— 已做的部分都保留着。」
//
// The copy the user actually reads is this dictionary entry, not the daemon's
// English diagnostic sentence. Two properties matter enough to pin: it names
// the wait, and it promises the work is kept. Neither may quietly disappear in
// a future copy edit, and neither may grow back into a diagnosis of what the
// model was doing — 968 runs across 14 days emitted their first output after
// ten minutes and then succeeded, so "it hung" is usually just wrong.
describe('run timeout copy', () => {
  it('states the wait and keeps the design’s "work is saved" promise', () => {
    expect(zhCN['chat.runError.inactivityTimeoutMessage'])
      .toBe('等了 {minutes} 分钟没有新的输出，先停下来了 —— 已做的部分都保留着。');
    expect(en['chat.runError.inactivityTimeoutMessage']).toContain('{minutes}');
    for (const copy of [
      en['chat.runError.inactivityTimeoutMessage'],
      en['chat.runError.inactivityTimeoutMessageOneMinute'],
      en['chat.runError.inactivityTimeoutMessageNoTime'],
      zhCN['chat.runError.inactivityTimeoutMessage'],
      zhCN['chat.runError.inactivityTimeoutMessageOneMinute'],
      zhCN['chat.runError.inactivityTimeoutMessageNoTime'],
    ]) {
      expect(copy).not.toMatch(/hung|hang|crash|卡死|挂起|崩溃/i);
    }
  });
});
