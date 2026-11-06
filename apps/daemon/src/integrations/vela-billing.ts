import type {
  WorkspaceBillingPreflight,
  WorkspaceRequestConcurrencyHint,
  WorkspaceBillingCatalog,
  WorkspaceBillingRevisionClock,
  WorkspaceBillingSnapshot,
  WorkspaceBillingState,
  WorkspaceBillingSummary,
  WorkspaceTeamBillingPlanId,
  WorkspaceWalletBalance,
} from '@open-design/contracts';
import { runVelaCommand, velaCommandStderr } from './vela-command.js';
import { readVelaControlApiContext, readVelaRuntimeLinkContext } from './vela.js';

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

/** Wall-clock budget for `vela billing preflight`. A hung CLI must not pin
 * recovery polling or the workspace billing route. */
export const BILLING_PREFLIGHT_TIMEOUT_MS = 60_000;

export interface FetchVelaBillingOptions {
  /** Injectable child-process runner; defaults to spawning the vela binary. */
  run?: RunVelaBilling;
  /** Settings-selected AMR environment applied to the spawned Vela command. */
  configuredEnv?: Record<string, string>;
}

/** Missing capability is distinct from a successful empty pool. */
export async function fetchVelaBillingPreflight(
  workspaceId: string,
  modelId: string | null,
  options: FetchVelaBillingOptions = {},
): Promise<WorkspaceBillingPreflight | null> {
  return fetchVelaFundingPreview('preflight', workspaceId, modelId, options);
}

/** Optional send-time hint; old CLIs use the same authenticated API capability. */
export async function fetchVelaBillingFundingCheck(
  workspaceId: string,
  modelId: string | null,
  options: FetchVelaBillingOptions = {},
): Promise<WorkspaceBillingPreflight | null> {
  // This is the same authenticated capability used by the CLI. A Home send
  // must check fresh funds, but need not start a process (or probe an older
  // binary's command help) when the selected profile's control session exists.
  if (!options.run) {
    let session: ReturnType<typeof readVelaControlApiContext> = null;
    try {
      session = readVelaControlApiContext(process.env, options.configuredEnv);
    } catch {
      // A profile edit may race this read; let the selected CLI resolve it.
    }
    if (session) return fetchAuthenticatedFundingCheck(workspaceId, modelId, options, session);
  }
  return fetchVelaFundingPreview('funding-check', workspaceId, modelId, options);
}

/** Read Link's existing counter with the same runtime identity as the CLI. */
export async function fetchVelaRequestConcurrency(
  workspaceId: string,
  options: FetchVelaBillingOptions = {},
): Promise<WorkspaceRequestConcurrencyHint | null> {
  // A fresh send has a sub-second budget. The selected runtime key already
  // authenticates this exact Link capability, so avoid CLI startup when it
  // is available. Keep the CLI for injected runners and profiles whose
  // runtime identity cannot be read by the daemon.
  if (!options.run) {
    let session: ReturnType<typeof readVelaRuntimeLinkContext> = null;
    try {
      session = readVelaRuntimeLinkContext(process.env, options.configuredEnv);
    } catch {
      // A profile edit during snapshot resolution must not fail the send.
      // The CLI resolves the selected profile again below.
    }
    if (session) return fetchAuthenticatedRequestConcurrency(workspaceId, options, session);
  }
  let stdout: string;
  try {
    stdout = await resolveVelaBillingRunner(options)([
      'request-concurrency', '--workspace-id', workspaceId, '--format', 'json',
    ]);
  } catch (error) {
    if (isVelaWorkspaceAuthorizationError(error)) throw error;
    if (await isBillingCommandMissing(error, 'request-concurrency', options)) {
      return fetchAuthenticatedRequestConcurrency(workspaceId, options);
    }
    return null;
  }
  if (isBillingParentHelp(stdout, 'request-concurrency')) {
    return fetchAuthenticatedRequestConcurrency(workspaceId, options);
  }
  return parseRequestConcurrency(stdout, workspaceId);
}

function parseRequestConcurrency(stdout: string, workspaceId: string): WorkspaceRequestConcurrencyHint | null {
  try {
    const raw = JSON.parse(stdout) as WorkspaceRequestConcurrencyHint;
    if (raw.workspaceId !== workspaceId || !raw.workspaceMemberId?.trim()
      || !Number.isFinite(Date.parse(raw.observedAt))) return null;
    if (raw.status === 'unknown') return raw.running === undefined && raw.limit === undefined ? raw : null;
    if ((raw.status !== 'available' && raw.status !== 'full')
      || !Number.isSafeInteger(raw.running) || raw.running < 0
      || !Number.isSafeInteger(raw.limit) || raw.limit < 1
      || (raw.status === 'full') !== (raw.running >= raw.limit)) return null;
    return raw;
  } catch {
    return null;
  }
}

async function fetchAuthenticatedRequestConcurrency(
  workspaceId: string,
  options: FetchVelaBillingOptions,
  selectedSession?: NonNullable<ReturnType<typeof readVelaRuntimeLinkContext>>,
): Promise<WorkspaceRequestConcurrencyHint | null> {
  try {
    const session = selectedSession ?? readVelaRuntimeLinkContext(process.env, options.configuredEnv);
    if (!session) return null;
    const response = await fetch(new URL('/billing/request-concurrency', session.linkUrl), {
      headers: { authorization: `Bearer ${session.runtimeKey}`, 'x-vela-workspace-id': workspaceId },
      // Match the CLI's advisory counter budget; this read reserves no slot.
      signal: AbortSignal.timeout(400),
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error(`API request failed with status ${response.status}: workspace request concurrency authorization rejected`);
    }
    if (!response.ok) return null;
    return parseRequestConcurrency(await response.text(), workspaceId);
  } catch (error) {
    if (isVelaWorkspaceAuthorizationError(error)) throw error;
    return null;
  }
}

async function fetchVelaFundingPreview(
  command: 'preflight' | 'funding-check',
  workspaceId: string,
  modelId: string | null,
  options: FetchVelaBillingOptions,
): Promise<WorkspaceBillingPreflight | null> {
  const args = [command, '--workspace-id', workspaceId, '--format', 'json'];
  if (modelId) args.push('--model', modelId);
  let stdout: string;
  try {
    stdout = await resolveVelaBillingRunner(options)(args);
  } catch (error) {
    if (isVelaWorkspaceAuthorizationError(error)) throw error;
    if (command === 'funding-check' && await isBillingCommandMissing(error, command, options)) {
      return fetchAuthenticatedFundingCheck(workspaceId, modelId, options);
    }
    // Server, transport and unrecognized CLI failures carry no quota evidence.
    return null;
  }
  if (command === 'funding-check' && isBillingParentHelp(stdout, command)) {
    return fetchAuthenticatedFundingCheck(workspaceId, modelId, options);
  }
  return parseBillingPreflight(stdout, workspaceId, modelId);
}

type OptionalBillingCommand = 'funding-check' | 'request-concurrency';

function isBillingParentHelp(stdout: string, command: OptionalBillingCommand): boolean {
  return /^\s*vela billing \[command\]\s*$/m.test(stdout)
    && /^Available Commands:\s*$/m.test(stdout)
    && !new RegExp(`^\\s+${command}(?:\\s|$)`, 'm').test(stdout);
}

async function isBillingCommandMissing(
  error: unknown,
  command: OptionalBillingCommand,
  options: FetchVelaBillingOptions,
): Promise<boolean> {
  const detail = `${velaCommandStderr(error)}\n${error instanceof Error ? error.message : String(error)}`;
  if (new RegExp(`unknown command\\s+["']?${command}(?:["']|\\s|$)`, 'i').test(detail)) return true;
  if (!/unknown flag:\s+--workspace-id\b/i.test(detail)) return false;
  // Older Cobra rejects flags before resolving the absent subcommand. Prove
  // that case with this same binary's help; a bad flag alone is not capability.
  try {
    const help = await resolveVelaBillingRunner(options)([command, '--help']);
    return isBillingParentHelp(help, command);
  } catch (helpError) {
    if (isVelaWorkspaceAuthorizationError(helpError)) throw helpError;
    return false;
  }
}

async function fetchAuthenticatedFundingCheck(
  workspaceId: string,
  modelId: string | null,
  options: FetchVelaBillingOptions,
  selectedSession?: NonNullable<ReturnType<typeof readVelaControlApiContext>>,
): Promise<WorkspaceBillingPreflight | null> {
  try {
    const session = selectedSession ?? readVelaControlApiContext(process.env, options.configuredEnv);
    if (!session) return null;
    const url = new URL(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/billing/funding-check`,
      session.apiUrl,
    );
    if (modelId) url.searchParams.set('modelId', modelId);
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${session.controlKey}` },
      signal: AbortSignal.timeout(BILLING_PREFLIGHT_TIMEOUT_MS),
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error(`API request failed with status ${response.status}: workspace funding authorization rejected`);
    }
    if (!response.ok) return null;
    const preview = parseBillingPreflight(await response.text(), workspaceId, modelId);
    // An advisory preview without the endpoint's explicit result is not proof
    // of send-time funding. Never derive this field from wallet or DP values.
    return preview?.fundingCheck === undefined ? null : preview;
  } catch (error) {
    if (isVelaWorkspaceAuthorizationError(error)) throw error;
    return null;
  }
}

export function parseBillingPreflight(
  stdout: string,
  workspaceId: string,
  modelId: string | null,
): WorkspaceBillingPreflight | null {
  try {
    const raw = JSON.parse(stdout) as WorkspaceBillingPreflight;
    const plan = raw.codingPlan;
    const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
    const credits = (value: unknown) => typeof value === 'string' && /^\d+$/.test(value);
    if (
      raw.schemaVersion !== 1 || raw.workspaceId !== workspaceId ||
      !raw.workspaceMemberId?.trim() || raw.modelId !== modelId || !date(raw.generatedAt) ||
      typeof raw.balanceUsd !== 'string' || !/^-?\d+(\.\d+)?$/.test(raw.balanceUsd) ||
      !['coding_plan', 'wallet', 'gateway'].includes(raw.funding) ||
      (raw.fundingCheck !== undefined && !['available', 'insufficient', 'unknown'].includes(raw.fundingCheck)) ||
      (raw.modelCovered !== null && typeof raw.modelCovered !== 'boolean') ||
      !plan || plan.workspaceId !== workspaceId || !date(plan.generatedAt) ||
      typeof plan.eligible !== 'boolean' ||
      (plan.tier !== null && !['go', 'plus', 'pro', 'max'].includes(plan.tier)) ||
      !Array.isArray(plan.windows) ||
      (raw.funding === 'coding_plan' && plan.windows.length === 0) ||
      !plan.windows.every((w) =>
          typeof w.policyId === 'string' && w.policyId.length > 0 &&
          Number.isSafeInteger(w.durationSeconds) && w.durationSeconds > 0 &&
          ['activity_triggered', 'anchored_recurring'].includes(w.resetMode) &&
          credits(w.usedCredits) && credits(w.remainingCredits) && credits(w.limitCredits) &&
          BigInt(w.limitCredits) > 0n && BigInt(w.remainingCredits) <= BigInt(w.limitCredits) &&
          (w.windowStart === null || date(w.windowStart)) && (w.resetsAt === null || date(w.resetsAt)))
    ) return null;
    return raw;
  } catch {
    return null;
  }
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
  const run = resolveVelaBillingRunner(options);
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
  const run = resolveVelaBillingRunner(options);
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
  const run = resolveVelaBillingRunner(options);
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

export interface BillingCheckoutOptions extends FetchVelaBillingOptions {
  /** Team workspace id whose subscription is being purchased. */
  workspaceId?: string;
  /** Vela team subscription plan id. */
  planId?: WorkspaceTeamBillingPlanId;
  /** Seats to purchase for the team subscription (>= 1). */
  seats?: number;
  /** Where Stripe returns the user after success / cancel. */
  successUrl?: string;
  cancelUrl?: string;
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
  const run = resolveVelaBillingRunner(options);
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
  const run = resolveVelaBillingRunner(options);
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
  const creditsPerUsd = positiveRate(raw.creditsPerUsd);
  return {
    workspaceId: null,
    membershipTier: str(raw.membershipTier),
    totalAvailableCredits: credits(balances.totalAvailableCredits),
    subscriptionCredits: credits(balances.subscriptionCredits),
    rechargeCredits: credits(balances.rechargeCredits),
    balanceUsd: str(raw.balanceUsd) || '0',
    ...(creditsPerUsd === null ? {} : { creditsPerUsd }),
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
  const designPlanWindows = parseWorkspaceDesignPlanWindows(raw.designPlanWindows);
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
    ...(designPlanWindows !== undefined ? { designPlanWindows } : {}),
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

// Keep the canonical AMR datetime(offset:true) grammar, including leap days.
const workspaceDPTime = /^((\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\d|3[01])|(0[469]|11)-(0[1-9]|[12]\d|30)|(02)-(0[1-9]|1\d|2[0-8])))T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
function parseWorkspaceDesignPlanWindows(
  value: unknown,
): WorkspaceBillingSnapshot['designPlanWindows'] {
  if (!Array.isArray(value)) return undefined;
  const windows: NonNullable<WorkspaceBillingSnapshot['designPlanWindows']> = [];
  for (const raw of value) {
    if (
      !isObjectRecord(raw) ||
      (raw.kind !== '5h' && raw.kind !== '7d') ||
      typeof raw.remainingCredits !== 'string' ||
      !/^(0|[1-9]\d*)$/.test(raw.remainingCredits) ||
      typeof raw.limitCredits !== 'string' ||
      !/^(0|[1-9]\d*)$/.test(raw.limitCredits) ||
      ![raw.windowStart, raw.resetsAt].every(
        time => time === null || (typeof time === 'string' && workspaceDPTime.test(time)),
      )
    ) return undefined;
    windows.push({
      kind: raw.kind,
      windowStart: raw.windowStart as string | null,
      resetsAt: raw.resetsAt as string | null,
      remainingCredits: raw.remainingCredits,
      limitCredits: raw.limitCredits,
    });
  }
  // An explicit empty array is valid; absence/invalidity must not synthesize it.
  return windows;
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

/**
 * An exchange rate is only usable when it is a positive finite number. B sends
 * money-adjacent fields as numbers or as decimal strings, so both are read, but
 * a zero / negative / unparseable rate is reported as absent rather than as a
 * bad divisor — a client that divides by it would print wrong money.
 */
function positiveRate(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

function resolveVelaBillingRunner(options: FetchVelaBillingOptions): RunVelaBilling {
  return options.run ?? ((args) => defaultRunVelaBilling(args, options.configuredEnv));
}

const defaultRunVelaBilling = async (
  args: string[],
  configuredEnv: Record<string, string> = {},
): Promise<string> => {
  let stderr = '';
  try {
    return await runVelaCommand(['billing', ...args], {
      configuredEnv: {
        ...configuredEnv,
        VELA_INVOCATION_SOURCE: 'open-design',
      },
      maxBuffer: 4 * 1024 * 1024,
      ...(args[0] === 'request-concurrency' ? { timeoutMs: 450 } : {}),
      ...(args[0] === 'preflight' || args[0] === 'funding-check' ? { timeoutMs: BILLING_PREFLIGHT_TIMEOUT_MS } : {}),
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
