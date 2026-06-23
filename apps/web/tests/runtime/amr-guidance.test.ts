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
  // RATE_LIMITED / UPSTREAM_UNAVAILABLE: promote AMR + plain retry, raw error
  // copy (no override). The auth codes (AGENT_AUTH_REQUIRED / UNAUTHORIZED) also
  // promote AMR but carry sign-in copy — covered by a dedicated test below.
  it('promotes AMR (switch card) for non-AMR model/quota errors', () => {
    for (const code of ['RATE_LIMITED', 'UPSTREAM_UNAVAILABLE']) {
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

  it('localizes a mid-stream connection drop for any agent, no AMR promotion', () => {
    for (const agent of ['claude', 'codex', null]) {
      const ui = resolveRunFailureUi('AGENT_CONNECTION_DROPPED', agent);
      expect(ui).toMatchObject({
        primaryAction: 'retry',
        messageKey: 'chat.connectionDropped',
        secondaryRetry: false,
        showSwitchCard: false,
      });
    }
  });

  it('offers authorize-and-retry for an unauthorized AMR run (sign-in copy, no card)', () => {
    const ui = resolveRunFailureUi('AMR_AUTH_REQUIRED', 'amr');
    expect(ui).toMatchObject({
      primaryAction: 'authorize',
      titleKey: 'chat.runError.title.signInRequired',
      // AMR-specific sign-in copy; single CTA, no AMR promotion card.
      messageKey: 'chat.runError.signInMessage.amr',
      secondaryRetry: false,
      showSwitchCard: false,
    });
  });

  // PRD "需要登录" — non-AMR agents. Open Design can't sign in for them (their
  // login lives in the user's own terminal), so the card shows the {agent}
  // sign-in copy, a plain Retry primary, and promotes AMR via the switch card.
  it('shows sign-in copy + retry + AMR promotion for non-AMR AGENT_AUTH_REQUIRED / UNAUTHORIZED', () => {
    for (const code of ['AGENT_AUTH_REQUIRED', 'UNAUTHORIZED']) {
      for (const agent of ['claude', 'codex', 'cursor-agent', 'deepseek']) {
        const ui = resolveRunFailureUi(code, agent);
        expect(ui).toMatchObject({
          primaryAction: 'retry',
          titleKey: 'chat.runError.title.signInRequired',
          messageKey: 'chat.runError.signInMessage.other',
          secondaryRetry: false,
          showSwitchCard: true,
        });
      }
    }
  });

  // AMR's own auth code must NOT fall into the non-AMR sign-in branch.
  it('does not give an AMR run the non-AMR sign-in copy', () => {
    expect(resolveRunFailureUi('AMR_AUTH_REQUIRED', 'amr').messageKey).not.toBe(
      'chat.runError.signInMessage.other',
    );
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

  // PR #3157: Antigravity's `agy -p` cannot complete Google Sign-In on
  // its own — the OAuth callback page asks the user to paste an auth
  // code back into agy, but print mode has no input field. The auth
  // banner offers a one-click "Sign in via terminal" button that
  // spawns a system Terminal running `agy`. Pin both the action type
  // AND `secondaryRetry: true` because OAuth completes externally and
  // we can't auto-retry from the daemon side — the manual Retry
  // button next to the launcher is the only way back to the chat run.
  it('offers launch-terminal-auth + manual retry for antigravity AGENT_AUTH_REQUIRED', () => {
    const ui = resolveRunFailureUi('AGENT_AUTH_REQUIRED', 'antigravity');
    expect(ui).toMatchObject({
      primaryAction: 'launch-terminal-auth',
      messageKey: null,
      secondaryRetry: true,
      showSwitchCard: false,
    });
  });

  // Antigravity's per-model quota: each model (Gemini 3 Pro / Flash,
  // Claude 4.6, GPT-OSS) has its own quota and the user has to switch
  // models in agy's TUI because there's no `--model` flag (upstream
  // #35). RATE_LIMITED gets the same terminal-launch handler as
  // AGENT_AUTH_REQUIRED — only the button label changes ("Switch
  // model in terminal" vs "Sign in via terminal"). Pin both action
  // type AND `secondaryRetry: true` since model switching happens
  // out-of-band and we can't auto-retry from the daemon side.
  it('offers launch-terminal-switch-model + manual retry for antigravity RATE_LIMITED', () => {
    const ui = resolveRunFailureUi('RATE_LIMITED', 'antigravity');
    expect(ui).toMatchObject({
      primaryAction: 'launch-terminal-switch-model',
      messageKey: null,
      secondaryRetry: true,
      showSwitchCard: false,
    });
  });

  // Other antigravity failure codes must NOT promote the terminal
  // launcher — it's specific to the OAuth-missing and quota-reached
  // cases. A generic `AGENT_EXECUTION_FAILED` should fall back to
  // plain retry.
  it('does NOT promote launch-terminal-auth for non-auth/quota antigravity failures', () => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'antigravity');
    expect(ui.primaryAction).toBe('retry');
    expect(ui.primaryAction).not.toBe('launch-terminal-auth');
    expect(ui.primaryAction).not.toBe('launch-terminal-switch-model');
  });

  // Other agents hitting AGENT_AUTH_REQUIRED must NOT see the
  // terminal launcher — agy's specific OAuth quirk is what motivates
  // it; cursor-agent / deepseek / claude have different sign-in
  // shapes (own CLI subcommand / API key env var / OAuth on first run).
  it('does NOT promote launch-terminal-auth for non-antigravity auth failures', () => {
    for (const agent of ['claude', 'cursor-agent', 'deepseek', 'codex']) {
      const ui = resolveRunFailureUi('AGENT_AUTH_REQUIRED', agent);
      expect(ui.primaryAction).not.toBe('launch-terminal-auth');
    }
  });
});
