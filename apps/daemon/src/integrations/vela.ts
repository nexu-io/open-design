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
  'settings_amr_console',
  'settings_amr_install',
  'avatar_amr_console',
  'handoff_amr_website',
  'chat_error_authorize_retry',
  'chat_error_recharge',
  'chat_error_switch_retry_card',
  'generation_preview_authorize_retry',
  'generation_preview_recharge',
  'generation_preview_switch_retry_card',
]);

const AMR_ONBOARDING_PROFILE_SOURCES: ReadonlySet<TrackingAmrEntrySource> = new Set([
  'onboarding_amr_card',
  'onboarding_amr_sign_in_continue',
]);

type AmrEntrySourcePageName = Extract<
  TrackingPageName,
  'onboarding' | 'chat_panel' | 'settings' | 'file_manager' | 'artifact'
>;

const AMR_ENTRY_SOURCE_PAGES: ReadonlySet<AmrEntrySourcePageName> = new Set([
  'onboarding',
  'chat_panel',
  'settings',
  'file_manager',
  'artifact',
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
  settings_amr_console: 'settings',
  settings_amr_install: 'settings',
  avatar_amr_console: 'chat_panel',
  handoff_amr_website: 'artifact',
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
}

export interface VelaLoginStatus {
  loggedIn: boolean;
  loginInFlight: boolean;
  profile: string;
  user: VelaUser | null;
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
    return { loggedIn: true, loginInFlight, profile, user: null, configPath };
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

// Attach lifetime listeners that accumulate the child's stdout/stderr and keep
// re-parsing the activation URL/code/warning as output streams in. Unlike
// `waitForImmediateLoginFailure` (which only reads the first 250ms), this lives
// for the whole login so a slow CreateDeviceAuthorization round-trip — common on
// constrained networks, exactly where the browser handoff also tends to fail —
// still surfaces the URL once it finally prints.
function beginLoginActivationCapture(child: ChildProcess): VelaLoginActivationCapture {
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
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk) => {
    if (capture.stdout.length < LOGIN_CAPTURE_LIMIT_BYTES) {
      capture.stdout += String(chunk);
    }
    const parsed = parseVelaLoginActivation(capture.stdout, capture.stderr);
    if (parsed.activationUrl) activation.activationUrl = parsed.activationUrl;
    if (parsed.userCode) activation.userCode = parsed.userCode;
  });
  child.stderr?.on('data', (chunk) => {
    if (capture.stderr.length < LOGIN_CAPTURE_LIMIT_BYTES) {
      capture.stderr += String(chunk);
    }
    if (parseVelaLoginActivation('', capture.stderr).browserOpenFailed) {
      activation.browserOpenFailed = true;
    }
  });
  return capture;
}

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
  defaultApiUrl?: string | null;
  // When set, block until the direct attempt reaches device-auth steady state
  // (prints its activation URL) or exits/errors before that, so the login route
  // can fall back to the IPv4 proxy on a real pre-activation failure rather than
  // only on a sub-250ms startup crash. See waitForLoginActivationSteadyState.
  waitForActivation?: boolean;
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
  child: ChildProcess,
  capture: VelaLoginActivationCapture,
  graceMs: number,
): Promise<void> {
  if (capture.activation.activationUrl) return;
  if (!isChildRunning(child)) {
    if (child.exitCode === 0) return;
    const detail = (capture.stderr || capture.stdout).trim();
    throw new Error(
      detail ||
        `vela login exited before device authorization started (code ${child.exitCode ?? 'null'}, signal ${child.signalCode ?? 'null'})`,
    );
  }

  const result = await new Promise<
    | { kind: 'activated' }
    | { kind: 'exit'; code: number | null; signal: NodeJS.Signals | null }
    | { kind: 'error'; error: Error }
    | { kind: 'still-running' }
  >((resolve) => {
    let settled = false;
    let poll: NodeJS.Timeout | null = null;
    let timer: NodeJS.Timeout | null = null;
    const finish = (
      value:
        | { kind: 'activated' }
        | { kind: 'exit'; code: number | null; signal: NodeJS.Signals | null }
        | { kind: 'error'; error: Error }
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
    child.once('exit', (code, signal) => finish({ kind: 'exit', code, signal }));
    child.once('error', (error) => finish({ kind: 'error', error }));
    if (capture.activation.activationUrl) finish({ kind: 'activated' });
  });

  if (result.kind === 'activated') return;
  // Slow but still alive: leave the direct attempt running and let the request
  // return — do NOT kill it or fall back to the proxy.
  if (result.kind === 'still-running') return;
  if (result.kind === 'error') {
    throw new Error(`vela login failed to start: ${result.error.message}`);
  }
  if (result.code === 0) return;
  const detail = (capture.stderr || capture.stdout).trim();
  throw new Error(
    detail ||
      `vela login exited before device authorization started (code ${result.code ?? 'null'}, signal ${result.signal ?? 'null'})`,
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
  const configuredEnv = withDefaultVelaApiUrl(
    deps.configuredEnv ?? {},
    baseEnv,
    deps.defaultApiUrl,
  );
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
    activeLoginActivation = null;
  };
  child.once('exit', cleanup);
  child.once('error', cleanup);
  // Capture the activation URL/code/warning for the whole login (not just the
  // 250ms startup race) so readVelaLoginStatus can surface them. Start before
  // the grace wait so no early stdout is missed.
  const activationCapture = beginLoginActivationCapture(child);
  await waitForImmediateLoginFailure(child);
  if (deps.waitForActivation) {
    await waitForLoginActivationSteadyState(
      child,
      activationCapture,
      resolveLoginActivationGraceMs(baseEnv),
    );
  }
  // vela opens the browser itself (OpenBrowser in apps/cli/.../login.go), but it
  // also prints the activation URL + code to stdout first and warns on stderr if
  // the auto-open failed. We capture those above and expose them via
  // readVelaLoginStatus() so the UI can offer a manual link when the browser
  // never opened. Callers still poll readVelaLoginStatus() to detect completion.
  return {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    profile: resolveAmrProfile(env),
  };
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
