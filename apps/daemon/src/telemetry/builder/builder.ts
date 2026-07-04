/** @module builder/builder
 * Assembles prompt-stack telemetry from raw prompt sections: fingerprints and
 * measures each section, allocates a byte budget for captured content by
 * priority, and derives content-free / structured / flat projections of the
 * result. Depends on the foundation (`../core`) for types and constants and on
 * the redaction sibling (`../redaction`, a declared allowedEdge) for content
 * sanitization.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';

import {
  PROMPT_STACK_REDACTION_VERSION,
  type PromptStackTelemetry,
  type PromptTelemetryInputSection,
  type PromptTelemetrySection,
  type PromptTelemetrySectionKind,
  type StructuredPromptStackInput,
} from '../core/index.js';
import { redactPromptText, sanitizeSectionContent } from '../redaction/index.js';

const KIB = 1024;
const DAEMON_SYSTEM_PROMPT_MAX_BYTES = 128 * KIB;
const SECTION_MAX_BYTES = 64 * KIB;
const TOTAL_REDACTED_CONTENT_MAX_BYTES = 512 * KIB;

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
]);

const SECTION_PRIORITY = new Map<PromptTelemetrySectionKind, number>([
  ['formOverride', 1],
  ['daemonSystemPrompt', 2],
  ['runtimeToolPrompt', 3],
  ['clientSystemPrompt', 4],
  ['skillPrompt', 5],
  ['designSystemPrompt', 5],
  ['pluginStagePrompt', 5],
  ['researchCommandContract', 6],
  ['runContextPrompt', 7],
  ['echoGuard', 8],
  ['userRequest', 9],
]);

/**
 * @internal
 * Prefixed SHA-256 hex digest used for every fingerprint in the payload.
 */
function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

/**
 * @internal
 * UTF-8 byte length of a string (all budgets and measurements are in bytes).
 */
function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/**
 * @internal
 * Truncates a string to at most `maxBytes` UTF-8 bytes without splitting a
 * multi-byte code point.
 */
function truncateUtf8(value: string, maxBytes: number): string {
  const buf = Buffer.from(value, 'utf8');
  if (buf.length <= maxBytes) return value;
  let cut = maxBytes;
  while (cut > 0 && (buf[cut]! & 0xc0) === 0x80) cut -= 1;
  return buf.subarray(0, cut).toString('utf8');
}

/**
 * @internal
 * Lowercased file extension (no dot) from a path-like string, or null.
 */
function extensionFromPath(value: string): string | null {
  const ext = path.extname(value).replace(/^\./, '').toLowerCase();
  return ext || null;
}

/**
 * @internal
 * Coarse size bucket label for a byte count, so metadata summaries never leak
 * exact sizes.
 */
function sizeBucket(value: number): string {
  if (value <= 0) return 'unknown';
  if (value <= 10 * KIB) return '0-10KiB';
  if (value <= 100 * KIB) return '10-100KiB';
  if (value <= 1024 * KIB) return '100KiB-1MiB';
  return '1MiB+';
}

/**
 * @internal
 * Reduces arbitrary section metadata to a privacy-safe summary: counts,
 * sorted file extensions, size buckets, and selection-kind tallies for arrays;
 * key inventories for objects; extension/count for strings.
 */
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

/**
 * @internal
 * Chooses the summary source for a section's fingerprint: explicit metadata
 * when provided, otherwise a summary of its content.
 */
function metadataFingerprintSource(
  section: PromptTelemetryInputSection,
): Record<string, unknown> {
  if (section.metadata !== undefined) {
    return summarizeMetadataValue(section.metadata);
  }
  return summarizeMetadataValue(section.content ?? '');
}

/**
 * @internal
 * Per-section capture byte limit; the daemon system prompt gets a larger cap.
 */
function perSectionLimit(kind: PromptTelemetrySectionKind): number {
  return kind === 'daemonSystemPrompt'
    ? DAEMON_SYSTEM_PROMPT_MAX_BYTES
    : SECTION_MAX_BYTES;
}

/**
 * Builds the full prompt-stack telemetry payload from a composed prompt and its
 * constituent sections: redacts and fingerprints each section, records raw and
 * redacted byte sizes, then allocates the shared capture budget across
 * content-bearing sections in priority order (truncating per-section and when
 * the total budget is exhausted). The result is the canonical
 * {@link PromptStackTelemetry} that all downstream projections derive from.
 */
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
 * Projects a telemetry payload with all captured section content stripped
 * (fingerprints and byte counts retained), for consumers that must not receive
 * even redacted prompt text.
 */
export function promptStackWithoutContent(
  telemetry: PromptStackTelemetry,
): PromptStackTelemetry {
  return {
    ...telemetry,
    redactedContentBytes: 0,
    sections: telemetry.sections.map(({ redactedContent: _content, ...section }) => section),
  };
}

/**
 * Projects the telemetry into the wire shape ingested by the trace pipeline as
 * a structured input (`open-design.prompt-stack`), omitting present/rawBytes
 * bookkeeping and including optional fields only when set.
 */
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

/**
 * Flattens the telemetry's top-level fingerprints and byte counters into a
 * `promptStack_`-prefixed key/value map suitable for flat analytics event
 * properties.
 */
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
