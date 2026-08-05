import type { Response } from 'express';
import {
  LiveArtifactRefreshLockError,
  LiveArtifactStoreValidationError,
} from '../live-artifacts/store.js';
import { LiveArtifactRefreshAbortError } from '../live-artifacts/refresh.js';
import { LiveArtifactRefreshUnavailableError } from '../live-artifacts/refresh-service.js';
import { ConnectorServiceError } from '../connectors/service.js';
import { sendApiError } from '../http/api-errors.js';

export function sendLiveArtifactRouteError(res: Response, err: unknown): Response {
  if (err instanceof LiveArtifactStoreValidationError) {
    return sendApiError(res, 400, 'LIVE_ARTIFACT_INVALID', err.message, {
      details: {
        kind: 'validation',
        issues: err.issues.map(({ path, message }) => ({ path, message })),
      },
    });
  }
  if (err instanceof LiveArtifactRefreshLockError) {
    return sendApiError(res, 409, 'REFRESH_LOCKED', err.message, {
      details: { artifactId: err.artifactId },
    });
  }
  if (err instanceof LiveArtifactRefreshUnavailableError) {
    return sendApiError(res, 400, 'LIVE_ARTIFACT_REFRESH_UNAVAILABLE', err.message);
  }
  if (err instanceof LiveArtifactRefreshAbortError) {
    return sendApiError(res, err.kind === 'cancelled' ? 499 : 504, 'LIVE_ARTIFACT_REFRESH_TIMEOUT', err.message, {
      details: { kind: err.kind, timeoutMs: err.timeoutMs ?? null, step: err.step ?? null },
    });
  }
  if (err instanceof ConnectorServiceError) {
    return sendApiError(res, err.status, err.code, err.message, err.details === undefined ? {} : { details: err.details });
  }
  if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
    return sendApiError(res, 404, 'LIVE_ARTIFACT_NOT_FOUND', 'live artifact not found');
  }
  return sendApiError(res, 500, 'LIVE_ARTIFACT_STORAGE_FAILED', String(err));
}
