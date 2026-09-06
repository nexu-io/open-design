import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  TrackingRunFailureCategory,
  TrackingRunFailureUserAction,
} from '@open-design/contracts';
import {
  DEFAULT_AMR_RECHARGE_URL,
  OPEN_DESIGN_PRICING_URL,
  amrConsoleUrlForWorkspace,
  amrPlansUrlForWorkspace,
  amrProfileBadgeLabel,
  amrRechargeUrlForProfile,
  formatModelWindowRetryAt,
  modelWindowLimitCopy,
  resolveRunFailureUi,
  setRuntimeAmrConsoleOrigin,
} from '../../src/runtime/amr-guidance';

// Stand-in for an internal deployment's console origin. The real hostnames are
// injected into packaged builds at build time and reach the web runtime through
// the daemon, so they must never appear in this public source tree.
const RUNTIME_CONSOLE_ORIGIN = 'https://vela.example.invalid';

afterEach(() => {
  setRuntimeAmrConsoleOrigin(null);
});

describe('amrRechargeUrlForProfile', () => {
  // Product decision: there is no wallet page in the console's information
  // architecture any more — balance, top-up and the auto-recharge policy all
  // report on the dashboard (vela #1055 rehomed them there). Every console
  // entry this module builds therefore targets `/dashboard`, not `/wallet`.
  it('targets the console dashboard on every AMR profile', () => {
    expect(DEFAULT_AMR_RECHARGE_URL).toBe(
      'https://open-design.ai/amr/dashboard?source=open_design',
    );
    expect(amrRechargeUrlForProfile('prod')).toBe(DEFAULT_AMR_RECHARGE_URL);
    expect(amrRechargeUrlForProfile('test')).toBe(
      'https://vela.powerformer.net/dashboard?source=open_design',
    );
    expect(amrRechargeUrlForProfile('local')).toBe(
      'http://localhost:5173/dashboard?source=open_design',
    );
    expect(amrRechargeUrlForProfile(' unknown ')).toBe(DEFAULT_AMR_RECHARGE_URL);
    expect(amrRechargeUrlForProfile(null)).toBe(DEFAULT_AMR_RECHARGE_URL);
  });

  it('labels the feature-test profile distinctly', () => {
    expect(amrProfileBadgeLabel('feature-test')).toBe('FEATURE TEST');
  });

  // An internal (non-public) environment has no origin in this bundle at all:
  // the daemon reports the one its build was given, and until it does the
  // client shows the public console rather than a guessed internal hostname.
  it('falls back to the public console for a profile with no runtime origin', () => {
    expect(amrRechargeUrlForProfile('feature-test')).toBe(DEFAULT_AMR_RECHARGE_URL);
  });

  it('uses the runtime console origin the daemon reported for a non-prod profile', () => {
    setRuntimeAmrConsoleOrigin(RUNTIME_CONSOLE_ORIGIN);
    expect(amrRechargeUrlForProfile('feature-test')).toBe(
      `${RUNTIME_CONSOLE_ORIGIN}/dashboard?source=open_design`,
    );
  });

  it('tolerates a trailing slash and blank runtime origins', () => {
    setRuntimeAmrConsoleOrigin(`${RUNTIME_CONSOLE_ORIGIN}/`);
    expect(amrRechargeUrlForProfile('feature-test')).toBe(
      `${RUNTIME_CONSOLE_ORIGIN}/dashboard?source=open_design`,
    );
    setRuntimeAmrConsoleOrigin('   ');
    expect(amrRechargeUrlForProfile('feature-test')).toBe(DEFAULT_AMR_RECHARGE_URL);
  });

  // prod's console is the public product URL. A runtime origin must never be
  // able to redirect a production user's console/upgrade links elsewhere.
  it('never lets a runtime origin override the prod console', () => {
    setRuntimeAmrConsoleOrigin(RUNTIME_CONSOLE_ORIGIN);
    expect(amrRechargeUrlForProfile('prod')).toBe(DEFAULT_AMR_RECHARGE_URL);
    expect(amrRechargeUrlForProfile(null)).toBe(DEFAULT_AMR_RECHARGE_URL);
    expect(amrRechargeUrlForProfile(' unknown ')).toBe(DEFAULT_AMR_RECHARGE_URL);
  });
});

// The web bundle ships publicly, so an environment hostname that is not itself
// public must not be a literal in it. New environments arrive through the
// daemon's runtime console origin (OD_VELA_WEB_URL, baked at packaging time
// from a CI secret) — not by adding a row to the static profile table.
describe('amr-guidance origin literals', () => {
  it('bakes no additional environment origin into the web bundle', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', 'src', 'runtime', 'amr-guidance.ts'),
      'utf8',
    );
    const origins = [...source.matchAll(/https?:\/\/[^'"`\s)]+/g)].map((match) => match[0]);
    // Exactly four: public prod console + Pricing, the local dev server, and
    // the one grandfathered internal entry that predates this rule. A fifth means
    // someone hardcoded an environment hostname instead of injecting it.
    expect(origins).toHaveLength(4);
  });
});

describe('workspace-scoped AMR URLs', () => {
  it('pins console links to the workspace and sends plan discovery to Pricing', () => {
    setRuntimeAmrConsoleOrigin(RUNTIME_CONSOLE_ORIGIN);
    expect(amrConsoleUrlForWorkspace('feature-test', ' workspace-a ')).toBe(
      `${RUNTIME_CONSOLE_ORIGIN}/dashboard?source=open_design&workspaceId=workspace-a`,
    );
    expect(amrPlansUrlForWorkspace('feature-test', ' workspace-a ')).toBe(
      OPEN_DESIGN_PRICING_URL,
    );
  });

  it('fails closed when the workspace identity is absent', () => {
    expect(amrConsoleUrlForWorkspace('feature-test', null)).toBeNull();
    expect(amrConsoleUrlForWorkspace('feature-test', '   ')).toBeNull();
    expect(amrPlansUrlForWorkspace('feature-test', undefined)).toBeNull();
  });
});

// The Home composer's send path never reaches `resolveRunFailureUi` — it fails
// before a run exists, and its catch-all prints `err.message` verbatim, which is
// how an English gateway sentence ends up on a localized Home screen. Both
// surfaces therefore read the window limit through this one helper.
describe('modelWindowLimitCopy', () => {
  it('reads the window limit and its reset instant off the upstream sentence', () => {
    expect(
      modelWindowLimitCopy(
        'You have reached the 5-hour usage limit for Kimi K2.6. Try again after 2026-08-12T06:34:47Z. This request was not charged to Wallet Credits.',
      ),
    ).toEqual({
      messageKey: 'chat.runError.modelWindowLimitMessage',
      retryAt: '2026-08-12T06:34:47Z',
    });
  });

  it('falls back to the no-time copy when no instant is readable', () => {
    expect(
      modelWindowLimitCopy('[code=model_limit_exceeded] rolling window in effect'),
    ).toEqual({ messageKey: 'chat.runError.modelWindowLimitMessageNoTime' });
  });

  it('leaves every other failure alone', () => {
    expect(modelWindowLimitCopy('Could not create project')).toBeNull();
    expect(modelWindowLimitCopy('insufficient wallet balance')).toBeNull();
    expect(modelWindowLimitCopy(null)).toBeNull();
  });
});

describe('formatModelWindowRetryAt', () => {
  it('renders the gateway instant in the reader locale', () => {
    const formatted = formatModelWindowRetryAt('2026-08-12T06:34:47Z', 'en-US');
    expect(formatted).not.toBe('2026-08-12T06:34:47Z');
    expect(formatted).toMatch(/Aug/);
  });

  it('returns the input untouched rather than rendering "Invalid Date"', () => {
    expect(formatModelWindowRetryAt('not-an-instant', 'en-US')).toBe('not-an-instant');
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
  // A clarification answer submitted after the daemon's OD Next protocol gate
  // already settled the task (blocked, or otherwise past this round) 409s with
  // STRATEGY_TASK_STATE_MISMATCH. That is a task-lifecycle verdict, not an
  // engine failure, so it must render dedicated halted-task copy for every
  // agent instead of the generic "task failed" card.
  it('maps a strategy-task state mismatch to dedicated halted-task copy', () => {
    for (const agent of ['claude', 'codex', 'amr', null]) {
      expect(resolveRunFailureUi('STRATEGY_TASK_STATE_MISMATCH', null, agent)).toMatchObject({
        primaryAction: 'retry',
        titleKey: 'chat.runError.title.strategyTaskHalted',
        messageKey: 'chat.runError.strategyTaskStateMismatchMessage',
        secondaryRetry: false,
        showSwitchCard: false,
      });
    }
  });

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

  // A cpu_unsupported crash (bundled agent binary requires AVX2, this CPU has
  // none) is deterministic: retry re-runs the same binary on the same CPU, and
  // switching hosted models doesn't replace the runtime binary. So: guidance
  // copy only — no Retry button, no AMR promotion — for every agent.
  it('maps cpu_unsupported to update guidance without retry or switch card', () => {
    for (const agent of ['claude', 'codex', 'amr', null]) {
      expect(resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'cpu_unsupported', agent)).toMatchObject({
        primaryAction: 'none',
        titleKey: 'chat.runError.title.cpuUnsupported',
        messageKey: 'chat.runError.cpuUnsupportedMessage',
        secondaryRetry: false,
        showSwitchCard: false,
      });
    }
  });

  // Agent-agnostic root-cause codes (#895): each carries a named failure type +
  // actionable fix, resolved the same way for any agent, with a plain Retry and
  // no AMR promotion (these aren't "switch to hosted model" cases).
  it('maps agent-agnostic root-cause codes to a named type + guidance for any agent', () => {
    const cases: Array<[string, string, string | null]> = [
      ['ARTIFACT_NOT_FOUND', 'chat.runError.title.artifactMissing', null],
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

  // An ACP agent that answered `initialize` and then refused `session/new`
  // (Kimi Code 0.37.x / 0.38.0). The daemon names it with a code and ships the
  // runtime identity as data; the sentence the user reads is this map's job.
  // Before this, the daemon wrote an English paragraph into `run.error` and the
  // card printed it verbatim — untranslated in every non-English UI, and
  // duplicated because the paragraph also restated the raw agent line the
  // details block already shows.
  describe('AGENT_CLI_SESSION_REFUSED', () => {
    it('renders localized copy naming the agent that refused', () => {
      const ui = resolveRunFailureUi(
        'AGENT_CLI_SESSION_REFUSED',
        'agent_protocol_error',
        'kimi',
        'json-rpc id 2: Internal error',
      );
      expect(ui).toMatchObject({
        primaryAction: 'retry',
        titleKey: 'chat.runError.title.cliSessionRefused',
        messageKey: 'chat.runError.cliSessionRefusedMessage',
        secondaryRetry: false,
        showSwitchCard: false,
      });
      // One sentence, no interpolated build number. Naming the version this run
      // started with needs a pre-spawn `--version` read the failure path does
      // not buy; the copy says "the installed version" and stays true. Pinned
      // so a re-land of that work cannot quietly leave a `{version}` slot in
      // the rendered string with nothing to fill it.
      expect(ui.messageVars?.version).toBeUndefined();
    });

    it('takes no CLI build to render — it is the same card either way', () => {
      const withRaw = resolveRunFailureUi(
        'AGENT_CLI_SESSION_REFUSED',
        'agent_protocol_error',
        'kimi',
        'json-rpc id 2: Internal error',
      );
      const withoutRaw = resolveRunFailureUi(
        'AGENT_CLI_SESSION_REFUSED',
        'agent_protocol_error',
        'kimi',
        null,
      );
      expect(withoutRaw).toEqual(withRaw);
    });

    it('resolves the same way for every agent, hosted AMR included', () => {
      for (const agent of ['kimi', 'devin', 'amr', 'antigravity', null]) {
        expect(
          resolveRunFailureUi('AGENT_CLI_SESSION_REFUSED', 'agent_protocol_error', agent, null),
        ).toMatchObject({
          titleKey: 'chat.runError.title.cliSessionRefused',
          messageKey: 'chat.runError.cliSessionRefusedMessage',
        });
      }
    });

    it('leaves the neighbouring handshake causes on their own cards', () => {
      // #7303 round 2: an ACP CLI can fail the same handshake because the user
      // is signed out, throttled, out of credit, or the upstream is down. Those
      // arrive with their own codes and must never inherit "change your CLI".
      const neighbours: Array<[string, string]> = [
        ['AGENT_AUTH_REQUIRED', 'chat.runError.title.signInRequired'],
        ['UNAUTHORIZED', 'chat.runError.title.signInRequired'],
        ['RATE_LIMITED', 'chat.runError.title.rateLimited'],
        ['UPSTREAM_UNAVAILABLE', 'chat.runError.title.upstreamUnavailable'],
      ];
      for (const [code, titleKey] of neighbours) {
        const ui = resolveRunFailureUi(code, null, 'kimi', null);
        expect(ui.titleKey).toBe(titleKey);
        expect(ui.messageKey).not.toBe('chat.runError.cliSessionRefusedMessage');
      }
    });
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

  // PRD "需要登录" — non-AMR agents. OpenDesign can't sign in for them (their
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

  // vela's rolling 5-hour model window resets on its own, so the card must name
  // the wait — not fall through to the generic "task failed" title with the raw
  // English upstream sentence as its body, which is what every AMR failure
  // outside the three account codes used to get.
  it('names the model window limit and carries the reset instant for AMR', () => {
    const ui = resolveRunFailureUi(
      'RATE_LIMITED',
      'model_window_limit',
      'amr',
      'You have reached the 5-hour usage limit for Kimi K2.6. Try again after 2026-08-12T06:34:47Z. This request was not charged to Wallet Credits.',
    );
    expect(ui).toMatchObject({
      primaryAction: 'retry',
      titleKey: 'chat.runError.title.modelWindowLimit',
      messageKey: 'chat.runError.modelWindowLimitMessage',
      showSwitchCard: false,
    });
    expect(ui.messageVars?.retryAt).toBe('2026-08-12T06:34:47Z');
  });

  it('explains an AMR membership concurrency limit and preserves its reset instant', () => {
    const ui = resolveRunFailureUi(
      'AGENT_EXECUTION_FAILED',
      'membership_concurrency_limit',
      'amr',
      '[code=tier_limit_exceeded] membership concurrency limit exceeded: 3/2 resets 2026-08-25T10:42:00Z',
    );
    expect(ui).toMatchObject({
      primaryAction: 'retry',
      titleKey: 'chat.runError.title.membershipConcurrencyLimit',
      messageKey: 'chat.runError.membershipConcurrencyLimitMessage',
      messageVars: { retryAt: '2026-08-25T10:42:00Z' },
      secondaryRetry: false,
      showSwitchCard: false,
    });
  });

  it('keeps membership concurrency guidance when no reset instant is readable', () => {
    const ui = resolveRunFailureUi(
      'AGENT_EXECUTION_FAILED',
      'membership_concurrency_limit',
      'amr',
      '[code=tier_limit_exceeded] membership concurrency limit exceeded: 3/2',
    );
    expect(ui.messageKey).toBe(
      'chat.runError.membershipConcurrencyLimitMessageNoTime',
    );
    expect(ui.messageVars?.retryAt).toBeUndefined();
  });

  // Same classification without a readable instant (older CLI, or upstream
  // wording drift) must still get the localized copy — just the variant that
  // does not promise a time.
  it('degrades to the no-time copy when the reset instant is unreadable', () => {
    const ui = resolveRunFailureUi(
      'RATE_LIMITED',
      'model_window_limit',
      'amr',
      'You have reached the 5-hour usage limit for Kimi K2.6.',
    );
    expect(ui.titleKey).toBe('chat.runError.title.modelWindowLimit');
    expect(ui.messageKey).toBe('chat.runError.modelWindowLimitMessageNoTime');
    expect(ui.messageVars?.retryAt).toBeUndefined();
  });

  // The window limit is agent-neutral: it comes from the hosted gateway, so the
  // AMR branch's catch-all "generic + raw English" fallthrough must not be the
  // thing that decides how it reads. Same classification, same card, whichever
  // agent carried the request.
  it('names the model window limit for non-AMR agents too', () => {
    const ui = resolveRunFailureUi(
      'RATE_LIMITED',
      'model_window_limit',
      'claude',
      'You have reached the 5-hour usage limit for Kimi K2.6. Try again after 2026-08-12T06:34:47Z.',
    );
    expect(ui.titleKey).toBe('chat.runError.title.modelWindowLimit');
    expect(ui.messageVars?.retryAt).toBe('2026-08-12T06:34:47Z');
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

// #3408 §5: the daemon's canonical `user_action` is the authoritative CTA
// signal. The resolver must prefer it over re-deriving from the raw error code,
// and fall back to the code map only when it is absent or `none`. The
// `user_action` value list mirrors the daemon classifier's
// `TrackingRunFailureUserAction` union so the two layers can't drift.
describe('resolveRunFailureUi — daemon user_action drives the CTA', () => {
  it('maps every user_action to the expected primary action (compile-time exhaustive)', () => {
    // Compile-time exhaustive map ensuring all non-none user actions are mapped
    const userActionMap = {
      retry: { agentId: 'claude', expected: 'retry' },
      login: { agentId: 'amr', expected: 'authorize' },
      recharge: { agentId: 'amr', expected: 'recharge' },
      upgrade: { agentId: 'amr', expected: 'upgrade' },
      switch_model: { agentId: 'claude', expected: 'switch-model' },
      reduce_context: { agentId: 'claude', expected: 'reduce-context' },
      install_cli: { agentId: 'claude', expected: 'retry' },
      fix_config: { agentId: 'claude', expected: 'retry' },
    } satisfies Record<
      Exclude<TrackingRunFailureUserAction, 'none'>,
      { agentId: string | null; expected: string }
    >;

    for (const [userAction, { agentId, expected }] of Object.entries(userActionMap) as Array<[
      Exclude<TrackingRunFailureUserAction, 'none'>,
      { agentId: string | null; expected: string },
    ]>) {
      const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', agentId, {
        userAction,
      });
      expect(ui.primaryAction).toBe(expected);
    }

    // Additional agent-specific variants
    expect(
      resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'antigravity', {
        userAction: 'login',
      }).primaryAction,
    ).toBe('launch-terminal-auth');
    expect(
      resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'claude', {
        userAction: 'login',
      }).primaryAction,
    ).toBe('retry');
    expect(
      resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'antigravity', {
        userAction: 'switch_model',
      }).primaryAction,
    ).toBe('launch-terminal-switch-model');
    expect(
      resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'amr', {
        userAction: 'switch_model',
      }).primaryAction,
    ).toBe('switch-model');
  });

  it('maps every failure_category to the expected title/display (compile-time exhaustive)', () => {
    const categoryMap = {
      auth: 'chat.runError.title.signInRequired',
      rate_limit: 'chat.runError.title.rateLimited',
      insufficient_balance: 'chat.runError.title.balance',
      entitlement_required: 'chat.amrBalanceGate.title',
      model_unavailable: 'chat.runError.title.modelUnavailable',
      prompt_too_large: 'chat.runError.title.promptTooLarge',
      upstream_unavailable: 'chat.runError.title.upstreamUnavailable',
      timeout: 'chat.runError.title.timedOut',
      empty_output: 'chat.runError.title.emptyOutput',
      tool_error: 'chat.runError.title.generic',
      process_exit: 'chat.runError.title.generic',
      user_cancel: 'chat.runError.title.generic',
      unknown: 'chat.runError.title.generic',
    } satisfies Record<TrackingRunFailureCategory, string>;

    for (const [category, expectedTitleKey] of Object.entries(categoryMap) as Array<[
      TrackingRunFailureCategory,
      string,
    ]>) {
      const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'claude', {
        failureCategory: category,
      });
      expect(ui.titleKey).toBe(expectedTitleKey);
    }
  });

  it('preserves localized error guidance, messageKey, and details when overlaying user_action', () => {
    // model_window_limit carries a custom title, localized message with retryAt, and secondaryRetry
    const ui = resolveRunFailureUi(
      'RATE_LIMITED',
      'model_window_limit',
      'claude',
      'You have reached the 5-hour usage limit for Kimi K2.6. Try again after 2026-08-12T06:34:47Z.',
      {
        failureCategory: 'rate_limit',
        failureDetail: 'model_window_limit',
        userAction: 'switch_model',
      },
    );
    expect(ui.titleKey).toBe('chat.runError.title.modelWindowLimit');
    expect(ui.messageKey).toBe('chat.runError.modelWindowLimitMessage');
    expect(ui.messageVars?.retryAt).toBe('2026-08-12T06:34:47Z');
    expect(ui.primaryAction).toBe('switch-model');
    expect(ui.secondaryRetry).toBe(true);

    // AMR_TIER_UPGRADE_REQUIRED preserves plans upgrade action
    const upgradeUi = resolveRunFailureUi(
      'AMR_TIER_UPGRADE_REQUIRED',
      'amr',
      {
        failureCategory: 'tier_entitlement_required',
        userAction: 'upgrade',
      },
    );
    expect(upgradeUi.primaryAction).toBe('upgrade');
    expect(upgradeUi.titleKey).toBe('chat.amrBalanceGate.title');
  });

  it('promotes the AMR switch card for non-AMR switch_model, not for AMR itself', () => {
    expect(
      resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'claude', {
        userAction: 'switch_model',
      }).showSwitchCard,
    ).toBe(true);
    expect(
      resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'amr', {
        userAction: 'switch_model',
      }).showSwitchCard,
    ).toBe(false);
  });

  it('names the failure type for the new context/model classes', () => {
    expect(
      resolveRunFailureUi(null, 'claude', { userAction: 'reduce_context' })
        .titleKey,
    ).toBe('chat.runError.title.promptTooLarge');
    expect(
      resolveRunFailureUi(null, 'claude', { userAction: 'switch_model' })
        .titleKey,
    ).toBe('chat.runError.title.modelUnavailable');
  });

  it('lets a classified user_action beat the raw-code map', () => {
    // The bare code would resolve to a plain generic retry with no card; the
    // daemon-decided user_action takes precedence.
    const byCode = resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'claude');
    expect(byCode.primaryAction).toBe('retry');
    expect(byCode.showSwitchCard).toBe(false);

    const byAction = resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'claude', {
      userAction: 'switch_model',
    });
    expect(byAction.primaryAction).toBe('switch-model');
    expect(byAction.showSwitchCard).toBe(true);
  });

  it('falls through to the code map when no user_action is supplied', () => {
    // An unclassified run (older daemon) must resolve exactly like the 2-arg
    // form — here the AMR balance code still yields the recharge CTA.
    const withEmptyClassification = resolveRunFailureUi(
      'AMR_INSUFFICIENT_BALANCE',
      'amr',
      { failureCategory: null, userAction: null },
    );
    expect(withEmptyClassification).toEqual(
      resolveRunFailureUi('AMR_INSUFFICIENT_BALANCE', 'amr'),
    );
    expect(withEmptyClassification.primaryAction).toBe('recharge');
  });

  it('falls through on the partial-classification edge (category set, user_action none/absent)', () => {
    // The daemon landed a category but no actionable user_action. The CTA must
    // still reach the code map rather than rendering a blank action.
    const noneAction = resolveRunFailureUi('AMR_INSUFFICIENT_BALANCE', 'amr', {
      failureCategory: 'insufficient_balance',
      userAction: 'none',
    });
    expect(noneAction.primaryAction).toBe('recharge');

    const absentAction = resolveRunFailureUi('RATE_LIMITED', 'claude', {
      failureCategory: 'rate_limit',
    });
    expect(absentAction.primaryAction).toBe('retry');
    expect(absentAction.showSwitchCard).toBe(true);
  });

  it('handles unknown or forward-compatible user_action strings by falling back to base UI', () => {
    // A future daemon might introduce a new user_action string that this web build
    // does not explicitly know. It must degrade gracefully to the base UI rather than throw,
    // retaining actionful recovery CTAs such as recharge.
    const uiRateLimited = resolveRunFailureUi(
      'RATE_LIMITED',
      'claude',
      {
        userAction: 'future_unknown_action' as unknown as TrackingRunFailureUserAction,
      },
    );
    expect(uiRateLimited.primaryAction).toBe('retry');
    expect(uiRateLimited.titleKey).toBe('chat.runError.title.rateLimited');
    expect(uiRateLimited.showSwitchCard).toBe(true);

    const uiBalance = resolveRunFailureUi(
      'AMR_INSUFFICIENT_BALANCE',
      'amr',
      {
        userAction: 'future_unknown_action' as unknown as TrackingRunFailureUserAction,
      },
    );
    expect(uiBalance.primaryAction).toBe('recharge');
    expect(uiBalance.titleKey).toBe('chat.runError.title.balance');
  });

  it('lets failure_category drive display over proxy HTTP error codes (#4734 BYOK)', () => {
    // sendProxyError returns UPSTREAM_UNAVAILABLE for HTTP 400 with model_unavailable
    const byokModelUnavailable = resolveRunFailureUi(
      'UPSTREAM_UNAVAILABLE',
      'claude',
      {
        failureCategory: 'model_unavailable',
        userAction: 'switch_model',
      },
    );
    expect(byokModelUnavailable.titleKey).toBe('chat.runError.title.modelUnavailable');
    expect(byokModelUnavailable.messageKey).toBe('chat.runError.modelUnavailableMessage');
    expect(byokModelUnavailable.primaryAction).toBe('switch-model');
    expect(byokModelUnavailable.showSwitchCard).toBe(true);

    // sendProxyError returns UPSTREAM_UNAVAILABLE for HTTP 400 with prompt_too_large
    const byokPromptTooLarge = resolveRunFailureUi(
      'UPSTREAM_UNAVAILABLE',
      'claude',
      {
        failureCategory: 'prompt_too_large',
        userAction: 'reduce_context',
      },
    );
    expect(byokPromptTooLarge.titleKey).toBe('chat.runError.title.promptTooLarge');
    expect(byokPromptTooLarge.messageKey).toBe('chat.runError.promptTooLargeMessage');
    expect(byokPromptTooLarge.primaryAction).toBe('reduce-context');
  });

  it('preserves Antigravity RATE_LIMITED terminal switch-model CTA when user_action is retry', () => {
    const ui = resolveRunFailureUi(
      'RATE_LIMITED',
      'antigravity',
      {
        userAction: 'retry',
      },
    );
    expect(ui.primaryAction).toBe('launch-terminal-switch-model');
    expect(ui.titleKey).toBe('chat.runError.title.rateLimited');
    expect(ui.secondaryRetry).toBe(true);
    expect(ui.showSwitchCard).toBe(false);
  });

  it('preserves code-derived fallback controls when daemon user_action is absent or none with mismatched category (#4734)', () => {
    // When code is AGENT_EXECUTION_FAILED and user_action is absent:
    // Category should only update titleKey / messageKey, controls stay from code (primaryAction: 'retry')
    const absentAction = resolveRunFailureUi(
      'AGENT_EXECUTION_FAILED',
      'claude',
      {
        failureCategory: 'prompt_too_large',
      },
    );
    expect(absentAction.titleKey).toBe('chat.runError.title.promptTooLarge');
    expect(absentAction.messageKey).toBe('chat.runError.promptTooLargeMessage');
    expect(absentAction.primaryAction).toBe('retry');
    expect(absentAction.secondaryRetry).toBe(false);

    // When code is AGENT_EXECUTION_FAILED and user_action is explicitly 'none':
    // Client must not invent an action; controls stay from code (primaryAction: 'retry')
    const noneAction = resolveRunFailureUi(
      'AGENT_EXECUTION_FAILED',
      'claude',
      {
        failureCategory: 'prompt_too_large',
        userAction: 'none',
      },
    );
    expect(noneAction.titleKey).toBe('chat.runError.title.promptTooLarge');
    expect(noneAction.messageKey).toBe('chat.runError.promptTooLargeMessage');
    expect(noneAction.primaryAction).toBe('retry');
    expect(noneAction.secondaryRetry).toBe(false);
  });
});
