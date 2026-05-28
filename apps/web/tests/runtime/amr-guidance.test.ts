import { describe, expect, it } from 'vitest';
import { resolveRunFailureUi } from '../../src/runtime/amr-guidance';

describe('resolveRunFailureUi', () => {
  it('promotes AMR (switch card) for non-AMR model/auth/quota errors', () => {
    for (const code of [
      'AGENT_AUTH_REQUIRED',
      'UNAUTHORIZED',
      'RATE_LIMITED',
      'UPSTREAM_UNAVAILABLE',
    ]) {
      const ui = resolveRunFailureUi(code, 'claude');
      expect(ui.showSwitchCard).toBe(true);
      expect(ui.primaryAction).toBe('retry');
      expect(ui.messageKey).toBeNull();
    }
    expect(resolveRunFailureUi('UNAUTHORIZED', null).showSwitchCard).toBe(true);
  });

  it('shows plain retry (no card) for generic non-AMR failures', () => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'claude');
    expect(ui).toMatchObject({ primaryAction: 'retry', showSwitchCard: false, messageKey: null });
    expect(resolveRunFailureUi('AGENT_UNAVAILABLE', 'codex').showSwitchCard).toBe(false);
  });

  it('offers authorize-and-retry for an unauthorized AMR run (no card)', () => {
    const ui = resolveRunFailureUi('AMR_AUTH_REQUIRED', 'amr');
    expect(ui).toMatchObject({
      primaryAction: 'authorize',
      messageKey: 'chat.amrError.authMessage',
      secondaryRetry: false,
      showSwitchCard: false,
    });
  });

  it('offers recharge + manual retry for an out-of-balance AMR run', () => {
    const ui = resolveRunFailureUi('AMR_INSUFFICIENT_BALANCE', 'amr');
    expect(ui).toMatchObject({
      primaryAction: 'recharge',
      messageKey: 'chat.amrError.balanceMessage',
      secondaryRetry: true,
      showSwitchCard: false,
    });
  });

  it('falls back to plain retry for other AMR failures', () => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'amr');
    expect(ui).toMatchObject({ primaryAction: 'retry', showSwitchCard: false });
  });
});
