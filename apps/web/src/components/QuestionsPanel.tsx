import { useCallback, useEffect, useRef, useState } from 'react';
import { questionsFormTrackingId } from '@open-design/contracts/analytics';
import type { RunContextSelection, WorkspaceContextItem } from '@open-design/contracts';
import { useT } from '../i18n';
import { useAnalytics } from '../analytics/provider';
import { trackQuestionsFormClick, trackQuestionsFormSurfaceView } from '../analytics/events';
import type { QuestionForm } from '../artifacts/question-form';
import { uploadProjectFiles } from '../providers/registry';
import type { ChatAttachment } from '../types';
import {
  QuestionFormView,
  type QuestionFormFileSubmission,
  type QuestionFormHandle,
} from './QuestionForm';

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

// Form occurrences whose surface_view already fired. Same remount caveat as
// `revealedOccurrences`: the tab unmounts/remounts mid-stream, so dedupe the
// exposure by the stable per-occurrence key instead of component lifetime.
const viewedFormOccurrences = new Set<string>();

// Once the form is actionable, the user has this long before we auto-continue
// for them — submitting whatever they picked (unanswered questions count as
// skipped) so generation never stalls waiting on a reply.
const SKIP_COUNTDOWN_SECONDS = 10 * 60;
const QUESTION_FORM_DRAFT_STORAGE_PREFIX = 'open-design:question-form-draft:';

type QuestionFormAnswers = Record<string, string | string[]>;

interface QuestionFormSubmitPayload {
  attachments?: ChatAttachment[];
  context?: RunContextSelection;
}

interface Props {
  // Owning project, carried on every questions_form event. The Questions tab
  // host (FileWorkspace) always supplies it; it is optional only so bare
  // unit-test renders stay valid — tracking is skipped when absent.
  projectId?: string;
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
  onSubmit: (text: string, payload?: QuestionFormSubmitPayload) => void;
}

export function QuestionsPanel({
  projectId,
  form,
  formKey = null,
  interactive,
  submitDisabled = false,
  submittedAnswers,
  generating,
  onSubmit,
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  const formRef = useRef<QuestionFormHandle>(null);
  // What drove the next submit: the Continue CTA, the Skip button, or the
  // auto-continue countdown. Read (and reset) inside submitAndClearDraft so
  // the single submit chokepoint can label the click event.
  const submitSourceRef = useRef<'continue' | 'skip_button' | 'countdown'>('continue');
  const [ready, setReady] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Once the user commits an answer we optimistically lock the panel — disabling
  // Continue/Skip and showing a busy spinner — for the window before the
  // parent's busy/answered signals catch up (and across the async file upload).
  // Without it, a form-answer send that is still being dispatched leaves the CTA
  // enabled, so an impatient user (or the countdown) can re-fire it and pile
  // duplicate sends into the queue. The ref is the synchronous chokepoint guard;
  // the state drives rendering.
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const releaseSubmitLock = useCallback(() => {
    submittingRef.current = false;
    setSubmitting(false);
  }, []);
  const [draftAnswers, setDraftAnswers] = useState<QuestionFormAnswers | undefined>(() =>
    readQuestionFormDraft(formKey),
  );

  const total = form?.questions.length ?? 0;
  const answered = submittedAnswers !== undefined;

  // Exposure of the active (unanswered) form — once per occurrence, surviving
  // the tab's unmount/remount cycle via the module-level set.
  useEffect(() => {
    if (!form || answered || !projectId) return;
    const key = formKey ?? `${projectId}:${form.id}`;
    if (viewedFormOccurrences.has(key)) return;
    viewedFormOccurrences.add(key);
    trackQuestionsFormSurfaceView(analytics.track, {
      page_name: 'chat_panel',
      area: 'questions_form',
      project_id: projectId,
      form_id: questionsFormTrackingId(form.id),
    });
  }, [form, answered, formKey, projectId, analytics.track]);

  useEffect(() => {
    setDraftAnswers(readQuestionFormDraft(formKey));
  }, [formKey]);

  useEffect(() => {
    if (answered) clearQuestionFormDraft(formKey);
  }, [answered, formKey]);

  const updateDraftAnswers = useCallback(
    (answers: QuestionFormAnswers) => {
      setUploadError(null);
      setDraftAnswers(answers);
      writeQuestionFormDraft(formKey, answers);
    },
    [formKey],
  );

  // Tracks taskType/brand chip picks. Other questions (text, checkbox, …)
  // intentionally don't emit a click.
  const handleAnswerChange = useCallback(
    (questionId: string, value: string | string[]) => {
      if (!form || !projectId || typeof value !== 'string' || value.length === 0) return;
      const element =
        questionId === 'taskType'
          ? ('task_type_chip' as const)
          : questionId === 'brand'
            ? ('brand_bg_chip' as const)
            : null;
      if (!element) return;
      trackQuestionsFormClick(analytics.track, {
        page_name: 'chat_panel',
        area: 'questions_form',
        element,
        chip_id: questionsFormTrackingId(value),
        form_id: questionsFormTrackingId(form.id),
        project_id: projectId,
      });
    },
    [analytics.track, form, projectId],
  );

  // The single submit chokepoint — Continue, Skip and the countdown all land
  // here, so the submit/skip click is reported exactly once.
  const submitAndClearDraft = useCallback(
    async (
      text: string,
      answers: QuestionFormAnswers,
      fileSubmissions: QuestionFormFileSubmission[] = [],
    ) => {
      // Single-submit invariant: a form occurrence commits exactly one answer.
      // A repeat click, or the countdown racing a click, must not enqueue a
      // second send (see the "76 queued" repro). Released below if an upload
      // fails so the user can retry.
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      let attachments: ChatAttachment[] = [];
      let context: RunContextSelection | undefined;
      let submittedText = text;
      if (fileSubmissions.length > 0) {
        if (!projectId) {
          submitSourceRef.current = 'continue';
          setUploadError(t('questions.uploadNeedsProject'));
          releaseSubmitLock();
          return;
        }
        setUploadingFiles(true);
        setUploadError(null);
        const flatFiles = fileSubmissions.flatMap((submission) =>
          submission.files.map((file) => ({
            file,
            questionLabel: submission.questionLabel,
          })),
        );
        const result = await uploadProjectFiles(projectId, flatFiles.map((entry) => entry.file)).catch(
          (err) => ({
            uploaded: [],
            failed: flatFiles.map((entry) => ({
              name: entry.file.name,
              error: err instanceof Error ? err.message : String(err),
            })),
            error: err instanceof Error ? err.message : String(err),
          }),
        );
        setUploadingFiles(false);
        if (result.failed.length > 0 || result.uploaded.length !== flatFiles.length) {
          const failed = result.failed.length || Math.max(1, flatFiles.length - result.uploaded.length);
          const uploaded = result.uploaded.length;
          const detail = result.error ? ` (${result.error})` : '';
          submitSourceRef.current = 'continue';
          setUploadError(
            (uploaded > 0
              ? t('questions.uploadPartialFailed', { uploaded, failed })
              : t('questions.uploadFailed', { failed })) + detail,
          );
          releaseSubmitLock();
          return;
        }
        attachments = result.uploaded.map((attachment, index) => ({
          ...attachment,
          order: index,
        }));
        context = { workspaceItems: workspaceItemsForQuestionUploads(attachments) };
        submittedText = appendQuestionUploadSummary(submittedText, fileSubmissions, attachments);
      }
      const source = submitSourceRef.current;
      submitSourceRef.current = 'continue';
      if (form && projectId) {
        const total = form.questions.length;
        const answeredCount = form.questions.filter((q) => {
          const v = answers[q.id];
          return Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim().length > 0;
        }).length;
        trackQuestionsFormClick(analytics.track, {
          page_name: 'chat_panel',
          area: 'questions_form',
          ...(source === 'continue'
            ? { element: 'submit' as const }
            : {
                element: 'skip' as const,
                skip_source: (source === 'countdown' ? 'countdown' : 'button') as
                  | 'button'
                  | 'countdown',
              }),
          answered_count: answeredCount,
          skipped_count: total - answeredCount,
          form_id: questionsFormTrackingId(form.id),
          project_id: projectId,
        });
      }
      clearQuestionFormDraft(formKey);
      setDraftAnswers(undefined);
      setUploadError(null);
      if (attachments.length > 0 || context) {
        onSubmit(submittedText, {
          ...(attachments.length > 0 ? { attachments } : {}),
          ...(context ? { context } : {}),
        });
      } else {
        onSubmit(submittedText);
      }
    },
    [analytics.track, form, formKey, onSubmit, projectId, releaseSubmitLock, t],
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
  const canSubmit =
    !!form && interactive && !building && !submitDisabled && !uploadingFiles && !submitting;
  const canContinue = canSubmit && ready;
  const canSkip = canSubmit;

  // Release the optimistic lock once the world catches up: either the turn is
  // now busy (`submitDisabled` takes over the disable) or the answer has landed
  // (`answered`). This also recovers a form that never actually started a turn,
  // so it stays actionable instead of latching disabled forever.
  useEffect(() => {
    if (submitting && (submitDisabled || answered)) releaseSubmitLock();
  }, [submitting, submitDisabled, answered, releaseSubmitLock]);

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
      // Either branch reports as skip_source=countdown; answered_count tells
      // apart a countdown submit that carried picks from a pure skip.
      submitSourceRef.current = 'countdown';
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
              onAnswerChange={handleAnswerChange}
              onSubmit={(text, answers, files) => void submitAndClearDraft(text, answers, files)}
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
        <span className={`questions-panel-status${uploadError ? ' questions-panel-error' : ''}`}>
          {building
            ? t('questions.generating')
            : uploadingFiles
              ? t('questions.uploadingFiles')
              : uploadError
                ? uploadError
                : submitting
                  ? t('questions.submitting')
                  : canSkip
                    ? t('questions.autoSkipHint')
                    : null}
        </span>
        <button
          type="button"
          className="questions-skip"
          disabled={!canSkip}
          onClick={() => {
            submitSourceRef.current = 'skip_button';
            formRef.current?.skipAll();
          }}
        >
          {t('questions.skipAll')}
          {canSkip ? <span className="questions-skip-timer">{countdown}</span> : null}
        </button>
        <button
          type="button"
          className="questions-continue"
          disabled={!canContinue}
          aria-busy={submitting ? 'true' : undefined}
          onClick={() => {
            submitSourceRef.current = 'continue';
            formRef.current?.submit();
          }}
        >
          {submitting ? (
            <>
              <span className="questions-continue-spinner" aria-hidden />
              {t('questions.submitting')}
            </>
          ) : (
            t('questions.continue')
          )}
        </button>
      </div>
    </div>
  );
}

function questionFormDraftStorageKey(formKey: string | null | undefined): string | null {
  return formKey ? `${QUESTION_FORM_DRAFT_STORAGE_PREFIX}${formKey}` : null;
}

function workspaceItemsForQuestionUploads(attachments: ChatAttachment[]): WorkspaceContextItem[] {
  return attachments.map((attachment) => ({
    id: `file:${attachment.path}`,
    kind: 'file',
    label: attachment.path.split('/').filter(Boolean).pop() || attachment.name,
    path: attachment.path,
  }));
}

function appendQuestionUploadSummary(
  text: string,
  fileSubmissions: QuestionFormFileSubmission[],
  attachments: ChatAttachment[],
): string {
  if (attachments.length === 0) return text;
  const labelsByFileName = new Map<string, string[]>();
  for (const submission of fileSubmissions) {
    for (const file of submission.files) {
      const labels = labelsByFileName.get(file.name) ?? [];
      labels.push(submission.questionLabel);
      labelsByFileName.set(file.name, labels);
    }
  }
  const lines = ['[uploaded design files]'];
  attachments.forEach((attachment, index) => {
    const labels = labelsByFileName.get(attachment.name) ?? [];
    const prefix = labels[0] ? `${labels[0]}: ` : '';
    lines.push(`- ${prefix}${attachment.name} -> ${attachment.path}`);
    if (labels.length > 1) {
      lines.push(`  (also selected for: ${labels.slice(1).join(', ')})`);
    }
    if (!labels[0]) {
      lines[lines.length - 1] = `- Attachment ${index + 1}: ${attachment.name} -> ${attachment.path}`;
    }
  });
  return `${text}\n\n${lines.join('\n')}`;
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
