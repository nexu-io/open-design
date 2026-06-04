import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { createCommandInvocation } from '@open-design/platform';
import type {
  AmrEntryAttribution,
  TrackingAmrEntrySource,
  TrackingPageName,
} from '@open-design/contracts/analytics';

import { resolveAgentLaunch } from '../runtimes/launch.js';
import { spawnEnvForAgent } from '../runtimes/env.js';
import { getAgentDef } from '../runtimes/registry.js';
import { resolveAmrProfile } from './vela-profile.js';

export { resolveAmrProfile } from './vela-profile.js';

const AMR_ENTRY_SOURCES: ReadonlySet<TrackingAmrEntrySource> = new Set([
  'onboarding_amr_card',
  'onboarding_amr_sign_in_continue',
  'inline_model_switcher_amr_row',
  'settings_amr_agent_card',
  'settings_amr_authorize',
  'chat_error_authorize_retry',
  'chat_error_recharge',
  'chat_error_switch_retry_card',
  'generation_preview_authorize_retry',
  'generation_preview_recharge',
  'generation_preview_switch_retry_card',
]);

type AmrEntrySourcePageName = Extract<
  TrackingPageName,
  'onboarding' | 'chat_panel' | 'settings' | 'file_manager'
>;

const AMR_ENTRY_SOURCE_PAGES: ReadonlySet<AmrEntrySourcePageName> = new Set([
  'onboarding',
  'chat_panel',
  'settings',
  'file_manager',
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
  chat_error_authorize_retry: 'chat_panel',
  chat_error_recharge: 'chat_panel',
  chat_error_switch_retry_card: 'chat_panel',
  generation_preview_authorize_retry: 'file_manager',
  generation_preview_recharge: 'file_manager',
  generation_preview_switch_retry_card: 'file_manager',
};

const AMR_ANALYTICS_EVENTS_URL =
  'https://amr-api.open-design.ai/api/v1/analytics/events';
const AMR_ANALYTICS_TIMEOUT_MS = 1500;

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
}

export interface VelaLoginStatus {
  loggedIn: boolean;
  loginInFlight: boolean;
  profile: string;
  user: VelaUser | null;
  configPath: string;
}

export interface VelaCredentialRevision {
  authSource: 'env' | 'file' | 'none';
  profile: string;
  loggedIn: boolean;
  userId: string;
  userEmail: string;
  configMtimeMs: number | null;
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

export function readVelaLoginStatus(
  env: NodeJS.ProcessEnv = process.env,
  configuredEnv: Record<string, string> = {},
): VelaLoginStatus {
  const mergedEnv = mergeVelaEnv(env, configuredEnv);
  const profile = resolveAmrProfile(mergedEnv);
  const configPath = amrConfigPath();
  const loginInFlight = isVelaLoginInFlight();
  const runtimeKey = mergedEnv.VELA_RUNTIME_KEY?.trim() ?? '';
  const linkUrl = mergedEnv.VELA_LINK_URL?.trim() ?? '';
  if (runtimeKey && linkUrl) {
    return { loggedIn: true, loginInFlight, profile, user: null, configPath };
  }
  const file = readConfigFile();
  const stored = file?.profiles?.[profile];
  const storedRuntimeKey = stored?.runtimeKey?.trim() ?? '';
  if (!storedRuntimeKey) {
    return { loggedIn: false, loginInFlight, profile, user: null, configPath };
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
  return { loggedIn: true, loginInFlight, profile, user, configPath };
}

export function readVelaCredentialRevision(
  env: NodeJS.ProcessEnv = process.env,
  configuredEnv: Record<string, string> = {},
): VelaCredentialRevision {
  const mergedEnv = mergeVelaEnv(env, configuredEnv);
  const status = readVelaLoginStatus(env, configuredEnv);
  const hasEnvCredentials =
    (mergedEnv.VELA_RUNTIME_KEY?.trim() ?? '').length > 0 &&
    (mergedEnv.VELA_LINK_URL?.trim() ?? '').length > 0;
  return {
    authSource: hasEnvCredentials ? 'env' : status.loggedIn ? 'file' : 'none',
    profile: status.profile,
    loggedIn: status.loggedIn,
    userId: status.user?.id ?? '',
    userEmail: status.user?.email ?? '',
    configMtimeMs:
      hasEnvCredentials || !existsSync(status.configPath)
        ? null
        : statSync(status.configPath).mtimeMs,
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
}

const activeLoginProcs = new Map<number, ChildProcess>();
const LOGIN_STARTUP_GRACE_MS = 250;
const LOGIN_CANCEL_KILL_GRACE_MS = 2000;

function isChildRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

export function isVelaLoginInFlight(): boolean {
  for (const [pid, child] of activeLoginProcs) {
    if (isChildRunning(child)) return true;
    activeLoginProcs.delete(pid);
  }
  return false;
}

export interface CancelVelaLoginResult {
  canceled: boolean;
  pids: number[];
}

export function cancelVelaLogin(): CancelVelaLoginResult {
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
  return { canceled: pids.length > 0, pids };
}

export interface SpawnVelaLoginDeps {
  configuredEnv?: Record<string, string>;
  baseEnv?: NodeJS.ProcessEnv;
  attribution?: AmrEntryAttribution | null;
}

async function waitForImmediateLoginFailure(child: ChildProcess): Promise<void> {
  let stderr = '';
  let stdout = '';
  child.stderr?.setEncoding('utf8');
  child.stdout?.setEncoding('utf8');
  child.stderr?.on('data', (chunk) => {
    if (stderr.length < 4096) stderr += String(chunk);
  });
  child.stdout?.on('data', (chunk) => {
    if (stdout.length < 4096) stdout += String(chunk);
  });

  const result = await new Promise<
    | { kind: 'running' }
    | { kind: 'exit'; code: number | null; signal: NodeJS.Signals | null }
    | { kind: 'error'; error: Error }
  >((resolve) => {
    let settled = false;
    const finish = (
      value:
        | { kind: 'running' }
        | { kind: 'exit'; code: number | null; signal: NodeJS.Signals | null }
        | { kind: 'error'; error: Error },
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(
      () => finish({ kind: 'running' }),
      LOGIN_STARTUP_GRACE_MS,
    );
    child.once('exit', (code, signal) => finish({ kind: 'exit', code, signal }));
    child.once('error', (error) => finish({ kind: 'error', error }));
  });

  if (result.kind === 'running') return;
  if (result.kind === 'error') {
    throw new Error(`vela login failed to start: ${result.error.message}`);
  }
  if (result.code === 0) return;
  const detail = (stderr || stdout).trim();
  throw new Error(
    detail ||
      `vela login exited before authentication completed (code ${result.code ?? 'null'}, signal ${result.signal ?? 'null'})`,
  );
}

export async function spawnVelaLogin(
  deps: SpawnVelaLoginDeps = {},
): Promise<SpawnedVelaLogin> {
  if (isVelaLoginInFlight()) {
    throw new Error('vela login already running');
  }
  const def = getAgentDef('amr');
  if (!def) throw new Error('AMR runtime def not registered');
  const baseEnv = deps.baseEnv ?? process.env;
  const configuredEnv = deps.configuredEnv ?? {};
  const launch = resolveAgentLaunch(def, configuredEnv);
  const bin = launch.selectedPath;
  if (!bin) {
    throw new Error('vela binary not found; install vela or configure VELA_BIN');
  }
  const env = {
    ...spawnEnvForAgent('amr', baseEnv, configuredEnv),
    ...velaLoginAttributionEnv(deps.attribution),
  };
  // Route through createCommandInvocation so an npm/Node-style `vela.cmd` or
  // `vela.bat` shim on Windows gets wrapped under `cmd.exe /d /s /c …` with
  // verbatim args, matching what `execAgentFile` / chat-run spawning do. A
  // direct `spawn(bin, args)` on a `.cmd` shim quietly fails to find the
  // shim's actual entry point. POSIX is unchanged (no wrapping needed).
  const invocation = createCommandInvocation({ command: bin, args: ['login'], env });
  const child = spawn(invocation.command, invocation.args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
    detached: false,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
  if (typeof child.pid !== 'number') {
    throw new Error('failed to spawn vela login');
  }
  activeLoginProcs.set(child.pid, child);
  const cleanup = () => {
    if (typeof child.pid === 'number') activeLoginProcs.delete(child.pid);
  };
  child.once('exit', cleanup);
  child.once('error', cleanup);
  await waitForImmediateLoginFailure(child);
  // We don't surface URL/code in this API — vela CLI opens the browser itself
  // (via OpenBrowser in apps/cli/internal/commands/login.go). Callers poll
  // readVelaLoginStatus() to detect completion.
  return {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    profile: resolveAmrProfile(env),
  };
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
  return {
    entryId: value.entryId,
    sourceProduct: value.sourceProduct,
    sourceDetail: value.sourceDetail as TrackingAmrEntrySource,
    occurredAt: value.occurredAt,
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
  };
}

export async function mirrorAmrEntryAnalytics(
  payload: AmrEntryAnalyticsPayload,
  deps: MirrorAmrEntryAnalyticsDeps = {},
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
            common: buildAmrEntryAnalyticsCommon(payload, deps),
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
