import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { createCommandInvocation } from '@open-design/platform';
import type {
  AmrAuthErrorKind,
  AmrAuthNetworkPath,
  AmrAuthStage,
  AmrAuthStageResult,
  AmrEntryAttribution,
  TrackingAmrEntrySource,
  TrackingCampaignConversionSource,
  TrackingCampaignId,
  TrackingPageName,
} from '@open-design/contracts/analytics';
import type { AmrSessionState } from '@open-design/contracts';

import { resolveAgentLaunch } from '../runtimes/launch.js';
import { spawnEnvForAgent } from '../runtimes/env.js';
import { getAgentDef } from '../runtimes/registry.js';
import { resolveAmrProfile } from './vela-profile.js';
import { resolveEffectiveVelaConsoleOrigin } from './vela-console-origin.js';

export { resolveAmrProfile } from './vela-profile.js';

const AMR_ENTRY_SOURCES: ReadonlySet<TrackingAmrEntrySource> = new Set([
  'onboarding_amr_card',
  'onboarding_amr_sign_in_continue',
  'inline_model_switcher_amr_row',
  'settings_amr_agent_card',
  'settings_amr_authorize',
  'settings_cloud_callout',
  'settings_amr_console',
  'settings_amr_install',
  'avatar_amr_console',
  'handoff_amr_website',
  'chat_error_authorize_retry',
  'chat_error_recharge',
  'chat_error_upgrade',
  'chat_balance_gate_upgrade',
  'home_balance_gate_upgrade',
  'chat_low_balance_warn_recharge',
  'home_low_balance_warn_recharge',
  'chat_balance_gate_sign_in',
  'home_balance_gate_sign_in',
  'chat_error_switch_retry_card',
  'generation_preview_authorize_retry',
  'generation_preview_recharge',
  'generation_preview_switch_retry_card',
  'settings_amr_upgrade',
  'inline_amr_upgrade',
  'go_plan_sunset_modal',
  'deepseek_unpaid_modal',
  'deepseek_workbench_badge',
  'deepseek_model_switcher_upgrade',
  'avatar_amr_upgrade',
  'avatar_amr_agent_card',
  'artifact_success_upgrade',
  'home_artifact_upgrade',
]);

function isCanonicalAmrAuthAttemptId(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

const AMR_ONBOARDING_PROFILE_SOURCES: ReadonlySet<TrackingAmrEntrySource> = new Set([
  'onboarding_amr_card',
  'onboarding_amr_sign_in_continue',
]);

type AmrEntrySourcePageName = Extract<
  TrackingPageName,
  'onboarding' | 'chat_panel' | 'settings' | 'file_manager' | 'artifact' | 'home'
>;

const AMR_ENTRY_SOURCE_PAGES: ReadonlySet<AmrEntrySourcePageName> = new Set([
  'onboarding',
  'chat_panel',
  'settings',
  'file_manager',
  'artifact',
  'home',
]);

// Fail-closed: an id missing here voids the WHOLE entry, not just its campaign
// field, so a live campaign left out loses every attributed entry it produces.
// Both are listed because entries minted during the finished free week can
// still arrive within their attribution window.
const AMR_ENTRY_CAMPAIGN_IDS: ReadonlySet<TrackingCampaignId> = new Set([
  'deepseek_v4_flash',
  'deepseek_v4_pro',
  'go_plan_sunset_202608',
]);

const AMR_ENTRY_CAMPAIGN_CONVERSION_SOURCES: ReadonlySet<TrackingCampaignConversionSource> =
  new Set([
    'go_plan_sunset_modal',
    'deepseek_unpaid_modal',
    'deepseek_workbench_badge',
    'deepseek_model_switcher_upgrade',
    'landing_home_banner',
    'landing_pricing_personal_plan',
    'landing_pricing_team_plan',
  ]);

const AMR_ENTRY_SOURCE_PAGE_BY_SOURCE: Record<
  TrackingAmrEntrySource,
  AmrEntrySourcePageName
> = {
  onboarding_amr_card: 'onboarding',
  onboarding_amr_sign_in_continue: 'onboarding',
  inline_model_switcher_amr_row: 'chat_panel',
  settings_amr_agent_card: 'settings',
  settings_amr_authorize: 'settings',
  settings_cloud_callout: 'settings',
  settings_amr_console: 'settings',
  settings_amr_install: 'settings',
  avatar_amr_console: 'chat_panel',
  handoff_amr_website: 'artifact',
  chat_error_authorize_retry: 'chat_panel',
  chat_error_recharge: 'chat_panel',
  chat_error_upgrade: 'chat_panel',
  chat_balance_gate_upgrade: 'chat_panel',
  home_balance_gate_upgrade: 'home',
  chat_low_balance_warn_recharge: 'chat_panel',
  home_low_balance_warn_recharge: 'home',
  chat_balance_gate_sign_in: 'chat_panel',
  home_balance_gate_sign_in: 'home',
  chat_error_switch_retry_card: 'chat_panel',
  generation_preview_authorize_retry: 'file_manager',
  generation_preview_recharge: 'file_manager',
  generation_preview_switch_retry_card: 'file_manager',
  settings_amr_upgrade: 'settings',
  inline_amr_upgrade: 'chat_panel',
  go_plan_sunset_modal: 'home',
  deepseek_unpaid_modal: 'home',
  deepseek_workbench_badge: 'home',
  deepseek_model_switcher_upgrade: 'chat_panel',
  avatar_amr_upgrade: 'chat_panel',
  avatar_amr_agent_card: 'chat_panel',
  artifact_success_upgrade: 'artifact',
  home_artifact_upgrade: 'home',
};

const AMR_ANALYTICS_EVENTS_URL =
  'https://amr-api.open-design.ai/api/v1/analytics/events';
const AMR_ANALYTICS_TIMEOUT_MS = 1500;
const OD_DEVICE_ID_MAX_LENGTH = 128;

type AmrAnalyticsEnv = 'local' | 'test' | 'staging' | 'production';

const AMR_ANALYTICS_ENVS: ReadonlySet<AmrAnalyticsEnv> = new Set([
  'local',
  'test',
  'staging',
  'production',
]);

export interface AmrEntryAnalyticsPayload {
  pageName: 'open_design';
  sourcePageName: AmrEntrySourcePageName;
  area: 'amr_entry';
  element: TrackingAmrEntrySource;
  action: 'click_amr_entry';
  entryId: string;
  sourceProduct: 'open_design';
  sourceDetail: TrackingAmrEntrySource;
  entryOccurredAt: string;
  // Campaign dimensions mirrored from the web consent-gated channel so the
  // AMR ingest body matches the local PostHog + redirect URL envelope.
  campaignId?: TrackingCampaignId;
  conversionSource?: TrackingCampaignConversionSource;
  // Optional self-reported onboarding profile, forwarded to AMR for paid-
  // conversion segmentation. Open strings (not a union) so a new onboarding
  // option never forces a contract bump on either side. useCase is multi-select.
  odRole?: string;
  odOrgSize?: string;
  odUseCase?: string[];
  odSource?: string;
}

export interface AmrOnboardingProfileAnalyticsPayload {
  pageName: 'open_design';
  sourcePageName: 'onboarding';
  area: 'onboarding';
  element: 'about_you_submit';
  action: 'submit_profile';
  entryId: string;
  sourceProduct: 'open_design';
  sourceDetail: TrackingAmrEntrySource;
  entryOccurredAt: string;
  profileOccurredAt: string;
  odDeviceId?: string;
  odRole?: string;
  odOrgSize?: string;
  odUseCase?: string[];
  odSource?: string;
}

export interface AmrEntryAnalyticsContext {
  deviceId?: string | null;
  sessionId?: string | null;
  locale?: string | null;
}

interface FetchResponseLike {
  ok: boolean;
  status: number;
}

type FetchLike = (
  input: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<FetchResponseLike>;

export interface MirrorAmrEntryAnalyticsDeps {
  analyticsContext?: AmrEntryAnalyticsContext | null;
  appVersion?: string | null;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
}

export interface MirrorAmrEntryAnalyticsResult {
  mirrored: boolean;
  status?: number;
  error?: string;
}

export interface VelaUser {
  id: string;
  email: string;
  name?: string;
  image?: string | null;
  plan?: string;
  /**
   * Wallet balance (USD, string), surfaced live from the control-plane
   * `/api/v1/me` endpoint. `null` when unknown (lookup failed, not yet warmed,
   * or upstream does not return it). Absent on stale config-only reads.
   */
  balanceUsd?: string | null;
}

export interface VelaLoginStatus {
  loggedIn: boolean;
  sessionState?: AmrSessionState;
  credentialRevision?: string;
  loginInFlight: boolean;
  profile: string;
  user: VelaUser | null;
  /**
   * Live billing projection (plan tier + wallet balance) for the signed-in
   * account. Kept SEPARATE from `user` so env-backed sessions (where `user` is
   * null) can surface plan/balance without fabricating a blank identity, and so
   * `user.id === null` keeps meaning "no account identity available" for
   * analytics and other callers. Absent until the live summary resolves;
   * absent means unknown / hidden.
   */
  account?: VelaLiveAccount;
  configPath: string;
  /**
   * Device-authorization URL parsed from `vela login` stdout, surfaced so the
   * user can complete sign-in manually when the browser did not auto-open.
   * Present only while a login is in flight and after vela has printed it.
   */
  activationUrl?: string;
  /** Device-authorization user code printed alongside the activation URL. */
  userCode?: string;
  /** True when vela warned it could not open the browser automatically. */
  browserOpenFailed?: boolean;
  /**
   * Origin of the vela web console this runtime talks to, when it was given
   * one. See {@link resolveVelaConsoleOrigin} — the client needs it to build
   * wallet / plans / upgrade links for a non-public AMR environment.
   */
  consoleOrigin?: string;
  authAttemptId?: string;
  authStages?: VelaLoginAuthStage[];
  authRoute?: AmrAuthNetworkPath;
  fallbackUsed?: boolean;
}

/**
 * The vela web console origin this runtime was configured with, normalized
 * without a trailing slash, or undefined when it was given none.
 *
 * Non-prod AMR environments are internal deployments, so their hostnames are
 * not literals in this public repository: packaging injects the origin from a
 * CI secret and the packaged runtime forwards it as `OD_VELA_WEB_URL`. Reporting
 * it on the login status is how the web client learns which console to link to.
 * The resolver combines that packaged origin with the settings-selected AMR
 * profile, so a runtime switch cannot keep linking to the package's backend.
 */
export function resolveVelaConsoleOrigin(
  env: NodeJS.ProcessEnv = process.env,
  configuredEnv: Record<string, string> = {},
): string | undefined {
  return resolveEffectiveVelaConsoleOrigin(env, configuredEnv);
}

export interface VelaLoginAuthStage {
  sequence: number;
  stage: AmrAuthStage;
  result: AmrAuthStageResult;
  source: 'daemon';
  occurredAt: string;
  route: AmrAuthNetworkPath;
  errorKind?: AmrAuthErrorKind;
}

export interface VelaLoginAttemptSnapshot {
  authAttemptId?: string;
  authStages?: VelaLoginAuthStage[];
  authRoute?: AmrAuthNetworkPath;
  fallbackUsed?: boolean;
}

export interface VelaLoginActivation {
  activationUrl: string | null;
  userCode: string | null;
  browserOpenFailed: boolean;
}

// `vela login` is a device-authorization flow. Before it best-effort opens the
// browser it prints, to stdout, the exact lines:
//
//   Open this URL to continue:
//   <activation-url>
//
//   Code: <user-code>
//
// and, when the auto-open fails, warns on stderr "could not open browser
// automatically: …" (see apps/cli/internal/commands/login.go in the vela repo).
// The daemon spawns vela login headless, so this parser recovers the URL/code/
// warning from the captured streams to surface them to the user. Pure so the
// extraction rules stay unit-testable against vela's literal output format.
export function parseVelaLoginActivation(
  stdout: string,
  stderr: string,
): VelaLoginActivation {
  const urlMatch = /Open this URL to continue:\s*\r?\n\s*(\S+)/i.exec(stdout);
  // Anchor on a line start so a `user_code=` query param inside the URL is not
  // mistaken for the dedicated `Code:` line.
  const codeMatch = /^[^\S\r\n]*Code:\s*(\S+)/im.exec(stdout);
  return {
    activationUrl: urlMatch?.[1] ?? null,
    userCode: codeMatch?.[1] ?? null,
    browserOpenFailed: /could not open browser automatically/i.test(stderr),
  };
}

export interface VelaCredentialRevision {
  authSource: 'env' | 'file' | 'none';
  profile: string;
  loggedIn: boolean;
  userId: string;
  userEmail: string;
  configMtimeMs: number | null;
  /**
   * Non-secret fingerprint of the configured AMR env credentials
   * (`VELA_RUNTIME_KEY` / `VELA_LINK_URL`, which can come from `agentCliEnv.amr`
   * in app-config, not just process env). Env-backed sessions report
   * `user: null`, so without this an account switch that only rewrites the
   * Settings-backed env (leaving `~/.amr/config.json` untouched) would reuse the
   * previous account's cached plan/balance. File-backed sessions fingerprint
   * the stored keys as well, so a successful login is recognized even when a
   * filesystem preserves the config mtime.
   */
  credentialFingerprint: string;
}

export interface VelaControlApiContext {
  profile: string;
  apiUrl: string;
  controlKey: string;
  user: VelaUser | null;
  configMtimeMs: number | null;
}

export interface VelaApiContext {
  profile: string;
  apiUrl: string;
}

interface VelaProfileShape {
  controlKey?: string;
  runtimeKey?: string;
  apiUrl?: string;
  linkUrl?: string;
  user?: VelaUser | null;
}

interface VelaConfigFileShape {
  profiles?: Record<string, VelaProfileShape>;
}

interface VelaProfileConfigSnapshot {
  profile: string;
  stored: VelaProfileShape | undefined;
  configMtimeMs: number | null;
}

export function mergeVelaEnv(
  env: NodeJS.ProcessEnv = process.env,
  configuredEnv: Record<string, string> = {},
): NodeJS.ProcessEnv {
  return {
    ...env,
    ...configuredEnv,
  };
}

function configDir(): string {
  const amrHome = process.env.AMR_HOME?.trim();
  if (amrHome === '~') return homedir();
  if (amrHome?.startsWith('~/')) return path.join(homedir(), amrHome.slice(2));
  if (amrHome) return amrHome;
  return path.join(homedir(), '.amr');
}

export function amrConfigPath(): string {
  return path.join(configDir(), 'config.json');
}

function readConfigFile(): VelaConfigFileShape | null {
  const file = amrConfigPath();
  if (!existsSync(file)) return null;
  try {
    const data = readFileSync(file, 'utf8');
    const parsed = JSON.parse(data) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as VelaConfigFileShape;
  } catch {
    return null;
  }
}

function readVelaProfileConfigSnapshot(
  env: NodeJS.ProcessEnv = process.env,
  configuredEnv: Record<string, string> = {},
): VelaProfileConfigSnapshot {
  const mergedEnv = mergeVelaEnv(env, configuredEnv);
  const profile = resolveAmrProfile(mergedEnv);
  const file = readConfigFile();
  return {
    profile,
    stored: file?.profiles?.[profile],
    configMtimeMs: existsSync(amrConfigPath()) ? statSync(amrConfigPath()).mtimeMs : null,
  };
}

export function readVelaLoginStatus(
  env: NodeJS.ProcessEnv = process.env,
  configuredEnv: Record<string, string> = {},
): VelaLoginStatus {
  const rawStatus = readRawVelaLoginStatus(env, configuredEnv);
  const credentialRevision = velaCredentialRevisionDigest(
    readRawVelaCredentialRevision(env, configuredEnv, rawStatus),
  );
  let sessionState: AmrSessionState = 'authenticated';
  if (!rawStatus.loggedIn) {
    sessionState = 'signed_out';
  } else if (expiredVelaCredentialRevisions.has(credentialRevision)) {
    sessionState = 'reauth_required';
  }
  return {
    ...rawStatus,
    // `loggedIn` remains the backwards-compatible "credential is present"
    // projection. Routing must not treat an expired credential like a brand
    // new user and throw them back into first-run onboarding; new callers use
    // `sessionState` for authoritative validity.
    loggedIn: rawStatus.loggedIn,
    sessionState,
    credentialRevision,
  };
}

function readRawVelaLoginStatus(
  env: NodeJS.ProcessEnv = process.env,
  configuredEnv: Record<string, string> = {},
): Omit<VelaLoginStatus, 'sessionState' | 'credentialRevision'> {
  const mergedEnv = mergeVelaEnv(env, configuredEnv);
  const profile = resolveAmrProfile(mergedEnv);
  const configPath = amrConfigPath();
  const loginInFlight = isVelaLoginInFlight();
  // Only meaningful while signing in (loggedIn becomes true once vela writes the
  // runtime key); empty otherwise so completed sessions don't echo a stale URL.
  const activationFields: Partial<VelaLoginStatus> =
    loginInFlight && activeLoginActivation
      ? {
          ...(activeLoginActivation.activationUrl
            ? { activationUrl: activeLoginActivation.activationUrl }
            : {}),
          ...(activeLoginActivation.userCode
            ? { userCode: activeLoginActivation.userCode }
            : {}),
          ...(activeLoginActivation.browserOpenFailed
            ? { browserOpenFailed: true }
            : {}),
        }
      : {};
  const runtimeKey = mergedEnv.VELA_RUNTIME_KEY?.trim() ?? '';
  const linkUrl = mergedEnv.VELA_LINK_URL?.trim() ?? '';
  if (runtimeKey && linkUrl) {
    return {
      loggedIn: true,
      loginInFlight,
      profile,
      user: null,
      configPath,
      ...readVelaLoginAttemptSnapshot(),
    };
  }
  const file = readConfigFile();
  const stored = file?.profiles?.[profile];
  const storedRuntimeKey = stored?.runtimeKey?.trim() ?? '';
  if (!storedRuntimeKey) {
    return {
      loggedIn: false,
      loginInFlight,
      profile,
      user: null,
      configPath,
      ...activationFields,
      ...readVelaLoginAttemptSnapshot(),
    };
  }
  const rawUser = stored?.user ?? null;
  const user: VelaUser | null = rawUser
    ? {
        id: typeof rawUser.id === 'string' ? rawUser.id : '',
        email: typeof rawUser.email === 'string' ? rawUser.email : '',
        ...(typeof rawUser.name === 'string' ? { name: rawUser.name } : {}),
        ...(typeof rawUser.image === 'string' ? { image: rawUser.image } : {}),
        ...(typeof rawUser.plan === 'string' ? { plan: rawUser.plan } : {}),
      }
    : null;
  return {
    loggedIn: true,
    loginInFlight,
    profile,
    user,
    configPath,
    ...readVelaLoginAttemptSnapshot(),
  };
}

/**
 * Live account fields (plan tier + wallet balance) sourced from the vela CLI
 * (`vela billing summary`). Cached separately from the config-only
 * {@link readVelaLoginStatus} read so the status route can merge live data
 * without blocking: the route reads this cache synchronously and triggers a
 * background CLI refresh for the next poll. The CLI spawn itself lives in the
 * route layer (which already resolves the vela launch path for models).
 */
export interface VelaLiveAccount {
  plan?: string;
  balanceUsd?: string | null;
}

const liveAccountCache = new Map<string, VelaLiveAccount>();
const liveAccountFetchedAt = new Map<string, number>();
const LIVE_ACCOUNT_TTL_MS = 60_000;

/**
 * Cache key for the live account. Derived from the full credential revision
 * (auth source + profile + signed-in user + config mtime), NOT just the
 * profile — so a logout or an account switch on the same profile produces a
 * fresh key and the previous account's plan/balance can never leak into a new
 * session before the background refresh completes.
 */
export function velaLiveAccountCacheKey(
  revision: VelaCredentialRevision,
): string {
  return [
    revision.authSource,
    revision.profile,
    revision.loggedIn ? '1' : '0',
    revision.userId,
    revision.configMtimeMs ?? '',
    revision.credentialFingerprint,
  ].join('|');
}

/** Synchronous, non-blocking read of the most recent live-account projection. */
export function peekVelaLiveAccount(cacheKey: string): VelaLiveAccount | null {
  return liveAccountCache.get(cacheKey) ?? null;
}

/**
 * TTL gate for the background refresh. Returns true (and records the attempt)
 * at most once per cache key per {@link LIVE_ACCOUNT_TTL_MS}, so concurrent
 * status polls don't all spawn the CLI.
 */
export function shouldRefreshVelaLiveAccount(cacheKey: string): boolean {
  const last = liveAccountFetchedAt.get(cacheKey) ?? 0;
  if (Date.now() - last < LIVE_ACCOUNT_TTL_MS) return false;
  liveAccountFetchedAt.set(cacheKey, Date.now());
  return true;
}

/** Store a freshly fetched live-account projection. */
export function setVelaLiveAccount(
  cacheKey: string,
  account: VelaLiveAccount,
): void {
  liveAccountCache.set(cacheKey, account);
  // Stamp the fetch time so the warm-path TTL gate doesn't immediately trigger
  // a redundant refresh right after a (blocking) cold fetch populated the cache.
  liveAccountFetchedAt.set(cacheKey, Date.now());
}

/** Clear the refresh throttle so a failed fetch can retry on the next poll. */
export function clearVelaLiveAccountRefreshThrottle(cacheKey: string): void {
  liveAccountFetchedAt.delete(cacheKey);
}

/**
 * Drop every cached live-account projection + throttle. Call on logout so a
 * subsequent login can never surface the signed-out account's plan or balance.
 */
export function clearAllVelaLiveAccounts(): void {
  liveAccountCache.clear();
  liveAccountFetchedAt.clear();
}

/**
 * Attach a fetched live account (plan tier + wallet balance) to a login status
 * on the dedicated {@link VelaLoginStatus.account} field. Deliberately does NOT
 * touch `status.user`: env-backed sessions keep `user: null` (no fabricated
 * blank identity), and the billing projection rides on its own field so every
 * surface can read plan/balance uniformly. No-op when signed out or when there
 * is no account to apply.
 */
export function applyVelaLiveAccount(
  status: VelaLoginStatus,
  account: VelaLiveAccount | null,
): void {
  if (!status.loggedIn || !account) return;
  status.account = account;
}

export function readVelaCredentialRevision(
  env: NodeJS.ProcessEnv = process.env,
  configuredEnv: Record<string, string> = {},
): VelaCredentialRevision {
  return readRawVelaCredentialRevision(
    env,
    configuredEnv,
    readRawVelaLoginStatus(env, configuredEnv),
  );
}

function readRawVelaCredentialRevision(
  env: NodeJS.ProcessEnv,
  configuredEnv: Record<string, string>,
  status: Omit<VelaLoginStatus, 'sessionState' | 'credentialRevision'>,
): VelaCredentialRevision {
  const mergedEnv = mergeVelaEnv(env, configuredEnv);
  const hasEnvCredentials =
    (mergedEnv.VELA_RUNTIME_KEY?.trim() ?? '').length > 0 &&
    (mergedEnv.VELA_LINK_URL?.trim() ?? '').length > 0;
  // One-way hash (never the raw key) so the cache key distinguishes env-backed
  // accounts whose only difference is the configured runtime credential.
  const fileProfile = hasEnvCredentials
    ? undefined
    : readConfigFile()?.profiles?.[status.profile];
  const credentialFingerprint = createHash('sha256')
    .update(
      hasEnvCredentials
        ? `${mergedEnv.VELA_RUNTIME_KEY ?? ''}\n${mergedEnv.VELA_LINK_URL ?? ''}`
        : [
            fileProfile?.runtimeKey ?? '',
            fileProfile?.controlKey ?? '',
            fileProfile?.linkUrl ?? '',
            fileProfile?.apiUrl ?? '',
          ].join('\n'),
    )
    .digest('hex')
    .slice(0, 16);
  return {
    authSource: hasEnvCredentials ? 'env' : status.loggedIn ? 'file' : 'none',
    profile: status.profile,
    loggedIn: status.loggedIn,
    userId: status.user?.id ?? '',
    userEmail: status.user?.email ?? '',
    // Include the config mtime even for env-backed auth: the live billing
    // summary is fetched with the config profile's controlKey, so a config
    // rewrite (account switch) must invalidate the cached plan/balance — even
    // when VELA_RUNTIME_KEY is the active runtime credential. Otherwise an
    // env-backed session keeps serving the previous account's plan/balance.
    configMtimeMs: existsSync(status.configPath)
      ? statSync(status.configPath).mtimeMs
      : null,
    credentialFingerprint,
  };
}

const expiredVelaCredentialRevisions = new Set<string>();
const expiredVelaControlKeys = new Set<string>();

function velaCredentialRevisionDigest(revision: VelaCredentialRevision): string {
  return createHash('sha256')
    .update(JSON.stringify(revision))
    .digest('hex')
    .slice(0, 20);
}

/** Mark only the currently-active credential revision as rejected upstream. */
export function markVelaAuthorizationExpired(
  env: NodeJS.ProcessEnv = process.env,
  configuredEnv: Record<string, string> = {},
): string {
  const revision = velaCredentialRevisionDigest(readVelaCredentialRevision(env, configuredEnv));
  expiredVelaCredentialRevisions.add(revision);
  const control = readRawVelaControlApiContext(env, configuredEnv);
  if (control) expiredVelaControlKeys.add(velaControlKeyDigest(control.controlKey));
  return revision;
}

/** Test/logout seam. A rotated credential naturally has a different revision. */
export function clearVelaAuthorizationState(): void {
  expiredVelaCredentialRevisions.clear();
  expiredVelaControlKeys.clear();
}

function velaControlKeyDigest(controlKey: string): string {
  return createHash('sha256').update(controlKey).digest('hex').slice(0, 20);
}

export function readVelaControlApiContext(
  env: NodeJS.ProcessEnv = process.env,
  configuredEnv: Record<string, string> = {},
): VelaControlApiContext | null {
  const context = readRawVelaControlApiContext(env, configuredEnv);
  if (
    context
    && expiredVelaControlKeys.has(velaControlKeyDigest(context.controlKey))
  ) return null;
  return context;
}

function readRawVelaControlApiContext(
  env: NodeJS.ProcessEnv = process.env,
  configuredEnv: Record<string, string> = {},
): VelaControlApiContext | null {
  const mergedEnv = mergeVelaEnv(env, configuredEnv);
  const profile = resolveAmrProfile(mergedEnv);
  const envControlKey = mergedEnv.VELA_CONTROL_KEY?.trim() ?? '';
  const envApiUrl = mergedEnv.VELA_API_URL?.trim() ?? '';
  if (envControlKey) {
    const status = readRawVelaLoginStatus(env, configuredEnv);
    return {
      profile,
      apiUrl: envApiUrl || 'https://amr-api.open-design.ai',
      controlKey: envControlKey,
      user: status.user,
      configMtimeMs: null,
    };
  }
  const snapshot = readVelaProfileConfigSnapshot(env, configuredEnv);
  const apiContext = readVelaApiContext(env, configuredEnv, snapshot);
  const stored = snapshot.stored;
  const controlKey = stored?.controlKey?.trim() ?? '';
  if (!controlKey) return null;
  return {
    ...apiContext,
    controlKey,
    user: stored?.user ?? null,
    configMtimeMs: snapshot.configMtimeMs,
  };
}

export function readVelaApiContext(
  env: NodeJS.ProcessEnv = process.env,
  configuredEnv: Record<string, string> = {},
  snapshot: VelaProfileConfigSnapshot = readVelaProfileConfigSnapshot(env, configuredEnv),
): VelaApiContext {
  const mergedEnv = mergeVelaEnv(env, configuredEnv);
  return {
    profile: snapshot.profile,
    apiUrl:
      snapshot.stored?.apiUrl?.trim()
      || mergedEnv.VELA_API_URL?.trim()
      || 'https://amr-api.open-design.ai',
  };
}

export function forgetVelaLogin(env: NodeJS.ProcessEnv = process.env): void {
  const file = amrConfigPath();
  if (!existsSync(file)) return;
  const parsed = readConfigFile();
  if (!parsed?.profiles) return;
  const profile = resolveAmrProfile(env);
  if (!Object.prototype.hasOwnProperty.call(parsed.profiles, profile)) return;
  const keptProfileConfig = { ...(parsed.profiles[profile] ?? {}) };
  delete keptProfileConfig.controlKey;
  delete keptProfileConfig.runtimeKey;
  delete keptProfileConfig.user;
  const nextProfiles = { ...parsed.profiles };
  nextProfiles[profile] = keptProfileConfig;
  writeFileSync(
    file,
    JSON.stringify({ ...parsed, profiles: nextProfiles }, null, 2),
    'utf8',
  );
}

export interface SpawnedVelaLogin {
  pid: number;
  startedAt: string;
  profile: string;
  authAttemptId: string;
}

const activeLoginProcs = new Map<number, ChildProcess>();
interface VelaLoginAttemptRef {
  authAttemptId: string;
  generation: number;
}

interface VelaLoginAttemptState extends VelaLoginAttemptRef {
  authRequestId?: string;
  canceled: boolean;
  fallbackPending: boolean;
  fallbackStarted: boolean;
  currentPid: number | null;
  route: AmrAuthNetworkPath;
  fallbackUsed: boolean;
  stages: VelaLoginAuthStage[];
}

let loginGeneration = 0;
let latestLoginAttempt: VelaLoginAttemptState | null = null;
// Children registered for supervision until their `close`/`error` terminal
// handler runs. Distinct from `isVelaLoginInFlight()`: status can drop the
// public idle projection between `exit` and `close` once `exitCode` is set
// (especially after cancel, which suppresses the fallbackPending bridge).
let pendingVelaLoginTerminals = 0;
const LOGIN_STARTUP_GRACE_MS = 250;
const LOGIN_ACTIVATION_GRACE_MS = 10_000;
const LOGIN_CANCEL_KILL_GRACE_MS = 2000;

// How long the login request blocks waiting for the direct attempt's activation
// URL before returning and letting the UI poll /status. Overridable so tests can
// exercise the slow-direct path without a multi-second wait. Never used to kill
// the direct attempt — see waitForLoginActivationSteadyState.
function resolveLoginActivationGraceMs(baseEnv: NodeJS.ProcessEnv): number {
  const raw = Number(baseEnv.OD_AMR_LOGIN_ACTIVATION_GRACE_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : LOGIN_ACTIVATION_GRACE_MS;
}
// Cap the captured buffers: the activation URL + code land in the first handful
// of stdout lines, so a few KB is plenty and bounds memory if vela stays chatty.
const LOGIN_CAPTURE_LIMIT_BYTES = 8192;

// Activation details captured from the in-flight `vela login` child. Reset on
// each spawn (one interactive login at a time); `readVelaLoginStatus` only
// surfaces it while a login is actually in flight.
let activeLoginActivation: VelaLoginActivation | null = null;

interface VelaLoginActivationCapture {
  activation: VelaLoginActivation;
  stdout: string;
  stderr: string;
}

function recordVelaAuthStage(
  attempt: VelaLoginAttemptRef,
  signal: {
    stage: AmrAuthStage;
    result: AmrAuthStageResult;
    errorKind?: AmrAuthErrorKind;
  },
  source: 'daemon',
): void {
  const current = currentVelaLoginAttempt(attempt);
  if (!current) return;
  const duplicate = current.stages.some((stage) =>
    stage.stage === signal.stage
      && stage.result === signal.result
      && stage.route === current.route
      && stage.errorKind === signal.errorKind,
  );
  if (duplicate) return;
  if (current.stages.length >= 32) return;
  current.stages.push({
    sequence: current.stages.length + 1,
    stage: signal.stage,
    result: signal.result,
    source,
    occurredAt: new Date().toISOString(),
    route: current.route,
    ...(signal.errorKind ? { errorKind: signal.errorKind } : {}),
  });
}

function appendHumanVelaLoginStdout(
  capture: VelaLoginActivationCapture,
  chunk: string,
): void {
  if (capture.stdout.length >= LOGIN_CAPTURE_LIMIT_BYTES) return;
  capture.stdout += chunk.slice(
    0,
    LOGIN_CAPTURE_LIMIT_BYTES - capture.stdout.length,
  );
}

// Attach lifetime listeners that accumulate the child's stdout/stderr and keep
// re-parsing the activation URL/code/warning as output streams in. Unlike
// `waitForImmediateLoginFailure` (which only reads the first 250ms), this lives
// for the whole login so a slow CreateDeviceAuthorization round-trip — common on
// constrained networks, exactly where the browser handoff also tends to fail —
// still surfaces the URL once it finally prints.
function beginLoginActivationCapture(
  child: ChildProcess,
  attempt: VelaLoginAttemptRef,
): VelaLoginActivationCapture {
  const activation: VelaLoginActivation = {
    activationUrl: null,
    userCode: null,
    browserOpenFailed: false,
  };
  const capture: VelaLoginActivationCapture = {
    activation,
    stdout: '',
    stderr: '',
  };
  activeLoginActivation = activation;
  const ownsCapture = () =>
    currentVelaLoginAttempt(attempt)?.currentPid === child.pid;
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk) => {
    // Once a replacement proxy child owns the attempt, late data from the old
    // direct child must not be attributed to the proxy route. The pid remains
    // owned through normal `close`, so legitimate close-drain data still lands.
    if (!ownsCapture()) return;
    const text = String(chunk);
    appendHumanVelaLoginStdout(capture, text);
    const activationWasReady = Boolean(activation.activationUrl);
    const parsed = parseVelaLoginActivation(capture.stdout, capture.stderr);
    if (parsed.activationUrl) activation.activationUrl = parsed.activationUrl;
    if (parsed.userCode) activation.userCode = parsed.userCode;
    if (!activationWasReady && activation.activationUrl) {
      recordVelaAuthStage(
        attempt,
        { stage: 'device_auth_create_result', result: 'success' },
        'daemon',
      );
      recordVelaAuthStage(
        attempt,
        { stage: 'activation_ready', result: 'success' },
        'daemon',
      );
    }
  });
  child.stderr?.on('data', (chunk) => {
    if (!ownsCapture()) return;
    if (capture.stderr.length < LOGIN_CAPTURE_LIMIT_BYTES) {
      capture.stderr += String(chunk);
    }
    if (
      !activation.browserOpenFailed
      && parseVelaLoginActivation('', capture.stderr).browserOpenFailed
    ) {
      activation.browserOpenFailed = true;
      recordVelaAuthStage(
        attempt,
        {
          stage: 'browser_open_result',
          result: 'failed',
          errorKind: 'browser_open_error',
        },
        'daemon',
      );
    }
  });
  return capture;
}

function isChildRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

function hasRunningVelaLoginChild(): boolean {
  for (const [pid, child] of activeLoginProcs) {
    if (isChildRunning(child)) return true;
    activeLoginProcs.delete(pid);
  }
  return false;
}

export function isVelaLoginInFlight(): boolean {
  return hasRunningVelaLoginChild()
    || Boolean(latestLoginAttempt?.fallbackPending && !latestLoginAttempt.canceled);
}

/**
 * True once every supervised login child has finished its `close`/`error`
 * terminal handler and no late proxy fallback is still pending.
 *
 * Stronger than `isVelaLoginInFlight()` for tests that must observe the
 * close-deferred late-fallback decision: the public idle projection can
 * flip true between `exit` and `close` when the attempt was canceled.
 */
export function isVelaLoginSupervisorSettled(): boolean {
  return pendingVelaLoginTerminals === 0
    && !Boolean(latestLoginAttempt?.fallbackPending && !latestLoginAttempt.canceled);
}

export interface CancelVelaLoginResult {
  canceled: boolean;
  pids: number[];
}

export function cancelVelaLogin(
  expectedAuthAttemptId?: string | null,
  expectedAuthRequestId?: string | null,
): CancelVelaLoginResult {
  if (
    expectedAuthAttemptId !== undefined
    && expectedAuthAttemptId !== null
    && latestLoginAttempt?.authAttemptId !== expectedAuthAttemptId
  ) {
    return { canceled: false, pids: [] };
  }
  if (
    expectedAuthRequestId !== undefined
    && expectedAuthRequestId !== null
    && latestLoginAttempt?.authRequestId !== expectedAuthRequestId
  ) {
    return { canceled: false, pids: [] };
  }
  const attemptWasActive = Boolean(
    latestLoginAttempt
      && !latestLoginAttempt.canceled
      && (latestLoginAttempt.fallbackPending || hasRunningVelaLoginChild()),
  );
  if (latestLoginAttempt) latestLoginAttempt.canceled = true;
  // Invalidate every callback/captured stage belonging to the canceled
  // attempt before signalling its child. A late direct exit can therefore
  // never start the proxy fallback after the user has canceled.
  loginGeneration += 1;
  const pids: number[] = [];
  for (const [pid, child] of activeLoginProcs) {
    if (!isChildRunning(child)) {
      activeLoginProcs.delete(pid);
      continue;
    }
    try {
      child.kill('SIGTERM');
    } catch {
      activeLoginProcs.delete(pid);
      continue;
    }
    pids.push(pid);
    const killTimer = setTimeout(() => {
      try {
        if (isChildRunning(child)) child.kill('SIGKILL');
      } catch {
        activeLoginProcs.delete(pid);
      }
    }, LOGIN_CANCEL_KILL_GRACE_MS);
    killTimer.unref?.();
  }
  return { canceled: attemptWasActive || pids.length > 0, pids };
}

export interface SpawnVelaLoginDeps {
  configuredEnv?: Record<string, string>;
  baseEnv?: NodeJS.ProcessEnv;
  attribution?: AmrEntryAttribution | null;
  correlationEnv?: Record<string, string>;
  defaultApiUrl?: string | null;
  // When set, block until the direct attempt reaches device-auth steady state
  // (prints its activation URL) or exits/errors before that, so the login route
  // can fall back to the IPv4 proxy on a real pre-activation failure rather than
  // only on a sub-250ms startup crash. See waitForLoginActivationSteadyState.
  waitForActivation?: boolean;
}

export interface SpawnVelaLoginWithFallbackDeps extends SpawnVelaLoginDeps {
  authAttemptId?: string | null;
  authRequestId?: string | null;
  proxyApiUrl: string;
}

export function parseVelaAuthAttemptId(input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = (input as { authAttemptId?: unknown }).authAttemptId;
  return isCanonicalAmrAuthAttemptId(value) ? value : null;
}

export function parseVelaAuthRequestId(input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = (input as { authRequestId?: unknown }).authRequestId;
  return typeof value === 'string'
    && /^pending-amr-auth-[a-z0-9]+-[a-z0-9]+$/.test(value)
    ? value
    : null;
}

function beginVelaLoginAttempt(
  authAttemptId?: string | null,
  authRequestId?: string | null,
): VelaLoginAttemptRef {
  if (isVelaLoginInFlight()) throw new Error('vela login already running');
  const attempt: VelaLoginAttemptState = {
    authAttemptId: isCanonicalAmrAuthAttemptId(authAttemptId)
      ? authAttemptId
      : randomUUID(),
    ...(authRequestId ? { authRequestId } : {}),
    generation: ++loginGeneration,
    canceled: false,
    fallbackPending: false,
    fallbackStarted: false,
    currentPid: null,
    route: 'direct',
    fallbackUsed: false,
    stages: [],
  };
  latestLoginAttempt = attempt;
  recordVelaAuthStage(
    attempt,
    { stage: 'attempt_started', result: 'started' },
    'daemon',
  );
  return attempt;
}

function currentVelaLoginAttempt(
  attempt: VelaLoginAttemptRef,
): VelaLoginAttemptState | null {
  const current = latestLoginAttempt;
  return current
    && current.authAttemptId === attempt.authAttemptId
    && current.generation === attempt.generation
    && loginGeneration === attempt.generation
    && !current.canceled
    ? current
    : null;
}

export function readVelaLoginAttemptSnapshot(): VelaLoginAttemptSnapshot {
  const attempt = latestLoginAttempt;
  return attempt
    ? {
        authAttemptId: attempt.authAttemptId,
        authStages: attempt.stages.map((stage) => ({ ...stage })),
        authRoute: attempt.route,
        fallbackUsed: attempt.fallbackUsed,
      }
    : {};
}

type VelaLoginChildTerminal =
  | { kind: 'exit'; code: number | null; signal: NodeJS.Signals | null }
  | { kind: 'error'; error: Error };

async function waitForImmediateLoginFailure(
  capture: VelaLoginActivationCapture,
  terminal: Promise<VelaLoginChildTerminal>,
): Promise<void> {
  const result = await Promise.race<
    VelaLoginChildTerminal | { kind: 'running' }
  >([
    terminal,
    new Promise<{ kind: 'running' }>((resolve) => {
      const timer = setTimeout(
        () => resolve({ kind: 'running' }),
        LOGIN_STARTUP_GRACE_MS,
      );
      timer.unref?.();
    }),
  ]);

  if (result.kind === 'running') return;
  if (result.kind === 'error') {
    throw new Error(`vela login failed to start: ${result.error.message}`);
  }
  if (capture.activation.activationUrl) return;
  const detail = (capture.stderr || capture.stdout).trim();
  throw new Error(
    detail ||
      `vela login exited before authentication completed (code ${result.code ?? 'null'}, signal ${result.signal ?? 'null'})`,
  );
}

// Wait for the direct `vela login` attempt to either print its device-auth
// activation URL (healthy — the direct path works even on the transparent-proxy
// networks this fix targets, just possibly slowly) or exit/error BEFORE printing
// it (a real failure the caller can retry through the IPv4 proxy). Crucially, a
// merely slow-but-still-running direct login is NOT killed: once the grace
// elapses we simply stop blocking the request and let it keep running (the UI
// polls /status). Killing a slow-healthy direct login and re-routing it through
// the proxy is exactly the regression this avoids — on a corporate transparent
// proxy the proxy hop loses the client IP and the upstream 502s. Only an
// explicit pre-activation exit/error triggers the proxy fallback.
async function waitForLoginActivationSteadyState(
  capture: VelaLoginActivationCapture,
  graceMs: number,
  terminal: Promise<VelaLoginChildTerminal>,
): Promise<void> {
  if (capture.activation.activationUrl) return;

  const observed = new Promise<
    | { kind: 'activated' }
    | { kind: 'still-running' }
  >((resolve) => {
    let settled = false;
    let poll: NodeJS.Timeout | null = null;
    let timer: NodeJS.Timeout | null = null;
    const finish = (
      value:
        | { kind: 'activated' }
        | { kind: 'still-running' },
    ) => {
      if (settled) return;
      settled = true;
      if (poll) clearInterval(poll);
      if (timer) clearTimeout(timer);
      resolve(value);
    };
    poll = setInterval(() => {
      if (capture.activation.activationUrl) finish({ kind: 'activated' });
    }, 50);
    timer = setTimeout(() => finish({ kind: 'still-running' }), graceMs);
    timer.unref?.();
    if (capture.activation.activationUrl) finish({ kind: 'activated' });
  });
  const result = await Promise.race([observed, terminal]);

  if (result.kind === 'activated') return;
  // `close` may win the Promise.race before the 50ms activation poll even
  // though its final drained stdout chunk already populated the capture.
  // Observed activation always owns this child; never launch a duplicate
  // device-auth attempt merely because the child exited immediately after it.
  if (capture.activation.activationUrl) return;
  // Slow but still alive: leave the direct attempt running and let the request
  // return — do NOT kill it or fall back to the proxy.
  if (result.kind === 'still-running') return;
  if (result.kind === 'error') {
    throw new Error(`vela login failed to start: ${result.error.message}`);
  }
  const detail = (capture.stderr || capture.stdout).trim();
  throw new Error(
    detail ||
      `vela login exited before device authorization started (code ${result.code ?? 'null'}, signal ${result.signal ?? 'null'})`,
  );
}

interface SpawnVelaLoginAttemptDeps extends SpawnVelaLoginDeps {
  attempt: VelaLoginAttemptRef;
  onLatePreActivationFailure?: () => Promise<void>;
}

async function spawnVelaLoginAttempt(
  deps: SpawnVelaLoginAttemptDeps,
): Promise<SpawnedVelaLogin> {
  const attemptState = currentVelaLoginAttempt(deps.attempt);
  if (!attemptState) throw new Error('vela login attempt is no longer active');
  if (hasRunningVelaLoginChild()) throw new Error('vela login already running');
  const def = getAgentDef('amr');
  if (!def) {
    recordVelaAuthStage(
      deps.attempt,
      { stage: 'spawn_result', result: 'failed', errorKind: 'internal_error' },
      'daemon',
    );
    throw new Error('AMR runtime def not registered');
  }
  const baseEnv = deps.baseEnv ?? process.env;
  const configuredEnv = withDefaultVelaApiUrl(
    deps.configuredEnv ?? {},
    baseEnv,
    deps.defaultApiUrl,
  );
  const launch = resolveAgentLaunch(def, configuredEnv);
  const bin = launch.selectedPath;
  if (!bin) {
    recordVelaAuthStage(
      deps.attempt,
      { stage: 'spawn_result', result: 'failed', errorKind: 'internal_error' },
      'daemon',
    );
    throw new Error('vela binary not found; install vela or configure VELA_BIN');
  }
  const env: NodeJS.ProcessEnv = {
    ...spawnEnvForAgent('amr', baseEnv, configuredEnv),
    ...velaLoginAttributionEnv(deps.attribution),
    ...(deps.correlationEnv ?? {}),
    // The UUID is daemon-owned and written after configured/base env so a
    // child cannot replace the correlation key selected for this attempt.
    OPEN_DESIGN_AMR_AUTH_ATTEMPT_ID: deps.attempt.authAttemptId,
  };
  // This fallback-only change does not opt the child into a structured stage
  // protocol that the packaged Vela CLI cannot emit.
  delete env.OPEN_DESIGN_AMR_AUTH_STAGE_FORMAT;
  // Route through createCommandInvocation so an npm/Node-style `vela.cmd` or
  // `vela.bat` shim on Windows gets wrapped under `cmd.exe /d /s /c …` with
  // verbatim args, matching what `execAgentFile` / chat-run spawning do. A
  // direct `spawn(bin, args)` on a `.cmd` shim quietly fails to find the
  // shim's actual entry point. POSIX is unchanged (no wrapping needed).
  const invocation = createCommandInvocation({ command: bin, args: ['login'], env });
  let child: ChildProcess;
  try {
    child = spawn(invocation.command, invocation.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      detached: false,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    });
  } catch (error) {
    recordVelaAuthStage(
      deps.attempt,
      { stage: 'spawn_result', result: 'failed', errorKind: 'internal_error' },
      'daemon',
    );
    throw error;
  }
  if (typeof child.pid !== 'number') {
    recordVelaAuthStage(
      deps.attempt,
      { stage: 'spawn_result', result: 'failed', errorKind: 'internal_error' },
      'daemon',
    );
    throw new Error('failed to spawn vela login');
  }
  activeLoginProcs.set(child.pid, child);
  pendingVelaLoginTerminals += 1;
  attemptState.currentPid = child.pid;
  recordVelaAuthStage(
    deps.attempt,
    { stage: 'spawn_result', result: 'success' },
    'daemon',
  );
  let spawnReturned = false;
  let terminalHandled = false;
  let activationCapture: VelaLoginActivationCapture | null = null;
  let settleTerminal: (value: VelaLoginChildTerminal) => void = () => undefined;
  const terminal = new Promise<VelaLoginChildTerminal>((resolve) => {
    settleTerminal = resolve;
  });
  const handleTerminal = (
    terminalKind: 'exit' | 'error',
  ) => {
    if (terminalHandled) return;
    terminalHandled = true;
    pendingVelaLoginTerminals = Math.max(0, pendingVelaLoginTerminals - 1);
    if (typeof child.pid === 'number') activeLoginProcs.delete(child.pid);
    const current = currentVelaLoginAttempt(deps.attempt);
    if (!current || current.currentPid !== child.pid) return;
    current.currentPid = null;
    const exitedBeforeActivation =
      terminalKind === 'exit' && !activationCapture?.activation.activationUrl;
    const terminatedBeforeActivation =
      !activationCapture?.activation.activationUrl;
    if (
      exitedBeforeActivation
      && !current.stages.some((stage) =>
        stage.route === current.route
          && stage.stage === 'device_auth_create_result'
          && stage.result === 'failed',
      )
    ) {
      // Legacy Vela has no structured stage output. A real child exit after
      // spawn but before activation is the strongest safe boundary we can
      // infer without classifying raw stderr.
      recordVelaAuthStage(
        deps.attempt,
        {
          stage: 'device_auth_create_result',
          result: 'failed',
          errorKind: 'unknown',
        },
        'daemon',
      );
    }
    const shouldFallback = Boolean(
      terminatedBeforeActivation
        && spawnReturned
        && deps.onLatePreActivationFailure
        && !activeLoginActivation?.activationUrl
        && !current.fallbackStarted,
    );
    if (!shouldFallback) {
      current.fallbackPending = false;
      activeLoginActivation = null;
      return;
    }
    // Mark pending before starting the async retry so /status never exposes a
    // false idle window between the dead direct child and its proxy successor.
    current.fallbackStarted = true;
    current.fallbackPending = true;
    activeLoginActivation = null;
    void deps.onLatePreActivationFailure?.()
      .catch(() => {
        recordVelaAuthStage(
          deps.attempt,
          {
            stage: 'device_auth_create_result',
            result: 'failed',
            errorKind: 'internal_error',
          },
          'daemon',
        );
      })
      .finally(() => {
        const stillCurrent = currentVelaLoginAttempt(deps.attempt);
        if (stillCurrent) stillCurrent.fallbackPending = false;
      });
  };
  child.once('exit', () => {
    const current = currentVelaLoginAttempt(deps.attempt);
    if (
      current
      && current.currentPid === child.pid
      && !activationCapture?.activation.activationUrl
    ) {
      // `exit` precedes stdio drain/`close` on Node. Keep status continuous but
      // defer the activation/fallback decision until `close`, after every
      // queued stdout chunk has reached the parser.
      current.fallbackPending = true;
    }
  });
  child.once('close', (code, signal) => {
    handleTerminal('exit');
    settleTerminal({ kind: 'exit', code, signal });
  });
  child.once('error', (error) => {
    recordVelaAuthStage(
      deps.attempt,
      { stage: 'spawn_result', result: 'failed', errorKind: 'internal_error' },
      'daemon',
    );
    handleTerminal('error');
    settleTerminal({ kind: 'error', error });
  });
  // Capture the activation URL/code/warning for the whole login (not just the
  // 250ms startup race) so readVelaLoginStatus can surface them. Start before
  // the grace wait so no early stdout is missed.
  activationCapture = beginLoginActivationCapture(child, deps.attempt);
  await waitForImmediateLoginFailure(activationCapture, terminal);
  if (deps.waitForActivation) {
    await waitForLoginActivationSteadyState(
      activationCapture,
      resolveLoginActivationGraceMs(baseEnv),
      terminal,
    );
  }
  spawnReturned = true;
  // vela opens the browser itself (OpenBrowser in apps/cli/.../login.go), but it
  // also prints the activation URL + code to stdout first and warns on stderr if
  // the auto-open failed. We capture those above and expose them via
  // readVelaLoginStatus() so the UI can offer a manual link when the browser
  // never opened. Callers still poll readVelaLoginStatus() to detect completion.
  return {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    profile: resolveAmrProfile(env),
    authAttemptId: deps.attempt.authAttemptId,
  };
}

export async function spawnVelaLogin(
  deps: SpawnVelaLoginDeps = {},
): Promise<SpawnedVelaLogin> {
  const attempt = beginVelaLoginAttempt();
  return spawnVelaLoginAttempt({ ...deps, attempt });
}

export async function spawnVelaLoginWithFallback(
  deps: SpawnVelaLoginWithFallbackDeps,
): Promise<SpawnedVelaLogin> {
  const attempt = beginVelaLoginAttempt(deps.authAttemptId, deps.authRequestId);
  const sharedSpawnDeps: SpawnVelaLoginDeps = {
    ...(deps.configuredEnv ? { configuredEnv: deps.configuredEnv } : {}),
    ...(deps.baseEnv ? { baseEnv: deps.baseEnv } : {}),
    ...(deps.attribution !== undefined ? { attribution: deps.attribution } : {}),
    ...(deps.correlationEnv ? { correlationEnv: deps.correlationEnv } : {}),
    ...(deps.waitForActivation !== undefined
      ? { waitForActivation: deps.waitForActivation }
      : {}),
  };
  const spawnProxy = async (): Promise<SpawnedVelaLogin> => {
    const current = currentVelaLoginAttempt(attempt);
    if (!current) throw new Error('vela login attempt is no longer active');
    current.fallbackStarted = true;
    current.fallbackPending = true;
    current.fallbackUsed = true;
    current.route = 'proxy';
    recordVelaAuthStage(
      attempt,
      { stage: 'attempt_started', result: 'started' },
      'daemon',
    );
    try {
      return await spawnVelaLoginAttempt({
        ...sharedSpawnDeps,
        defaultApiUrl: deps.proxyApiUrl,
        attempt,
      });
    } finally {
      const stillCurrent = currentVelaLoginAttempt(attempt);
      if (stillCurrent) stillCurrent.fallbackPending = false;
    }
  };

  try {
    return await spawnVelaLoginAttempt({
      ...sharedSpawnDeps,
      attempt,
      onLatePreActivationFailure: async () => {
        await spawnProxy();
      },
    });
  } catch (directErr) {
    const directMessage = directErr instanceof Error
      ? directErr.message
      : String(directErr);
    if (/already running|no longer active/i.test(directMessage)) throw directErr;
    return spawnProxy();
  }
}

function withDefaultVelaApiUrl(
  configuredEnv: Record<string, string>,
  baseEnv: NodeJS.ProcessEnv,
  defaultApiUrl: string | null | undefined,
): Record<string, string> {
  const trimmed = defaultApiUrl?.trim();
  if (!trimmed) return configuredEnv;
  if ((configuredEnv.VELA_API_URL ?? '').trim()) return configuredEnv;
  if ((baseEnv.VELA_API_URL ?? '').trim()) return configuredEnv;
  return { ...configuredEnv, VELA_API_URL: trimmed };
}

export function parseVelaLoginAttribution(input: unknown): AmrEntryAttribution | null {
  const raw = input && typeof input === 'object' && 'attribution' in input
    ? (input as { attribution?: unknown }).attribution
    : null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Partial<AmrEntryAttribution>;
  if (
    typeof value.entryId !== 'string'
    || value.entryId.length === 0
    || value.sourceProduct !== 'open_design'
    || typeof value.sourceDetail !== 'string'
    || !AMR_ENTRY_SOURCES.has(value.sourceDetail as TrackingAmrEntrySource)
    || typeof value.occurredAt !== 'string'
    || !Number.isFinite(Date.parse(value.occurredAt))
  ) {
    return null;
  }
  const odDeviceId = sanitizeOpenDesignDeviceId(value.odDeviceId);
  return {
    entryId: value.entryId,
    sourceProduct: value.sourceProduct,
    sourceDetail: value.sourceDetail as TrackingAmrEntrySource,
    occurredAt: value.occurredAt,
    ...(odDeviceId ? { odDeviceId } : {}),
  };
}

export function parseAmrEntryAnalyticsPayload(
  input: unknown,
): AmrEntryAnalyticsPayload | null {
  const raw = isRecord(input) && 'payload' in input ? input.payload : input;
  if (!isRecord(raw)) return null;
  const pageName = raw.pageName;
  const sourcePageName = raw.sourcePageName;
  const area = raw.area;
  const element = raw.element;
  const action = raw.action;
  const entryId = raw.entryId;
  const sourceProduct = raw.sourceProduct;
  const sourceDetail = raw.sourceDetail;
  const entryOccurredAt = raw.entryOccurredAt;
  const campaignId = raw.campaignId;
  const conversionSource = raw.conversionSource;
  const hasCampaignId = campaignId !== undefined;
  const hasConversionSource = conversionSource !== undefined;
  const odRole = sanitizeOptionalProfileValue(raw.odRole);
  const odOrgSize = sanitizeOptionalProfileValue(raw.odOrgSize);
  const odSource = sanitizeOptionalProfileValue(raw.odSource);
  const odUseCase = sanitizeOptionalProfileList(raw.odUseCase);
  if (
    pageName !== 'open_design'
    || typeof sourcePageName !== 'string'
    || !AMR_ENTRY_SOURCE_PAGES.has(sourcePageName as AmrEntrySourcePageName)
    || area !== 'amr_entry'
    || typeof element !== 'string'
    || !AMR_ENTRY_SOURCES.has(element as TrackingAmrEntrySource)
    || action !== 'click_amr_entry'
    || typeof entryId !== 'string'
    || entryId.length === 0
    || sourceProduct !== 'open_design'
    || typeof sourceDetail !== 'string'
    || !AMR_ENTRY_SOURCES.has(sourceDetail as TrackingAmrEntrySource)
    || sourceDetail !== element
    || sourcePageName
      !== AMR_ENTRY_SOURCE_PAGE_BY_SOURCE[sourceDetail as TrackingAmrEntrySource]
    || typeof entryOccurredAt !== 'string'
    || !Number.isFinite(Date.parse(entryOccurredAt))
    || (hasCampaignId
      && (typeof campaignId !== 'string'
        || !AMR_ENTRY_CAMPAIGN_IDS.has(campaignId as TrackingCampaignId)))
    || (hasConversionSource
      && (typeof conversionSource !== 'string'
        || !AMR_ENTRY_CAMPAIGN_CONVERSION_SOURCES.has(
          conversionSource as TrackingCampaignConversionSource,
        )))
    || odRole === INVALID_PROFILE_VALUE
    || odOrgSize === INVALID_PROFILE_VALUE
    || odSource === INVALID_PROFILE_VALUE
    || odUseCase === INVALID_PROFILE_VALUE
  ) {
    return null;
  }
  return {
    pageName,
    sourcePageName: sourcePageName as AmrEntrySourcePageName,
    area,
    element: element as TrackingAmrEntrySource,
    action,
    entryId,
    sourceProduct,
    sourceDetail: sourceDetail as TrackingAmrEntrySource,
    entryOccurredAt,
    ...(hasCampaignId ? { campaignId: campaignId as TrackingCampaignId } : {}),
    ...(hasConversionSource
      ? { conversionSource: conversionSource as TrackingCampaignConversionSource }
      : {}),
    ...(odRole ? { odRole } : {}),
    ...(odOrgSize ? { odOrgSize } : {}),
    ...(odUseCase ? { odUseCase } : {}),
    ...(odSource ? { odSource } : {}),
  };
}

export function parseAmrOnboardingProfileAnalyticsPayload(
  input: unknown,
): AmrOnboardingProfileAnalyticsPayload | null {
  const raw = isRecord(input) && 'payload' in input ? input.payload : input;
  if (!isRecord(raw)) return null;
  const pageName = raw.pageName;
  const sourcePageName = raw.sourcePageName;
  const area = raw.area;
  const element = raw.element;
  const action = raw.action;
  const entryId = raw.entryId;
  const sourceProduct = raw.sourceProduct;
  const sourceDetail = raw.sourceDetail;
  const entryOccurredAt = raw.entryOccurredAt;
  const profileOccurredAt = raw.profileOccurredAt;
  const odDeviceId = sanitizeOpenDesignDeviceId(raw.odDeviceId);
  const odRole = sanitizeOptionalProfileValue(raw.odRole);
  const odOrgSize = sanitizeOptionalProfileValue(raw.odOrgSize);
  const odSource = sanitizeOptionalProfileValue(raw.odSource);
  const odUseCase = sanitizeOptionalProfileList(raw.odUseCase);
  if (
    pageName !== 'open_design'
    || sourcePageName !== 'onboarding'
    || area !== 'onboarding'
    || element !== 'about_you_submit'
    || action !== 'submit_profile'
    || typeof entryId !== 'string'
    || entryId.length === 0
    || sourceProduct !== 'open_design'
    || typeof sourceDetail !== 'string'
    || !AMR_ENTRY_SOURCES.has(sourceDetail as TrackingAmrEntrySource)
    || !AMR_ONBOARDING_PROFILE_SOURCES.has(sourceDetail as TrackingAmrEntrySource)
    || typeof entryOccurredAt !== 'string'
    || !Number.isFinite(Date.parse(entryOccurredAt))
    || typeof profileOccurredAt !== 'string'
    || !Number.isFinite(Date.parse(profileOccurredAt))
    || odRole === INVALID_PROFILE_VALUE
    || odOrgSize === INVALID_PROFILE_VALUE
    || odSource === INVALID_PROFILE_VALUE
    || odUseCase === INVALID_PROFILE_VALUE
    || (!odRole && !odOrgSize && !odSource && !odUseCase)
  ) {
    return null;
  }
  return {
    pageName,
    sourcePageName,
    area,
    element,
    action,
    entryId,
    sourceProduct,
    sourceDetail: sourceDetail as TrackingAmrEntrySource,
    entryOccurredAt,
    profileOccurredAt,
    ...(odDeviceId ? { odDeviceId } : {}),
    ...(odRole ? { odRole } : {}),
    ...(odOrgSize ? { odOrgSize } : {}),
    ...(odUseCase ? { odUseCase } : {}),
    ...(odSource ? { odSource } : {}),
  };
}

// Optional profile values are open strings; we accept absent/undefined, reject
// a present-but-wrong type or an over-long value (matches AMR's 64-char cap),
// and otherwise pass the trimmed string through.
const INVALID_PROFILE_VALUE = Symbol('invalid_profile_value');

function sanitizeOptionalProfileValue(
  value: unknown,
): string | undefined | typeof INVALID_PROFILE_VALUE {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return INVALID_PROFILE_VALUE;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return INVALID_PROFILE_VALUE;
  return trimmed;
}

// useCase is multi-select: accept absent/undefined, reject a non-array or any
// element that fails the open-string check, cap the count (matches AMR's array
// bound), and pass the trimmed list through.
function sanitizeOptionalProfileList(
  value: unknown,
): string[] | undefined | typeof INVALID_PROFILE_VALUE {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > 20) return INVALID_PROFILE_VALUE;
  const cleaned: string[] = [];
  for (const entry of value) {
    const sanitized = sanitizeOptionalProfileValue(entry);
    if (sanitized === INVALID_PROFILE_VALUE || sanitized === undefined) {
      return INVALID_PROFILE_VALUE;
    }
    cleaned.push(sanitized);
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

function sanitizeOpenDesignDeviceId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > OD_DEVICE_ID_MAX_LENGTH) return null;
  return trimmed;
}

export async function mirrorAmrEntryAnalytics(
  payload: AmrEntryAnalyticsPayload,
  deps: MirrorAmrEntryAnalyticsDeps = {},
): Promise<MirrorAmrEntryAnalyticsResult> {
  return mirrorAmrAnalyticsEvent(buildAmrEntryAnalyticsCommon(payload, deps), payload, deps);
}

export async function mirrorAmrOnboardingProfileAnalytics(
  payload: AmrOnboardingProfileAnalyticsPayload,
  deps: MirrorAmrEntryAnalyticsDeps = {},
): Promise<MirrorAmrEntryAnalyticsResult> {
  return mirrorAmrAnalyticsEvent(
    buildAmrOnboardingProfileAnalyticsCommon(payload, deps),
    payload,
    deps,
  );
}

async function mirrorAmrAnalyticsEvent(
  common: Record<string, unknown>,
  payload: AmrEntryAnalyticsPayload | AmrOnboardingProfileAnalyticsPayload,
  deps: MirrorAmrEntryAnalyticsDeps,
): Promise<MirrorAmrEntryAnalyticsResult> {
  const fetchImpl = deps.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (!fetchImpl) return { mirrored: false };
  const env = deps.env ?? process.env;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AMR_ANALYTICS_TIMEOUT_MS);
  timeout.unref?.();
  try {
    const response = await fetchImpl(resolveAmrAnalyticsEventsUrl(env), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        events: [
          {
            common,
            payload,
          },
        ],
      }),
    });
    return { mirrored: response.ok, status: response.status };
  } catch (err) {
    return {
      mirrored: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function velaLoginAttributionEnv(
  attribution: AmrEntryAttribution | null | undefined,
): Record<string, string> {
  if (!attribution) return {};
  return {
    OPEN_DESIGN_AMR_ENTRY_ID: attribution.entryId,
    OPEN_DESIGN_AMR_ENTRY_SOURCE: attribution.sourceDetail,
    OPEN_DESIGN_AMR_ENTRY_AT: attribution.occurredAt,
    OPEN_DESIGN_AMR_ORIGIN: attribution.sourceProduct,
    ...(attribution.odDeviceId
      ? { OPEN_DESIGN_AMR_DEVICE_ID: attribution.odDeviceId }
      : {}),
  };
}

function buildAmrEntryAnalyticsCommon(
  payload: AmrEntryAnalyticsPayload,
  deps: MirrorAmrEntryAnalyticsDeps,
) {
  const context = deps.analyticsContext ?? null;
  const anonymousId = context?.deviceId?.trim() || payload.entryId;
  const sessionId = context?.sessionId?.trim() || payload.entryId;
  return {
    eventId: `od-amr-entry-${payload.entryId}`,
    eventTime: payload.entryOccurredAt,
    registryKey: 'open_design_amr_entry',
    eventName: 'amr_entry',
    eventType: 'click',
    platform: 'web',
    env: resolveAmrAnalyticsEnv(deps.env ?? process.env),
    userId: null,
    anonymousId,
    sessionId,
    appVersion: deps.appVersion ?? null,
    locale: context?.locale?.trim() || null,
    timezone: null,
    deviceType: null,
    browser: null,
    os: null,
    arch: null,
    cliVersion: null,
    traceId: payload.entryId,
    walletBalance: null,
  };
}

function buildAmrOnboardingProfileAnalyticsCommon(
  payload: AmrOnboardingProfileAnalyticsPayload,
  deps: MirrorAmrEntryAnalyticsDeps,
) {
  const context = deps.analyticsContext ?? null;
  const anonymousId =
    context?.deviceId?.trim() || payload.odDeviceId || payload.entryId;
  const sessionId = context?.sessionId?.trim() || payload.entryId;
  return {
    eventId: `od-onboarding-profile-${payload.entryId}`,
    eventTime: payload.profileOccurredAt,
    registryKey: 'open_design_onboarding_profile',
    eventName: 'onboarding_profile',
    eventType: 'result',
    platform: 'web',
    env: resolveAmrAnalyticsEnv(deps.env ?? process.env),
    userId: null,
    anonymousId,
    sessionId,
    appVersion: deps.appVersion ?? null,
    locale: context?.locale?.trim() || null,
    timezone: null,
    deviceType: null,
    browser: null,
    os: null,
    arch: null,
    cliVersion: null,
    traceId: payload.entryId,
    walletBalance: null,
  };
}

function resolveAmrAnalyticsEventsUrl(env: NodeJS.ProcessEnv): string {
  return env.OPEN_DESIGN_AMR_ANALYTICS_URL?.trim() || AMR_ANALYTICS_EVENTS_URL;
}

function resolveAmrAnalyticsEnv(env: NodeJS.ProcessEnv): AmrAnalyticsEnv {
  const raw = env.OPEN_DESIGN_AMR_ANALYTICS_ENV?.trim();
  if (raw && AMR_ANALYTICS_ENVS.has(raw as AmrAnalyticsEnv)) {
    return raw as AmrAnalyticsEnv;
  }
  if (env.NODE_ENV === 'production') return 'production';
  if (env.NODE_ENV === 'test') return 'test';
  return 'local';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
