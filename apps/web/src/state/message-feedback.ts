/**
 * localStorage-backed feedback store for issue #1288.
 *
 * The acceptance criteria call for feedback that is "visually clear after
 * submission" and "leaves room for future feedback metadata, such as
 * reason, free-text comment, artifact id, task id, or Agent run id". We
 * persist locally rather than round-tripping through the daemon for v1
 * because:
 *
 *   1. The daemon's `messages` table is column-strict; adding a feedback
 *      column would require a schema migration plus a contract bump in
 *      `packages/contracts/src/api/chat.ts`. The team has not yet defined
 *      the analytics pipeline shape (lefarcen's clarifying comment on
 *      the issue), so persisting prematurely on the daemon would lock
 *      in a shape that may need to change.
 *
 *   2. Local storage matches the lightweight, non-blocking UX the issue
 *      asks for and survives reload, which is the minimum for the
 *      "feedback state is visually clear after submission" criterion.
 *      A future PR can replace the storage layer (or add a daemon
 *      mirror) without touching the React surface, since the hook's
 *      contract is just `(MessageFeedback | null, setter)`.
 *
 * Storage key shape: `open-design:message-feedback:<messageId>`. We
 * intentionally do not namespace by project / conversation since
 * `messageId` is already globally unique in the daemon's
 * `messages` table and the values would either match or be stale (in
 * which case the orphan entries are harmless 80-byte rows that the
 * browser GCs on its own quota policy).
 */

import { useEffect, useState } from 'react';

export type FeedbackRating = 'positive' | 'negative';

export interface MessageFeedback {
  rating: FeedbackRating;
  /** Optional free-text reason or comment, currently captured only for negative feedback. */
  comment?: string;
  /** Epoch ms for telemetry / "submitted at" labels. */
  submittedAt: number;
}

const STORAGE_PREFIX = 'open-design:message-feedback:';

function storageKey(messageId: string): string {
  return `${STORAGE_PREFIX}${messageId}`;
}

function safeWindow(): Window | null {
  return typeof window === 'undefined' ? null : window;
}

/**
 * Read the persisted feedback for a single message. Returns `null` when
 * nothing has been recorded yet, on storage errors, or on shape mismatch
 * (e.g. an older / future schema version landed in storage). Callers
 * treat any non-null result as authoritative.
 */
export function readMessageFeedback(messageId: string): MessageFeedback | null {
  const w = safeWindow();
  if (!w) return null;
  let raw: string | null;
  try {
    raw = w.localStorage.getItem(storageKey(messageId));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Record<string, unknown>;
    const rating = candidate.rating;
    if (rating !== 'positive' && rating !== 'negative') return null;
    const submittedAt = typeof candidate.submittedAt === 'number'
      ? candidate.submittedAt
      : Date.now();
    const comment = typeof candidate.comment === 'string'
      ? candidate.comment
      : undefined;
    return { rating, comment, submittedAt };
  } catch {
    return null;
  }
}

const FEEDBACK_EVENT_NAME = 'open-design:message-feedback';

interface FeedbackEventDetail {
  messageId: string;
  value: MessageFeedback | null;
}

/**
 * Persist or clear the feedback for a single message. Passing `null`
 * removes the entry so the UI flips back to the unsubmitted state and
 * the user can re-rate.
 *
 * The broadcast contract: a same-tab `open-design:message-feedback`
 * CustomEvent always fires with the new value in `detail.value`,
 * regardless of whether the underlying storage write succeeded.
 * Listeners apply the value directly instead of re-reading storage so
 * a setItem failure (private mode, quota exceeded, disabled storage)
 * does not clobber the in-memory confirmation the user just saw
 * (codex + lefarcen P2 on PR #1308). The clear path likewise emits the
 * broadcast so two mounted hooks for the same message return to idle
 * together when the user clicks Change (Siri-Ray + lefarcen P2 on
 * PR #1308).
 */
export function writeMessageFeedback(
  messageId: string,
  feedback: MessageFeedback | null,
): void {
  const w = safeWindow();
  if (!w) return;
  try {
    if (feedback === null) {
      w.localStorage.removeItem(storageKey(messageId));
    } else {
      w.localStorage.setItem(storageKey(messageId), JSON.stringify(feedback));
    }
  } catch {
    // Storage quota / disabled storage / private-mode rejection: the
    // UI keeps the in-memory state so the user still sees a confirmation
    // for this session. The broadcast below ensures every mounted hook
    // for this messageId picks up the new value from the event detail
    // even though `readMessageFeedback` would now return null.
  }
  try {
    const detail: FeedbackEventDetail = { messageId, value: feedback };
    w.dispatchEvent(new CustomEvent(FEEDBACK_EVENT_NAME, { detail }));
  } catch {
    /* IE-style CustomEvent shim missing — fine, single-mount remains correct */
  }
}

/**
 * React hook for a single message's feedback. Returns the current value
 * and a setter that updates both storage and any other mounted listeners
 * for the same messageId (e.g. when the same message renders in two
 * places, like the chat pane plus a debug panel).
 */
export function useMessageFeedback(
  messageId: string,
): [MessageFeedback | null, (next: MessageFeedback | null) => void] {
  const [value, setValue] = useState<MessageFeedback | null>(() =>
    readMessageFeedback(messageId),
  );

  // Keep two mounts of this hook for the same messageId in sync.
  // Cross-tab updates land via the platform `storage` event and we
  // re-read from storage to pick up the new value. Same-tab updates
  // land via our `open-design:message-feedback` CustomEvent and we
  // apply the broadcast value directly — re-reading from storage at
  // this point would clobber the in-memory state if the writer's
  // setItem call failed (private mode / quota / disabled storage).
  useEffect(() => {
    const w = safeWindow();
    if (!w) return;
    const onStorage = (evt: StorageEvent) => {
      if (evt.key !== null && evt.key !== storageKey(messageId)) return;
      setValue(readMessageFeedback(messageId));
    };
    const onCustom = (evt: Event) => {
      const detail = (evt as CustomEvent<FeedbackEventDetail>).detail;
      if (!detail || detail.messageId !== messageId) return;
      setValue(detail.value);
    };
    w.addEventListener('storage', onStorage);
    w.addEventListener(FEEDBACK_EVENT_NAME, onCustom);
    // Re-read on mount in case storage changed between the lazy init
    // and the effect attaching (rare, but cheap to cover).
    setValue(readMessageFeedback(messageId));
    return () => {
      w.removeEventListener('storage', onStorage);
      w.removeEventListener(FEEDBACK_EVENT_NAME, onCustom);
    };
  }, [messageId]);

  const set = (next: MessageFeedback | null): void => {
    setValue(next);
    writeMessageFeedback(messageId, next);
  };

  return [value, set];
}
