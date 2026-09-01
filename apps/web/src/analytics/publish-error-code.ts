/**
 * Classify a failed publish/unpublish error into a stable, queryable analytics
 * code for `artifact_publish_result.error_code`.
 *
 * The publish flow already routes user-facing copy through
 * `publicFilePublishFailureKey` (apps/web/src/collab/public-file-publish.ts),
 * but that returns an i18n MESSAGE KEY — screen copy, not a metric value.
 * Analytics wants a code that stays stable when the copy key is renamed, so
 * this maps the one actionable failure (workspace identity could not be
 * confirmed) to its own code and buckets everything else. Only FIXED codes are
 * emitted — no message text can leak into analytics.
 *
 * Mirrors apps/web/src/analytics/deploy-error-code.ts (issue-#5220 pattern).
 */

import type { TrackingPublishErrorCode } from '@open-design/contracts/analytics';

import { publicFilePublishFailureKey } from '../collab/public-file-publish';

export function publishErrorCode(err: unknown): TrackingPublishErrorCode {
  return publicFilePublishFailureKey(err) === 'fileViewer.publishFileRequiresWorkspace'
    ? 'workspace_identity_required'
    : 'publish_failed';
}
