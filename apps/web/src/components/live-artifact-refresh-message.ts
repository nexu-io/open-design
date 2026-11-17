import type { Dict } from '../i18n/types';
import { LiveArtifactRefreshError } from '../providers/registry';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

/** User-facing message for a failed live-artifact refresh, shared by the
 *  viewer toolbar and the Design Files row action. */
export function refreshErrorMessage(error: unknown, t: TranslateFn): string {
  if (error instanceof LiveArtifactRefreshError && error.status === 0) {
    return t('liveArtifact.refresh.networkFailure');
  }
  if (error instanceof LiveArtifactRefreshError && error.code === 'LIVE_ARTIFACT_REFRESH_UNAVAILABLE') {
    return t('liveArtifact.refresh.noSourceTitle');
  }
  if (error instanceof Error && error.message.length > 0) return error.message;
  return t('liveArtifact.refresh.genericFailure');
}
