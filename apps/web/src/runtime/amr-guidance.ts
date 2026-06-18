// Shared logic that maps a failed run's error code + agent into the failure
// UI: title, explanation, contextual button, and whether an official-agent
// recovery path should be offered. Kept in its own module so ChatPane /
// ProjectView / AssistantMessage can import it without a circular dependency.

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

export function amrProfileBadgeLabel(profile: string | null | undefined): string | null {
  if (profile === 'test') return 'TEST';
  if (profile === 'local') return 'LOCAL';
  return null;
}

// Codes that get a case-specific official-agent explanation for non-AMR runs.
// Other non-AMR failures still offer the same recovery path, but use the
// generic official-agent copy.
const USE_OFFICIAL_AGENT_MESSAGE_BY_CODE = new Map<string, RunFailureMessageKey>([
  ['AGENT_AUTH_REQUIRED', 'chat.runError.description.useOfficialAgent'],
  ['UNAUTHORIZED', 'chat.runError.description.useOfficialAgent'],
  ['RATE_LIMITED', 'chat.runError.description.rateLimitUseOfficialAgent'],
  ['UPSTREAM_UNAVAILABLE', 'chat.runError.description.upstreamUseOfficialAgent'],
]);

// Primary action offered in the gray error card.
//   - retry:                       re-run with the current agent.
//   - switch-to-amr:               switch to the official AMR agent and retry.
//   - authorize:                   AMR sign-in/authorize flow, then auto-retry on success.
//   - recharge:                    open the AMR wallet (manual retry afterwards).
//   - launch-terminal-switch-model: Antigravity-specific. agy has no
//                                  `--model` flag (upstream #35), so
//                                  switching to a model with available
//                                  quota means opening agy's TUI and
//                                  using its Switch Model picker.
// The terminal-launch action pairs with `secondaryRetry: true` so the
// user has a Retry button after the external model switch completes.
export type RunFailurePrimaryAction =
  | 'retry'
  | 'switch-to-amr'
  | 'authorize'
  | 'recharge'
  | 'launch-terminal-switch-model';

export type RunFailureTitleKey =
  | 'chat.runError.title.auth'
  | 'chat.runError.title.balance'
  | 'chat.runError.title.connectionDropped'
  | 'chat.runError.title.rateLimit'
  | 'chat.runError.title.modelUnavailable'
  | 'chat.runError.title.promptTooLarge'
  | 'chat.runError.title.agentUnavailable'
  | 'chat.runError.title.processExit'
  | 'chat.runError.title.generic';

// i18n keys for the repair-panel explanation.
export type RunFailureMessageKey =
  | 'chat.amrError.authMessage'
  | 'chat.amrError.balanceMessage'
  | 'chat.connectionDropped'
  | 'chat.runError.description.auth'
  | 'chat.runError.description.rateLimit'
  | 'chat.runError.description.useOfficialAgent'
  | 'chat.runError.description.rateLimitUseOfficialAgent'
  | 'chat.runError.description.upstreamUseOfficialAgent'
  | 'chat.runError.description.genericUseOfficialAgent'
  | 'chat.runError.description.promptTooLarge'
  | 'chat.runError.description.agentUnavailable'
  | 'chat.runError.description.processExit'
  | 'chat.runError.description.generic';

export interface RunFailureUi {
  titleKey: RunFailureTitleKey;
  primaryAction: RunFailurePrimaryAction;
  // Friendly explanation shown above the raw source block.
  messageKey: RunFailureMessageKey;
  // Show a secondary plain "retry" button alongside the primary action (used
  // by out-of-band fixes where retry is manual after the external step).
  secondaryRetry: boolean;
}

function genericTitleKey(code: string | null | undefined): RunFailureTitleKey {
  if (code === 'AGENT_AUTH_REQUIRED' || code === 'UNAUTHORIZED') {
    return 'chat.runError.title.auth';
  }
  if (code === 'RATE_LIMITED') return 'chat.runError.title.rateLimit';
  if (code === 'AMR_MODEL_UNAVAILABLE') return 'chat.runError.title.modelUnavailable';
  if (code === 'AGENT_PROMPT_TOO_LARGE') return 'chat.runError.title.promptTooLarge';
  if (code === 'AGENT_UNAVAILABLE') return 'chat.runError.title.agentUnavailable';
  if (
    code === 'AGENT_EXECUTION_FAILED' ||
    code === 'AGENT_TERMINATED_UNKNOWN' ||
    code?.startsWith('AGENT_EXIT_') ||
    code?.startsWith('AGENT_SIGNAL_')
  ) {
    return 'chat.runError.title.processExit';
  }
  return 'chat.runError.title.generic';
}

function genericMessageKey(code: string | null | undefined): RunFailureMessageKey {
  if (code === 'AGENT_PROMPT_TOO_LARGE') return 'chat.runError.description.promptTooLarge';
  if (code === 'AGENT_UNAVAILABLE') return 'chat.runError.description.agentUnavailable';
  if (
    code === 'AGENT_EXECUTION_FAILED' ||
    code === 'AGENT_TERMINATED_UNKNOWN' ||
    code?.startsWith('AGENT_EXIT_') ||
    code?.startsWith('AGENT_SIGNAL_')
  ) {
    return 'chat.runError.description.processExit';
  }
  return 'chat.runError.description.generic';
}

function officialAgentTitleKey(code: string | null | undefined): RunFailureTitleKey {
  if (code === 'AGENT_AUTH_REQUIRED' || code === 'UNAUTHORIZED') {
    return 'chat.runError.title.auth';
  }
  return 'chat.runError.title.generic';
}

// Resolve the failure UI for a failed run:
//   - AMR agent, auth required      → authorize-and-retry button, clearer copy
//   - AMR agent, insufficient funds → recharge button + manual retry, clearer copy
//   - AMR agent, anything else      → plain retry
//   - non-AMR auth/quota/upstream/generic failure → official-agent primary + manual retry
export function resolveRunFailureUi(
  code: string | null | undefined,
  agentId: string | null | undefined,
): RunFailureUi {
  if (agentId === 'amr') {
    if (code === 'AMR_AUTH_REQUIRED') {
      return {
        titleKey: 'chat.runError.title.auth',
        primaryAction: 'authorize',
        messageKey: 'chat.amrError.authMessage',
        secondaryRetry: false,
      };
    }
    if (code === 'AMR_INSUFFICIENT_BALANCE') {
      return {
        titleKey: 'chat.runError.title.balance',
        primaryAction: 'recharge',
        messageKey: 'chat.amrError.balanceMessage',
        secondaryRetry: true,
      };
    }
    return {
      titleKey: genericTitleKey(code),
      primaryAction: 'retry',
      messageKey: genericMessageKey(code),
      secondaryRetry: false,
    };
  }
  if (agentId === 'antigravity') {
    // Quota: each Antigravity model has its own quota, so the action
    // is "open agy, switch model" rather than "use official agent."
    if (code === 'RATE_LIMITED') {
      return {
        titleKey: 'chat.runError.title.rateLimit',
        primaryAction: 'launch-terminal-switch-model',
        messageKey: 'chat.runError.description.rateLimit',
        secondaryRetry: true,
      };
    }
  }
  // Agent-neutral: a mid-response connection drop (any agent) gets a clear,
  // localized "lost connection — retry" message instead of the raw SDK string.
  // Not an AMR-promotable case: the break is the user's own network path, which
  // switching model service wouldn't fix.
  if (code === 'AGENT_CONNECTION_DROPPED') {
    return {
      titleKey: 'chat.runError.title.connectionDropped',
      primaryAction: 'retry',
      messageKey: 'chat.connectionDropped',
      secondaryRetry: false,
    };
  }
  return {
    titleKey: officialAgentTitleKey(code),
    primaryAction: 'switch-to-amr',
    messageKey:
      (typeof code === 'string' && USE_OFFICIAL_AGENT_MESSAGE_BY_CODE.get(code))
      || 'chat.runError.description.genericUseOfficialAgent',
    secondaryRetry: true,
  };
}
