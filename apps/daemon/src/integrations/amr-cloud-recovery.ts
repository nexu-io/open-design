import fs from 'node:fs';
import path from 'node:path';

import type { AmrCloudRecoveryOverlay } from '@open-design/contracts';

import {
  readVelaApiContext,
  type VelaApiContext,
} from './vela.js';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type RecoverySourceStatus =
  | 'active'
  | 'waiting_payment'
  | 'waiting_auto_topup'
  | 'retry_available'
  | 'resuming'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'blocked';

type RecoveryMode =
  | 'automatic_topup'
  | 'manual_topup'
  | 'manual_topup_required'
  | 'unknown';

interface StoredRecoveryContext {
  operationId: string;
  retryToken: string | null;
  status: RecoverySourceStatus;
  version: number | string | null;
  userId: string;
  runId: string;
  projectId: string | null;
  conversationId: string | null;
  assistantMessageId: string | null;
  mode: RecoveryMode;
  userVisible: boolean;
  resumeAttempts: number;
  pollAttempts: number;
  recoveryUrl: string | null;
  blockReason: string | null;
  restartAvailable: boolean;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
}

export interface AmrRecoveryRunRef {
  id: string;
  projectId?: string | null;
  conversationId?: string | null;
  assistantMessageId?: string | null;
}

export interface AmrCloudRecoveryService {
  prepareRun(input: {
    run: AmrRecoveryRunRef;
    env?: NodeJS.ProcessEnv;
    configuredEnv?: Record<string, string>;
    model?: string | null;
  }): Promise<AmrCloudRecoveryOverlay | null>;
  pauseForInsufficientBalance(input: {
    runId: string;
    env?: NodeJS.ProcessEnv;
    configuredEnv?: Record<string, string>;
  }): Promise<AmrCloudRecoveryOverlay | null>;
  refreshRun(input: {
    runId: string;
    env?: NodeJS.ProcessEnv;
    configuredEnv?: Record<string, string>;
  }): Promise<AmrCloudRecoveryOverlay | null>;
  resumeRun(input: {
    runId: string;
    env?: NodeJS.ProcessEnv;
    configuredEnv?: Record<string, string>;
  }): Promise<AmrCloudRecoveryOverlay | null>;
  markTerminal(input: {
    runId: string;
    terminal: 'complete' | 'fail' | 'cancel';
    env?: NodeJS.ProcessEnv;
    configuredEnv?: Record<string, string>;
  }): Promise<AmrCloudRecoveryOverlay | null>;
  cancelRun(input: {
    runId: string;
    env?: NodeJS.ProcessEnv;
    configuredEnv?: Record<string, string>;
  }): Promise<AmrCloudRecoveryOverlay | null>;
  rebindRun(input: {
    fromRunId: string;
    toRun: AmrRecoveryRunRef;
  }): AmrCloudRecoveryOverlay | null;
  markRestartAvailable(input: {
    runId: string;
    message?: string;
  }): AmrCloudRecoveryOverlay | null;
  getOverlayForRun(runId: string): AmrCloudRecoveryOverlay | null;
  getContextForRun(runId: string): StoredRecoveryContext | null;
}

export interface CreateAmrCloudRecoveryServiceDeps {
  dataDir: string;
  fetchImpl?: FetchLike;
  now?: () => number;
  logger?: Pick<Console, 'warn'>;
}

const STORE_DIR_NAME = 'amr-cloud-recovery';
const DEFAULT_EXPIRES_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_AUTO_POLL_ATTEMPTS = 12;
const MAX_RESUME_ATTEMPTS = 2;

function recoveryDir(dataDir: string): string {
  return path.join(dataDir, STORE_DIR_NAME);
}

function contextPath(dataDir: string, operationId: string): string {
  return path.join(recoveryDir(dataDir), `${encodeURIComponent(operationId)}.json`);
}

function ensureStore(dataDir: string): void {
  fs.mkdirSync(recoveryDir(dataDir), { recursive: true, mode: 0o700 });
}

function readJsonFile(file: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function writeContext(dataDir: string, context: StoredRecoveryContext): void {
  ensureStore(dataDir);
  const tmp = `${contextPath(dataDir, context.operationId)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(context, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, contextPath(dataDir, context.operationId));
}

function deleteContext(dataDir: string, operationId: string): void {
  try {
    fs.unlinkSync(contextPath(dataDir, operationId));
  } catch {
    // best effort
  }
}

function readContexts(dataDir: string): StoredRecoveryContext[] {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(recoveryDir(dataDir));
  } catch {
    return [];
  }
  const contexts: StoredRecoveryContext[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const parsed = readJsonFile(path.join(recoveryDir(dataDir), entry));
    const normalized = normalizeStoredContext(parsed);
    if (normalized) contexts.push(normalized);
  }
  return contexts;
}

function normalizeStoredContext(value: unknown): StoredRecoveryContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const operationId = readNonEmptyString(raw.operationId);
  const userId = readNonEmptyString(raw.userId);
  const runId = readNonEmptyString(raw.runId);
  if (!operationId || !userId || !runId) return null;
  const status = normalizeSourceStatus(raw.status);
  return {
    operationId,
    retryToken: readNullableString(raw.retryToken),
    status,
    version: readVersion(raw.version),
    userId,
    runId,
    projectId: readNullableString(raw.projectId),
    conversationId: readNullableString(raw.conversationId),
    assistantMessageId: readNullableString(raw.assistantMessageId),
    mode: normalizeMode(raw.mode),
    userVisible: raw.userVisible === true,
    resumeAttempts: readNonNegativeInt(raw.resumeAttempts),
    pollAttempts: readNonNegativeInt(raw.pollAttempts),
    recoveryUrl: readNullableString(raw.recoveryUrl),
    blockReason: readNullableString(raw.blockReason),
    restartAvailable: raw.restartAvailable === true,
    createdAt: readTimestamp(raw.createdAt),
    updatedAt: readTimestamp(raw.updatedAt),
    expiresAt: typeof raw.expiresAt === 'number' && Number.isFinite(raw.expiresAt)
      ? raw.expiresAt
      : null,
  };
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readVersion(value: unknown): number | string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function readTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Date.now();
}

function readNonNegativeInt(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

function normalizeSourceStatus(value: unknown): RecoverySourceStatus {
  switch (value) {
    case 'active':
    case 'waiting_payment':
    case 'waiting_auto_topup':
    case 'retry_available':
    case 'resuming':
    case 'completed':
    case 'failed':
    case 'canceled':
    case 'blocked':
      return value;
    default:
      return 'blocked';
  }
}

function normalizeMode(value: unknown): RecoveryMode {
  switch (value) {
    case 'automatic_topup':
    case 'manual_topup':
    case 'manual_topup_required':
    case 'unknown':
      return value;
    default:
      return 'unknown';
  }
}

function modeFromResponse(value: Record<string, unknown>): RecoveryMode {
  if (value.manualTopupRequired === true || value.manual_topup_required === true) {
    return 'manual_topup_required';
  }
  const rawMode = value.mode ?? value.recoveryMode ?? value.recovery_mode ?? value.topupMode ?? value.topup_mode;
  const normalized = normalizeMode(rawMode);
  if (normalized !== 'unknown') return normalized;
  if (value.autoTopup === true || value.auto_topup === true || value.automaticTopup === true) {
    return 'automatic_topup';
  }
  if (value.status === 'waiting_auto_topup') return 'automatic_topup';
  if (value.status === 'waiting_payment') return 'manual_topup';
  return 'unknown';
}

function responseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const data = raw.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return { ...raw, ...(data as Record<string, unknown>) };
  }
  return raw;
}

function contextFromResponse(input: {
  response: unknown;
  run: AmrRecoveryRunRef;
  userId: string;
  now: number;
  previous?: StoredRecoveryContext | null;
}): StoredRecoveryContext {
  const raw = responseObject(input.response);
  const operationId =
    readNonEmptyString(raw.operationId) ??
    readNonEmptyString(raw.operation_id) ??
    input.previous?.operationId;
  if (!operationId) throw new Error('AMR recovery response missing operationId');
  const retryToken =
    readNullableString(raw.retryToken) ??
    readNullableString(raw.retry_token) ??
    input.previous?.retryToken ??
    null;
  const status = normalizeSourceStatus(raw.status ?? input.previous?.status ?? 'active');
  const mode = modeFromResponse(raw);
  const previousMode = input.previous?.mode ?? 'unknown';
  return {
    operationId,
    retryToken,
    status,
    version: readVersion(raw.version) ?? input.previous?.version ?? null,
    userId:
      readNonEmptyString(raw.userId) ??
      readNonEmptyString(raw.user_id) ??
      input.userId,
    runId: input.run.id,
    projectId: input.run.projectId ?? input.previous?.projectId ?? null,
    conversationId: input.run.conversationId ?? input.previous?.conversationId ?? null,
    assistantMessageId: input.run.assistantMessageId ?? input.previous?.assistantMessageId ?? null,
    mode: mode !== 'unknown' ? mode : previousMode,
    userVisible: input.previous?.userVisible === true || status !== 'active',
    resumeAttempts: input.previous?.resumeAttempts ?? 0,
    pollAttempts: input.previous?.pollAttempts ?? 0,
    recoveryUrl:
      readNullableString(raw.recoveryUrl) ??
      readNullableString(raw.recovery_url) ??
      readNullableString(raw.walletUrl) ??
      input.previous?.recoveryUrl ??
      null,
    blockReason:
      readNullableString(raw.blockReason) ??
      readNullableString(raw.block_reason) ??
      readNullableString(raw.reason) ??
      input.previous?.blockReason ??
      null,
    restartAvailable: input.previous?.restartAvailable === true,
    createdAt: input.previous?.createdAt ?? input.now,
    updatedAt: input.now,
    expiresAt:
      typeof raw.expiresAt === 'number' && Number.isFinite(raw.expiresAt)
        ? raw.expiresAt
        : input.previous?.expiresAt ?? input.now + DEFAULT_EXPIRES_AFTER_MS,
  };
}

function stateFor(context: StoredRecoveryContext): AmrCloudRecoveryOverlay['state'] {
  if (context.restartAvailable) return 'recovering_restart_available';
  if (context.status === 'waiting_payment') return 'recovering_waiting_payment';
  if (context.status === 'waiting_auto_topup') return 'recovering_waiting_auto_topup';
  if (context.status === 'retry_available') return 'recovering_retry_available';
  if (context.status === 'resuming') return 'recovering_resuming';
  if (context.status === 'completed') return 'recovering_completed';
  if (context.status === 'canceled') return 'recovering_canceled';
  return 'recovering_blocked';
}

function actionFor(context: StoredRecoveryContext): AmrCloudRecoveryOverlay['userAction'] {
  if (context.restartAvailable) return 'restart_request';
  if (context.status === 'waiting_payment') return 'open_wallet';
  if (context.status === 'retry_available') {
    return context.mode === 'automatic_topup' ? 'none' : 'continue_request';
  }
  if (context.status === 'blocked') {
    return context.blockReason === 'wrong_user' ? 'switch_amr_user' : 'contact_support';
  }
  return 'none';
}

function messageFor(context: StoredRecoveryContext): string {
  if (context.restartAvailable) {
    return 'This AMR Cloud operation can no longer continue the original local run. Restart the request to continue.';
  }
  if (context.status === 'waiting_payment') {
    return 'AMR Cloud needs a manual top-up before this request can continue.';
  }
  if (context.status === 'waiting_auto_topup') {
    return 'AMR Cloud automatic top-up is in progress. Open Design will continue this request when retry is available.';
  }
  if (context.status === 'retry_available') {
    return context.mode === 'automatic_topup'
      ? 'AMR Cloud retry is available and Open Design is preparing to continue.'
      : 'AMR Cloud retry is available. Continue this request from Open Design; continuing may use AMR Cloud balance.';
  }
  if (context.status === 'resuming') return 'Open Design is continuing this AMR Cloud request.';
  if (context.status === 'canceled') return 'AMR Cloud Recovery was canceled for this request.';
  if (context.status === 'completed') return 'AMR Cloud Recovery completed.';
  return 'AMR Cloud blocked recovery for this request.';
}

function overlayFromContext(context: StoredRecoveryContext): AmrCloudRecoveryOverlay {
  const userAction = actionFor(context);
  const canResume =
    context.status === 'retry_available' &&
    context.mode !== 'automatic_topup' &&
    context.restartAvailable !== true;
  return {
    operationId: context.operationId,
    state: stateFor(context),
    sourceStatus: context.status,
    mode: context.mode,
    userAction,
    userActionRequired: userAction !== 'none',
    recoveryUrl: context.recoveryUrl,
    message: messageFor(context),
    blockReason: context.blockReason,
    restartAvailable: context.restartAvailable,
    canResume,
    canCancel:
      context.status !== 'completed' &&
      context.status !== 'failed' &&
      context.status !== 'canceled',
    updatedAt: context.updatedAt,
    expiresAt: context.expiresAt,
  };
}

async function postJson(
  fetchImpl: FetchLike,
  api: VelaApiContext,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const base = api.apiUrl.replace(/\/$/, '');
  const resp = await fetchImpl(`${base}${endpoint}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${api.runtimeKey}`,
    },
    body: JSON.stringify(body),
  });
  const parsed = await resp.json().catch(() => null);
  if (!resp.ok) {
    const message =
      responseObject(parsed).message ??
      responseObject(parsed).error ??
      `AMR Cloud recovery request failed with HTTP ${resp.status}`;
    throw new Error(String(message));
  }
  return parsed;
}

async function getJson(fetchImpl: FetchLike, api: VelaApiContext, endpoint: string): Promise<unknown> {
  const base = api.apiUrl.replace(/\/$/, '');
  const resp = await fetchImpl(`${base}${endpoint}`, {
    headers: { authorization: `Bearer ${api.runtimeKey}` },
  });
  const parsed = await resp.json().catch(() => null);
  if (!resp.ok) {
    const message =
      responseObject(parsed).message ??
      responseObject(parsed).error ??
      `AMR Cloud recovery request failed with HTTP ${resp.status}`;
    throw new Error(String(message));
  }
  return parsed;
}

function endpoint(operationId: string, suffix = ''): string {
  return `/api/v1/billing/recoveries/${encodeURIComponent(operationId)}${suffix}`;
}

function contextForRun(dataDir: string, runId: string): StoredRecoveryContext | null {
  return readContexts(dataDir)
    .filter((context) => context.runId === runId)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

function runRefFromContext(context: StoredRecoveryContext): AmrRecoveryRunRef {
  return {
    id: context.runId,
    projectId: context.projectId,
    conversationId: context.conversationId,
    assistantMessageId: context.assistantMessageId,
  };
}

function apiContextOrThrow(env?: NodeJS.ProcessEnv, configuredEnv?: Record<string, string>): VelaApiContext {
  const api = readVelaApiContext(env, configuredEnv);
  if (!api) throw new Error('AMR Cloud sign-in is required before recovery can be used.');
  return api;
}

function apiUserId(api: VelaApiContext): string {
  return api.user?.id || api.user?.email || 'env-auth-user';
}

export function createAmrCloudRecoveryService(
  deps: CreateAmrCloudRecoveryServiceDeps,
): AmrCloudRecoveryService {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => Date.now());
  const logger = deps.logger ?? console;
  const dataDir = deps.dataDir;

  async function refreshContext(
    context: StoredRecoveryContext,
    env?: NodeJS.ProcessEnv,
    configuredEnv?: Record<string, string>,
  ): Promise<StoredRecoveryContext> {
    const api = apiContextOrThrow(env, configuredEnv);
    if (context.userId && apiUserId(api) !== context.userId) {
      const next = {
        ...context,
        status: 'blocked' as RecoverySourceStatus,
        blockReason: 'wrong_user',
        updatedAt: now(),
      };
      writeContext(dataDir, next);
      return next;
    }
    const response = await getJson(fetchImpl, api, endpoint(context.operationId));
    const next = contextFromResponse({
      response,
      run: runRefFromContext(context),
      userId: context.userId,
      now: now(),
      previous: context,
    });
    writeContext(dataDir, next);
    return next;
  }

  return {
    async prepareRun(input) {
      const api = apiContextOrThrow(input.env, input.configuredEnv);
      const userId = apiUserId(api);
      const createdAt = now();
      const response = await postJson(fetchImpl, api, '/api/v1/billing/recoveries', {
        sourceProduct: 'open_design',
        runId: input.run.id,
        projectId: input.run.projectId ?? null,
        conversationId: input.run.conversationId ?? null,
        assistantMessageId: input.run.assistantMessageId ?? null,
        model: input.model ?? null,
      });
      const context = contextFromResponse({
        response,
        run: input.run,
        userId,
        now: createdAt,
      });
      writeContext(dataDir, { ...context, userVisible: false });
      return null;
    },

    async pauseForInsufficientBalance(input) {
      const context = contextForRun(dataDir, input.runId);
      if (!context) return null;
      const api = apiContextOrThrow(input.env, input.configuredEnv);
      const response = await postJson(fetchImpl, api, endpoint(context.operationId, '/insufficient-balance'), {
        version: context.version,
        retryToken: context.retryToken,
      });
      const next = contextFromResponse({
        response,
        run: runRefFromContext(context),
        userId: context.userId,
        now: now(),
        previous: { ...context, userVisible: true },
      });
      writeContext(dataDir, { ...next, userVisible: true });
      return overlayFromContext({ ...next, userVisible: true });
    },

    async refreshRun(input) {
      const context = contextForRun(dataDir, input.runId);
      if (!context) return null;
      try {
        return overlayFromContext(await refreshContext(context, input.env, input.configuredEnv));
      } catch (err) {
        logger.warn('[amr-recovery] refresh failed', err);
        return overlayFromContext(context);
      }
    },

    async resumeRun(input) {
      const context = contextForRun(dataDir, input.runId);
      if (!context) return null;
      const latest = await refreshContext(context, input.env, input.configuredEnv);
      if (latest.status !== 'retry_available') return overlayFromContext(latest);
      if (latest.resumeAttempts >= MAX_RESUME_ATTEMPTS) {
        const restart = {
          ...latest,
          restartAvailable: true,
          updatedAt: now(),
        };
        writeContext(dataDir, restart);
        return overlayFromContext(restart);
      }
      const api = apiContextOrThrow(input.env, input.configuredEnv);
      const response = await postJson(fetchImpl, api, endpoint(latest.operationId, '/resume'), {
        version: latest.version,
        retryToken: latest.retryToken,
      });
      const next = contextFromResponse({
        response,
        run: runRefFromContext(latest),
        userId: latest.userId,
        now: now(),
        previous: {
          ...latest,
          resumeAttempts: latest.resumeAttempts + 1,
          status: 'resuming',
        },
      });
      writeContext(dataDir, {
        ...next,
        status: next.status === 'retry_available' ? 'resuming' : next.status,
        userVisible: true,
        resumeAttempts: latest.resumeAttempts + 1,
      });
      return overlayFromContext(contextForRun(dataDir, input.runId)!);
    },

    async markTerminal(input) {
      const context = contextForRun(dataDir, input.runId);
      if (!context) return null;
      const terminalStatus =
        input.terminal === 'complete'
          ? 'completed'
          : input.terminal === 'cancel'
            ? 'canceled'
            : 'failed';
      try {
        const api = apiContextOrThrow(input.env, input.configuredEnv);
        await postJson(fetchImpl, api, endpoint(context.operationId, `/${input.terminal}`), {
          version: context.version,
          retryToken: context.retryToken,
        });
      } catch (err) {
        logger.warn('[amr-recovery] terminal update failed', err);
      }
      const next = {
        ...context,
        status: terminalStatus as RecoverySourceStatus,
        updatedAt: now(),
      };
      if (context.userVisible) {
        writeContext(dataDir, next);
        return overlayFromContext(next);
      }
      deleteContext(dataDir, context.operationId);
      return null;
    },

    async cancelRun(input) {
      const context = contextForRun(dataDir, input.runId);
      if (!context) return null;
      try {
        const api = apiContextOrThrow(input.env, input.configuredEnv);
        await postJson(fetchImpl, api, endpoint(context.operationId, '/cancel'), {
          version: context.version,
          retryToken: context.retryToken,
        });
      } catch (err) {
        logger.warn('[amr-recovery] cancel update failed', err);
      }
      const next = {
        ...context,
        status: 'canceled' as RecoverySourceStatus,
        updatedAt: now(),
      };
      writeContext(dataDir, next);
      return overlayFromContext(next);
    },

    rebindRun(input) {
      const context = contextForRun(dataDir, input.fromRunId);
      if (!context) return null;
      const next = {
        ...context,
        runId: input.toRun.id,
        projectId: input.toRun.projectId ?? context.projectId,
        conversationId: input.toRun.conversationId ?? context.conversationId,
        assistantMessageId: input.toRun.assistantMessageId ?? context.assistantMessageId,
        updatedAt: now(),
      };
      writeContext(dataDir, next);
      return overlayFromContext(next);
    },

    markRestartAvailable(input) {
      const context = contextForRun(dataDir, input.runId);
      if (!context) return null;
      const next = {
        ...context,
        status: 'blocked' as RecoverySourceStatus,
        blockReason: input.message ?? context.blockReason,
        restartAvailable: true,
        userVisible: true,
        updatedAt: now(),
      };
      writeContext(dataDir, next);
      return overlayFromContext(next);
    },

    getOverlayForRun(runId) {
      const context = contextForRun(dataDir, runId);
      return context && context.userVisible ? overlayFromContext(context) : null;
    },

    getContextForRun(runId) {
      return contextForRun(dataDir, runId);
    },
  };
}
