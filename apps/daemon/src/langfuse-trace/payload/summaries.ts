/** @module langfuse-trace/payload/summaries
 * Tag list, prompt-build summary, object-ref summary, and the "should emit generation" predicate.
 * Imports only from `core/`; `timing.ts` and `trace-payload.ts` call functions from this file.
 */
import type { PromptStackTelemetry } from '../../prompt-telemetry.js';
import {
  usageTotal,
} from '../core/index.js';
import type {
  ArtifactManifestEntry,
  AttachmentManifestEntry,
  ReportContext,
} from '../core/index.js';

/**
 * Produces the flat string tag array for a Langfuse trace: always includes `open-design`
 * and `project:<id>`, then conditionally appends agent, model, skill, design-system,
 * OS, client-type, and any extra caller-supplied tags.
 * These tags power Langfuse's filter and dataset-selection UI.
 *
 * @param ctx - The run's {@link ReportContext}.
 * @returns An ordered array of Langfuse tag strings.
 */
export function buildTagList(ctx: ReportContext): string[] {
  const tags = ['open-design', `project:${ctx.projectId}`];
  if (ctx.agentId) tags.push(`agent:${ctx.agentId}`);
  if (ctx.turn?.model) tags.push(`model:${ctx.turn.model}`);
  if (ctx.turn?.skillId) tags.push(`skill:${ctx.turn.skillId}`);
  if (ctx.turn?.designSystemId) tags.push(`ds:${ctx.turn.designSystemId}`);
  if (ctx.runtime?.os) tags.push(`os:${ctx.runtime.os}`);
  if (ctx.runtime?.clientType && ctx.runtime.clientType !== 'unknown') {
    tags.push(`client:${ctx.runtime.clientType}`);
  }
  if (ctx.extraTags?.length) tags.push(...ctx.extraTags);
  return tags;
}

/**
 * Summarises prompt-stack telemetry (section count, fingerprints, byte sizes)
 * for inclusion in the prompt-build timing span's output field.
 * Returns a shallow `{ prompt_stack_available: false }` sentinel when telemetry
 * is absent so the span output is always a well-typed object.
 *
 * @param promptTelemetry - The assembled prompt-stack telemetry, or `undefined`.
 * @returns A summary record describing the prompt-stack state.
 */
export function promptBuildSummary(
  promptTelemetry: PromptStackTelemetry | undefined,
): Record<string, unknown> {
  if (!promptTelemetry) {
    return {
      prompt_stack_available: false,
    };
  }
  return {
    prompt_stack_available: true,
    section_count: promptTelemetry.sectionCount,
    stack_fingerprint: promptTelemetry.stackFingerprint,
    prompt_fingerprint: promptTelemetry.promptFingerprint,
    raw_bytes: promptTelemetry.rawBytes,
    redacted_bytes: promptTelemetry.redactedBytes,
    redacted_content_bytes: promptTelemetry.redactedContentBytes,
  };
}

/**
 * Converts an array of attachment or artifact manifest entries into
 * redaction-safe reference objects — no file paths, no content — suitable
 * for the prompt-build span and the attachment/artifact manifest metadata fields.
 * Returns `undefined` for an empty or absent entry list so callers can omit the field.
 *
 * @param entries - Attachment or artifact manifest entries, or `undefined`.
 * @returns An array of anonymous reference records, or `undefined`.
 */
export function objectRefSummary(
  entries: Array<AttachmentManifestEntry | ArtifactManifestEntry> | undefined,
): Array<Record<string, unknown>> | undefined {
  if (!entries?.length) return undefined;
  return entries.map((entry) => ({
    object_class: entry.object_class,
    storage_ref: entry.storage_ref,
    status: entry.status,
    size_bytes: entry.size_bytes,
    sha256: entry.sha256,
    mime_type: entry.mime_type,
    extension: entry.extension,
    redacted: entry.redacted,
    truncated: entry.truncated,
    retention_policy: entry.retention_policy,
    access_scope: entry.access_scope,
    sensitivity: entry.sensitivity,
    source: entry.source,
    ...(entry.object_class === 'attachment'
      ? { attachment_id: entry.attachment_id }
      : { artifact_id: entry.artifact_id, type: entry.type }),
  }));
}

/**
 * Returns `true` when the run produced observable model activity and therefore
 * warrants a Langfuse generation observation.
 * The predicate passes for: a successful run, non-zero token usage, any tool calls,
 * or a failure that occurred after session init.
 * Failures during `session_init` indicate no model call was made, so emitting a
 * generation observation would produce a misleading cost/token entry.
 *
 * @param ctx - The run's {@link ReportContext}.
 * @returns `true` if a generation observation should be added to the batch.
 */
export function shouldCreateGenerationObservation(ctx: ReportContext): boolean {
  if (ctx.run.status === 'succeeded') return true;
  if (usageTotal(ctx.message.usage) > 0) return true;
  if (ctx.eventsSummary.toolCalls > 0) return true;
  return ctx.run.failure?.failure_stage !== 'session_init';
}
