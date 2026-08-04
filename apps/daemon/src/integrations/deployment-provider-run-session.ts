import { randomUUID } from 'node:crypto';
import type { DeploymentProviderProfile } from './deployment-provider.js';
import { proxyDispatcherRequestInit } from '../connectionTest.js';

const DEPLOYMENT_PROVIDER_RUN_SESSION_TIMEOUT_MS = 10_000;
type DeploymentProviderRunErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE';

export type DeploymentProviderRunMetadataResult =
  | { ok: true; metadata?: Record<string, unknown> }
  | { ok: false; status: number; code: DeploymentProviderRunErrorCode; message: string };

function cleanProviderRunString(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  return raw.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 128) || null;
}

function cleanProviderRunStringOrDefault(value: unknown, fallback: string): string {
  return cleanProviderRunString(value) ?? fallback;
}

function existingMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

function validateProviderRunSessionUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Deployment provider run-session URL must use http or https.';
    }
    if (parsed.username || parsed.password) {
      return 'Deployment provider run-session URL must not include user info.';
    }
    return null;
  } catch {
    return 'Deployment provider run-session URL is invalid.';
  }
}

export async function deploymentProviderRunMetadata(
  profile: DeploymentProviderProfile,
  body: Record<string, unknown>,
  requestSignal?: AbortSignal,
): Promise<DeploymentProviderRunMetadataResult> {
  if (!profile.runSessionUrl) return { ok: true };
  if (profile.runCostCapUsd === undefined) {
    return {
      ok: false,
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Deployment provider run sessions require OD_PROVIDER_ORCHESTRATOR_RUN_COST_CAP_USD.',
    };
  }
  const runSessionUrlError = validateProviderRunSessionUrl(profile.runSessionUrl);
  if (runSessionUrlError) {
    return {
      ok: false,
      status: 400,
      code: 'BAD_REQUEST',
      message: runSessionUrlError,
    };
  }

  const projectId = cleanProviderRunString(body.projectId);
  if (!projectId) {
    return {
      ok: false,
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Deployment provider run sessions require projectId.',
    };
  }
  const runId = cleanProviderRunString(body.providerRunId);
  if (!runId) {
    return {
      ok: false,
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Deployment provider run sessions require providerRunId.',
    };
  }
  const operationId = cleanProviderRunString(body.providerOperationId);
  if (!operationId) {
    return {
      ok: false,
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Deployment provider run sessions require providerOperationId.',
    };
  }
  const purpose = cleanProviderRunStringOrDefault(body.providerRunPurpose, 'chat-completion');
  const requestBody: Record<string, unknown> = {
    od_project_id: projectId,
    od_run_id: runId,
    purpose,
    allowed_surfaces: ['reasoning'],
    max_total_cost_usd: profile.runMaxTotalCostUsd ?? profile.runCostCapUsd,
  };
  if (profile.runTtlSeconds !== undefined) {
    requestBody.ttl_seconds = Math.trunc(profile.runTtlSeconds);
  }

  const timeoutSignal = AbortSignal.timeout(DEPLOYMENT_PROVIDER_RUN_SESSION_TIMEOUT_MS);
  const signal = requestSignal
    ? AbortSignal.any([requestSignal, timeoutSignal])
    : timeoutSignal;
  const proxyDispatcher = proxyDispatcherRequestInit();
  try {
    const response = await fetch(profile.runSessionUrl, {
      ...proxyDispatcher.requestInit,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${profile.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      redirect: 'error',
      signal,
    });
    if (!response.ok) {
      const code = response.status === 401
        ? 'UNAUTHORIZED'
        : response.status === 403
          ? 'FORBIDDEN'
          : response.status === 429
            ? 'RATE_LIMITED'
            : 'UPSTREAM_UNAVAILABLE';
      return {
        ok: false,
        status: response.status,
        code,
        message: `Deployment provider run session failed: ${response.status}`,
      };
    }
    const session = await response.json().catch((): unknown => null);
    const runSessionId = (
      session &&
      typeof session === 'object' &&
      !Array.isArray(session) &&
      typeof (session as { run_session_id?: unknown }).run_session_id === 'string'
    )
      ? (session as { run_session_id: string }).run_session_id.trim()
      : '';
    if (!runSessionId) {
      return {
        ok: false,
        status: 502,
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Deployment provider run session response did not include run_session_id.',
      };
    }

    return {
      ok: true,
      metadata: {
        ...existingMetadata(body.metadata),
        opendesign_run_session_id: runSessionId,
        opendesign_cost_cap_usd: profile.runCostCapUsd,
        opendesign_idempotency_key: operationId,
        opendesign_operation_nonce: `nonce-${randomUUID()}`,
      },
    };
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'name' in err &&
      ((err as { name?: unknown }).name === 'AbortError' ||
        (err as { name?: unknown }).name === 'TimeoutError')
    ) {
      return {
        ok: false,
        status: 504,
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Deployment provider run session endpoint timed out.',
      };
    }
    return {
      ok: false,
      status: 502,
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'Deployment provider run session endpoint was unreachable.',
    };
  } finally {
    await proxyDispatcher.close();
  }
}
