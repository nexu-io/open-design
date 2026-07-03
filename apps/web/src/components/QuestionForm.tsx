import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useT } from '../i18n';
import type { DirectionCard, FormOption, QuestionForm } from '../artifacts/question-form';
import { formatFormAnswers, formOptionValueForLabel } from '../artifacts/question-form';

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
  // When the form lives in the Questions tab the Continue button owns the
  // submit, so hide the form's own footer button and report ready-state out.
  hideInternalSubmit?: boolean;
  draftAnswers?: Record<string, string | string[]>;
  onReadyChange?: (ready: boolean) => void;
  onDraftChange?: (answers: Record<string, string | string[]>) => void;
  // Fires on each real user interaction with a single question (locked forms
  // never reach it). Lets the Questions tab host track chip picks.
  onAnswerChange?: (questionId: string, value: string | string[]) => void;
  onSubmit?: (text: string, answers: Record<string, string | string[]>) => void;
}

// Lets a parent (the Questions tab Continue button) trigger submission.
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
    onSubmit,
  },
  ref,
) {
  const t = useT();
  const initial = useMemo(
    () => buildInitialState(form, submittedAnswers ?? draftAnswers),
    [form, submittedAnswers, draftAnswers],
  );
  const [answers, setAnswers] = useState<Record<string, string | string[]>>(initial);
  const locked = !interactive || !onSubmit || submittedAnswers !== undefined;
  const currentAnswers = submittedAnswers ?? answers;

  // When the form streams in question-by-question, backfill state for newly
  // revealed questions without disturbing answers the user already touched.
  useEffect(() => {
    setAnswers((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const q of form.questions) {
        if (next[q.id] !== undefined) continue;
        changed = true;
        if (submittedAnswers && submittedAnswers[q.id] !== undefined) {
          next[q.id] = canonicalizeQuestionValue(q, submittedAnswers[q.id]!);
        } else if (q.defaultValue !== undefined) {
          next[q.id] = canonicalizeQuestionValue(q, q.defaultValue);
        } else {
          next[q.id] = emptyQuestionValue(q);
        }
      }
      return changed ? next : prev;
    });
  }, [form, submittedAnswers]);

  function update(id: string, value: string | string[]) {
    if (locked) return;
    const next = { ...answers, [id]: value };
    setAnswers(next);
    onDraftChange?.(next);
    onAnswerChange?.(id, value);
  }

  function toggleCheckbox(id: string, option: string, maxSelections?: number) {
    if (locked) return;
    const current = Array.isArray(answers[id]) ? (answers[id] as string[]) : [];
    const has = current.includes(option);
    if (!has && maxSelections !== undefined && current.length >= maxSelections) return;
    const next = has ? current.filter((v) => v !== option) : [...current, option];
    const nextAnswers = { ...answers, [id]: next };
    setAnswers(nextAnswers);
    onDraftChange?.(nextAnswers);
    onAnswerChange?.(id, next);
  }

  function updateCheckboxCustom(q: QuestionForm['questions'][number], raw: string) {
    if (locked) return;
    const current = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
    const fixed = current.filter((entry) => questionValueIsKnown(q, entry));
    update(q.id, [...fixed, ...splitCustomEntries(raw)]);
  }

  function handleSubmit() {
    if (locked || !onSubmit) return;
    // Block submit until required fields are answered and selection caps hold.
    // skipAll() is the only path that intentionally bypasses this (the new
    // Questions-tab Skip button / countdown).
    if (!ready) return;
    onSubmit(formatFormAnswers(form, answers), answers);
  }

  function handleSkipAll() {
    if (locked || !onSubmit) return;
    const empty: Record<string, string | string[]> = {};
    onSubmit(formatFormAnswers(form, empty), empty);
  }

  // Per-question checkbox selection caps must hold.
  const withinSelectionLimits = form.questions.every((q) => {
    if (q.type !== 'checkbox' || q.maxSelections === undefined) return true;
    const v = currentAnswers[q.id];
    return !Array.isArray(v) || v.length <= q.maxSelections;
  });
  // Required questions must carry a non-empty answer. This gates the standard
  // submit button AND the Questions-tab Continue CTA — only skipAll() bypasses
  // it on purpose. Without this, main-path forms (the discovery router's
  // required taskType/output, the ElevenLabs voice picker) would accept an
  // empty submit and serialize "(skipped)" for fields the rest of the system
  // treats as mandatory.
  const requiredAnswered = form.questions.every((q) => {
    if (q.required !== true) return true;
    const v = currentAnswers[q.id];
    if (Array.isArray(v)) return v.length > 0;
    return typeof v === 'string' && v.trim().length > 0;
  });
  const ready = withinSelectionLimits && requiredAnswered;

  useImperativeHandle(ref, () => ({ submit: handleSubmit, skipAll: handleSkipAll }));
  useEffect(() => {
    onReadyChange?.(!locked && ready);
  }, [onReadyChange, locked, ready]);

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
        {locked ? <span className="question-form-pill">{t('qf.answered')}</span> : null}
      </div>
      <div className="question-form-body">
        {form.questions.map((q) => {
          const value = currentAnswers[q.id];
          return (
            <div key={q.id} className="qf-field">
              <label className="qf-label">
                <span>{q.label}</span>
                {q.required ? (
                  <span className="qf-required" aria-label={t('qf.required')}>*</span>
                ) : null}
              </label>
              {q.help ? <div className="qf-help">{q.help}</div> : null}
              {q.type === 'radio' && q.options ? (
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
                        onChange={() => update(q.id, opt.value)}
                      />
                      <OptionCopy option={opt} />
                    </label>
                  ))}
                </div>
              ) : null}
              {q.type === 'radio' && q.options && shouldRenderCustomChoice(q) ? (
                <CustomChoiceInput
                  label={q.customLabel ?? t('qf.customLabel')}
                  value={customSingleValue(q, value)}
                  placeholder={q.customPlaceholder ?? t('qf.customPlaceholder')}
                  disabled={locked}
                  onChange={(next) => update(q.id, next)}
                />
              ) : null}
              {q.type === 'checkbox' && q.options ? (
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
                </div>
              ) : null}
              {q.type === 'checkbox' && q.options && shouldRenderCustomChoice(q) ? (
                <CustomChoiceInput
                  label={q.customLabel ?? t('qf.customLabel')}
                  value={customCheckboxValue(q, value)}
                  placeholder={q.customPlaceholder ?? t('qf.customPlaceholder')}
                  disabled={locked}
                  onChange={(next) => updateCheckboxCustom(q, next)}
                />
              ) : null}
              {q.type === 'select' && q.options ? (
                <select
                  className="qf-select"
                  value={
                    typeof value === 'string' && questionValueIsKnown(q, value) ? value : ''
                  }
                  disabled={locked}
                  onChange={(e) => update(q.id, e.target.value)}
                >
                  <option value="" disabled>
                    {q.placeholder ?? t('qf.choose')}
                  </option>
                  {q.options.map((opt) => (
                    <option key={opt.value} value={opt.value} title={opt.description}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : null}
              {q.type === 'select' && q.options && shouldRenderCustomChoice(q) ? (
                <CustomChoiceInput
                  label={q.customLabel ?? t('qf.customLabel')}
                  value={customSingleValue(q, value)}
                  placeholder={q.customPlaceholder ?? t('qf.customPlaceholder')}
                  disabled={locked}
                  onChange={(next) => update(q.id, next)}
                />
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
                    disabled={locked}
                    onChange={(e) => {
                      const names = Array.from(e.target.files ?? []).map((file) => file.name);
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
                      onSelect={() => update(q.id, card.id)}
                    />
                  ))}
                </div>
              ) : null}
              {q.type === 'direction-cards' && q.cards && q.cards.length > 0 && shouldRenderCustomChoice(q) ? (
                <CustomChoiceInput
                  label={q.customLabel ?? t('qf.customLabel')}
                  value={customSingleValue(q, value)}
                  placeholder={q.customPlaceholder ?? t('qf.customPlaceholder')}
                  disabled={locked}
                  onChange={(next) => update(q.id, next)}
                />
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
          ) : (
            <span className="qf-hint">{t('qf.hint')}</span>
          )}
          {!locked ? (
            <button
              type="button"
              className="primary"
              onClick={handleSubmit}
              disabled={!ready}
              title={ready ? t('qf.submitTitle') : t('qf.submitDisabledTitle')}
            >
              {form.submitLabel ?? t('qf.submitDefault')}
            </button>
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
  return (
    <label className="qf-custom">
      <span>{label}</span>
      <input
        type="text"
        className="qf-input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function DirectionCardView({
  card,
  formId,
  questionId,
  selected,
  disabled,
  onSelect,
}: {
  card: DirectionCard;
  formId: string;
  questionId: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const t = useT();
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
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const q of form.questions) {
    if (submitted && submitted[q.id] !== undefined) {
      out[q.id] = canonicalizeQuestionValue(q, submitted[q.id]!);
      continue;
    }
    if (q.defaultValue !== undefined) {
      out[q.id] = canonicalizeQuestionValue(q, q.defaultValue);
      continue;
    }
    out[q.id] = emptyQuestionValue(q);
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

function canonicalizeQuestionValue(
  q: QuestionForm['questions'][number],
  value: string | string[],
): string | string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => formOptionValueForLabel(q, entry));
  }
  return formOptionValueForLabel(q, value);
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
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
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
