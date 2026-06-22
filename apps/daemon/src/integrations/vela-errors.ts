export type AmrAccountErrorCode = 'AMR_AUTH_REQUIRED' | 'AMR_INSUFFICIENT_BALANCE';

export interface AmrAccountFailure {
  code: AmrAccountErrorCode;
  message: string;
  action: 'relogin' | 'recharge';
  actionUrl?: string;
}

// `source=open_design` tags the wallet landing page_view so vela analytics can
// attribute the recharge visit to Open Design.
export const DEFAULT_AMR_RECHARGE_URL =
  'https://open-design.ai/amr/wallet?source=open_design';

const AMR_AUTH_REQUIRED_MESSAGE =
  'AMR sign-in is required. Sign in to AMR Cloud again, then retry this run.';

const AMR_INSUFFICIENT_BALANCE_MESSAGE =
  `AMR Cloud reported insufficient balance for this model. Recharge your AMR wallet at ${DEFAULT_AMR_RECHARGE_URL}, then retry this run.`;

function normalizeFailureText(text: string): string {
  return String(text || '').toLowerCase();
}

function containsInsufficientBalanceSignal(value: string): boolean {
  if (
    value.includes('insufficient_balance') ||
    value.includes('insufficient balance') ||
    value.includes('insufficient wallet balance') ||
    value.includes('insufficient credits') ||
    value.includes('insufficient credit') ||
    value.includes('insufficient funds') ||
    value.includes('not enough balance') ||
    value.includes('not enough credits') ||
    value.includes('balance is empty') ||
    value.includes('balance too low') ||
    value.includes('billing balance') ||
    // vela returns the pre-charge (额度预扣) failure in Chinese when the wallet
    // cannot cover a model call; this currently leaks into execution_failed.
    value.includes('预扣费额度失败') ||
    value.includes('余额不足') ||
    value.includes('额度不足')
  ) {
    return true;
  }
  return value.includes('quota') && /\b(wallet|balance|credit|billing|funds?)\b/.test(value);
}

export function classifyAmrAccountFailure(text: string): AmrAccountFailure | null {
  const value = normalizeFailureText(text);
  if (!value.trim()) return null;

  if (containsInsufficientBalanceSignal(value)) {
    return {
      code: 'AMR_INSUFFICIENT_BALANCE',
      message: AMR_INSUFFICIENT_BALANCE_MESSAGE,
      action: 'recharge',
      actionUrl: DEFAULT_AMR_RECHARGE_URL,
    };
  }

  if (
    value.includes('auth_required') ||
    value.includes('authentication required') ||
    value.includes('not authenticated') ||
    value.includes('unauthenticated') ||
    value.includes('not logged in') ||
    value.includes('login missing') ||
    value.includes('sign in again') ||
    value.includes('sign-in required') ||
    value.includes('signin required') ||
    value.includes('token has expired') ||
    value.includes('expired token') ||
    value.includes('invalid session') ||
    value.includes('session expired')
  ) {
    return {
      code: 'AMR_AUTH_REQUIRED',
      message: AMR_AUTH_REQUIRED_MESSAGE,
      action: 'relogin',
    };
  }

  return null;
}

export function amrAccountFailureDetails(failure: AmrAccountFailure) {
  return {
    kind: 'amr_account',
    action: failure.action,
    ...(failure.actionUrl ? { actionUrl: failure.actionUrl } : {}),
  };
}
