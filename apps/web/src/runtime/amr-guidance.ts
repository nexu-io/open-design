// Shared logic that maps a failed run's error code + agent into the failure
// UI: which contextual button the gray error card shows, whether to override
// the error text, and whether to show the AMR promotion card below. Kept in
// its own module so ChatPane / ProjectView / AssistantMessage can import it
// without a circular dependency.

// AMR model-gateway console wallet (recharge).
export const AMR_RECHARGE_URL = 'https://open-design.ai/amr/wallet';

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
//   - retry:     re-run with the current agent.
//   - authorize: AMR sign-in/authorize flow, then auto-retry on success.
//   - recharge:  open the AMR wallet (manual retry afterwards).
export type RunFailurePrimaryAction = 'retry' | 'authorize' | 'recharge';

// i18n keys for the gray-card text override (null = show the raw error).
export type RunFailureMessageKey =
  | 'chat.amrError.authMessage'
  | 'chat.amrError.balanceMessage'
  | null;

export interface RunFailureUi {
  primaryAction: RunFailurePrimaryAction;
  // Override the gray error card's text (e.g. AMR auth / balance get a clearer
  // explanation than the raw upstream string).
  messageKey: RunFailureMessageKey;
  // Show a secondary plain "retry" button alongside the primary action (used
  // by the recharge case, where retry is manual after topping up).
  secondaryRetry: boolean;
  // Show the AMR promotion card under the gray error card.
  showSwitchCard: boolean;
}

// Resolve the failure UI for a failed run:
//   - AMR agent, auth required      → authorize-and-retry button, clearer copy
//   - AMR agent, insufficient funds → recharge button + manual retry, clearer copy
//   - AMR agent, anything else      → plain retry
//   - non-AMR agent, model/auth/quota error → plain retry + promotion card
//   - non-AMR agent, generic failure        → plain retry
export function resolveRunFailureUi(
  code: string | null | undefined,
  agentId: string | null | undefined,
): RunFailureUi {
  if (agentId === 'amr') {
    if (code === 'AMR_AUTH_REQUIRED') {
      return {
        primaryAction: 'authorize',
        messageKey: 'chat.amrError.authMessage',
        secondaryRetry: false,
        showSwitchCard: false,
      };
    }
    if (code === 'AMR_INSUFFICIENT_BALANCE') {
      return {
        primaryAction: 'recharge',
        messageKey: 'chat.amrError.balanceMessage',
        secondaryRetry: true,
        showSwitchCard: false,
      };
    }
    return {
      primaryAction: 'retry',
      messageKey: null,
      secondaryRetry: false,
      showSwitchCard: false,
    };
  }
  const promote = typeof code === 'string' && PROMOTE_AMR_CODES.has(code);
  return {
    primaryAction: 'retry',
    messageKey: null,
    secondaryRetry: false,
    showSwitchCard: promote,
  };
}
