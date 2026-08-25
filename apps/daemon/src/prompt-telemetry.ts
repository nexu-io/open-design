import { createHash } from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import type { StrategyInputStageV2 } from '@open-design/contracts';

import { redactSecrets } from './redact.js';
import type { StrategyTaskFinalTextIdentity } from './strategies/task-store.js';

export const PROMPT_STACK_REDACTION_VERSION = 'prompt-stack-redaction-v1';
export const PROMPT_STACK_PATH_MARKER = '[REDACTED:path]';

const KIB = 1024;
const DAEMON_SYSTEM_PROMPT_MAX_BYTES = 128 * KIB;
const SECTION_MAX_BYTES = 64 * KIB;
const TOTAL_REDACTED_CONTENT_MAX_BYTES = 512 * KIB;
const CHILD_PROMPT_MESSAGE_MAX_BYTES = 16 * KIB;
const CHILD_PROMPT_TOTAL_MAX_BYTES = 64 * KIB;
const CHILD_PROMPT_MAX_MESSAGES = 16;

export type PromptTelemetrySectionKind =
  | 'formOverride'
  | 'daemonSystemPrompt'
  | 'runtimeToolPrompt'
  | 'researchCommandContract'
  | 'runContextPrompt'
  | 'clientSystemPrompt'
  | 'echoGuard'
  | 'userRequest'
  | 'skillPrompt'
  | 'designSystemPrompt'
  | 'pluginStagePrompt'
  | 'odNextExactFinalText'
  | 'cwdHint'
  | 'linkedDirsHint'
  | 'attachments'
  | 'commentAttachments'
  | 'promptImagePaths';

export interface PromptTelemetryInputSection {
  kind: PromptTelemetrySectionKind;
  content?: string | null;
  captureContent?: boolean;
  metadata?: unknown;
}

export interface PromptTelemetrySection {
  kind: PromptTelemetrySectionKind;
  ordinal: number;
  present: boolean;
  contentMode: 'redacted-section-content' | 'metadata-only';
  rawBytes: number;
  redactedBytes: number;
  fingerprint: string;
  truncated: boolean;
  truncationReason?: 'section_byte_limit' | 'total_budget_exceeded';
  redactedContent?: string;
  metadata?: Record<string, unknown>;
}

export interface PromptStackTelemetry {
  redactionVersion: typeof PROMPT_STACK_REDACTION_VERSION;
  promptFingerprint: string;
  stackFingerprint: string;
  rawBytes: number;
  redactedBytes: number;
  sectionCount: number;
  redactedContentBytes: number;
  redactedContentBudgetBytes: number;
  sections: PromptTelemetrySection[];
  odNextExactSend?: OdNextExactSendPromptEvidenceV1;
}

export interface OdNextExactSendPromptEvidenceV1 {
  schema: 'open-design.od-next-exact-send-prompt/v1';
  boundary: 'hostComposed';
  kind: StrategyTaskFinalTextIdentity['kind'];
  promptSchema: StrategyTaskFinalTextIdentity['schema'];
  stage: StrategyInputStageV2;
  sha256: string;
  utf8Bytes: number;
}

export class InvalidOdNextExactSendPromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOdNextExactSendPromptError';
  }
}

export interface StructuredPromptStackInput {
  type: 'open-design.prompt-stack';
  redactionVersion: typeof PROMPT_STACK_REDACTION_VERSION;
  promptFingerprint: string;
  stackFingerprint: string;
  sectionCount: number;
  redactedContentBytes: number;
  redactedContentBudgetBytes: number;
  sections: Array<{
    kind: PromptTelemetrySectionKind;
    ordinal: number;
    contentMode: PromptTelemetrySection['contentMode'];
    rawBytes: number;
    redactedBytes: number;
    fingerprint: string;
    truncated: boolean;
    truncationReason?: PromptTelemetrySection['truncationReason'];
    redactedContent?: string;
    metadata?: Record<string, unknown>;
  }>;
}

export interface SafeChildPromptInput extends Record<string, unknown> {
  type: 'open-design.child-injected-prompt';
  redactionVersion: typeof PROMPT_STACK_REDACTION_VERSION;
  messageCount: number;
  capturedMessageCount: number;
  rawBytes: number;
  redactedContentBytes: number;
  redactedContentBudgetBytes: number;
  truncated: boolean;
  messages: Array<{
    ordinal: number;
    rawBytes: number;
    redactedBytes: number;
    fingerprint: string;
    truncated: boolean;
    redactedContent: string;
  }>;
}

export interface SafeChildPromptTelemetry {
  hash: string;
  bytes: number;
  safePayload: SafeChildPromptInput;
  truncated: boolean;
}

interface MutablePromptTelemetrySection extends PromptTelemetrySection {
  redactedSource: string;
}

const REDACTED_CONTENT_KINDS = new Set<PromptTelemetrySectionKind>([
  'formOverride',
  'daemonSystemPrompt',
  'runtimeToolPrompt',
  'researchCommandContract',
  'runContextPrompt',
  'clientSystemPrompt',
  'echoGuard',
  'userRequest',
  'skillPrompt',
  'designSystemPrompt',
  'pluginStagePrompt',
  'odNextExactFinalText',
]);

const SECTION_PRIORITY = new Map<PromptTelemetrySectionKind, number>([
  ['formOverride', 1],
  ['daemonSystemPrompt', 2],
  ['runtimeToolPrompt', 3],
  ['clientSystemPrompt', 4],
  ['skillPrompt', 5],
  ['designSystemPrompt', 5],
  ['pluginStagePrompt', 5],
  ['odNextExactFinalText', 1],
  ['researchCommandContract', 6],
  ['runContextPrompt', 7],
  ['echoGuard', 8],
  ['userRequest', 9],
]);

const FILE_LOCAL_PATH =
  /(^|[\s([{"'`@])file:\/\/(?:localhost)?\/[^\s)\]}"'`,;<>]+/gi;
const POSIX_LOCAL_PATH =
  /(^|[\s([{"'`@])\/(?:Users|home|root|tmp|private\/tmp|private\/var\/folders|private\/var\/tmp|var\/folders|var\/tmp|usr\/local|opt|Volumes|mnt|media|srv|workspace|workspaces|app)\/[^\s)\]}"'`,;<>]+/g;
const WINDOWS_LOCAL_PATH =
  /(^|[\s([{"'`@])(?:[A-Za-z]:\\|\\\\)[^\s)\]}"'`,;<>]+/g;

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function truncateUtf8(value: string, maxBytes: number): string {
  const buf = Buffer.from(value, 'utf8');
  if (buf.length <= maxBytes) return value;
  let cut = maxBytes;
  while (cut > 0 && (buf[cut]! & 0xc0) === 0x80) cut -= 1;
  return buf.subarray(0, cut).toString('utf8');
}

export function redactLocalPaths(input: string): string {
  if (!input) return input;
  return input
    .replace(FILE_LOCAL_PATH, (_match, prefix: string) => {
      return `${prefix}${PROMPT_STACK_PATH_MARKER}`;
    })
    .replace(POSIX_LOCAL_PATH, (_match, prefix: string) => {
      return `${prefix}${PROMPT_STACK_PATH_MARKER}`;
    })
    .replace(WINDOWS_LOCAL_PATH, (_match, prefix: string) => {
      return `${prefix}${PROMPT_STACK_PATH_MARKER}`;
    });
}

function redactPromptText(input: string): string {
  return redactLocalPaths(redactSecrets(input));
}

/**
 * Capture the runtime-visible Child task text without retaining its raw body.
 * The same secret/path redaction used for host-composed Prompt telemetry runs
 * before bounded content enters a Normalized observation. Callers may persist
 * the returned object; they must never persist the input strings separately.
 */
export function buildSafeChildPromptTelemetry(
  messages: readonly string[],
): SafeChildPromptTelemetry {
  const rawBytes = messages.reduce((total, message) => total + byteLength(message), 0);
  let remaining = CHILD_PROMPT_TOTAL_MAX_BYTES;
  let truncated = messages.length > CHILD_PROMPT_MAX_MESSAGES;
  const safeMessages = messages.slice(0, CHILD_PROMPT_MAX_MESSAGES).map((message, ordinal) => {
    const redacted = redactPromptText(message);
    const messageRawBytes = byteLength(message);
    const redactedBytes = byteLength(redacted);
    const limit = Math.min(CHILD_PROMPT_MESSAGE_MAX_BYTES, remaining);
    const redactedContent = truncateUtf8(redacted, Math.max(0, limit));
    const contentBytes = byteLength(redactedContent);
    remaining -= contentBytes;
    const messageTruncated = contentBytes < redactedBytes;
    truncated ||= messageTruncated;
    return {
      ordinal,
      rawBytes: messageRawBytes,
      redactedBytes,
      fingerprint: sha256(redacted),
      truncated: messageTruncated,
      redactedContent,
    };
  });
  return {
    hash: sha256(JSON.stringify(messages)),
    bytes: rawBytes,
    safePayload: {
      type: 'open-design.child-injected-prompt',
      redactionVersion: PROMPT_STACK_REDACTION_VERSION,
      messageCount: messages.length,
      capturedMessageCount: safeMessages.length,
      rawBytes,
      redactedContentBytes: safeMessages.reduce(
        (total, message) => total + byteLength(message.redactedContent),
        0,
      ),
      redactedContentBudgetBytes: CHILD_PROMPT_TOTAL_MAX_BYTES,
      truncated,
      messages: safeMessages,
    },
    truncated,
  };
}

function stripRuntimeToolPromptTokens(input: string): string {
  return input
    .split(/\r?\n/)
    .filter((line) => !line.includes('OD_TOOL_TOKEN'))
    .join('\n');
}

function sanitizeSectionContent(kind: PromptTelemetrySectionKind, content: string): string {
  const structurallySafe =
    kind === 'runtimeToolPrompt' ? stripRuntimeToolPromptTokens(content) : content;
  return redactPromptText(structurallySafe);
}

function extensionFromPath(value: string): string | null {
  const ext = path.extname(value).replace(/^\./, '').toLowerCase();
  return ext || null;
}

function sizeBucket(value: number): string {
  if (value <= 0) return 'unknown';
  if (value <= 10 * KIB) return '0-10KiB';
  if (value <= 100 * KIB) return '10-100KiB';
  if (value <= 1024 * KIB) return '100KiB-1MiB';
  return '1MiB+';
}

function summarizeMetadataValue(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const extensions = new Set<string>();
    const sizeBuckets = new Map<string, number>();
    const selectionKinds = new Map<string, number>();
    let knownSizeCount = 0;
    for (const item of value) {
      if (typeof item === 'string') {
        const ext = extensionFromPath(item);
        if (ext) extensions.add(ext);
        continue;
      }
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const fileLike =
        typeof obj.filePath === 'string'
          ? obj.filePath
          : typeof obj.screenshotPath === 'string'
            ? obj.screenshotPath
            : typeof obj.path === 'string'
              ? obj.path
              : typeof obj.name === 'string'
                ? obj.name
                : '';
      const ext = fileLike ? extensionFromPath(fileLike) : null;
      if (ext) extensions.add(ext);
      const size = typeof obj.size === 'number' ? obj.size : undefined;
      if (size !== undefined && Number.isFinite(size)) {
        knownSizeCount += 1;
        const bucket = sizeBucket(size);
        sizeBuckets.set(bucket, (sizeBuckets.get(bucket) ?? 0) + 1);
      }
      if (typeof obj.selectionKind === 'string') {
        selectionKinds.set(
          obj.selectionKind,
          (selectionKinds.get(obj.selectionKind) ?? 0) + 1,
        );
      }
    }
    return {
      count: value.length,
      extensions: Array.from(extensions).sort(),
      sizeBuckets: Object.fromEntries([...sizeBuckets].sort()),
      knownSizeCount,
      selectionKinds: Object.fromEntries([...selectionKinds].sort()),
    };
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return { keyCount: keys.length, keys };
  }
  if (typeof value === 'string') {
    return {
      count: value.length > 0 ? 1 : 0,
      extensions: extensionFromPath(value) ? [extensionFromPath(value)] : [],
    };
  }
  return {};
}

function metadataFingerprintSource(
  section: PromptTelemetryInputSection,
): Record<string, unknown> {
  if (section.metadata !== undefined) {
    return summarizeMetadataValue(section.metadata);
  }
  return summarizeMetadataValue(section.content ?? '');
}

function perSectionLimit(kind: PromptTelemetrySectionKind): number {
  return kind === 'daemonSystemPrompt'
    ? DAEMON_SYSTEM_PROMPT_MAX_BYTES
    : SECTION_MAX_BYTES;
}

export function buildPromptStackTelemetry({
  composedPrompt,
  sections,
}: {
  composedPrompt: string;
  sections: PromptTelemetryInputSection[];
}): PromptStackTelemetry {
  const normalizedComposed = redactPromptText(composedPrompt);
  const rawBytes = byteLength(composedPrompt);
  const redactedBytes = byteLength(normalizedComposed);
  const built: MutablePromptTelemetrySection[] = sections.map((section, index) => {
    const rawContent = typeof section.content === 'string' ? section.content : '';
    const present =
      rawContent.length > 0 ||
      (Array.isArray(section.metadata)
        ? section.metadata.length > 0
        : section.metadata !== undefined && section.metadata !== null);
    const isContentKind = REDACTED_CONTENT_KINDS.has(section.kind);
    const canCaptureContent = isContentKind && section.captureContent !== false;
    const redacted = isContentKind
      ? sanitizeSectionContent(section.kind, rawContent)
      : JSON.stringify(metadataFingerprintSource(section));
    const metadata = isContentKind
      ? section.metadata && typeof section.metadata === 'object'
        ? summarizeMetadataValue(section.metadata)
        : undefined
      : metadataFingerprintSource(section);
    return {
      kind: section.kind,
      ordinal: index,
      present,
      contentMode: (canCaptureContent
        ? 'redacted-section-content'
        : 'metadata-only') as PromptTelemetrySection['contentMode'],
      rawBytes: byteLength(rawContent),
      redactedBytes: byteLength(redacted),
      fingerprint: sha256(redacted),
      truncated: false,
      redactedSource: redacted,
      ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
    };
  });

  let remaining = TOTAL_REDACTED_CONTENT_MAX_BYTES;
  const allocationOrder = [...built]
    .filter((section) => section.present && section.contentMode === 'redacted-section-content')
    .sort((a, b) => {
      const priorityA = SECTION_PRIORITY.get(a.kind) ?? 99;
      const priorityB = SECTION_PRIORITY.get(b.kind) ?? 99;
      return priorityA - priorityB || a.ordinal - b.ordinal;
    });
  for (const section of allocationOrder) {
    if (remaining <= 0) {
      section.truncated = true;
      section.truncationReason = 'total_budget_exceeded';
      continue;
    }
    const limit = Math.min(perSectionLimit(section.kind), remaining);
    const redactedContent = truncateUtf8(section.redactedSource, limit);
    const contentBytes = byteLength(redactedContent);
    if (contentBytes > 0) section.redactedContent = redactedContent;
    remaining -= contentBytes;
    const sourceBytes = byteLength(section.redactedSource);
    if (contentBytes < sourceBytes) {
      section.truncated = true;
      section.truncationReason =
        limit < perSectionLimit(section.kind)
          ? 'total_budget_exceeded'
          : 'section_byte_limit';
    }
  }

  const outputSections: PromptTelemetrySection[] = built
    .filter((section) => section.present)
    .map(({ redactedSource: _redactedSource, ...section }) => section);
  const stackFingerprintSource = outputSections.map((section) => ({
    kind: section.kind,
    ordinal: section.ordinal,
    fingerprint: section.fingerprint,
  }));
  const redactedContentBytes = outputSections.reduce(
    (total, section) => total + byteLength(section.redactedContent ?? ''),
    0,
  );
  return {
    redactionVersion: PROMPT_STACK_REDACTION_VERSION,
    promptFingerprint: sha256(normalizedComposed),
    stackFingerprint: sha256(JSON.stringify(stackFingerprintSource)),
    rawBytes,
    redactedBytes,
    sectionCount: outputSections.length,
    redactedContentBytes,
    redactedContentBudgetBytes: TOTAL_REDACTED_CONTENT_MAX_BYTES,
    sections: outputSections,
  };
}

/**
 * Bind the mapped OD Next identity to the exact inner text that is about to
 * cross a runtime transport. The caller must pass the same variable used by
 * prompt-file, argv, ACP, stdin, or stream-json encoding; wrappers are applied
 * only after this gate and therefore never enter this identity.
 */
export function bindOdNextExactSendPromptEvidence(input: {
  telemetry: PromptStackTelemetry;
  finalText: string;
  persisted: StrategyTaskFinalTextIdentity;
  stage: StrategyInputStageV2;
}): PromptStackTelemetry {
  const utf8Bytes = byteLength(input.finalText);
  const sha256Hex = createHash('sha256').update(input.finalText, 'utf8').digest('hex');
  if (
    input.telemetry.rawBytes !== utf8Bytes ||
    input.persisted.text !== input.finalText ||
    input.persisted.utf8Bytes !== utf8Bytes ||
    input.persisted.sha256 !== sha256Hex
  ) {
    throw new InvalidOdNextExactSendPromptError(
      'OD Next exact-send Prompt does not match its persisted SHA-256 and UTF-8 byte identity.',
    );
  }
  const expectedKind = input.stage === 'request' ? 'bundle' : 'turn';
  if (input.persisted.kind !== expectedKind) {
    throw new InvalidOdNextExactSendPromptError(
      'OD Next exact-send Prompt kind does not match its mapped task stage.',
    );
  }
  return {
    ...input.telemetry,
    odNextExactSend: {
      schema: 'open-design.od-next-exact-send-prompt/v1',
      boundary: 'hostComposed',
      kind: input.persisted.kind,
      promptSchema: input.persisted.schema,
      stage: input.stage,
      sha256: sha256Hex,
      utf8Bytes,
    },
  };
}

/**
 * Revalidate durable exact-send evidence before task-level export. The task
 * mapping is the persisted source of truth; this comparison deliberately does
 * not replace the run evidence or rebuild an export payload from task state.
 */
export function assertOdNextExactSendPromptEvidence(input: {
  telemetry: PromptStackTelemetry;
  persisted: StrategyTaskFinalTextIdentity;
  stage: StrategyInputStageV2;
}): void {
  const expected = bindOdNextExactSendPromptEvidence({
    telemetry: buildPromptStackTelemetry({
      composedPrompt: input.persisted.text,
      sections: [{ kind: 'odNextExactFinalText', content: input.persisted.text }],
    }),
    finalText: input.persisted.text,
    persisted: input.persisted,
    stage: input.stage,
  });
  if (!isDeepStrictEqual(input.telemetry, expected)) {
    throw new InvalidOdNextExactSendPromptError(
      'Persisted OD Next exact-send Prompt evidence no longer matches its authoritative task mapping.',
    );
  }
}

export function promptStackWithoutContent(
  telemetry: PromptStackTelemetry,
): PromptStackTelemetry {
  return {
    ...telemetry,
    redactedContentBytes: 0,
    sections: telemetry.sections.map(({ redactedContent: _content, ...section }) => section),
  };
}

export function structuredPromptStackInput(
  telemetry: PromptStackTelemetry,
): StructuredPromptStackInput {
  return {
    type: 'open-design.prompt-stack',
    redactionVersion: telemetry.redactionVersion,
    promptFingerprint: telemetry.promptFingerprint,
    stackFingerprint: telemetry.stackFingerprint,
    sectionCount: telemetry.sectionCount,
    redactedContentBytes: telemetry.redactedContentBytes,
    redactedContentBudgetBytes: telemetry.redactedContentBudgetBytes,
    sections: telemetry.sections.map((section) => ({
      kind: section.kind,
      ordinal: section.ordinal,
      contentMode: section.contentMode,
      rawBytes: section.rawBytes,
      redactedBytes: section.redactedBytes,
      fingerprint: section.fingerprint,
      truncated: section.truncated,
      ...(section.truncationReason
        ? { truncationReason: section.truncationReason }
        : {}),
      ...(section.redactedContent !== undefined
        ? { redactedContent: section.redactedContent }
        : {}),
      ...(section.metadata ? { metadata: section.metadata } : {}),
    })),
  };
}

export function buildPromptStackFlatMetadata(
  telemetry: PromptStackTelemetry,
): Record<string, unknown> {
  return {
    promptStack_redactionVersion: telemetry.redactionVersion,
    promptStack_promptFingerprint: telemetry.promptFingerprint,
    promptStack_stackFingerprint: telemetry.stackFingerprint,
    promptStack_sectionCount: telemetry.sectionCount,
    promptStack_redactedContentBytes: telemetry.redactedContentBytes,
    promptStack_redactedContentBudgetBytes: telemetry.redactedContentBudgetBytes,
  };
}
