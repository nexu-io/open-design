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
  // RATE_LIMITED / UPSTREAM_UNAVAILABLE (non-antigravity): still promote AMR as
  // the steadier hosted alternative, but now also name the failure type and
  // carry actionable recovery copy (#895) instead of leaving the raw upstream
  // string as the message. The auth codes (AGENT_AUTH_REQUIRED / UNAUTHORIZED)
  // also promote AMR but carry sign-in copy — covered by a dedicated test below.
  it('promotes AMR (switch card) + guidance copy for non-AMR quota/upstream errors', () => {
    const rate = resolveRunFailureUi('RATE_LIMITED', null, 'claude');
    expect(rate).toMatchObject({
      primaryAction: 'retry',
      titleKey: 'chat.runError.title.rateLimited',
      messageKey: 'chat.runError.rateLimitedMessage',
      showSwitchCard: true,
    });
    const upstream = resolveRunFailureUi('UPSTREAM_UNAVAILABLE', null, 'claude');
    expect(upstream).toMatchObject({
      primaryAction: 'retry',
      titleKey: 'chat.runError.title.upstreamUnavailable',
      messageKey: 'chat.runError.upstreamUnavailableMessage',
      showSwitchCard: true,
    });
    expect(resolveRunFailureUi('UNAUTHORIZED', null, null).showSwitchCard).toBe(true);
  });

  // #895 follow-up: the daemon's fine-grained failure_detail can refine — and
  // even override — a too-coarse error_code. A hard quota and a transient 429
  // both arrive as RATE_LIMITED, but retrying a hard quota is futile, so it must
  // drop Retry (primaryAction 'none') and name a distinct "quota exhausted" type
  // while still promoting the hosted-AMR switch card.
  it('overrides a coarse RATE_LIMITED code with hard-quota / workspace-credits detail', () => {
    const hard = resolveRunFailureUi('RATE_LIMITED', 'hard_quota', 'claude');
    expect(hard).toMatchObject({
      primaryAction: 'none',
      titleKey: 'chat.runError.title.quotaExhausted',
      messageKey: 'chat.runError.quotaExhaustedMessage',
      secondaryRetry: false,
      showSwitchCard: true,
    });
    const workspace = resolveRunFailureUi('RATE_LIMITED', 'workspace_credits_exhausted', 'claude');
    expect(workspace).toMatchObject({
      primaryAction: 'none',
      titleKey: 'chat.runError.title.quotaExhausted',
      messageKey: 'chat.runError.workspaceCreditsMessage',
      showSwitchCard: true,
    });
  });

  // A transient 429 (no hard-quota detail) still offers Retry — the detail
  // override must not swallow the recoverable case.
  it('keeps Retry for a transient RATE_LIMITED without a hard-quota detail', () => {
    const transient = resolveRunFailureUi('RATE_LIMITED', 'rate_limit_429', 'claude');
    expect(transient).toMatchObject({
      primaryAction: 'retry',
      titleKey: 'chat.runError.title.rateLimited',
      showSwitchCard: true,
    });
  });

  // CLI-missing detected only from stderr text leaks in as the opaque
  // AGENT_EXECUTION_FAILED code; the cli_not_installed detail must still route
  // it to the same "install the CLI, then retry" card as AGENT_UNAVAILABLE.
  it('routes text-detected cli_not_installed detail to the install-CLI card', () => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'cli_not_installed', 'claude');
    expect(ui).toMatchObject({
      primaryAction: 'retry',
      titleKey: 'chat.runError.title.cliMissing',
      messageKey: 'chat.runError.cliMissingMessage',
      showSwitchCard: false,
    });
  });

  // Antigravity's per-model quota flow (terminal switch-model) must still win
  // over the generic hard-quota detail override — its bespoke handling is
  // resolved before the detail layer.
  it('keeps the antigravity terminal switch-model flow even with a hard_quota detail', () => {
    const ui = resolveRunFailureUi('RATE_LIMITED', 'hard_quota', 'antigravity');
    expect(ui.primaryAction).toBe('launch-terminal-switch-model');
  });

  // #895 long tail: lower-frequency failure_detail values the daemon already
  // classifies (timeout, empty output, stale resumed session, missing Git Bash)
  // now map to a named type + actionable copy with a plain Retry, for any agent —
  // the AGENT_EXECUTION_FAILED code alone would only show the raw stderr.
  it('maps long-tail failure_detail values to a named type + retry guidance for any agent', () => {
    const cases: Array<[string, string, string]> = [
      ['timeout', 'chat.runError.title.timedOut', 'chat.runError.timedOutMessage'],
      ['inactivity_timeout', 'chat.runError.title.timedOut', 'chat.runError.inactivityTimeoutMessage'],
      ['empty_output', 'chat.runError.title.emptyOutput', 'chat.runError.emptyOutputMessage'],
      ['session_resume_expired', 'chat.runError.title.sessionExpired', 'chat.runError.sessionExpiredMessage'],
      ['git_bash_missing', 'chat.runError.title.gitBashMissing', 'chat.runError.gitBashMissingMessage'],
    ];
    for (const [detail, titleKey, messageKey] of cases) {
      for (const agent of ['claude', 'codex', 'amr', null]) {
        expect(resolveRunFailureUi('AGENT_EXECUTION_FAILED', detail, agent)).toMatchObject({
          primaryAction: 'retry',
          titleKey,
          messageKey,
          secondaryRetry: false,
          showSwitchCard: false,
        });
      }
    }
  });

  // Agent-agnostic root-cause codes (#895): each carries a named failure type +
  // actionable fix, resolved the same way for any agent, with a plain Retry and
  // no AMR promotion (these aren't "switch to hosted model" cases).
  it('maps agent-agnostic root-cause codes to a named type + guidance for any agent', () => {
    const cases: Array<[string, string, string]> = [
      ['AGENT_UNAVAILABLE', 'chat.runError.title.cliMissing', 'chat.runError.cliMissingMessage'],
      ['AGENT_PROMPT_TOO_LARGE', 'chat.runError.title.promptTooLarge', 'chat.runError.promptTooLargeMessage'],
      ['AMR_MODEL_UNAVAILABLE', 'chat.runError.title.modelUnavailable', 'chat.runError.modelUnavailableMessage'],
      ['TOOL_LOOP_DETECTED', 'chat.runError.title.toolLoop', 'chat.runError.toolLoopMessage'],
      ['ROLE_MARKER_HALLUCINATION', 'chat.runError.title.outputInvalid', 'chat.runError.outputInvalidMessage'],
      ['AGENT_RUNTIME_DEF_INVALID', 'chat.runError.title.runtimeConfig', 'chat.runError.runtimeConfigMessage'],
    ];
    for (const [code, titleKey, messageKey] of cases) {
      for (const agent of ['claude', 'codex', 'amr', 'antigravity', null]) {
        const ui = resolveRunFailureUi(code, null, agent);
        expect(ui).toMatchObject({
          primaryAction: 'retry',
          titleKey,
          messageKey,
          secondaryRetry: false,
          showSwitchCard: false,
        });
      }
    }
  });

  it('shows plain retry (no card) for generic non-AMR failures', () => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', null, 'claude');
    expect(ui).toMatchObject({ primaryAction: 'retry', showSwitchCard: false, messageKey: null });
    expect(resolveRunFailureUi('AGENT_UNAVAILABLE', null, 'codex').showSwitchCard).toBe(false);
  });

  it('localizes a mid-stream connection drop for any agent, no AMR promotion', () => {
    for (const agent of ['claude', 'codex', null]) {
      const ui = resolveRunFailureUi('AGENT_CONNECTION_DROPPED', null, agent);
      expect(ui).toMatchObject({
        primaryAction: 'retry',
        messageKey: 'chat.connectionDropped',
        secondaryRetry: false,
        showSwitchCard: false,
      });
    }
  });

  it('offers authorize-and-retry for an unauthorized AMR run (sign-in copy, no card)', () => {
    const ui = resolveRunFailureUi('AMR_AUTH_REQUIRED', null, 'amr');
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
        const ui = resolveRunFailureUi(code, null, agent);
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
    expect(resolveRunFailureUi('AMR_AUTH_REQUIRED', null, 'amr').messageKey).not.toBe(
      'chat.runError.signInMessage.other',
    );
  });

  it('offers recharge + manual retry for an out-of-balance AMR run', () => {
    const ui = resolveRunFailureUi('AMR_INSUFFICIENT_BALANCE', null, 'amr');
    expect(ui).toMatchObject({
      primaryAction: 'recharge',
      messageKey: 'chat.amrError.balanceMessage',
      secondaryRetry: true,
      showSwitchCard: false,
    });
  });

  it('offers upgrade + manual retry for an AMR tier entitlement failure', () => {
    const ui = resolveRunFailureUi('AMR_TIER_UPGRADE_REQUIRED', null, 'amr');
    expect(ui).toMatchObject({
      primaryAction: 'upgrade',
      titleKey: 'chat.amrBalanceGate.title',
      messageKey: null,
      secondaryRetry: true,
      showSwitchCard: false,
    });
  });

  it('falls back to plain retry for other AMR failures', () => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', null, 'amr');
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
    const ui = resolveRunFailureUi('AGENT_AUTH_REQUIRED', null, 'antigravity');
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
    const ui = resolveRunFailureUi('RATE_LIMITED', null, 'antigravity');
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
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', null, 'antigravity');
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
      const ui = resolveRunFailureUi('AGENT_AUTH_REQUIRED', null, agent);
      expect(ui.primaryAction).not.toBe('launch-terminal-auth');
    }
  });
});
