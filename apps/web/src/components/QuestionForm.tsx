import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-design/components';
import { tForLanguageTag, useT } from '../i18n';
import type { DirectionCard, FormOption, QuestionForm } from '../artifacts/question-form';
import { formatFormAnswers, formOptionValueForLabel } from '../artifacts/question-form';
import {
  visualStyleCardsForContext,
  type VisualStyleCard,
  type VisualStyleCategory,
  type VisualStyleContext,
  type VisualStyleVariant,
} from '../runtime/visual-style-catalog';
import { Icon } from './Icon';

export type QuestionFormInteraction =
  | {
      element: 'visual_style_card';
      questionId: string;
      styleId: string;
      styleContext: VisualStyleContext;
      source: 'inline' | 'gallery';
    }
  | {
      element: 'visual_style_refresh' | 'visual_style_gallery_open';
      questionId: string;
      styleContext: VisualStyleContext;
    }
  | {
      element: 'visual_style_category_tab';
      questionId: string;
      styleContext: VisualStyleContext;
      categoryId: 'all' | 'business' | 'editorial' | 'creative' | 'minimal';
    }
  | {
      element: 'step_back' | 'step_next' | 'step_skip';
      questionId: string;
      stepIndex: number;
      stepCount: number;
    };

const OPTIONAL_FORM_AUTO_CONTINUE_SECONDS = 10 * 60;

interface Props {
  form: QuestionForm;
  // Whether the user can still submit answers. The owning AssistantMessage
  // disables the form when the assistant turn is no longer the most recent
  // one (i.e. the user has already moved past it).
  interactive: boolean;
  // Pre-existing answers — when we detect a follow-up user message that
  // begins with "[form answers — <id>]", we parse it back out and pass it
  // here so the rendered form reflects what was sent.
  submittedAnswers?: Record<string, string | string[]>;
  // Embedded hosts may own submission, so the form can hide its footer and
  // report draft/readiness state outward.
  hideInternalSubmit?: boolean;
  draftAnswers?: Record<string, string | string[]>;
  onReadyChange?: (ready: boolean) => void;
  onDraftChange?: (answers: Record<string, string | string[]>) => void;
  // Fires on each real user interaction with a single question (locked forms
  // never reach it), allowing the host to track finite-choice picks.
  onAnswerChange?: (questionId: string, value: string | string[]) => void;
  onInteraction?: (interaction: QuestionFormInteraction) => void;
  onSubmit?: (
    text: string,
    answers: Record<string, string | string[]>,
    source: 'submit' | 'skip' | 'auto',
    files?: QuestionFormFileSubmission[],
  ) => void;
  submitDisabled?: boolean;
  visualStyleContext?: VisualStyleContext;
  // Optional paths can move on after the timeout. A required answer never
  // becomes a skipped answer merely because the form was left unattended.
  autoContinueAfterTimeout?: boolean;
}

export interface QuestionFormFileSubmission {
  questionId: string;
  questionLabel: string;
  files: File[];
}

// Lets an embedding host trigger submission.
export interface QuestionFormHandle {
  submit: () => void;
  // Submit with no answers — backs the "skip all" affordance. Every question
  // is optional, so this just records each as "(skipped)" and moves on.
  skipAll: () => void;
}

export const QuestionFormView = forwardRef<QuestionFormHandle, Props>(function QuestionFormView(
  {
    form,
    interactive,
    submittedAnswers,
    hideInternalSubmit = false,
    draftAnswers,
    onReadyChange,
    onDraftChange,
    onAnswerChange,
    onInteraction,
    onSubmit,
    submitDisabled = false,
    visualStyleContext,
    autoContinueAfterTimeout = false,
  },
  ref,
) {
  const uiT = useT();
  // Host strings inside the card follow the form's declared content language
  // (`form.lang`, set by the model alongside the localized labels) so a
  // Chinese form in an English UI doesn't mix scripts; without a resolvable
  // tag they follow the app UI locale as before.
  const t = useMemo(() => tForLanguageTag(form.lang) ?? uiT, [form.lang, uiT]);
  const initial = useMemo(
    () => buildInitialState(form, submittedAnswers, draftAnswers, visualStyleContext),
    [form, submittedAnswers, draftAnswers, visualStyleContext],
  );
  const [answers, setAnswers] = useState<Record<string, string | string[]>>(initial);
  const [fileAnswers, setFileAnswers] = useState<Record<string, File[]>>({});
  // Question ids the user has interacted with this mount, seeded with ids
  // restored from a submitted/draft snapshot (those are prior user input).
  // "Untouched" for the streamed-default backfill below means absent here —
  // NOT "currently empty": clearing an answer is itself a touch.
  const [touched] = useState(
    () => new Set<string>(Object.keys(submittedAnswers ?? draftAnswers ?? {})),
  );
  // Finite-choice questions keep their type-in field collapsed behind a
  // host-rendered "Other" chip; this tracks which questions the user expanded
  // this mount. A question whose current answer already carries a custom
  // value (submitted history, restored draft) renders expanded without an
  // entry here — see customChoiceExpanded.
  const [otherOpen, setOtherOpen] = useState<Set<string>>(() => new Set());
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [skippedQuestionIds, setSkippedQuestionIds] = useState<Set<string>>(() => new Set());
  const [autoContinueRemaining, setAutoContinueRemaining] = useState(
    OPTIONAL_FORM_AUTO_CONTINUE_SECONDS,
  );
  const autoContinuedRef = useRef(false);
  const locked = !interactive || !onSubmit || submittedAnswers !== undefined;
  // Submitted answers are held by the host in their original wire format.
  // Use the normalized snapshot for rendering so legacy tone values select
  // the same visual card that a new submission will send.
  const currentAnswers = submittedAnswers !== undefined ? initial : answers;
  const stepped = !locked && !hideInternalSubmit && form.questions.length > 1;
  const activeQuestion = form.questions[activeQuestionIndex];
  const isLastQuestion = activeQuestionIndex === form.questions.length - 1;
  const questionsToRender = stepped && activeQuestion ? [activeQuestion] : form.questions;

  useEffect(() => {
    setActiveQuestionIndex(0);
    setSkippedQuestionIds(new Set());
  }, [form.id]);

  useEffect(() => {
    setActiveQuestionIndex((current) =>
      Math.min(current, Math.max(0, form.questions.length - 1)),
    );
  }, [form.questions.length]);

  function hasCustomAnswer(q: QuestionForm['questions'][number]): boolean {
    const value = currentAnswers[q.id];
    return q.type === 'checkbox'
      ? customCheckboxValue(q, value).length > 0
      : customSingleValue(q, value).length > 0;
  }

  // Whether a finite-choice question shows its custom type-in field. Locked
  // forms only ever show it when the recorded answer is a custom value.
  function customChoiceExpanded(q: QuestionForm['questions'][number]): boolean {
    if (locked) return hasCustomAnswer(q);
    return otherOpen.has(q.id) || hasCustomAnswer(q);
  }

  // Toggle the "Other" chip. Opening a single-choice question's field
  // deselects the fixed options (the user is saying "none of these");
  // collapsing discards any custom text and keeps only known option values.
  function toggleOther(q: QuestionForm['questions'][number]) {
    if (locked) return;
    const expanded = customChoiceExpanded(q);
    setOtherOpen((prev) => {
      const next = new Set(prev);
      if (expanded) next.delete(q.id);
      else next.add(q.id);
      return next;
    });
    if (expanded) {
      if (q.type === 'checkbox') {
        const current = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
        update(q.id, current.filter((entry) => questionValueIsKnown(q, entry)));
      } else {
        const current = typeof answers[q.id] === 'string' ? (answers[q.id] as string) : '';
        if (!questionValueIsKnown(q, current)) update(q.id, '');
      }
    } else if (q.type !== 'checkbox') {
      update(q.id, '');
    }
  }

  // Picking a fixed option collapses an open (and still empty) "Other" field
  // on single-choice questions; checkbox questions keep it open since fixed
  // and custom entries coexist.
  function pickFixed(q: QuestionForm['questions'][number], value: string) {
    setOtherOpen((prev) => {
      if (!prev.has(q.id)) return prev;
      const next = new Set(prev);
      next.delete(q.id);
      return next;
    });
    update(q.id, value);
  }

  function renderOtherChip(q: QuestionForm['questions'][number]) {
    const on = customChoiceExpanded(q);
    // A real <button> keeps the escape hatch in the tab order — the previous
    // display:none checkbox inside a label was mouse-only for keyboard and
    // screen-reader users.
    return (
      <button
        type="button"
        className={`qf-chip qf-chip-other${on ? ' qf-chip-on' : ''}`}
        aria-pressed={on}
        aria-expanded={on}
        disabled={locked}
        onClick={() => toggleOther(q)}
      >
        <span className="qf-chip-copy">
          <span>{t('qf.otherOption')}</span>
        </span>
      </button>
    );
  }

  useEffect(() => {
    setFileAnswers({});
  }, [form.id]);

  // When the form streams in question-by-question, backfill state for newly
  // revealed questions without disturbing answers the user already touched.
  useEffect(() => {
    setAnswers((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const q of form.questions) {
        if (next[q.id] !== undefined) {
          if (shouldAdoptStreamedDefault(q, next[q.id]!, touched)) {
            next[q.id] = canonicalizeQuestionValue(
              q,
              q.defaultValue!,
              visualStyleContext,
            );
            changed = true;
          }
          continue;
        }
        changed = true;
        if (submittedAnswers && submittedAnswers[q.id] !== undefined) {
          next[q.id] = canonicalizeQuestionValue(
            q,
            submittedAnswers[q.id]!,
            visualStyleContext,
          );
        } else if (q.defaultValue !== undefined) {
          next[q.id] = canonicalizeQuestionValue(q, q.defaultValue, visualStyleContext);
        } else {
          next[q.id] = emptyQuestionValue(q);
        }
      }
      return changed ? next : prev;
    });
  }, [form, submittedAnswers, touched, visualStyleContext]);

  function update(id: string, value: string | string[]) {
    if (locked) return;
    touched.add(id);
    const next = { ...answers, [id]: value };
    setAnswers(next);
    setSkippedQuestionIds((current) => {
      if (!current.has(id)) return current;
      const nextSkipped = new Set(current);
      nextSkipped.delete(id);
      return nextSkipped;
    });
    onDraftChange?.(draftSafeAnswers(form, next));
    onAnswerChange?.(id, value);
  }

  function toggleCheckbox(id: string, option: string, maxSelections?: number) {
    if (locked) return;
    const current = Array.isArray(answers[id]) ? (answers[id] as string[]) : [];
    const has = current.includes(option);
    if (!has && maxSelections !== undefined && current.length >= maxSelections) return;
    touched.add(id);
    const next = has ? current.filter((v) => v !== option) : [...current, option];
    const nextAnswers = { ...answers, [id]: next };
    setAnswers(nextAnswers);
    setSkippedQuestionIds((currentSkipped) => {
      if (!currentSkipped.has(id)) return currentSkipped;
      const nextSkipped = new Set(currentSkipped);
      nextSkipped.delete(id);
      return nextSkipped;
    });
    onDraftChange?.(draftSafeAnswers(form, nextAnswers));
    onAnswerChange?.(id, next);
  }

  function updateCheckboxCustom(q: QuestionForm['questions'][number], raw: string) {
    if (locked) return;
    const current = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
    const fixed = current.filter((entry) => questionValueIsKnown(q, entry));
    update(q.id, [...fixed, ...splitCustomEntries(raw)]);
  }

  function finalizeSubmission(
    source: 'submit' | 'skip' | 'auto',
    skippedIds: ReadonlySet<string> = skippedQuestionIds,
  ) {
    if (!onSubmit) return;
    const submittedAnswers = answersWithSkippedQuestions(form, answers, skippedIds);
    const submissionForm = formWithVisualStyleOptions(form, visualStyleContext);
    const files = collectFileSubmissions(form, fileAnswers, skippedIds);
    if (files.length > 0) {
      onSubmit(formatFormAnswers(submissionForm, submittedAnswers), submittedAnswers, source, files);
    } else {
      onSubmit(formatFormAnswers(submissionForm, submittedAnswers), submittedAnswers, source);
    }
  }

  function handleSubmit() {
    if (locked || !onSubmit) return;
    // Block submit until required fields are answered and selection caps hold.
    if (!ready) return;
    finalizeSubmission('submit');
  }

  function handleSkipAll() {
    if (locked || !onSubmit || !canSkipAll) return;
    const empty: Record<string, string | string[]> = {};
    onSubmit(formatFormAnswers(formWithVisualStyleOptions(form, visualStyleContext), empty), empty, 'skip');
  }

  function handleSkipCurrent() {
    if (locked || !onSubmit || !activeQuestion || activeQuestion.required === true) return;
    onInteraction?.({
      element: 'step_skip',
      questionId: activeQuestion.id,
      stepIndex: activeQuestionIndex + 1,
      stepCount: form.questions.length,
    });
    const nextSkipped = new Set(skippedQuestionIds);
    nextSkipped.add(activeQuestion.id);
    setSkippedQuestionIds(nextSkipped);
    if (!isLastQuestion) {
      setActiveQuestionIndex((current) => current + 1);
      return;
    }
    finalizeSubmission('skip', nextSkipped);
  }

  function handlePreviousQuestion() {
    if (!activeQuestion || activeQuestionIndex === 0) return;
    onInteraction?.({
      element: 'step_back',
      questionId: activeQuestion.id,
      stepIndex: activeQuestionIndex + 1,
      stepCount: form.questions.length,
    });
    setActiveQuestionIndex((current) => Math.max(0, current - 1));
  }

  function handleNextQuestion() {
    if (!activeQuestion || isLastQuestion || !currentQuestionReady) return;
    onInteraction?.({
      element: 'step_next',
      questionId: activeQuestion.id,
      stepIndex: activeQuestionIndex + 1,
      stepCount: form.questions.length,
    });
    setActiveQuestionIndex((current) => current + 1);
  }

  // Per-question checkbox selection caps must hold.
  const withinSelectionLimits = form.questions.every((q) => {
    if (q.type !== 'checkbox' || q.maxSelections === undefined) return true;
    const v = currentAnswers[q.id];
    return !Array.isArray(v) || v.length <= q.maxSelections;
  });
  // Required questions must carry a non-empty answer. Without this, main-path forms (the discovery router's
  // required taskType/output, the ElevenLabs voice picker) would accept an
  // empty submit and serialize "(skipped)" for fields the rest of the system
  // treats as mandatory.
  const requiredAnswered = form.questions.every((q) => {
    if (q.required !== true) return true;
    const v = currentAnswers[q.id];
    return questionAnswerIsPresent(v);
  });
  const ready = withinSelectionLimits && requiredAnswered;
  const canSkipAll = form.questions.every((q) => q.required !== true);
  // Required answers remain required after a timeout. A flat form may only
  // auto-continue once every required answer is present; a stepped form can
  // auto-continue on an optional active step after its earlier requirements
  // have been met. Fully optional forms retain the countdown throughout.
  const autoContinueEnabled =
    autoContinueAfterTimeout &&
    !locked &&
    !submitDisabled &&
    (canSkipAll || (ready && (!stepped || activeQuestion?.required !== true)));
  const currentQuestionReady =
    !activeQuestion ||
    activeQuestion.required !== true ||
    questionAnswerIsPresent(currentAnswers[activeQuestion.id]);
  const autoContinueCountdown = `${Math.floor(autoContinueRemaining / 60)}:${String(
    autoContinueRemaining % 60,
  ).padStart(2, '0')}`;

  useImperativeHandle(ref, () => ({ submit: handleSubmit, skipAll: handleSkipAll }));
  useEffect(() => {
    onReadyChange?.(!locked && ready);
  }, [onReadyChange, locked, ready]);
  useEffect(() => {
    if (!autoContinueEnabled) {
      setAutoContinueRemaining(OPTIONAL_FORM_AUTO_CONTINUE_SECONDS);
      autoContinuedRef.current = false;
      return;
    }
    setAutoContinueRemaining(OPTIONAL_FORM_AUTO_CONTINUE_SECONDS);
    autoContinuedRef.current = false;
    const timer = window.setInterval(() => {
      setAutoContinueRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [autoContinueEnabled, form.id]);
  useEffect(() => {
    if (
      !autoContinueEnabled ||
      autoContinueRemaining > 0 ||
      autoContinuedRef.current ||
      !onSubmit
    ) {
      return;
    }
    autoContinuedRef.current = true;
    finalizeSubmission('auto');
  }, [answers, autoContinueEnabled, autoContinueRemaining, fileAnswers, form, onSubmit]);

  return (
    <div className={`question-form${locked ? ' question-form-locked' : ''}`} data-form-id={form.id}>
      <div className="question-form-head">
        <span className="question-form-icon" aria-hidden>?</span>
        <div className="question-form-titles">
          <div className="question-form-title">{form.title}</div>
          {form.description ? (
            <div className="question-form-desc">{form.description}</div>
          ) : null}
        </div>
        {stepped ? (
          <span
            className="qf-step-progress"
            aria-label={`${activeQuestionIndex + 1} / ${form.questions.length}`}
          >
            {activeQuestionIndex + 1} / {form.questions.length}
          </span>
        ) : null}
        {locked ? <span className="question-form-pill">{t('qf.answered')}</span> : null}
      </div>
      <div className="question-form-body">
        {questionsToRender.map((q) => {
          const value = currentAnswers[q.id];
          const visualStyleCards =
            visualStyleContext &&
            q.id === 'tone' &&
            (q.type === 'checkbox' || q.type === 'radio') &&
            q.options
              ? visualStyleCardsForContext(visualStyleContext)
              : null;
          return (
            <div
              key={q.id}
              className={`qf-field${visualStyleCards ? ' qf-field-visual' : ''}`}
            >
              <label className="qf-label">
                <span>{q.label}</span>
                {q.required ? <span className="qf-required">{t('qf.required')}</span> : null}
              </label>
              {q.help ? <div className="qf-help">{q.help}</div> : null}
              {q.type === 'radio' && q.options && !visualStyleCards ? (
                <div className="qf-options">
                  {q.options.map((opt) => (
                    <label
                      key={opt.value}
                      className={`qf-chip${value === opt.value ? ' qf-chip-on' : ''}`}
                      title={opt.description}
                    >
                      <input
                        type="radio"
                        name={`${form.id}-${q.id}`}
                        value={opt.value}
                        checked={value === opt.value}
                        disabled={locked}
                        aria-label={opt.label}
                        onChange={() => pickFixed(q, opt.value)}
                      />
                      <OptionCopy option={opt} />
                    </label>
                  ))}
                  {shouldRenderCustomChoice(q) ? renderOtherChip(q) : null}
                </div>
              ) : null}
              {q.type === 'radio' &&
              q.options &&
              !visualStyleCards &&
              shouldRenderCustomChoice(q) ? (
                <CollapsibleCustomChoice open={customChoiceExpanded(q)}>
                  <CustomChoiceInput
                    label={q.customLabel ?? t('qf.customLabel')}
                    value={customSingleValue(q, value)}
                    placeholder={q.customPlaceholder ?? t('qf.customPlaceholder')}
                    disabled={locked || !customChoiceExpanded(q)}
                    onChange={(next) => update(q.id, next)}
                  />
                </CollapsibleCustomChoice>
              ) : null}
              {q.type === 'checkbox' && q.options && !visualStyleCards ? (
                <div className="qf-options">
                  {q.options.map((opt) => {
                    const arr = Array.isArray(value) ? value : [];
                    const on = arr.includes(opt.value);
                    const maxed =
                      q.maxSelections !== undefined && !on && arr.length >= q.maxSelections;
                    return (
                      <label
                        key={opt.value}
                        title={opt.description}
                        className={`qf-chip${on ? ' qf-chip-on' : ''}${maxed ? ' qf-chip-disabled' : ''}`}
                      >
                        <input
                          type="checkbox"
                          value={opt.value}
                          checked={on}
                          disabled={locked || maxed}
                          aria-label={opt.label}
                          onChange={() => toggleCheckbox(q.id, opt.value, q.maxSelections)}
                        />
                        <OptionCopy option={opt} />
                      </label>
                    );
                  })}
                  {shouldRenderCustomChoice(q) ? renderOtherChip(q) : null}
                </div>
              ) : null}
              {visualStyleCards && visualStyleContext ? (
                <VisualStylePicker
                  cards={visualStyleCards}
                  context={visualStyleContext}
                  formId={form.id}
                  questionId={q.id}
                  title={q.label}
                  allowCustom={shouldRenderCustomChoice(q)}
                  customLabel={q.customLabel ?? t('qf.customLabel')}
                  customPlaceholder={q.customPlaceholder ?? t('qf.customPlaceholder')}
                  value={
                    Array.isArray(value)
                      ? value
                      : typeof value === 'string' && value
                        ? [value]
                        : []
                  }
                  disabled={locked}
                  selectionMode={q.type === 'radio' ? 'single' : 'multiple'}
                  maxSelections={q.type === 'checkbox' ? q.maxSelections : 1}
                  onChange={(next) =>
                    update(q.id, q.type === 'radio' ? (next[0] ?? '') : next)
                  }
                  onInteraction={onInteraction}
                />
              ) : null}
              {q.type === 'checkbox' &&
              q.options &&
              !visualStyleCards &&
              shouldRenderCustomChoice(q) ? (
                <CollapsibleCustomChoice open={customChoiceExpanded(q)}>
                  <CustomChoiceInput
                    label={q.customLabel ?? t('qf.customLabel')}
                    value={customCheckboxValue(q, value)}
                    placeholder={q.customPlaceholder ?? t('qf.customPlaceholder')}
                    disabled={locked || !customChoiceExpanded(q)}
                    onChange={(next) => updateCheckboxCustom(q, next)}
                  />
                </CollapsibleCustomChoice>
              ) : null}
              {q.type === 'select' && q.options ? (
                <select
                  className="qf-select"
                  value={
                    typeof value === 'string' && value.length > 0 && questionValueIsKnown(q, value)
                      ? value
                      : customChoiceExpanded(q)
                        ? OTHER_SELECT_VALUE
                        : ''
                  }
                  disabled={locked}
                  onChange={(e) => {
                    if (e.target.value === OTHER_SELECT_VALUE) {
                      if (!customChoiceExpanded(q)) toggleOther(q);
                      return;
                    }
                    pickFixed(q, e.target.value);
                  }}
                >
                  <option value="" disabled>
                    {q.placeholder ?? t('qf.choose')}
                  </option>
                  {q.options.map((opt) => (
                    <option key={opt.value} value={opt.value} title={opt.description}>
                      {opt.label}
                    </option>
                  ))}
                  {shouldRenderCustomChoice(q) ? (
                    <option value={OTHER_SELECT_VALUE}>{t('qf.otherOption')}…</option>
                  ) : null}
                </select>
              ) : null}
              {q.type === 'select' && q.options && shouldRenderCustomChoice(q) ? (
                <CollapsibleCustomChoice open={customChoiceExpanded(q)}>
                  <CustomChoiceInput
                    label={q.customLabel ?? t('qf.customLabel')}
                    value={customSingleValue(q, value)}
                    placeholder={q.customPlaceholder ?? t('qf.customPlaceholder')}
                    disabled={locked || !customChoiceExpanded(q)}
                    onChange={(next) => update(q.id, next)}
                  />
                </CollapsibleCustomChoice>
              ) : null}
              {q.type === 'text' ? (
                <input
                  type="text"
                  className="qf-input"
                  value={typeof value === 'string' ? value : ''}
                  placeholder={q.placeholder}
                  disabled={locked}
                  onChange={(e) => update(q.id, e.target.value)}
                />
              ) : null}
              {q.type === 'number' ? (
                <input
                  type="number"
                  className="qf-input"
                  value={typeof value === 'string' ? value : ''}
                  placeholder={q.placeholder}
                  min={q.min}
                  max={q.max}
                  step={q.step}
                  disabled={locked}
                  onChange={(e) => update(q.id, e.target.value)}
                />
              ) : null}
              {q.type === 'range' ? (
                <div className="qf-range-wrap">
                  <input
                    type="range"
                    className="qf-range"
                    value={typeof value === 'string' && value.trim() ? value : String(q.min ?? 0)}
                    min={q.min}
                    max={q.max}
                    step={q.step}
                    disabled={locked}
                    onChange={(e) => update(q.id, e.target.value)}
                  />
                  <output className="qf-range-value">
                    {typeof value === 'string' && value.trim() ? value : String(q.min ?? 0)}
                  </output>
                </div>
              ) : null}
              {q.type === 'date' || q.type === 'time' || q.type === 'datetime-local' ? (
                <input
                  type={q.type}
                  className="qf-input"
                  value={typeof value === 'string' ? value : ''}
                  placeholder={q.placeholder}
                  disabled={locked}
                  onChange={(e) => update(q.id, e.target.value)}
                />
              ) : null}
              {q.type === 'color' ? (
                <input
                  type="color"
                  className="qf-color"
                  value={normalizeColorInputValue(value)}
                  disabled={locked}
                  onChange={(e) => update(q.id, e.target.value)}
                />
              ) : null}
              {q.type === 'url' || q.type === 'email' || q.type === 'tel' ? (
                <input
                  type={q.type}
                  className="qf-input"
                  value={typeof value === 'string' ? value : ''}
                  placeholder={q.placeholder}
                  disabled={locked}
                  onChange={(e) => update(q.id, e.target.value)}
                />
              ) : null}
              {q.type === 'file' ? (
                <div className="qf-file-wrap">
                  <input
                    type="file"
                    className="qf-file"
                    multiple={q.multiple}
                    accept={q.accept}
                    disabled={locked}
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      const names = files.map((file) => file.name);
                      setFileAnswers((current) => ({ ...current, [q.id]: files }));
                      update(q.id, q.multiple ? names : names[0] ?? '');
                    }}
                  />
                  {fileValueLabel(value) ? (
                    <div className="qf-file-summary">{fileValueLabel(value)}</div>
                  ) : null}
                </div>
              ) : null}
              {q.type === 'switch' ? (
                <label className="qf-switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={value === 'true'}
                    disabled={locked}
                    onChange={(e) => update(q.id, e.target.checked ? 'true' : 'false')}
                  />
                  <span aria-hidden />
                </label>
              ) : null}
              {q.type === 'textarea' ? (
                <textarea
                  className="qf-textarea"
                  value={typeof value === 'string' ? value : ''}
                  placeholder={q.placeholder}
                  disabled={locked}
                  rows={3}
                  onChange={(e) => update(q.id, e.target.value)}
                />
              ) : null}
              {q.type === 'direction-cards' && q.cards && q.cards.length > 0 ? (
                <div className="qf-direction-cards">
                  {q.cards.map((card) => (
                    <DirectionCardView
                      key={card.id}
                      card={card}
                      formId={form.id}
                      questionId={q.id}
                      selected={value === card.id || value === card.label}
                      disabled={locked}
                      onSelect={() => pickFixed(q, card.id)}
                      t={t}
                    />
                  ))}
                </div>
              ) : null}
              {q.type === 'direction-cards' && q.cards && q.cards.length > 0 && shouldRenderCustomChoice(q) ? (
                <>
                  <div className="qf-options">{renderOtherChip(q)}</div>
                  <CollapsibleCustomChoice open={customChoiceExpanded(q)}>
                    <CustomChoiceInput
                      label={q.customLabel ?? t('qf.customLabel')}
                      value={customSingleValue(q, value)}
                      placeholder={q.customPlaceholder ?? t('qf.customPlaceholder')}
                      disabled={locked || !customChoiceExpanded(q)}
                      onChange={(next) => update(q.id, next)}
                    />
                  </CollapsibleCustomChoice>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
      {hideInternalSubmit ? null : (
        <div className="question-form-foot">
          {locked ? (
            <span className="qf-locked-note">
              {submittedAnswers ? t('qf.lockedSubmitted') : t('qf.lockedPrev')}
            </span>
          ) : stepped ? (
            <>
              {autoContinueEnabled ? (
                <span
                  className="qf-auto-continue"
                  title={t('questions.autoSkipHint')}
                  aria-label={`${t('questions.autoSkipHint')} ${autoContinueCountdown}`}
                >
                  {autoContinueCountdown}
                </span>
              ) : null}
              {activeQuestion?.required === true ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleSkipCurrent}
                  disabled={submitDisabled}
                >
                  {t('questionForm.skip')}
                </Button>
              )}
              <span className="qf-submit-actions">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handlePreviousQuestion}
                  disabled={submitDisabled || activeQuestionIndex === 0}
                >
                  {t('settings.onboardingBack')}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={
                    isLastQuestion
                      ? handleSubmit
                      : handleNextQuestion
                  }
                  disabled={
                    submitDisabled || (isLastQuestion ? !ready : !currentQuestionReady)
                  }
                  title={
                    !submitDisabled && activeQuestion?.required === true && !currentQuestionReady
                      ? t('qf.submitDisabledTitle')
                      : isLastQuestion && !submitDisabled && ready
                        ? t('qf.submitTitle')
                        : undefined
                  }
                >
                  {isLastQuestion
                    ? form.submitLabel ?? t('qf.submitDefault')
                    : t('nextStep.title')}
                </Button>
              </span>
            </>
          ) : autoContinueEnabled || canSkipAll ? (
            <span
              className={autoContinueEnabled ? 'qf-auto-continue' : 'qf-hint'}
              title={autoContinueEnabled ? t('questions.autoSkipHint') : undefined}
              aria-label={
                autoContinueEnabled
                  ? `${t('questions.autoSkipHint')} ${autoContinueCountdown}`
                  : undefined
              }
            >
              {autoContinueEnabled ? autoContinueCountdown : t('qf.hint')}
            </span>
          ) : null}
          {!locked && !stepped ? (
            <span className="qf-submit-actions">
              {canSkipAll ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleSkipAll}
                  disabled={submitDisabled}
                >
                  {t('questions.skipAll')}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="primary"
                onClick={handleSubmit}
                disabled={submitDisabled || !ready}
                title={!submitDisabled && ready ? t('qf.submitTitle') : t('qf.submitDisabledTitle')}
              >
                {form.submitLabel ?? t('qf.submitDefault')}
              </Button>
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
});

function OptionCopy({ option }: { option: FormOption }) {
  return (
    <span className="qf-chip-copy">
      <span>{option.label}</span>
      {option.description ? <span className="qf-chip-desc">{option.description}</span> : null}
    </span>
  );
}

// Sentinel value for the host-injected "Other…" entry in a select control.
// Never leaks into answers: choosing it only expands the type-in field.
const OTHER_SELECT_VALUE = '__od-other__';

// Accordion wrapper for the custom type-in field: stays mounted so the
// collapse transition can play (see AGENTS.md → UI animation philosophy).
function CollapsibleCustomChoice({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`accordion-collapsible qf-custom-collapsible${open ? ' open' : ''}`}>
      <div className="accordion-collapsible-inner">{children}</div>
    </div>
  );
}

function CustomChoiceInput({
  label,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const chars = customInputCharCount(value, placeholder);
  return (
    <label className="qf-custom">
      <span>{label}</span>
      <input
        type="text"
        className="qf-input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        style={{ '--qf-custom-chars': String(chars) } as CSSProperties}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

const VISUAL_STYLE_PAGE_SIZE = 4;
type VisualStyleGalleryCategory = 'all' | VisualStyleCategory;
const VISUAL_STYLE_GALLERY_CATEGORIES: Array<{
  value: VisualStyleGalleryCategory;
  label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'business', label: 'Business' },
  { value: 'editorial', label: 'Editorial' },
  { value: 'creative', label: 'Creative' },
  { value: 'minimal', label: 'Minimal' },
];

function VisualStylePicker({
  cards,
  context,
  formId,
  questionId,
  title,
  allowCustom,
  customLabel,
  customPlaceholder,
  value,
  disabled,
  selectionMode,
  maxSelections,
  onChange,
  onInteraction,
}: {
  cards: VisualStyleCard[];
  context: VisualStyleContext;
  formId: string;
  questionId: string;
  title: string;
  allowCustom: boolean;
  customLabel: string;
  customPlaceholder: string;
  value: string[];
  disabled: boolean;
  selectionMode: 'single' | 'multiple';
  maxSelections?: number;
  onChange: (value: string[]) => void;
  onInteraction?: (interaction: QuestionFormInteraction) => void;
}) {
  const t = useT();
  const [offset, setOffset] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryCategory, setGalleryCategory] =
    useState<VisualStyleGalleryCategory>('all');
  const selectedCards = cards.filter((card) => value.includes(card.value));
  const customValue =
    value.find((candidate) => !cards.some((card) => card.value === candidate)) ?? '';
  const page = Array.from(
    { length: Math.min(VISUAL_STYLE_PAGE_SIZE, cards.length) },
    (_, index) => {
      const cardIndex = (offset + index) % cards.length;
      return cards[cardIndex]!;
    },
  );
  const compactSelectedCards = selectedCards.slice(
    0,
    Math.max(VISUAL_STYLE_PAGE_SIZE, selectedCards.length),
  );
  const compactCards =
    compactSelectedCards.length > 0
      ? [
          ...compactSelectedCards,
          ...page.filter((card) => !value.includes(card.value)),
        ].slice(0, Math.max(VISUAL_STYLE_PAGE_SIZE, compactSelectedCards.length))
      : page;
  const remaining = Math.max(0, cards.length - compactCards.length);
  const galleryCards =
    galleryCategory === 'all'
      ? cards
      : cards.filter((card) => card.category === galleryCategory);

  function shuffle() {
    if (cards.length <= VISUAL_STYLE_PAGE_SIZE) return;
    onInteraction?.({
      element: 'visual_style_refresh',
      questionId,
      styleContext: context,
    });
    setOffset((current) => (current + VISUAL_STYLE_PAGE_SIZE) % cards.length);
  }

  function selectStyle(card: VisualStyleCard, source: 'inline' | 'gallery') {
    onInteraction?.({
      element: 'visual_style_card',
      questionId,
      styleId: card.value,
      styleContext: context,
      source,
    });
    if (selectionMode === 'single') {
      onChange([card.value]);
      return;
    }
    if (value.includes(card.value)) {
      onChange(value.filter((candidate) => candidate !== card.value));
      return;
    }
    if (maxSelections !== undefined && value.length >= maxSelections) return;
    onChange([...value, card.value]);
  }

  return (
    <>
      <div className="qf-visual-picker" data-artifact-type={context}>
        <div className="qf-visual-toolbar">
          <Button
            type="button"
            variant="ghost"
            className="qf-visual-toolbar-button"
            disabled={disabled || cards.length <= VISUAL_STYLE_PAGE_SIZE}
            onClick={shuffle}
            title={t('designFiles.refresh')}
            aria-label={t('designFiles.refresh')}
          >
            <Icon name="refresh" size={13} />
          </Button>
        </div>
        <div
          className="qf-visual-strip"
          style={{
            gridTemplateColumns: `repeat(${compactCards.length + (remaining > 0 ? 1 : 0)}, minmax(0, 1fr))`,
          }}
        >
          {compactCards.map((card) => (
            <VisualStyleCardView
              key={card.value}
              card={card}
              context={context}
              formId={formId}
              questionId={questionId}
              selected={value.includes(card.value)}
              disabled={
                disabled ||
                (selectionMode === 'multiple' &&
                  !value.includes(card.value) &&
                  maxSelections !== undefined &&
                  value.length >= maxSelections)
              }
              inputType={selectionMode === 'single' ? 'radio' : 'checkbox'}
              onSelect={() => selectStyle(card, 'inline')}
            />
          ))}
          {remaining > 0 ? (
            <Button
              type="button"
              variant="ghost"
              className="qf-visual-more"
              disabled={disabled}
              aria-label={t('recentProjects.viewAll')}
              onClick={() => {
                onInteraction?.({
                  element: 'visual_style_gallery_open',
                  questionId,
                  styleContext: context,
                });
                setGalleryOpen(true);
              }}
            >
              +{remaining}
            </Button>
          ) : null}
        </div>
        {customValue ? (
          <Button
            type="button"
            variant="ghost"
            className="qf-visual-custom-summary"
            disabled={disabled}
            onClick={() => setGalleryOpen(true)}
          >
            <Icon name="check" size={12} />
            <span>{customValue}</span>
          </Button>
        ) : null}
      </div>
      {galleryOpen
        ? createPortal(
            <Dialog
              className="qf-visual-dialog"
              backdropClassName="qf-visual-dialog-backdrop"
              layout="sectioned"
              ariaLabel={title}
              onClose={() => setGalleryOpen(false)}
              closeOnEscape
            >
              <DialogHeader className="qf-visual-dialog-head">
                <DialogTitle className="qf-visual-dialog-title">{title}</DialogTitle>
                <Button
                  type="button"
                  variant="ghost"
                  className="qf-visual-dialog-close"
                  aria-label={t('common.close')}
                  title={t('common.close')}
                  onClick={() => setGalleryOpen(false)}
                >
                  <Icon name="close" size={16} />
                </Button>
              </DialogHeader>
              <DialogBody className="qf-visual-dialog-body">
                <div
                  className="qf-visual-dialog-tabs"
                  role="tablist"
                  aria-label={`${title} categories`}
                >
                  {VISUAL_STYLE_GALLERY_CATEGORIES.map((category) => {
                    const active = galleryCategory === category.value;
                    return (
                      <Button
                        key={category.value}
                        type="button"
                        variant="ghost"
                        role="tab"
                        aria-selected={active}
                        tabIndex={active ? 0 : -1}
                        className={`qf-visual-dialog-tab${active ? ' qf-visual-dialog-tab-active' : ''}`}
                        onClick={() => {
                          onInteraction?.({
                            element: 'visual_style_category_tab',
                            questionId,
                            styleContext: context,
                            categoryId: category.value,
                          });
                          setGalleryCategory(category.value);
                        }}
                      >
                        {category.label}
                      </Button>
                    );
                  })}
                </div>
                <div className="qf-visual-dialog-grid">
                  {galleryCards.map((card) => (
                    <VisualStyleCardView
                      key={card.value}
                      card={card}
                      context={context}
                      formId={`${formId}-gallery`}
                      questionId={questionId}
                      selected={value.includes(card.value)}
                      disabled={
                        disabled ||
                        (selectionMode === 'multiple' &&
                          !value.includes(card.value) &&
                          maxSelections !== undefined &&
                          value.length >= maxSelections)
                      }
                      inputType={selectionMode === 'single' ? 'radio' : 'checkbox'}
                      onSelect={() => selectStyle(card, 'gallery')}
                    />
                  ))}
                </div>
                {allowCustom ? (
                  <label className="qf-visual-custom">
                    <span className="qf-visual-custom-label">{customLabel}</span>
                    <input
                      type="text"
                      className="qf-input"
                      value={customValue}
                      placeholder={customPlaceholder}
                      disabled={
                        disabled ||
                        (selectionMode === 'multiple' &&
                          !customValue &&
                          maxSelections !== undefined &&
                          value.length >= maxSelections)
                      }
                      onChange={(event) => {
                        const presets = value.filter((candidate) =>
                          cards.some((card) => card.value === candidate),
                        );
                        const nextCustom = event.target.value;
                        onChange(
                          nextCustom
                            ? selectionMode === 'single'
                              ? [nextCustom]
                              : [...presets, nextCustom]
                            : presets,
                        );
                      }}
                    />
                  </label>
                ) : null}
              </DialogBody>
              <DialogFooter className="qf-visual-dialog-foot">
                <Button type="button" variant="primary" onClick={() => setGalleryOpen(false)}>
                  {t('tool.done')}
                </Button>
              </DialogFooter>
            </Dialog>,
            document.body,
          )
        : null}
    </>
  );
}

function VisualStyleCardView({
  card,
  context,
  formId,
  questionId,
  selected,
  disabled,
  inputType,
  onSelect,
}: {
  card: VisualStyleCard;
  context: VisualStyleContext;
  formId: string;
  questionId: string;
  selected: boolean;
  disabled: boolean;
  inputType: 'radio' | 'checkbox';
  onSelect: () => void;
}) {
  return (
    <label
      className={`qf-visual-card${selected ? ' qf-visual-card-on' : ''}${card.recommended ? ' qf-visual-card-recommended' : ''}${disabled ? ' qf-visual-card-disabled' : ''}`}
      data-recommended={card.recommended ? 'true' : undefined}
      title={card.title}
    >
      <input
        type={inputType}
        name={`${formId}-${questionId}`}
        value={card.value}
        checked={selected}
        disabled={disabled}
        aria-label={card.title}
        onChange={onSelect}
      />
      <VisualStylePreview context={context} variant={card.variant} preview={card.preview} />
      {selected ? (
        <span className="qf-visual-card-check" aria-hidden>
          <Icon name="check" size={12} />
        </span>
      ) : null}
      <span className="qf-visual-card-name">{card.title}</span>
    </label>
  );
}

function VisualStylePreview({
  context,
  variant,
  preview,
}: {
  context: VisualStyleContext;
  variant: VisualStyleCard['variant'];
  preview?: VisualStyleCard['preview'];
}) {
  if (preview) {
    return (
      <span className="qf-visual-preview" data-style={variant}>
        <img className="qf-visual-preview-image" src={preview.src} alt={preview.alt} loading="lazy" />
      </span>
    );
  }
  if (context === 'deck') {
    return (
      <span className="qf-visual-preview qf-visual-preview-deck" data-style={variant} aria-hidden>
        <span className="qf-preview-slide qf-preview-slide-hero">
          <span className="qf-preview-kicker" />
          <span className="qf-preview-title" />
          <span className="qf-preview-title qf-preview-title-short" />
          <span className="qf-preview-accent" />
        </span>
        <span className="qf-preview-slide qf-preview-slide-copy">
          <span className="qf-preview-copy-lines">
            <i />
            <i />
            <i />
          </span>
          <span className="qf-preview-figure" />
        </span>
        <span className="qf-preview-slide qf-preview-slide-data">
          <span className="qf-preview-chart">
            <i />
            <i />
            <i />
            <i />
          </span>
        </span>
      </span>
    );
  }
  return (
    <span className="qf-visual-preview qf-visual-preview-prototype" data-style={variant} aria-hidden>
      <span className="qf-preview-app">
        <span className="qf-preview-appbar">
          <i />
          <i />
          <i />
        </span>
        <span className="qf-preview-app-body">
          <span className="qf-preview-sidebar">
            <i />
            <i />
            <i />
          </span>
          <span className="qf-preview-content">
            <span className="qf-preview-content-head" />
            <span className="qf-preview-content-grid">
              <i />
              <i />
              <i />
            </span>
            <span className="qf-preview-content-list">
              <i />
              <i />
            </span>
          </span>
        </span>
      </span>
    </span>
  );
}

function DirectionCardView({
  card,
  formId,
  questionId,
  selected,
  disabled,
  onSelect,
  t,
}: {
  card: DirectionCard;
  formId: string;
  questionId: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  // Form-language-aware translator from the owning card (see QuestionFormView).
  t: (key: Parameters<ReturnType<typeof useT>>[0]) => string;
}) {
  return (
    <label
      className={`qf-card${selected ? ' qf-card-on' : ''}${disabled ? ' qf-card-disabled' : ''}`}
    >
      <input
        type="radio"
        name={`${formId}-${questionId}`}
        value={card.id}
        checked={selected}
        disabled={disabled}
        onChange={() => onSelect()}
      />
      <div className="qf-card-head">
        <div className="qf-card-title">{card.label}</div>
        {selected ? <span className="qf-card-pill">{t('qf.cardSelected')}</span> : null}
      </div>
      {card.palette.length > 0 ? (
        <div className="qf-card-swatches" aria-hidden>
          {card.palette.slice(0, 6).map((c, i) => (
            <span
              key={i}
              className="qf-card-swatch"
              style={{ background: c }}
              title={c}
            />
          ))}
        </div>
      ) : null}
      <div className="qf-card-types" aria-hidden>
        <span className="qf-card-type-display" style={{ fontFamily: card.displayFont }}>
          Aa
        </span>
        <span className="qf-card-type-body" style={{ fontFamily: card.bodyFont }}>
          {t('qf.cardSampleText')}
        </span>
      </div>
      {card.mood ? <p className="qf-card-mood">{card.mood}</p> : null}
      {card.references.length > 0 ? (
        <p className="qf-card-refs">
          <span className="qf-card-refs-label">{t('qf.cardRefs')}</span>{' '}
          {card.references.slice(0, 4).join(' · ')}
        </p>
      ) : null}
    </label>
  );
}

function buildInitialState(
  form: QuestionForm,
  submitted: Record<string, string | string[]> | undefined,
  draft: Record<string, string | string[]> | undefined,
  visualStyleContext: VisualStyleContext | undefined,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const q of form.questions) {
    if (submitted && submitted[q.id] !== undefined) {
      out[q.id] = canonicalizeQuestionValue(q, submitted[q.id]!, visualStyleContext);
      continue;
    }
    if (draft && draft[q.id] !== undefined && q.type !== 'file') {
      out[q.id] = canonicalizeQuestionValue(q, draft[q.id]!, visualStyleContext);
      continue;
    }
    if (q.defaultValue !== undefined) {
      out[q.id] = canonicalizeQuestionValue(q, q.defaultValue, visualStyleContext);
      continue;
    }
    out[q.id] = emptyQuestionValue(q);
  }
  return out;
}

/**
 * Whether a question that already holds a value should adopt a
 * later-arriving streamed `default`.
 *
 * The partial-JSON parser reveals a question as soon as its label lands, but
 * models are free to emit the `default` key after `options` — so the reveal
 * pass can park a question on its auto-assigned empty value before the
 * recommendation has streamed in. Invariant: a late default fills a question
 * only while (a) the user has never touched it and (b) it still holds that
 * auto-assigned empty value, so it can never clobber a real answer or an
 * intentional clear.
 */
function shouldAdoptStreamedDefault(
  q: QuestionForm['questions'][number],
  current: string | string[],
  touched: ReadonlySet<string>,
): boolean {
  if (q.defaultValue === undefined || touched.has(q.id)) return false;
  if (Array.isArray(current)) return current.length === 0;
  return current === emptyQuestionValue(q);
}

function draftSafeAnswers(
  form: QuestionForm,
  answers: Record<string, string | string[]>,
): Record<string, string | string[]> {
  const fileQuestionIds = new Set(
    form.questions.filter((q) => q.type === 'file').map((q) => q.id),
  );
  if (fileQuestionIds.size === 0) return answers;
  const out: Record<string, string | string[]> = {};
  for (const [id, value] of Object.entries(answers)) {
    if (!fileQuestionIds.has(id)) out[id] = value;
  }
  return out;
}

function answersWithSkippedQuestions(
  form: QuestionForm,
  answers: Record<string, string | string[]>,
  skippedQuestionIds: ReadonlySet<string>,
): Record<string, string | string[]> {
  if (skippedQuestionIds.size === 0) return answers;
  const submittedAnswers = { ...answers };
  for (const q of form.questions) {
    if (skippedQuestionIds.has(q.id)) {
      submittedAnswers[q.id] = emptyQuestionValue(q);
    }
  }
  return submittedAnswers;
}

function collectFileSubmissions(
  form: QuestionForm,
  fileAnswers: Record<string, File[]>,
  skippedQuestionIds: ReadonlySet<string>,
): QuestionFormFileSubmission[] {
  const out: QuestionFormFileSubmission[] = [];
  for (const q of form.questions) {
    if (q.type !== 'file' || skippedQuestionIds.has(q.id)) continue;
    const files = fileAnswers[q.id] ?? [];
    if (files.length === 0) continue;
    out.push({ questionId: q.id, questionLabel: q.label, files });
  }
  return out;
}

function emptyQuestionValue(q: QuestionForm['questions'][number]): string | string[] {
  if (q.type === 'checkbox') return [];
  if (q.type === 'switch') return 'false';
  if (q.type === 'range') return String(q.min ?? 0);
  if (q.type === 'color') return normalizeColorInputValue('');
  return '';
}

function formWithVisualStyleOptions(
  form: QuestionForm,
  visualStyleContext: VisualStyleContext | undefined,
): QuestionForm {
  if (!visualStyleContext) return form;
  let expanded = false;
  const questions = form.questions.map((question) => {
    if (
      question.id !== 'tone' ||
      (question.type !== 'checkbox' && question.type !== 'radio') ||
      !question.options
    ) {
      return question;
    }
    expanded = true;
    return {
      ...question,
      options: visualStyleCardsForContext(visualStyleContext).map((card) => ({
        label: card.title,
        value: card.value,
        description: card.description,
      })),
    };
  });
  return expanded ? { ...form, questions } : form;
}

function questionAnswerIsPresent(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === 'string' && value.trim().length > 0;
}

function canonicalizeQuestionValue(
  q: QuestionForm['questions'][number],
  value: string | string[],
  visualStyleContext: VisualStyleContext | undefined,
): string | string[] {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      normalizeVisualStyleQuestionValue(q, entry, visualStyleContext),
    );
  }
  return normalizeVisualStyleQuestionValue(q, value, visualStyleContext);
}

const LEGACY_VISUAL_STYLE_VARIANTS: Readonly<Record<string, VisualStyleVariant>> = {
  editorial: 'editorial',
  'editorial / magazine': 'editorial',
  magazine: 'editorial',
  minimal: 'minimal',
  'modern minimal': 'minimal',
  'modern-minimal': 'minimal',
  'soft gradients': 'minimal',
  'soft-gradient': 'minimal',
  'soft-gradients': 'minimal',
  playful: 'playful',
  'playful / illustrative': 'playful',
  illustrative: 'playful',
  utility: 'utility',
  'tech / utility': 'utility',
  tech: 'utility',
  luxury: 'luxury',
  'luxury / refined': 'luxury',
  refined: 'luxury',
  brutalist: 'brutalist',
  experimental: 'brutalist',
  human: 'human',
  'human / approachable': 'human',
  approachable: 'human',
};

/**
 * Maps the original seven tone aliases to the full catalog's stable card
 * IDs. Unknown/custom answers deliberately pass through unchanged.
 */
export function normalizeVisualStyleQuestionValue(
  q: QuestionForm['questions'][number],
  value: string,
  visualStyleContext: VisualStyleContext | undefined,
): string {
  const optionValue = formOptionValueForLabel(q, value);
  if (
    !visualStyleContext ||
    q.id !== 'tone' ||
    (q.type !== 'checkbox' && q.type !== 'radio')
  ) {
    return optionValue;
  }

  const cards = visualStyleCardsForContext(visualStyleContext);
  const normalized = optionValue.trim().toLocaleLowerCase();
  const directMatch = cards.find(
    (card) =>
      card.value.toLocaleLowerCase() === normalized ||
      card.title.toLocaleLowerCase() === normalized,
  );
  if (directMatch) return directMatch.value;

  const variant = LEGACY_VISUAL_STYLE_VARIANTS[normalized];
  return variant
    ? (cards.find((card) => card.variant === variant)?.value ?? optionValue)
    : optionValue;
}

function shouldRenderCustomChoice(q: QuestionForm['questions'][number]): boolean {
  return q.allowCustom !== false;
}

function questionValueIsKnown(q: QuestionForm['questions'][number], value: string): boolean {
  if (q.options?.some((option) => option.value === value || option.label === value)) return true;
  if (q.cards?.some((card) => card.id === value || card.label === value)) return true;
  return false;
}

function customSingleValue(
  q: QuestionForm['questions'][number],
  value: string | string[] | undefined,
): string {
  if (typeof value !== 'string' || value.length === 0) return '';
  return questionValueIsKnown(q, value) ? '' : value;
}

function customCheckboxValue(
  q: QuestionForm['questions'][number],
  value: string | string[] | undefined,
): string {
  if (!Array.isArray(value)) return '';
  return value.filter((entry) => !questionValueIsKnown(q, entry)).join(', ');
}

function splitCustomEntries(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function customInputCharCount(value: string, placeholder: string): number {
  const base = value.length > 0 ? value.length : Math.min(placeholder.length, 22);
  return Math.max(18, Math.min(base + 2, 72));
}

function normalizeColorInputValue(value: string | string[] | undefined): string {
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) return value;
  return '#000000';
}

function fileValueLabel(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.join(', ');
  return typeof value === 'string' ? value : '';
}

/**
 * Reverse of formatFormAnswers — when we render an old assistant message
 * that contained a form, look at the next user message in the conversation
 * to see if the form was already answered. If so, return the answers map
 * so the form renders in the locked "answered" state with the user's
 * picks visible.
 */
export function parseSubmittedAnswers(
  form: QuestionForm,
  userMessageContent: string,
): Record<string, string | string[]> | null {
  const lines = userMessageContent.split('\n').map((l) => l.trim());
  if (lines.length === 0) return null;
  const header = lines[0] ?? '';
  // We accept any "form answers" header so the agent can paraphrase.
  if (!/^\[form answers/i.test(header)) return null;
  const answers: Record<string, string | string[]> = {};
  const labelToId = new Map<string, string>();
  for (const q of form.questions) labelToId.set(q.label.toLowerCase(), q.id);
  const uploadSummaryIndex = lines.findIndex((line) => /^\[uploaded design files\]$/i.test(line));
  const answerLines = uploadSummaryIndex === -1 ? lines : lines.slice(0, uploadSummaryIndex);
  for (let i = 1; i < answerLines.length; i++) {
    const line = answerLines[i] ?? '';
    const m = /^[-*]\s*([^:]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const labelKey = m[1]!.trim().toLowerCase();
    const value = m[2]!.trim();
    const id = labelToId.get(labelKey);
    if (!id) continue;
    const q = form.questions.find((x) => x.id === id);
    if (!q) continue;
    if (q.type === 'checkbox') {
      answers[id] = value
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.toLowerCase() !== '(skipped)')
        .map((s) => formOptionValueForLabel(q, parseSubmittedOptionToken(s)));
    } else {
      answers[id] = value.toLowerCase() === '(skipped)' ? '' : formOptionValueForLabel(q, parseSubmittedOptionToken(value));
    }
  }
  return Object.keys(answers).length > 0 ? answers : null;
}

function parseSubmittedOptionToken(raw: string): string {
  const match = /\s+\[value:\s*([^\]]+)\]\s*$/i.exec(raw);
  if (!match) return raw.trim();
  return match[1]!.trim();
}
