/**
 * `OD_NEXT_TASK_BLOCKED` is the daemon's wrapper for any strategy-gate refusal
 * (OPEND-2953). It exits 0, so the daemon classifies it `execution_failed` —
 * the detail whose card is 「任务意外中断」. A projection that carries no
 * `blockedContext` reaches the resolver with exactly that pair, and the user
 * was told the agent had crashed over a reply that was sitting on screen.
 */
import { describe, expect, it } from 'vitest';

import { resolveRunFailureUi } from '../../src/runtime/amr-guidance';

describe('the daemon wrapper for a blocked strategy task', () => {
  it('names the halted task instead of an agent crash', () => {
    const ui = resolveRunFailureUi('OD_NEXT_TASK_BLOCKED', 'execution_failed', 'claude', null);

    expect(ui.titleKey).toBe('chat.runError.title.strategyTaskHalted');
    expect(ui.titleKey).not.toBe('chat.runError.title.agentCrashed');
    // The raw message carries the daemon's reason-code list; nothing better
    // is available without a `blockedContext`, so no override is invented.
    expect(ui.messageKey).toBeNull();
  });

  it('offers a retry and draws the card', () => {
    const ui = resolveRunFailureUi('OD_NEXT_TASK_BLOCKED', 'execution_failed', 'claude', null);

    expect(ui.primaryAction).toBe('retry');
    expect(ui.suppressCard).not.toBe(true);
  });
});
