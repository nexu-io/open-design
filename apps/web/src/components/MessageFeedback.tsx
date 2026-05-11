import { useEffect, useRef, useState } from 'react';

import { useT } from '../i18n';
import {
  useMessageFeedback,
  type FeedbackRating,
  type MessageFeedback as MessageFeedbackValue,
} from '../state/message-feedback';

interface Props {
  messageId: string;
  /**
   * Test seam: drop in a deterministic `Date.now()` so snapshot timing
   * isn't sensitive to wall-clock. Defaults to the real clock.
   */
  now?: () => number;
}

/**
 * Lightweight feedback widget rendered under each completed assistant
 * turn (issue #1288). The visibility gate (only after a successful
 * run) is the caller's responsibility — this component assumes it's
 * mounted at the right moment and always renders something.
 *
 * Lifecycle:
 *
 *   - **Idle.** Shows the helpful-prompt copy and two thumb buttons.
 *     Clicking either persists the rating immediately and flips to the
 *     submitted state.
 *
 *   - **Submitted positive.** Confirmation chip plus a Change button
 *     that clears the rating so the user can re-rate. Issue Open
 *     Question 2 ("should users be able to change feedback after
 *     submitting it?") — yes, the lightweight thing is to allow it.
 *
 *   - **Submitted negative.** Same confirmation chip plus an optional
 *     comment textarea. The comment is persisted on Send, so the
 *     reducer-style record is { rating: 'negative', comment, submittedAt }.
 *     A blank submit just confirms the comment area was acknowledged
 *     without changing the recorded value, matching the issue's
 *     "Optional follow-up reason or comment after negative feedback".
 *
 * Persistence is handled by `useMessageFeedback` (localStorage in v1;
 * see `state/message-feedback.ts` for the rationale).
 */
export function MessageFeedback({ messageId, now = Date.now }: Props) {
  const t = useT();
  const [feedback, setFeedback] = useMessageFeedback(messageId);
  // Seed the textarea from any saved comment at mount time so a
  // rehydrated negative feedback shows its prior text. The effect
  // below re-seeds on rating transitions (idle -> negative, or a
  // cross-mount sync flipping the rating) without overriding the
  // user's in-progress edits.
  const [draftComment, setDraftComment] = useState<string>(
    () => feedback?.comment ?? '',
  );
  const [commentJustSaved, setCommentJustSaved] = useState(false);
  const lastSeededRatingRef = useRef<FeedbackRating | null>(
    feedback?.rating ?? null,
  );

  // Re-seed draftComment whenever the rating itself transitions
  // (e.g. clearFeedback -> null -> negative again, or a cross-tab
  // update flips us into a different state). The dependency is
  // `feedback?.rating` specifically — NOT `feedback?.comment` —
  // because once the user types into the textarea we must not
  // override their draft with a stale saved comment. Cleared
  // comments (user erased the textarea then hit Send) deliberately
  // surface as an empty draft.
  useEffect(() => {
    const nextRating = feedback?.rating ?? null;
    if (nextRating !== lastSeededRatingRef.current) {
      lastSeededRatingRef.current = nextRating;
      setDraftComment(feedback?.comment ?? '');
      setCommentJustSaved(false);
    }
  }, [feedback?.rating, feedback?.comment]);

  const submitRating = (rating: FeedbackRating) => {
    const submittedAt = now();
    setFeedback({ rating, submittedAt });
    setCommentJustSaved(false);
  };

  const submitComment = () => {
    if (!feedback) return;
    const comment = draftComment.trim();
    const next: MessageFeedbackValue = {
      ...feedback,
      comment: comment || undefined,
      submittedAt: feedback.submittedAt,
    };
    setFeedback(next);
    setCommentJustSaved(true);
  };

  const clearFeedback = () => {
    setFeedback(null);
    setDraftComment('');
    setCommentJustSaved(false);
  };

  if (!feedback) {
    return (
      <div className="message-feedback" data-state="idle">
        <span className="message-feedback-prompt">{t('feedback.prompt')}</span>
        <div className="message-feedback-actions">
          <button
            type="button"
            className="message-feedback-button"
            aria-label={t('feedback.thumbsUp')}
            title={t('feedback.thumbsUp')}
            onClick={() => submitRating('positive')}
            data-testid="message-feedback-positive"
          >
            <span aria-hidden>👍</span>
          </button>
          <button
            type="button"
            className="message-feedback-button"
            aria-label={t('feedback.thumbsDown')}
            title={t('feedback.thumbsDown')}
            onClick={() => submitRating('negative')}
            data-testid="message-feedback-negative"
          >
            <span aria-hidden>👎</span>
          </button>
        </div>
      </div>
    );
  }

  const confirmationKey
    = feedback.rating === 'positive'
      ? 'feedback.submittedPositive'
      : 'feedback.submittedNegative';
  // Send is enabled when the textarea content differs from what's
  // already persisted. That covers three intents: writing a new
  // comment, editing an existing one, and clearing one (typed empty
  // -> Send -> comment removed). Disabling on draft === saved keeps
  // the button from being a no-op tap target.
  const savedComment = feedback.comment ?? '';
  const sendDisabled = draftComment === savedComment;

  return (
    <div
      className="message-feedback"
      data-state="submitted"
      data-rating={feedback.rating}
    >
      <span
        className="message-feedback-confirmation"
        role="status"
        aria-live="polite"
      >
        {t(confirmationKey)}
      </span>
      {feedback.rating === 'negative' ? (
        <div className="message-feedback-comment">
          <label className="message-feedback-comment-label">
            {t('feedback.commentLabel')}
            <textarea
              className="message-feedback-comment-input"
              placeholder={t('feedback.commentPlaceholder')}
              value={draftComment}
              onChange={(e) => {
                setDraftComment(e.target.value);
                if (commentJustSaved) setCommentJustSaved(false);
              }}
              data-testid="message-feedback-comment"
            />
          </label>
          <div className="message-feedback-comment-actions">
            <button
              type="button"
              className="message-feedback-comment-submit"
              onClick={submitComment}
              disabled={sendDisabled}
              data-testid="message-feedback-comment-submit"
            >
              {t('feedback.commentSubmit')}
            </button>
            {commentJustSaved ? (
              <span
                className="message-feedback-comment-saved"
                role="status"
                aria-live="polite"
              >
                {t('feedback.commentSaved')}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className="message-feedback-change"
        onClick={clearFeedback}
        data-testid="message-feedback-change"
      >
        {t('feedback.change')}
      </button>
    </div>
  );
}
