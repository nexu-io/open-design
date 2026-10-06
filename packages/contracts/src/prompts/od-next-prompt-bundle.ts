import type { StrategyInputStageV2 } from '../plugins/strategy-v2.js';

export const OD_NEXT_PROMPT_BUNDLE_SCHEMA_V1 =
  'open-design.od-next-prompt-bundle/v1' as const;
export const OD_NEXT_REQUEST_TURN_SCHEMA_V1 =
  'open-design.od-next-request-turn/v1' as const;

export interface OdNextPromptBundleV1 {
  systemPrompt: string;
  userPrompt: string;
  taskConfig: string;
  context: string;
}

export type OdNextRequestTurnStageV1 = Exclude<StrategyInputStageV2, 'request'>;

export interface OdNextRequestTurnV1 {
  taskExecutionId: string;
  stage: OdNextRequestTurnStageV1;
  taskRunIndex: number;
  payload: string;
}

const BUNDLE_BLOCKS = [
  ['system_prompt', 'systemPrompt'],
  ['user_prompt', 'userPrompt'],
  ['task_config', 'taskConfig'],
  ['context', 'context'],
] as const;
const TURN_STAGES = new Set<OdNextRequestTurnStageV1>([
  'clarification',
  'contract_repair',
  'production',
]);
const XML_ATTRIBUTE_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

function assertXmlText(value: string, field: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(field + ' must be a string.');
  }
  const normalized = value.replace(/\r\n?/g, '\n');
  for (const character of normalized) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint === 0x09
      || codePoint === 0x0a
      || (codePoint >= 0x20 && codePoint <= 0xd7ff)
      || (codePoint >= 0xe000 && codePoint <= 0xfffd)
      || (codePoint >= 0x10000 && codePoint <= 0x10ffff)
    ) {
      continue;
    }
    throw new TypeError(field + ' contains a character forbidden by XML 1.0.');
  }
  return normalized;
}

function requireNonBlank(value: string, field: string): string {
  const normalized = assertXmlText(value, field);
  if (!normalized.trim()) throw new TypeError(field + ' must not be empty.');
  return normalized;
}

function escapeXmlAttribute(value: string, field: string): string {
  return assertXmlText(value, field)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function unescapeXmlAttribute(value: string, field: string): string {
  if (/&(?!amp;|apos;|gt;|lt;|quot;)/.test(value)) {
    throw new TypeError(field + ' contains an unsupported or unescaped XML entity.');
  }
  const decoded = value.replace(/&([a-z]+);/g, (whole, entity: string) => {
    const replacement = XML_ATTRIBUTE_ENTITIES[entity];
    if (replacement === undefined) {
      throw new TypeError(field + ' contains an unsupported XML entity.');
    }
    return replacement;
  });
  return assertXmlText(decoded, field);
}

function cdata(value: string, field: string): string {
  return '<![CDATA[' + assertXmlText(value, field).replaceAll(']]>', ']]]]><![CDATA[>') + ']]>';
}

function renderBlock(tag: string, value: string, field: string): string {
  return '  <' + tag + '>\n    ' + cdata(value, field) + '\n  </' + tag + '>';
}

export function serializeOdNextPromptBundleV1(
  input: OdNextPromptBundleV1,
): string {
  requireNonBlank(input.systemPrompt, 'systemPrompt');
  return [
    '<open_design_prompt_bundle schema="' + OD_NEXT_PROMPT_BUNDLE_SCHEMA_V1 + '">',
    ...BUNDLE_BLOCKS.map(([tag, field]) => renderBlock(tag, input[field], field)),
    '</open_design_prompt_bundle>',
  ].join('\n');
}

class CanonicalXmlCursor {
  private offset = 0;

  constructor(private readonly source: string) {}

  consume(literal: string): void {
    if (!this.source.startsWith(literal, this.offset)) {
      throw new TypeError(
        'Non-canonical XML at byte ' + this.offset + '; expected ' + literal + '.',
      );
    }
    this.offset += literal.length;
  }

  cdata(field: string): string {
    const chunks: string[] = [];
    do {
      this.consume('<![CDATA[');
      const end = this.source.indexOf(']]>', this.offset);
      if (end < 0) throw new TypeError(field + ' has an unterminated CDATA section.');
      chunks.push(this.source.slice(this.offset, end));
      this.offset = end + 3;
    } while (this.source.startsWith('<![CDATA[', this.offset));
    return assertXmlText(chunks.join(''), field);
  }

  attributeUntil(suffix: string, field: string): string {
    const end = this.source.indexOf(suffix, this.offset);
    if (end < 0) throw new TypeError(field + ' is missing its closing delimiter.');
    const encoded = this.source.slice(this.offset, end);
    this.offset = end + suffix.length;
    return unescapeXmlAttribute(encoded, field);
  }

  done(): boolean {
    return this.offset === this.source.length;
  }
}

export function parseOdNextPromptBundleV1(source: string): OdNextPromptBundleV1 {
  const cursor = new CanonicalXmlCursor(assertXmlText(source, 'bundle'));
  cursor.consume(
    '<open_design_prompt_bundle schema="' + OD_NEXT_PROMPT_BUNDLE_SCHEMA_V1 + '">\n',
  );
  const result = {} as Record<(typeof BUNDLE_BLOCKS)[number][1], string>;
  for (const [tag, field] of BUNDLE_BLOCKS) {
    cursor.consume('  <' + tag + '>\n    ');
    result[field] = cursor.cdata(field);
    cursor.consume('\n  </' + tag + '>\n');
  }
  cursor.consume('</open_design_prompt_bundle>');
  if (!cursor.done()) throw new TypeError('Prompt Bundle has bytes outside its root.');
  const parsed: OdNextPromptBundleV1 = result;
  if (serializeOdNextPromptBundleV1(parsed) !== source) {
    throw new TypeError('Prompt Bundle is not in canonical form.');
  }
  return parsed;
}

export function serializeOdNextRequestTurnV1(
  input: OdNextRequestTurnV1,
): string {
  const taskExecutionId = requireNonBlank(input.taskExecutionId, 'taskExecutionId');
  if (!TURN_STAGES.has(input.stage)) {
    throw new TypeError('OD Next request Turn supports only existing continuation stages.');
  }
  if (!Number.isSafeInteger(input.taskRunIndex) || input.taskRunIndex <= 0) {
    throw new TypeError('taskRunIndex must be a positive safe integer.');
  }
  return [
    '<open_design_request_turn schema="' + OD_NEXT_REQUEST_TURN_SCHEMA_V1
      + '" task_execution_id="' + escapeXmlAttribute(taskExecutionId, 'taskExecutionId')
      + '" stage="' + input.stage + '" task_run_index="' + input.taskRunIndex + '">',
    '  <payload>\n    ' + cdata(input.payload, 'payload') + '\n  </payload>',
    '</open_design_request_turn>',
  ].join('\n');
}

export function parseOdNextRequestTurnV1(source: string): OdNextRequestTurnV1 {
  const cursor = new CanonicalXmlCursor(assertXmlText(source, 'turn'));
  cursor.consume(
    '<open_design_request_turn schema="' + OD_NEXT_REQUEST_TURN_SCHEMA_V1
      + '" task_execution_id="',
  );
  const taskExecutionId = cursor.attributeUntil('" stage="', 'taskExecutionId');
  const stage = cursor.attributeUntil('" task_run_index="', 'stage');
  const taskRunIndexText = cursor.attributeUntil('">\n', 'taskRunIndex');
  if (!TURN_STAGES.has(stage as OdNextRequestTurnStageV1)) {
    throw new TypeError('OD Next request Turn supports only existing continuation stages.');
  }
  if (!/^[1-9][0-9]*$/.test(taskRunIndexText)) {
    throw new TypeError('taskRunIndex must use canonical positive integer syntax.');
  }
  cursor.consume('  <payload>\n    ');
  const payload = cursor.cdata('payload');
  cursor.consume('\n  </payload>\n</open_design_request_turn>');
  if (!cursor.done()) throw new TypeError('Request Turn has bytes outside its root.');
  const parsed: OdNextRequestTurnV1 = {
    taskExecutionId,
    stage: stage as OdNextRequestTurnStageV1,
    taskRunIndex: Number(taskRunIndexText),
    payload,
  };
  if (serializeOdNextRequestTurnV1(parsed) !== source) {
    throw new TypeError('Request Turn is not in canonical form.');
  }
  return parsed;
}
