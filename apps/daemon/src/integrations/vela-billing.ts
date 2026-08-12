import type {
  WorkspaceBillingCatalog,
  WorkspaceBillingRevisionClock,
  WorkspaceBillingSnapshot,
  WorkspaceBillingState,
  WorkspaceBillingSummary,
  WorkspaceTeamBillingPlanId,
  WorkspaceWalletBalance,
} from '@open-design/contracts';
import { runVelaCommand } from './vela-command.js';

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

export class VelaWorkspaceBillingSnapshotUnsupportedError extends Error {
  readonly code = 'billing_workspace_snapshot_unsupported';

  constructor() {
    super('workspace billing snapshot unsupported');
    this.name = 'VelaWorkspaceBillingSnapshotUnsupportedError';
  }
}

export interface VelaWorkspaceBillingProjection {
  snapshot: WorkspaceBillingSnapshot | null;
  workspaceBalance: WorkspaceWalletBalance | null;
}

/** The Go CLI preserves the backend status/code in its wrapped stderr text,
 * while injected/newer adapters may expose a string code directly. */
export function isVelaWorkspaceAuthorizationError(error: unknown): boolean {
  const code =
    error && typeof error === 'object' && 'code' in error &&
    typeof error.code === 'string'
      ? error.code.trim().toLowerCase()
      : '';
  if (
    code === 'workspace_not_authorized' ||
    code === 'workspace_access_revoked' ||
    code === 'auth_required' ||
    code === 'forbidden'
  ) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    /api request failed with status (?:401|403)(?::|\b)/i.test(message) ||
    /\b(?:workspace_not_authorized|workspace_access_revoked|auth_required)\b/i.test(
      message,
    )
  );
}

/** Fetch Vela's account-scoped billing summary through the CLI 收口. */
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

/**
 * Fetch one explicit workspace wallet. The requested id travels as a CLI
 * argument, never as ambient active-workspace state, and the parser requires
 * Vela to return the same identity with billing-scope v2.
 */
export async function fetchVelaWorkspaceBalance(
  workspaceId: string,
  options: FetchVelaBillingOptions = {},
): Promise<WorkspaceWalletBalance | null> {
  const requestedWorkspaceId = workspaceId.trim();
  if (!requestedWorkspaceId) return null;
  const run = options.run ?? defaultRunVelaBilling;
  let stdout: string;
  try {
    stdout = await run([
      'workspace-balance',
      '--workspace-id',
      requestedWorkspaceId,
      '--format',
      'json',
    ]);
  } catch {
    return null;
  }
  return parseWorkspaceWalletBalance(stdout, requestedWorkspaceId);
}

/**
 * Prefer Vela's atomic plan+wallet snapshot. An old CLI/server may report the
 * typed unsupported sentinel. Older Cobra builds instead reject the first new
 * command flag before resolving the unknown subcommand; both compatibility
 * cases fall back to the legacy wallet command. Auth/network/parse failures
 * stay unavailable instead of being misclassified as an old server.
 */
export async function fetchVelaWorkspaceBillingProjection(
  workspaceId: string,
  options: FetchVelaBillingOptions = {},
): Promise<VelaWorkspaceBillingProjection> {
  const requestedWorkspaceId = workspaceId.trim();
  if (!requestedWorkspaceId) {
    return { snapshot: null, workspaceBalance: null };
  }
  const run = options.run ?? defaultRunVelaBilling;
  try {
    const stdout = await run([
      'workspace-snapshot',
      '--workspace-id',
      requestedWorkspaceId,
      '--format',
      'json',
    ]);
    const snapshot = parseWorkspaceBillingSnapshot(stdout, requestedWorkspaceId);
    if (!snapshot) {
      throw new Error(`workspace billing snapshot is invalid for ${requestedWorkspaceId}`);
    }
    return {
      snapshot,
      workspaceBalance: {
        workspaceId: snapshot.workspaceId,
        workspaceMemberId: snapshot.workspaceMemberId,
        balanceUsd: snapshot.wallet.balanceUsd,
        billingScopeVersion: 2,
        expiresAt: snapshot.wallet.expiresAt,
        updatedAt: snapshot.wallet.updatedAt,
      },
    };
  } catch (error) {
    if (
      !(error instanceof VelaWorkspaceBillingSnapshotUnsupportedError) &&
      !isWorkspaceBillingSnapshotUnsupported(error, '')
    ) {
      throw error;
    }
    const legacyStdout = await run([
      'workspace-balance',
      '--workspace-id',
      requestedWorkspaceId,
      '--format',
      'json',
    ]);
    const workspaceBalance = parseWorkspaceWalletBalance(
      legacyStdout,
      requestedWorkspaceId,
    );
    if (!workspaceBalance) {
      throw new Error(`workspace balance response is invalid for ${requestedWorkspaceId}`);
    }
    return {
      snapshot: null,
      workspaceBalance,
    };
  }
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

/** Map `vela billing summary` without inventing a workspace identity. */
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
  return {
    workspaceId: null,
    membershipTier: str(raw.membershipTier),
    totalAvailableCredits: credits(balances.totalAvailableCredits),
    subscriptionCredits: credits(balances.subscriptionCredits),
    rechargeCredits: credits(balances.rechargeCredits),
    balanceUsd: str(raw.balanceUsd) || '0',
    subscriptionStatus: str(raw.subscriptionStatus),
    availableActions: Array.isArray(raw.availableActions)
      ? raw.availableActions.filter((a): a is string => typeof a === 'string')
      : [],
    workspaceBalance: null,
  };
}

/** Parse only a backend-proven balance for the exact requested workspace. */
export function parseWorkspaceWalletBalance(
  stdout: string,
  requestedWorkspaceId: string,
): WorkspaceWalletBalance | null {
  const requested = requestedWorkspaceId.trim();
  const trimmed = stdout.trim();
  if (!requested || !trimmed) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
  const workspaceId = str(raw.workspaceId).trim();
  const workspaceMemberId = str(raw.workspaceMemberId).trim();
  const balanceUsd = str(raw.balanceUsd).trim();
  if (
    raw.billingScopeVersion !== 2 ||
    workspaceId !== requested ||
    !workspaceMemberId ||
    !balanceUsd
  ) {
    return null;
  }
  return {
    workspaceId,
    workspaceMemberId,
    balanceUsd,
    billingScopeVersion: 2,
    expiresAt: nullableString(raw.expiresAt),
    updatedAt: nullableString(raw.updatedAt),
  };
}

/** Parse only a backend-proven snapshot for the exact requested workspace. */
export function parseWorkspaceBillingSnapshot(
  stdout: string,
  requestedWorkspaceId: string,
): WorkspaceBillingSnapshot | null {
  const requested = requestedWorkspaceId.trim();
  const trimmed = stdout.trim();
  if (!requested || !trimmed) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
  const workspaceId = str(raw.workspaceId).trim();
  const workspaceMemberId = str(raw.workspaceMemberId).trim();
  const billing = objectRecord(raw.billing);
  const wallet = objectRecord(raw.wallet);
  const revisions = objectRecord(raw.revisions);
  const revisionClocks = objectRecord(raw.revisionClocks);
  const billingState = nullableBillingState(billing.billingState);
  const balanceUsd = str(wallet.balanceUsd).trim();
  const billingRevision = str(revisions.billing).trim();
  const walletRevision = str(revisions.wallet).trim();
  const billingRevisionClock = parseWorkspaceBillingRevisionClock(
    revisionClocks.billing,
  );
  const walletRevisionClock = parseWorkspaceBillingRevisionClock(
    revisionClocks.wallet,
  );
  if (
    raw.schemaVersion !== 1 ||
    raw.billingScopeVersion !== 2 ||
    !isObjectRecord(raw.billing) ||
    !isObjectRecord(raw.wallet) ||
    !isObjectRecord(raw.revisions) ||
    workspaceId !== requested ||
    !workspaceMemberId ||
    !balanceUsd ||
    !billingRevision ||
    !walletRevision ||
    !isNullableBillingState(billing.billingState) ||
    !isNullableNonEmptyString(billing.planId) ||
    !isNullableNonEmptyString(wallet.expiresAt) ||
    !isNullableNonEmptyString(wallet.updatedAt)
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    workspaceId,
    workspaceMemberId,
    billingScopeVersion: 2,
    billing: {
      billingState,
      planId: nullableString(billing.planId),
    },
    wallet: {
      balanceUsd,
      expiresAt: nullableString(wallet.expiresAt),
      updatedAt: nullableString(wallet.updatedAt),
    },
    revisions: {
      billing: billingRevision,
      wallet: walletRevision,
    },
    ...(billingRevisionClock && walletRevisionClock
      ? {
          revisionClocks: {
            billing: billingRevisionClock,
            wallet: walletRevisionClock,
          },
        }
      : {}),
  };
}

function parseWorkspaceBillingRevisionClock(
  value: unknown,
): WorkspaceBillingRevisionClock | null {
  if (!isObjectRecord(value)) return null;
  const epoch = str(value.epoch).trim();
  const counter = str(value.counter).trim();
  if (!epoch || !/^(?:0|[1-9]\d*)$/.test(counter)) return null;
  return { epoch, counter };
}

/** B sends credit buckets as decimal strings; a missing/garbage bucket is 0. */
function credits(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return isObjectRecord(value)
    ? value as Record<string, unknown>
    : {};
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

const WORKSPACE_BILLING_STATES: ReadonlySet<WorkspaceBillingState> = new Set([
  'free',
  'active',
  'past_due',
  'canceled',
  'inactive',
  'locked',
]);

function nullableBillingState(value: unknown): WorkspaceBillingState | null {
  return typeof value === 'string' &&
    WORKSPACE_BILLING_STATES.has(value as WorkspaceBillingState)
    ? value as WorkspaceBillingState
    : null;
}

function isNullableBillingState(value: unknown): boolean {
  return value == null ||
    (typeof value === 'string' &&
      WORKSPACE_BILLING_STATES.has(value as WorkspaceBillingState));
}

function isNullableNonEmptyString(value: unknown): boolean {
  return value == null || (typeof value === 'string' && value.trim().length > 0);
}

function parseTeamPlanId(value: unknown): WorkspaceTeamBillingPlanId | null {
  return value === 'team_plus' || value === 'team_pro' || value === 'team_max'
    ? value
    : null;
}

const defaultRunVelaBilling: RunVelaBilling = async (args) => {
  let stderr = '';
  try {
    return await runVelaCommand(['billing', ...args], {
      configuredEnv: { VELA_INVOCATION_SOURCE: 'open-design' },
      maxBuffer: 4 * 1024 * 1024,
      onStderr: (value) => {
        stderr = value;
      },
    });
  } catch (error) {
    if (
      args[0] === 'workspace-snapshot' &&
      isWorkspaceBillingSnapshotUnsupported(error, stderr)
    ) {
      throw new VelaWorkspaceBillingSnapshotUnsupportedError();
    }
    throw error;
  }
};

function isWorkspaceBillingSnapshotUnsupported(error: unknown, stderr: string): boolean {
  const detail = [
    stderr,
    error instanceof Error ? error.message : String(error),
  ].join('\n').toLowerCase();
  return (
    detail.includes('billing_workspace_snapshot_unsupported') ||
    detail.includes('workspace billing snapshot unsupported') ||
    detail.includes('unknown flag: --workspace-id') ||
    (
      detail.includes('unknown command') &&
      detail.includes('workspace-snapshot')
    )
  );
}
