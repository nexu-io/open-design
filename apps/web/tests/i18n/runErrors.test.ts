import { describe, expect, it } from 'vitest';

import { localizeRunFailureReason } from '../../src/i18n/runErrors';
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
