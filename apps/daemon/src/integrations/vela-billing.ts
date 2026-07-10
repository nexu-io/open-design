import { execFile } from 'node:child_process';
import type {
  WorkspaceBillingCatalog,
  WorkspaceBillingSummary,
  WorkspaceTeamBillingPlanId,
} from '@open-design/contracts';
import { amrVelaProfileEnv } from './vela-profile.js';

// A-lane billing 收口. Instead of the daemon holding billing credentials, it
// shells out to `vela billing summary --format json`, which authenticates with
// the same vela login session AMR + the resource CLI use — one identity, and
// the billing truth lives in the vela backend. This is the read-side twin of
// the resource CLI adapter (see vela-cli-resource-adapter.ts): the client shows
// real credits + plan tier instead of a placeholder, and it degrades to null
// (the client keeps its context-derived tier hint) when the CLI / session is
// unavailable. The child process is injectable so the mapping is unit-tested
// without a live CLI.

/** Run `vela billing <args>` and resolve its stdout. */
export type RunVelaBilling = (args: string[]) => Promise<string>;

export interface FetchVelaBillingOptions {
  /** Injectable child-process runner; defaults to spawning the vela binary. */
  run?: RunVelaBilling;
}

/**
 * Fetch the caller's Vela billing summary via the CLI 收口. Returns null when
 * the CLI is missing, the user has no billing session, or the payload can't be
 * parsed — every failure is a clean "no summary", never a throw, so the route
 * can always answer and the client falls back to its context tier hint.
 */
export async function fetchVelaBillingSummary(
  options: FetchVelaBillingOptions = {},
): Promise<WorkspaceBillingSummary | null> {
  const run = options.run ?? defaultRunVelaBilling;
  let stdout: string;
  try {
    stdout = await run(['summary', '--format', 'json']);
  } catch {
    return null;
  }
  return parseBillingSummary(stdout);
}

export interface BillingCheckoutOptions {
  /** Team workspace id whose subscription is being purchased. */
  workspaceId?: string;
  /** Vela team subscription plan id. */
  planId?: WorkspaceTeamBillingPlanId;
  /** Seats to purchase for the team subscription (>= 1). */
  seats?: number;
  /** Where Stripe returns the user after success / cancel. */
  successUrl?: string;
  cancelUrl?: string;
  /** Injectable child-process runner; defaults to spawning the vela binary. */
  run?: RunVelaBilling;
}

/**
 * Start a team-subscription checkout via the CLI 收口 and return the Stripe
 * checkout URL to open, or null when the CLI / session / backend route is
 * unavailable. Mirrors A's `POST …/billing/team-subscription/checkout-sessions`
 * behind `vela billing checkout`. Never throws — a null return means "no URL",
 * so the caller shows an error toast instead of crashing.
 */
export async function fetchBillingCheckoutUrl(
  options: BillingCheckoutOptions = {},
): Promise<string | null> {
  const workspaceId = options.workspaceId?.trim();
  if (!workspaceId) return null;
  const planId = options.planId ?? 'team_plus';
  const seats = options.seats && options.seats > 0 ? Math.floor(options.seats) : 1;
  const args = [
    'checkout',
    '--workspace-id',
    workspaceId,
    '--plan-id',
    planId,
    '--seats',
    String(seats),
    '--format',
    'json',
  ];
  if (options.successUrl) args.push('--success-url', options.successUrl);
  if (options.cancelUrl) args.push('--cancel-url', options.cancelUrl);
  const run = options.run ?? defaultRunVelaBilling;
  let stdout: string;
  try {
    stdout = await run(args);
  } catch {
    return null;
  }
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    const raw = JSON.parse(trimmed) as Record<string, unknown>;
    return typeof raw.checkoutUrl === 'string' && raw.checkoutUrl ? raw.checkoutUrl : null;
  } catch {
    return null;
  }
}

export async function fetchVelaBillingCatalog(
  workspaceId: string,
  options: FetchVelaBillingOptions = {},
): Promise<WorkspaceBillingCatalog | null> {
  const trimmedWorkspaceId = workspaceId.trim();
  if (!trimmedWorkspaceId) return null;
  const run = options.run ?? defaultRunVelaBilling;
  let stdout: string;
  try {
    stdout = await run([
      'team-catalog',
      '--workspace-id',
      trimmedWorkspaceId,
      '--format',
      'json',
    ]);
  } catch {
    return null;
  }
  return parseBillingCatalog(stdout);
}

/** Map the `vela billing summary` JSON into the client-facing summary. */
export function parseBillingSummary(stdout: string): WorkspaceBillingSummary | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
  const balances = (raw.balances ?? {}) as Record<string, unknown>;
  const total = Number(balances.totalAvailableCredits ?? 0);
  return {
    membershipTier: str(raw.membershipTier),
    totalAvailableCredits: Number.isFinite(total) ? total : 0,
    balanceUsd: str(raw.balanceUsd) || '0',
    subscriptionStatus: str(raw.subscriptionStatus),
    availableActions: Array.isArray(raw.availableActions)
      ? raw.availableActions.filter((a): a is string => typeof a === 'string')
      : [],
  };
}

export function parseBillingCatalog(stdout: string): WorkspaceBillingCatalog | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
  const workspaceId = str(raw.workspaceId);
  const billingInterval = raw.billingInterval === 'monthly' ? 'monthly' : null;
  if (!workspaceId || !billingInterval || !Array.isArray(raw.plans)) return null;
  const plans = raw.plans
    .map((plan): WorkspaceBillingCatalog['plans'][number] | null => {
      if (!plan || typeof plan !== 'object') return null;
      const record = plan as Record<string, unknown>;
      const planId = parseTeamPlanId(record.planId);
      const seatUnitAmountCents = Number(record.seatUnitAmountCents);
      const minSeats = Number(record.minSeats);
      const currency = record.currency === 'usd' ? 'usd' : null;
      const status =
        record.status === 'active' || record.status === 'disabled'
          ? record.status
          : null;
      if (
        !planId ||
        !currency ||
        !status ||
        !Number.isFinite(seatUnitAmountCents) ||
        seatUnitAmountCents <= 0 ||
        !Number.isFinite(minSeats) ||
        minSeats <= 0
      ) {
        return null;
      }
      return {
        planId,
        seatUnitAmountCents,
        currency,
        minSeats,
        status,
      };
    })
    .filter((plan): plan is WorkspaceBillingCatalog['plans'][number] => plan !== null);
  return { workspaceId, billingInterval, plans };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseTeamPlanId(value: unknown): WorkspaceTeamBillingPlanId | null {
  return value === 'team_plus' || value === 'team_pro' || value === 'team_max'
    ? value
    : null;
}

const defaultRunVelaBilling: RunVelaBilling = (args) =>
  new Promise<string>((resolve, reject) => {
    const bin = process.env.OD_VELA_BIN?.trim() || 'vela';
    execFile(
      bin,
      ['billing', ...args],
      // Inherit the AMR profile so the CLI reads the same ~/.amr session the
      // daemon's AMR runtime + resource transport use — one login covers agent
      // runs, resources, and billing.
      { env: { ...process.env, ...amrVelaProfileEnv() }, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });
