import { mediaFailureNextStep } from '@open-design/contracts';

import type { MediaTaskError } from './tasks.js';

/**
 * Build the persisted failure record for a media task.
 *
 * A media failure is the only thing the client has left to explain itself
 * with, so anything the producer proved must survive into the snapshot: the
 * stable `code` triage keys on, the optional `subject` naming what a safety
 * policy objected to, and `retryable` so the UI can stop inviting a retry that
 * cannot succeed. Absent fields stay absent rather than being defaulted —
 * `retryable: false` invented here would tell a user a transient outage is
 * permanent.
 *
 * `nextStep` is the one field this function derives rather than copies, and it
 * is the field a reader is meant to act on. Everything else describes the
 * failure; only `nextStep` answers "so what now?". It is computed from the RAW
 * failure, before `status` is defaulted to 400, so a missing upstream status
 * stays missing instead of being read as a bad request.
 *
 * Lives outside `routes/media.ts` because it is a pure function about media
 * failures, not about HTTP, and callers (tests included) should not have to
 * load the whole route module — and its Express/SQLite/blob-store dependency
 * graph — to classify one error.
 */
export function mediaTaskErrorFromFailure(
  err: any,
  context: { model?: string | undefined } = {},
): MediaTaskError {
  const subject = err?.subject;
  const retryable = err?.retryable;
  const code = typeof err?.code === 'string' && err.code.trim()
    ? err.code.trim()
    : undefined;
  const message = String(err && err.message ? err.message : err);
  return {
    message,
    status: typeof err?.status === 'number' ? err.status : 400,
    ...(code ? { code } : {}),
    ...(subject === 'prompt' || subject === 'input_image' || subject === 'output_image'
      ? { subject }
      : {}),
    ...(typeof retryable === 'boolean' ? { retryable } : {}),
    nextStep: mediaFailureNextStep({
      code,
      status: typeof err?.status === 'number' ? err.status : undefined,
      message,
      retryable: typeof retryable === 'boolean' ? retryable : undefined,
      model: context.model,
    }),
  };
}
