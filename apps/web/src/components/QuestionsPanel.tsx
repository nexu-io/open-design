import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import type { QuestionForm } from '../artifacts/question-form';
import { QuestionFormView, type QuestionFormHandle } from './QuestionForm';

// Surface one new question every this many ms. The agent often emits the whole
// form artifact in a single chunk, so we can't rely on the parse count
// trickling in — we always play this reveal client-side so the frame shows
// first and each question slides in after it.
const REVEAL_INTERVAL_MS = 280;

// Form occurrences whose one-by-one reveal has already played to completion.
// The Questions tab is conditionally mounted, so when the streaming assistant
// message is reconciled to its persisted copy the tab momentarily loses the
// form, unmounts the panel, then re-focuses and remounts it — which would
// otherwise reset `revealed` to 0 and replay the whole animation. Keyed by the
// host's stable per-occurrence id so a fresh form (new conversation) still
// animates while the same form never re-animates.
const revealedOccurrences = new Set<string>();

// Once the form is actionable, the user has this long before we auto-continue
// for them — submitting whatever they picked (unanswered questions count as
// skipped) so generation never stalls waiting on a reply.
const SKIP_COUNTDOWN_SECONDS = 120;
const QUESTION_FORM_DRAFT_STORAGE_PREFIX = 'open-design:question-form-draft:';

type QuestionFormAnswers = Record<string, string | string[]>;

interface Props {
  form: QuestionForm | null;
  // Stable id for this form occurrence. Lets the reveal survive a remount
  // (see `revealedOccurrences`) without re-animating.
  formKey?: string | null;
  // Whether the form is the active, unanswered one — it stays editable while
  // streaming and while the turn is busy, so it never flickers locked/unlocked.
  interactive: boolean;
  // The turn is busy (streaming/queued); keep Continue/Skip disabled while the
  // form itself stays editable.
  submitDisabled?: boolean;
  submittedAnswers?: Record<string, string | string[]>;
  // The assistant turn is still streaming the form — keep Continue disabled
  // and show the generating hint.
  generating: boolean;
  onSubmit: (text: string) => void;
}

export function QuestionsPanel({
  form,
  formKey = null,
  interactive,
  submitDisabled = false,
  submittedAnswers,
  generating,
  onSubmit,
}: Props) {
  const t = useT();
  const formRef = useRef<QuestionFormHandle>(null);
  const [ready, setReady] = useState(false);
  const [draftAnswers, setDraftAnswers] = useState<QuestionFormAnswers | undefined>(() =>
    readQuestionFormDraft(formKey),
  );

  const total = form?.questions.length ?? 0;
  const answered = submittedAnswers !== undefined;

  useEffect(() => {
    setDraftAnswers(readQuestionFormDraft(formKey));
  }, [formKey]);

  useEffect(() => {
    if (answered) clearQuestionFormDraft(formKey);
  }, [answered, formKey]);

  const updateDraftAnswers = useCallback(
    (answers: QuestionFormAnswers) => {
      setDraftAnswers(answers);
      writeQuestionFormDraft(formKey, answers);
    },
    [formKey],
  );

  const submitAndClearDraft = useCallback(
    (text: string) => {
      clearQuestionFormDraft(formKey);
      setDraftAnswers(undefined);
      onSubmit(text);
    },
    [formKey, onSubmit],
  );
  // If this occurrence already finished its reveal in a prior mount, show it in
  // full immediately rather than replaying the animation on remount.
  const [revealed, setRevealed] = useState(() =>
    formKey && revealedOccurrences.has(formKey) ? total : 0,
  );

  // Tick the visible question count up to the total, one at a time. This runs
  // regardless of whether the questions arrived incrementally or in one burst,
  // so the build-up is always visible. An already-answered (historical) form
  // shows everything at once — no reason to re-animate something the user sent.
  useEffect(() => {
    if (answered) {
      setRevealed(total);
      return;
    }
    if (revealed >= total) {
      // Reveal finished — remember it so a remount of this same occurrence
      // shows the form in full instead of animating again.
      if (formKey && total > 0) revealedOccurrences.add(formKey);
      return;
    }
    const id = window.setTimeout(
      () => setRevealed((n) => Math.min(n + 1, total)),
      REVEAL_INTERVAL_MS,
    );
    return () => window.clearTimeout(id);
  }, [answered, total, revealed, formKey]);

  const fullyRevealed = revealed >= total;
  const visibleCount = answered ? total : Math.min(revealed, total);
  const visibleForm = form
    ? { ...form, questions: form.questions.slice(0, visibleCount) }
    : null;
  // Still producing: the turn is streaming, OR we're mid reveal animation.
  const building = generating || (!answered && !fullyRevealed);

  // Submission needs the form present, active, fully revealed, and not blocked
  // by a busy/streaming turn. Required-field readiness is tracked separately by
  // `ready` (from QuestionForm) and gates Continue via `canContinue`.
  const canSubmit = !!form && interactive && !building && !submitDisabled;
  const canContinue = canSubmit && ready;
  const canSkip = canSubmit;

  // Auto-skip countdown. It only runs while the form is actionable; pausing
  // (busy turn, re-stream) resets it so we never auto-submit a half-ready form.
  const [remaining, setRemaining] = useState(SKIP_COUNTDOWN_SECONDS);
  const autoFiredRef = useRef(false);

  useEffect(() => {
    if (!canSubmit) {
      setRemaining(SKIP_COUNTDOWN_SECONDS);
      autoFiredRef.current = false;
      return;
    }
    const id = window.setInterval(() => {
      setRemaining((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [canSubmit]);

  // When the countdown elapses, continue with the current selections (anything
  // untouched submits as skipped) and let generation proceed.
  useEffect(() => {
    if (canSubmit && remaining <= 0 && !autoFiredRef.current) {
      autoFiredRef.current = true;
      // Honour the user's picks when the form is submittable; otherwise fall
      // back to skipping so a stray selection-cap can't stall generation.
      if (ready) formRef.current?.submit();
      else formRef.current?.skipAll();
    }
  }, [canSubmit, ready, remaining]);

  const countdown = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;

  return (
    <div className="questions-panel" data-testid="questions-panel">
      <div className="questions-panel-body">
        {visibleForm ? (
          <>
            <QuestionFormView
              ref={formRef}
              form={visibleForm}
              interactive={interactive}
              submittedAnswers={submittedAnswers}
              draftAnswers={draftAnswers}
              hideInternalSubmit
              onReadyChange={setReady}
              onDraftChange={updateDraftAnswers}
              onSubmit={(text) => submitAndClearDraft(text)}
            />
            {building ? (
              <div className="questions-panel-typing" aria-hidden>
                <span className="questions-panel-dot" />
                <span className="questions-panel-dot" />
                <span className="questions-panel-dot" />
              </div>
            ) : null}
          </>
        ) : (
          <div className="questions-panel-skeleton">{t('questions.generating')}</div>
        )}
      </div>
      <div className="questions-panel-foot">
        <span className="questions-panel-status">
          {building
            ? t('questions.generating')
            : canSkip
              ? t('questions.autoSkipHint')
              : null}
        </span>
        <button
          type="button"
          className="questions-skip"
          disabled={!canSkip}
          onClick={() => formRef.current?.skipAll()}
        >
          {t('questions.skipAll')}
          {canSkip ? <span className="questions-skip-timer">{countdown}</span> : null}
        </button>
        <button
          type="button"
          className="questions-continue"
          disabled={!canContinue}
          onClick={() => formRef.current?.submit()}
        >
          {t('questions.continue')}
        </button>
      </div>
    </div>
  );
}

function questionFormDraftStorageKey(formKey: string | null | undefined): string | null {
  return formKey ? `${QUESTION_FORM_DRAFT_STORAGE_PREFIX}${formKey}` : null;
}

function readQuestionFormDraft(formKey: string | null | undefined): QuestionFormAnswers | undefined {
  const key = questionFormDraftStorageKey(formKey);
  if (!key || typeof window === 'undefined') return undefined;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const out: QuestionFormAnswers = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        out[id] = value;
      } else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        out[id] = value;
      }
    }
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

function writeQuestionFormDraft(
  formKey: string | null | undefined,
  answers: QuestionFormAnswers,
): void {
  const key = questionFormDraftStorageKey(formKey);
  if (!key || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(answers));
  } catch {
    // Losing an in-progress draft is preferable to blocking form input when
    // browser storage is unavailable.
  }
}

function clearQuestionFormDraft(formKey: string | null | undefined): void {
  const key = questionFormDraftStorageKey(formKey);
  if (!key || typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage failures; the submitted answer message is authoritative.
  }
}
