/**
 * A per-page-load identifier, attached to every Studio event from BOTH
 * transports (`studio:*` via utils/studioTelemetry.ts, `studio_*` via
 * telemetry/system.ts).
 *
 * Why it exists: `distinct_id` identifies a browser, not a page. Several
 * investigations have stalled on "two tabs or one tab switching?" — a burst of
 * events alternating between two project hashes is indistinguishable from a
 * user moving between projects, and `session_start` fires once per page LOAD
 * (main.tsx), so counting it cannot tell them apart either. Nothing in the
 * payload named the page. This does.
 *
 * Semantics, stated plainly because the name invites the wrong reading: one id
 * per PAGE LOAD. A hard reload mints a new one. It is not "the same tab across
 * reloads" — that is a different, harder question, and nobody has needed it yet.
 *
 * Deliberately not persisted. Storage would survive a reload and turn this into
 * a tab-session id, silently changing what every query means; and a blocked or
 * cleared storage would make the property intermittently absent, which reads as
 * "old client" rather than "storage unavailable".
 *
 * Memoized like agentRuntime.ts and distinctId.ts: fixed for the life of the
 * page, so a per-event caller does not pay for generation on every emit.
 */

import { generateId } from "../utils/generateId";

let cached: string | null = null;

/** The page's id. Generated once, on first read. */
export function resolveTabId(): string {
  if (cached === null) cached = generateId();
  return cached;
}

/** The same value as a telemetry property, for the `studio_*` transport's meta. */
export function tabIdProperty(): string {
  return resolveTabId();
}

/** Test seam: the memo would otherwise leak between cases in one module load. */
export function resetTabIdForTests(): void {
  cached = null;
}
