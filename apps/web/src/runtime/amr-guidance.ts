// Shared logic that maps a failed run's error code + agent into the failure
// UI: which contextual button the gray error card shows, whether to override
// the error text, and whether to show the AMR promotion card below. Kept in
// its own module so ChatPane / ProjectView / AssistantMessage can import it
// without a circular dependency.

// AMR model-gateway console wallet (account, balance, recharge).
// `source=open_design` tags the landing page_view so vela analytics can
// attribute the visit to Open Design (per-product revenue/traffic attribution).
export const AMR_CONSOLE_URL =
  'https://open-design.ai/amr/wallet?source=open_design';
export const AMR_RECHARGE_URL = AMR_CONSOLE_URL;

const AMR_CONSOLE_URL_BY_PROFILE: Record<string, string> = {
  prod: AMR_CONSOLE_URL,
  test: 'https://vela.powerformer.net/wallet?source=open_design',
  local: 'http://localhost:5173/wallet?source=open_design',
};

export function amrConsoleUrlForProfile(profile: string | null | undefined): string {
  const normalized = profile?.trim() || 'prod';
  return AMR_CONSOLE_URL_BY_PROFILE[normalized] ?? AMR_CONSOLE_URL;
}

export function amrRechargeUrlForProfile(profile: string | null | undefined): string {
  return amrConsoleUrlForProfile(profile);
}

// Console wallet deep-linked to open the subscription/plans modal
// (`view=plans`), used by the "Upgrade" affordances next to the plan tier.
export function amrPlansUrlForProfile(profile: string | null | undefined): string {
  const base = amrConsoleUrlForProfile(profile);
  return base.includes('?') ? `${base}&view=plans` : `${base}?view=plans`;
}

export function amrProfileBadgeLabel(profile: string | null | undefined): string | null {
  if (profile === 'test') return 'TEST';
  if (profile === 'local') return 'LOCAL';
  return null;
}

// Codes that mean a non-AMR agent hit "the model service rejected or could not
// serve the run" — auth missing/invalid, quota/rate exhausted, or the upstream
// model endpoint was unavailable. These are the failures worth promoting AMR
// for. Generic process failures (AGENT_EXECUTION_FAILED) and missing binaries
// (AGENT_UNAVAILABLE) are excluded.
const PROMOTE_AMR_CODES = new Set<string>([
  'AGENT_AUTH_REQUIRED',
  'UNAUTHORIZED',
  'RATE_LIMITED',
  'UPSTREAM_UNAVAILABLE',
]);

// Primary action offered in the gray error card.
//   - retry:                       re-run with the current agent.
//   - authorize:                   AMR sign-in/authorize flow, then auto-retry on success.
//   - recharge:                    open the AMR wallet (manual retry afterwards).
//   - upgrade:                     open the AMR plans view (manual retry afterwards).
//   - launch-terminal-auth:        Antigravity-specific. agy's `-p`
//                                  print mode cannot complete Google
//                                  Sign-In on its own (no input field
//                                  for the auth code), so OD spawns a
//                                  system Terminal running `agy` and
//                                  the user finishes OAuth there.
//   - launch-terminal-switch-model: Antigravity-specific. agy has no
//                                  `--model` flag (upstream #35), so
//                                  switching to a model with available
//                                  quota means opening agy's TUI and
//                                  using its Switch Model picker. The
//                                  daemon spawns the same terminal as
//                                  launch-terminal-auth — the button
//                                  label is the only thing that changes.
// Both terminal-launch actions pair with `secondaryRetry: true` so the
// user has a Retry button after the external step completes (OAuth /
// switching models happens out-of-band; we can't auto-retry from the
// daemon side).
export type RunFailurePrimaryAction =
  | 'retry'
  | 'authorize'
  | 'recharge'
  | 'upgrade'
  | 'launch-terminal-auth'
  | 'launch-terminal-switch-model';

// i18n keys for the gray-card text override (null = show the raw error).
// Keys ending in a value with `{agent}` are interpolated at render time via
// t(key, { agent }) (see ChatPane displayError).
export type RunFailureMessageKey =
  | 'chat.amrError.authMessage'
  | 'chat.amrError.balanceMessage'
  | 'chat.connectionDropped'
  | 'chat.runError.signInMessage.amr'
  | 'chat.runError.signInMessage.other'
  | 'chat.runError.cliMissingMessage'
  | 'chat.runError.promptTooLargeMessage'
  | 'chat.runError.modelUnavailableMessage'
  | 'chat.runError.rateLimitedMessage'
  | 'chat.runError.upstreamUnavailableMessage'
  | 'chat.runError.toolLoopMessage'
  | 'chat.runError.outputInvalidMessage'
  | 'chat.runError.runtimeConfigMessage'
  | null;

// i18n keys for the unified error card's TITLE (the "error type" line above the
// detail message). Frontend-only mapping from error code → human-readable type;
// the daemon does not yet emit a type name (the raw status label is just the
// word "error"). A full backend type ⇄ frontend pairing is a later effort.
export type RunFailureTitleKey =
  | 'chat.runError.title.authRequired'
  | 'chat.runError.title.balance'
  | 'chat.runError.title.connectionDropped'
  | 'chat.runError.title.signInRequired'
  | 'chat.runError.title.rateLimited'
  | 'chat.amrBalanceGate.title'
  | 'chat.runError.title.cliMissing'
  | 'chat.runError.title.promptTooLarge'
  | 'chat.runError.title.modelUnavailable'
  | 'chat.runError.title.upstreamUnavailable'
  | 'chat.runError.title.toolLoop'
  | 'chat.runError.title.outputInvalid'
  | 'chat.runError.title.runtimeConfig'
  | 'chat.runError.title.generic';

export interface RunFailureUi {
  primaryAction: RunFailurePrimaryAction;
  // Title shown above the detail message — names the failure type.
  titleKey: RunFailureTitleKey;
  // Override the gray error card's text (e.g. AMR auth / balance get a clearer
  // explanation than the raw upstream string).
  messageKey: RunFailureMessageKey;
  // Show a secondary plain "retry" button alongside the primary action (used
  // by the recharge case, where retry is manual after topping up).
  secondaryRetry: boolean;
  // Show the AMR promotion card under the gray error card.
  showSwitchCard: boolean;
}

// Small helper for the common shape: a named failure type + actionable copy,
// recovered by re-running once the user has followed the instruction. No AMR
// promotion (these root causes aren't "switch to hosted model" cases).
function retryWithGuidance(
  titleKey: RunFailureTitleKey,
  messageKey: RunFailureMessageKey,
): RunFailureUi {
  return {
    primaryAction: 'retry',
    titleKey,
    messageKey,
    secondaryRetry: false,
    showSwitchCard: false,
  };
}

// Agent-agnostic failure codes that carry a clear root cause and a concrete
// fix, mapped the same way regardless of which agent produced them. The daemon
// already classifies these into failure_category / user_action
// (apps/daemon/src/run-failure-classification.ts); this is the user-facing half
// of that taxonomy — a human-readable type name plus a one-line instruction,
// with the raw upstream string preserved in the card's collapsible source area.
const AGENT_AGNOSTIC_FAILURE_UI: Record<string, RunFailureUi> = {
  // CLI binary not found on PATH (user_action: install_cli).
  AGENT_UNAVAILABLE: retryWithGuidance(
    'chat.runError.title.cliMissing',
    'chat.runError.cliMissingMessage',
  ),
  // Input exceeded the model context window (user_action: reduce_context).
  AGENT_PROMPT_TOO_LARGE: retryWithGuidance(
    'chat.runError.title.promptTooLarge',
    'chat.runError.promptTooLargeMessage',
  ),
  // Selected model is missing/disabled (user_action: switch_model).
  AMR_MODEL_UNAVAILABLE: retryWithGuidance(
    'chat.runError.title.modelUnavailable',
    'chat.runError.modelUnavailableMessage',
  ),
  // Guard halted a repeating, non-progressing tool loop (user_action: retry
  // after checking the real target).
  TOOL_LOOP_DETECTED: retryWithGuidance(
    'chat.runError.title.toolLoop',
    'chat.runError.toolLoopMessage',
  ),
  // Model emitted a fabricated role marker and was aborted; a plain retry
  // usually recovers.
  ROLE_MARKER_HALLUCINATION: retryWithGuidance(
    'chat.runError.title.outputInvalid',
    'chat.runError.outputInvalidMessage',
  ),
  // Checked-in runtime def failed strict validation (user_action: fix_config);
  // the user can't self-repair, so the copy points at update/support.
  AGENT_RUNTIME_DEF_INVALID: retryWithGuidance(
    'chat.runError.title.runtimeConfig',
    'chat.runError.runtimeConfigMessage',
  ),
};

// Resolve the failure UI for a failed run:
//   - agent-agnostic root cause (cli missing, prompt too large, model
//     unavailable, tool loop, bad output, bad runtime def) → named type + fix
//   - AMR agent, auth required      → authorize-and-retry button, clearer copy
//   - AMR agent, insufficient funds → recharge button + manual retry, clearer copy
//   - AMR agent, tier entitlement   → upgrade button + manual retry
//   - AMR agent, anything else      → plain retry
//   - non-AMR agent, model/auth/quota error → plain retry + promotion card
//   - non-AMR agent, generic failure        → plain retry
export function resolveRunFailureUi(
  code: string | null | undefined,
  agentId: string | null | undefined,
): RunFailureUi {
  // Agent-agnostic codes resolve first so an AMR/Antigravity run that hits one
  // of them still gets the specific guidance instead of the generic fallback.
  const agnostic = typeof code === 'string' ? AGENT_AGNOSTIC_FAILURE_UI[code] : undefined;
  if (agnostic) return agnostic;
  if (agentId === 'amr') {
    if (code === 'AMR_AUTH_REQUIRED') {
      return {
        primaryAction: 'authorize',
        // PRD「需要登录」type — shared title with the non-AMR sign-in case.
        titleKey: 'chat.runError.title.signInRequired',
        // "Open Design 智能体尚未登录，前往登录即可正常使用" — single CTA, no
        // AMR promotion (the agent already IS AMR). The authorize action reuses
        // the inline AmrLoginPill (sign-in + auto-retry on success).
        messageKey: 'chat.runError.signInMessage.amr',
        secondaryRetry: false,
        showSwitchCard: false,
      };
    }
    if (code === 'AMR_INSUFFICIENT_BALANCE') {
      return {
        primaryAction: 'recharge',
        titleKey: 'chat.runError.title.balance',
        messageKey: 'chat.amrError.balanceMessage',
        secondaryRetry: true,
        showSwitchCard: false,
      };
    }
    if (code === 'AMR_TIER_UPGRADE_REQUIRED') {
      return {
        primaryAction: 'upgrade',
        titleKey: 'chat.amrBalanceGate.title',
        messageKey: null,
        secondaryRetry: true,
        showSwitchCard: false,
      };
    }
    return {
      primaryAction: 'retry',
      titleKey: 'chat.runError.title.generic',
      messageKey: null,
      secondaryRetry: false,
      showSwitchCard: false,
    };
  }
  // Antigravity's auth flow is terminal-only — see the
  // `launch-terminal-auth` action comment for why. Without this branch
  // the user sees the daemon-emitted guidance text and would have to
  // open a terminal themselves; with it they get a one-click button
  // that opens Terminal.app / x-terminal-emulator / cmd with `agy`
  // running, and a Retry button to redo the chat after OAuth completes.
  if (agentId === 'antigravity') {
    if (code === 'AGENT_AUTH_REQUIRED') {
      return {
        primaryAction: 'launch-terminal-auth',
        titleKey: 'chat.runError.title.signInRequired',
        messageKey: null,
        secondaryRetry: true,
        showSwitchCard: false,
      };
    }
    // Quota: each Antigravity model has its own quota, so the action
    // is "open agy, switch model" rather than "sign in." Same handler
    // spawns the same terminal; only the label changes.
    if (code === 'RATE_LIMITED') {
      return {
        primaryAction: 'launch-terminal-switch-model',
        titleKey: 'chat.runError.title.rateLimited',
        messageKey: null,
        secondaryRetry: true,
        showSwitchCard: false,
      };
    }
  }
  // Agent-neutral: a mid-response connection drop (any agent) gets a clear,
  // localized "lost connection — retry" message instead of the raw SDK string.
  // Not an AMR-promotable case: the break is the user's own network path, which
  // switching model service wouldn't fix.
  if (code === 'AGENT_CONNECTION_DROPPED') {
    return {
      primaryAction: 'retry',
      titleKey: 'chat.runError.title.connectionDropped',
      messageKey: 'chat.connectionDropped',
      secondaryRetry: false,
      showSwitchCard: false,
    };
  }
  // Non-AMR sign-in required (any non-amr, non-antigravity agent — those two are
  // handled above). The agent's login lives in the user's own terminal, so Open
  // Design can't sign in for them: surface a "{agent} 尚未登录，请本地检查登录状态"
  // message, offer Retry as the primary action (re-run after they log in
  // locally), and promote AMR as the steadier alternative via the switch card.
  if (code === 'AGENT_AUTH_REQUIRED' || code === 'UNAUTHORIZED') {
    return {
      primaryAction: 'retry',
      titleKey: 'chat.runError.title.signInRequired',
      messageKey: 'chat.runError.signInMessage.other',
      secondaryRetry: false,
      showSwitchCard: true,
    };
  }
  // Non-antigravity rate limit / upstream outage: name the type and explain the
  // recovery (wait & retry / switch service), and still promote AMR as the
  // steadier hosted alternative. Antigravity's own RATE_LIMITED was handled
  // above (per-model quota → switch model in terminal).
  if (code === 'RATE_LIMITED') {
    return {
      primaryAction: 'retry',
      titleKey: 'chat.runError.title.rateLimited',
      messageKey: 'chat.runError.rateLimitedMessage',
      secondaryRetry: false,
      showSwitchCard: true,
    };
  }
  if (code === 'UPSTREAM_UNAVAILABLE') {
    return {
      primaryAction: 'retry',
      titleKey: 'chat.runError.title.upstreamUnavailable',
      messageKey: 'chat.runError.upstreamUnavailableMessage',
      secondaryRetry: false,
      showSwitchCard: true,
    };
  }
  const promote = typeof code === 'string' && PROMOTE_AMR_CODES.has(code);
  return {
    primaryAction: 'retry',
    titleKey: 'chat.runError.title.generic',
    messageKey: null,
    secondaryRetry: false,
    showSwitchCard: promote,
  };
}
