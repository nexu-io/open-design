import { useMemo, useState } from 'react';
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
  onSubmit?: (text: string, answers: Record<string, string | string[]>) => void;
}

export function QuestionFormView({ form, interactive, submittedAnswers, onSubmit }: Props) {
  const t = useT();
  const initial = useMemo(() => buildInitialState(form, submittedAnswers), [form, submittedAnswers]);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>(initial);
  const locked = !interactive || !onSubmit || submittedAnswers !== undefined;
  const currentAnswers = submittedAnswers ?? answers;

  function update(id: string, value: string | string[]) {
    if (locked) return;
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function toggleCheckbox(id: string, option: string, maxSelections?: number) {
    if (locked) return;
    setAnswers((prev) => {
      const current = Array.isArray(prev[id]) ? (prev[id] as string[]) : [];
      const has = current.includes(option);
      if (!has && maxSelections !== undefined && current.length >= maxSelections) {
        return prev;
      }
      const next = has ? current.filter((v) => v !== option) : [...current, option];
      return { ...prev, [id]: next };
    });
  }

  function missingRequired(): string | null {
    for (const q of form.questions) {
      if (!q.required) continue;
      const v = currentAnswers[q.id];
      if (Array.isArray(v) ? v.length === 0 : !(typeof v === 'string' && v.trim().length > 0)) {
        return q.label;
      }
    }
    return null;
  }

  function handleSubmit() {
    if (locked || !onSubmit) return;
    if (!withinSelectionLimits) return;
    const missing = missingRequired();
    if (missing) {
      // Soft inline guard — surface via aria but don't alert; the disabled
      // state of the submit button covers most cases.
      return;
    }
    onSubmit(formatFormAnswers(form, answers), answers);
  }

  const required = form.questions.filter((q) => q.required);
  const withinSelectionLimits = form.questions.every((q) => {
    if (q.type !== 'checkbox' || q.maxSelections === undefined) return true;
    const v = currentAnswers[q.id];
    return !Array.isArray(v) || v.length <= q.maxSelections;
  });
  const ready = withinSelectionLimits && required.every((q) => {
    const v = currentAnswers[q.id];
    return Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim().length > 0;
  });

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
              {q.type === 'select' && q.options ? (
                <select
                  className="qf-select"
                  value={typeof value === 'string' ? value : ''}
                  disabled={locked}
                  onChange={(e) => update(q.id, e.target.value)}
                >
                  <option value="" disabled>
                    {t('qf.choose')}
                  </option>
                  {q.options.map((opt) => (
                    <option key={opt.value} value={opt.value} title={opt.description}>
                      {opt.label}
                    </option>
                  ))}
                </select>
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
            </div>
          );
        })}
      </div>
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
    </div>
  );
}

function OptionCopy({ option }: { option: FormOption }) {
  return (
    <span className="qf-chip-copy">
      <span>{option.label}</span>
      {option.description ? <span className="qf-chip-desc">{option.description}</span> : null}
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
      out[q.id] = submitted[q.id]!;
      continue;
    }
    if (q.defaultValue !== undefined) {
      out[q.id] = q.defaultValue;
      continue;
    }
    if (q.type === 'checkbox') {
      out[q.id] = [];
    } else {
      out[q.id] = '';
    }
  }
  return out;
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
