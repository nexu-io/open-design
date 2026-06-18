import { describe, expect, it } from 'vitest';
import { amrRechargeUrlForProfile, resolveRunFailureUi } from '../../src/runtime/amr-guidance';

describe('amrRechargeUrlForProfile', () => {
  it('matches the selected AMR profile wallet origin', () => {
    expect(amrRechargeUrlForProfile('prod')).toBe(
      'https://open-design.ai/amr/wallet?source=open_design',
    );
    expect(amrRechargeUrlForProfile('test')).toBe(
      'https://vela.powerformer.net/wallet?source=open_design',
    );
    expect(amrRechargeUrlForProfile('local')).toBe(
      'http://localhost:5173/wallet?source=open_design',
    );
    expect(amrRechargeUrlForProfile(' unknown ')).toBe(
      'https://open-design.ai/amr/wallet?source=open_design',
    );
  });
});

describe('resolveRunFailureUi', () => {
  it('promotes the official agent as the primary action for non-AMR auth/quota/upstream errors', () => {
    const cases = [
      ['AGENT_AUTH_REQUIRED', 'chat.runError.description.useOfficialAgent'],
      ['UNAUTHORIZED', 'chat.runError.description.useOfficialAgent'],
      ['RATE_LIMITED', 'chat.runError.description.rateLimitUseOfficialAgent'],
      ['UPSTREAM_UNAVAILABLE', 'chat.runError.description.upstreamUseOfficialAgent'],
    ] as const;
    for (const [code, messageKey] of cases) {
      const ui = resolveRunFailureUi(code, 'claude');
      expect(ui.primaryAction).toBe('switch-to-amr');
      expect(ui.secondaryRetry).toBe(true);
      expect(ui.messageKey).toBe(messageKey);
    }
    expect(resolveRunFailureUi('UNAUTHORIZED', null).primaryAction).toBe('switch-to-amr');
  });

  it('promotes the official agent for generic non-AMR failures', () => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'claude');
    expect(ui).toMatchObject({
      titleKey: 'chat.runError.title.generic',
      primaryAction: 'switch-to-amr',
      messageKey: 'chat.runError.description.genericUseOfficialAgent',
      secondaryRetry: true,
    });
    expect(resolveRunFailureUi('AGENT_UNAVAILABLE', 'codex')).toMatchObject({
      titleKey: 'chat.runError.title.generic',
      primaryAction: 'switch-to-amr',
      messageKey: 'chat.runError.description.genericUseOfficialAgent',
      secondaryRetry: true,
    });
  });

  it('localizes a mid-stream connection drop for any agent, no AMR promotion', () => {
    for (const agent of ['claude', 'codex', null]) {
      const ui = resolveRunFailureUi('AGENT_CONNECTION_DROPPED', agent);
      expect(ui).toMatchObject({
        titleKey: 'chat.runError.title.connectionDropped',
        primaryAction: 'retry',
        messageKey: 'chat.connectionDropped',
        secondaryRetry: false,
      });
    }
  });

  it('offers authorize-and-retry for an unauthorized AMR run (no card)', () => {
    const ui = resolveRunFailureUi('AMR_AUTH_REQUIRED', 'amr');
    expect(ui).toMatchObject({
      titleKey: 'chat.runError.title.auth',
      primaryAction: 'authorize',
      messageKey: 'chat.amrError.authMessage',
      secondaryRetry: false,
    });
  });

  it('offers recharge + manual retry for an out-of-balance AMR run', () => {
    const ui = resolveRunFailureUi('AMR_INSUFFICIENT_BALANCE', 'amr');
    expect(ui).toMatchObject({
      titleKey: 'chat.runError.title.balance',
      primaryAction: 'recharge',
      messageKey: 'chat.amrError.balanceMessage',
      secondaryRetry: true,
    });
  });

  it('falls back to plain retry for other AMR failures', () => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'amr');
    expect(ui).toMatchObject({
      titleKey: 'chat.runError.title.processExit',
      primaryAction: 'retry',
    });
  });

  it('promotes the official agent for antigravity AGENT_AUTH_REQUIRED', () => {
    const ui = resolveRunFailureUi('AGENT_AUTH_REQUIRED', 'antigravity');
    expect(ui).toMatchObject({
      titleKey: 'chat.runError.title.auth',
      primaryAction: 'switch-to-amr',
      messageKey: 'chat.runError.description.useOfficialAgent',
      secondaryRetry: true,
    });
  });

  // Antigravity's per-model quota: each model (Gemini 3 Pro / Flash,
  // Claude 4.6, GPT-OSS) has its own quota and the user has to switch
  // models in agy's TUI because there's no `--model` flag (upstream
  // #35). RATE_LIMITED keeps a terminal-launch handler for model switching.
  // Pin both action type AND `secondaryRetry: true` since model switching
  // happens out-of-band and we can't auto-retry from the daemon side.
  it('offers launch-terminal-switch-model + manual retry for antigravity RATE_LIMITED', () => {
    const ui = resolveRunFailureUi('RATE_LIMITED', 'antigravity');
    expect(ui).toMatchObject({
      titleKey: 'chat.runError.title.rateLimit',
      primaryAction: 'launch-terminal-switch-model',
      messageKey: 'chat.runError.description.rateLimit',
      secondaryRetry: true,
    });
  });

  // Other antigravity failure codes must NOT promote the terminal launcher —
  // it is specific to quota-reached model switching. Generic failures use the
  // same official-agent primary CTA as other non-AMR agents.
  it('does NOT promote terminal model switching for non-quota antigravity failures', () => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'antigravity');
    expect(ui.primaryAction).toBe('switch-to-amr');
    expect(ui.primaryAction).not.toBe('launch-terminal-switch-model');
  });

  it('promotes the official agent for other non-AMR auth failures', () => {
    for (const agent of ['claude', 'cursor-agent', 'deepseek', 'codex']) {
      const ui = resolveRunFailureUi('AGENT_AUTH_REQUIRED', agent);
      expect(ui.primaryAction).toBe('switch-to-amr');
    }
  });
});
