import type {
  DirectionCard,
  FormOption,
  FormQuestion,
  QuestionForm,
  QuestionFormAnswerEnvelope,
  QuestionFormAnswers,
  QuestionType,
} from '@open-design/contracts';

export interface ResolvedQuestionForm {
  form: QuestionForm;
  source: 'assistant-text' | 'tool-result' | 'fallback';
  repaired: boolean;
  reason?: string;
}

const OPEN_TAG_RE = /<(question-form|ask-question)\b/i;
const COMPLETE_FORM_RE = /<(question-form|ask-question)\b([^>]*)>([\s\S]*?)<\/\1>/i;

const QUESTION_TYPES = new Set<QuestionType>([
  'radio',
  'checkbox',
  'select',
  'text',
  'textarea',
  'number',
  'range',
  'date',
  'time',
  'datetime-local',
  'color',
  'url',
  'email',
  'tel',
  'file',
  'switch',
  'direction-cards',
]);

export type CompletedQuestionFormParseResult =
  | { kind: 'none' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'valid'; form: QuestionForm; raw: string; prose: string };

export function parseCompletedQuestionForm(input: string): CompletedQuestionFormParseResult {
  const match = COMPLETE_FORM_RE.exec(input);
  if (!match) {
    return OPEN_TAG_RE.test(input)
      ? { kind: 'invalid', reason: 'question form is incomplete' }
      : { kind: 'none' };
  }

  const body = (match[3] ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  if (!body) return { kind: 'invalid', reason: 'question form body is empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { kind: 'invalid', reason: 'question form body is not valid JSON' };
  }

  const form = normalizeQuestionForm(parsed, parseAttrs(match[2] ?? ''));
  if (!form) return { kind: 'invalid', reason: 'question form has no valid questions' };

  const raw = match[0];
  const prose = `${input.slice(0, match.index)}${input.slice(match.index + raw.length)}`.trim();
  return { kind: 'valid', form, raw, prose };
}

/**
 * Resolve the canonical form for an A2A clarification turn. Assistant text is
 * authoritative. A standalone tool result is accepted as a compatibility
 * recovery for agents that incorrectly route the markup through `echo`. If a
 * complete-looking form is malformed, return a deterministic Open Design form
 * rather than letting website-output validation misclassify the turn.
 */
export function resolveA2AQuestionForm(input: {
  assistantText: string;
  standaloneToolResult?: string | null;
  prompt: string;
}): ResolvedQuestionForm | null {
  const candidates: Array<{
    source: 'assistant-text' | 'tool-result';
    value: string;
  }> = [
    { source: 'assistant-text', value: input.assistantText },
    ...(input.standaloneToolResult
      ? [{ source: 'tool-result' as const, value: input.standaloneToolResult }]
      : []),
  ];
  let invalidReason: string | null = null;
  for (const candidate of candidates) {
    const parsed = parseCompletedQuestionForm(candidate.value);
    if (parsed.kind === 'valid') {
      return { form: parsed.form, source: candidate.source, repaired: false };
    }
    if (parsed.kind === 'invalid') invalidReason ??= parsed.reason;
  }
  if (!invalidReason) return null;
  return {
    form: buildFallbackDiscoveryQuestionForm(input.prompt),
    source: 'fallback',
    repaired: true,
    reason: invalidReason,
  };
}

export function standaloneQuestionFormToolResult(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^<(?:question-form|ask-question)\b/i.test(trimmed)) return null;
  if (!/<\/(?:question-form|ask-question)>$/i.test(trimmed)) return null;
  return trimmed;
}

export function buildFallbackDiscoveryQuestionForm(prompt: string): QuestionForm {
  const chinese = /[\u3400-\u9fff]/.test(prompt);
  if (chinese) {
    return {
      id: 'discovery',
      title: '快速确认 · 30秒',
      description: 'Open Design 返回的定制表单格式无效，已切换为安全的标准需求确认表单。',
      lang: 'zh-CN',
      questions: [
        {
          id: 'brand',
          label: '品牌方向',
          type: 'radio',
          defaultValue: 'recommend',
          options: [
            { label: '由 Open Design 推荐', value: 'recommend', description: '根据当前需求自动选择合适的品牌方向' },
            { label: '使用已有品牌规范', value: 'provided', description: '我会提供品牌色、字体或参考资料' },
          ],
        },
        {
          id: 'audience',
          label: '主要用户是谁？',
          type: 'text',
          placeholder: '例如：北京的年轻上班族',
        },
        {
          id: 'tone',
          label: '希望采用什么视觉风格？',
          type: 'radio',
          defaultValue: 'modern',
          options: [
            { label: '现代简洁', value: 'modern', description: '清晰、克制、适合多数产品与企业网站' },
            { label: '高端奢华', value: 'luxury', description: '精致排版、丰富留白和高级质感' },
            { label: '轻松活泼', value: 'playful', description: '更有亲和力、城市生活感或年轻气质' },
          ],
        },
        {
          id: 'additional',
          label: '还有哪些必须包含的页面或功能？',
          type: 'textarea',
          placeholder: '没有可填写“按当前需求直接生成”',
        },
      ],
    };
  }
  return {
    id: 'discovery',
    title: 'Quick brief · 30 seconds',
    description: 'The tailored form was invalid, so Open Design switched to a safe standard brief.',
    lang: 'en',
    questions: [
      {
        id: 'brand',
        label: 'Brand direction',
        type: 'radio',
        defaultValue: 'recommend',
        options: [
          { label: 'Let Open Design recommend', value: 'recommend', description: 'Choose a suitable direction from the current brief' },
          { label: 'Use an existing brand', value: 'provided', description: 'I will provide colors, type, or references' },
        ],
      },
      { id: 'audience', label: 'Who is the primary audience?', type: 'text' },
      {
        id: 'tone',
        label: 'Which visual tone should we use?',
        type: 'radio',
        defaultValue: 'modern',
        options: [
          { label: 'Modern and minimal', value: 'modern', description: 'Clear, restrained, and broadly suitable' },
          { label: 'Premium and luxurious', value: 'luxury', description: 'Refined typography and generous whitespace' },
          { label: 'Friendly and playful', value: 'playful', description: 'Approachable, energetic, and youthful' },
        ],
      },
      { id: 'additional', label: 'Any required pages or features?', type: 'textarea' },
    ],
  };
}

export function parseQuestionFormAnswer(
  value: unknown,
  expected: QuestionForm,
): QuestionFormAnswerEnvelope {
  if (!isRecord(value)) throw new Error('answer part must contain an object');
  if (value.schemaVersion !== 1) throw new Error('unsupported question form answer schema');
  if (value.formId !== expected.id) throw new Error('answer formId does not match the pending form');
  if (!isRecord(value.answers)) throw new Error('answers must be an object');

  const questions = new Map(expected.questions.map((question) => [question.id, question]));
  const answers: QuestionFormAnswers = {};
  for (const [id, rawAnswer] of Object.entries(value.answers)) {
    const question = questions.get(id);
    if (!question) throw new Error(`unknown question id: ${id}`);
    const answer = normalizeAnswer(rawAnswer, question);
    answers[id] = answer;
  }

  for (const question of expected.questions) {
    const answer = answers[question.id];
    if (question.required && isEmptyAnswer(answer)) {
      throw new Error(`required question is unanswered: ${question.id}`);
    }
  }

  return { schemaVersion: 1, formId: expected.id, answers };
}

export function formatQuestionFormAnswers(
  form: QuestionForm,
  answers: QuestionFormAnswers,
): string {
  const lines = [`[form answers — ${form.id}]`];
  for (const question of form.questions) {
    const answer = answers[question.id];
    const values = Array.isArray(answer) ? answer : typeof answer === 'string' ? [answer] : [];
    const display = values.length > 0
      ? values.map((value) => optionDisplay(question, value)).join(', ')
      : '(skipped)';
    lines.push(`- ${question.label}: ${display}`);
  }
  return lines.join('\n');
}

function normalizeQuestionForm(value: unknown, attrs: Record<string, string>): QuestionForm | null {
  const record = Array.isArray(value) ? null : isRecord(value) ? value : null;
  const rawQuestions = Array.isArray(value)
    ? value
    : record && Array.isArray(record.questions)
      ? record.questions
      : null;
  if (!rawQuestions) return null;

  const questions = rawQuestions
    .map((question, index) => normalizeQuestion(question, index))
    .filter((question): question is FormQuestion => question !== null);
  if (questions.length === 0) return null;

  const id = attrs.id ?? stringValue(record?.id) ?? 'discovery';
  const title = attrs.title ?? stringValue(record?.title) ?? 'A few quick questions';
  const description = stringValue(record?.description);
  const submitLabel = stringValue(record?.submitLabel);
  const lang = stringValue(record?.lang);
  return {
    id,
    title,
    questions,
    ...(description ? { description } : {}),
    ...(submitLabel ? { submitLabel } : {}),
    ...(lang ? { lang } : {}),
  };
}

function normalizeQuestion(value: unknown, index: number): FormQuestion | null {
  if (!isRecord(value)) return null;
  const options = normalizeOptions(value.options);
  const id = stringValue(value.id) ?? `q${index + 1}`;
  const label = stringValue(value.label) ?? stringValue(value.prompt) ?? id;
  const type = normalizeQuestionType(value.type, options);
  const cards = normalizeCards(value.cards);
  const defaultValue = normalizeDefaultValue(value.defaultValue ?? value.default, options);
  const maxSelections = positiveInteger(value.maxSelections);
  const min = finiteNumber(value.min);
  const max = finiteNumber(value.max);
  const step = finiteNumber(value.step);
  const placeholder = stringValue(value.placeholder);
  const help = stringValue(value.help);
  const customLabel = stringValue(value.customLabel);
  const customPlaceholder = stringValue(value.customPlaceholder);
  const accept = stringValue(value.accept);
  const allowCustom = value.allowCustom === false
    ? false
    : value.allowCustom === true || value.custom === true
      ? true
      : undefined;
  return {
    id,
    label,
    type,
    ...(options ? { options } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(value.required === true ? { required: true } : {}),
    ...(help ? { help } : {}),
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(type === 'checkbox' && maxSelections ? { maxSelections } : {}),
    ...(allowCustom !== undefined ? { allowCustom } : {}),
    ...(customLabel ? { customLabel } : {}),
    ...(customPlaceholder ? { customPlaceholder } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    ...(step !== undefined ? { step } : {}),
    ...(type === 'file' && value.multiple === true ? { multiple: true } : {}),
    ...(type === 'file' && accept ? { accept } : {}),
    ...(cards ? { cards } : {}),
  };
}

function normalizeQuestionType(value: unknown, options?: FormOption[]): QuestionType {
  if (typeof value === 'string' && QUESTION_TYPES.has(value as QuestionType)) {
    return value as QuestionType;
  }
  return options && options.length > 0 ? 'radio' : 'text';
}

function normalizeOptions(value: unknown): FormOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const options = value.flatMap((option): FormOption[] => {
    if (typeof option === 'string' && option.trim()) {
      return [{ label: option.trim(), value: option.trim() }];
    }
    if (!isRecord(option)) return [];
    const label = stringValue(option.label) ?? stringValue(option.value);
    const optionValue = stringValue(option.value) ?? label;
    if (!label || !optionValue) return [];
    const description = stringValue(option.description);
    return [{ label, value: optionValue, ...(description ? { description } : {}) }];
  });
  return options.length > 0 ? options : undefined;
}

function normalizeCards(value: unknown): DirectionCard[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cards = value.flatMap((card): DirectionCard[] => {
    if (!isRecord(card)) return [];
    const id = stringValue(card.id);
    const label = stringValue(card.label);
    if (!id || !label) return [];
    return [{
      id,
      label,
      mood: stringValue(card.mood) ?? '',
      references: stringArray(card.references).slice(0, 6),
      palette: stringArray(card.palette).slice(0, 8),
      displayFont: stringValue(card.displayFont) ?? 'Georgia, serif',
      bodyFont: stringValue(card.bodyFont) ?? '-apple-system, system-ui, sans-serif',
    }];
  });
  return cards.length > 0 ? cards : undefined;
}

function normalizeDefaultValue(
  value: unknown,
  options?: FormOption[],
): string | string[] | undefined {
  if (typeof value === 'string') return normalizeOptionValue(value, options);
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value.map((item) => normalizeOptionValue(item, options));
  }
  return undefined;
}

function normalizeAnswer(value: unknown, question: FormQuestion): string | string[] {
  const expectsMany = question.type === 'checkbox' || (question.type === 'file' && question.multiple);
  if (expectsMany) {
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
      throw new Error(`answer for ${question.id} must be an array of strings`);
    }
    const answer = value.map((item) => item.trim()).filter(Boolean);
    if (question.maxSelections && answer.length > question.maxSelections) {
      throw new Error(`answer for ${question.id} exceeds maxSelections`);
    }
    validateFiniteChoices(question, answer);
    return answer;
  }
  if (typeof value !== 'string') throw new Error(`answer for ${question.id} must be a string`);
  const answer = value.trim();
  validateFiniteChoices(question, answer ? [answer] : []);
  return answer;
}

function validateFiniteChoices(question: FormQuestion, values: string[]): void {
  if (!question.options || question.options.length === 0 || question.allowCustom !== false) return;
  const allowed = new Set(question.options.flatMap((option) => [option.value, option.label]));
  for (const value of values) {
    if (!allowed.has(value)) throw new Error(`answer for ${question.id} is not an allowed option`);
  }
}

function optionDisplay(question: FormQuestion, value: string): string {
  const option = question.options?.find((candidate) =>
    candidate.value === value || candidate.label === value);
  if (!option) return value;
  return option.value === option.label ? option.label : `${option.label} [value: ${option.value}]`;
}

function normalizeOptionValue(value: string, options?: FormOption[]): string {
  const option = options?.find((candidate) =>
    candidate.value === value || candidate.label === value);
  return option?.value ?? value;
}

function isEmptyAnswer(value: string | string[] | undefined): boolean {
  return value === undefined || (Array.isArray(value) ? value.length === 0 : value.trim().length === 0);
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    attrs[match[1] as string] = match[2] ?? match[3] ?? '';
  }
  return attrs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}
