import { createHash } from 'node:crypto';
import path from 'node:path';
import type { ArtifactManifestEntry, AttachmentManifestEntry, MessageSummary } from '../langfuse-trace.js';
import type { PromptStackTelemetry } from '../prompt-telemetry.js';

export type EvidenceMode = 'off' | 'observe' | 'send';
export const evidenceMode = (value: string | undefined): EvidenceMode => value === 'observe' || value === 'send' ? value : 'off';
type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const digest = (value: unknown): string => typeof value === 'string' ? value.replace(/^sha256:/, '').toLowerCase() : '';

export interface AttachmentContextEntry {
  identity: string;
  originMessageId: string;
  source: 'user_upload';
  source_path_hash?: string;
  sha256?: string;
  size_bytes?: number;
  storage_ref?: string;
}

/** Origin and normalized path are stable across Runs; paths themselves never leave the host. */
export function attachmentContext(messages: Row[], assistantIndex: number, projectId: string) {
  const users = messages.slice(0, Math.max(0, assistantIndex)).filter(message => message.role === 'user');
  const current = users.at(-1);
  const effective = new Map<string, AttachmentContextEntry>();
  const delta: AttachmentContextEntry[] = [];
  for (const message of users) {
    for (const item of Array.isArray(message.attachments) ? message.attachments : []) {
      const attachment = typeof item === 'string' ? { path: item } : row(item);
      const localPath = typeof attachment.path === 'string' ? path.posix.normalize(attachment.path.replace(/\\/g, '/')) : '';
      if (!localPath || typeof message.id !== 'string') continue;
      const sha256 = digest(attachment.sha256 ?? attachment.hash);
      const key = hash(JSON.stringify([projectId, localPath, sha256]));
      if (effective.has(key)) continue;
      const entry: AttachmentContextEntry = {
        identity: hash(JSON.stringify([projectId, localPath, message.id, sha256])),
        originMessageId: message.id, source: 'user_upload', source_path_hash: hash(localPath),
        ...(/^[a-f0-9]{64}$/.test(sha256) ? { sha256 } : {}),
        ...(typeof attachment.size === 'number' ? { size_bytes: attachment.size } : {}),
      };
      effective.set(key, entry);
      if (message === current) delta.push(entry);
    }
  }
  return {
    turnDelta: { semantics: 'current_user_turn' as const, entries: delta },
    effectiveContext: { semantics: 'conversation_context_before_run' as const, entries: [...effective.values()] },
  };
}

export interface EvalContextInput {
  runStatus: string;
  resultDeliveryState?: unknown;
  endedWithUnfinishedWork?: boolean;
  toolErrorCount: number;
  attachments?: ReturnType<typeof attachmentContext>;
  attachmentManifest: AttachmentManifestEntry[];
  artifactManifest: ArtifactManifestEntry[];
  agentId?: string;
  usage?: MessageSummary['usage'];
  turnUsage?: { input: number; output: number; total: number; modelCalls: number } | null;
  prompt?: PromptStackTelemetry;
  failureCode?: string;
  failureStage?: string;
}

export function buildEvalContext(input: EvalContextInput) {
  const reasons = new Set<string>();
  const sourceAttachments = input.attachments ?? {
    turnDelta: { semantics: 'current_user_turn' as const, entries: [] },
    effectiveContext: { semantics: 'conversation_context_before_run' as const, entries: [] },
  };
  const bind = (entry: AttachmentContextEntry): AttachmentContextEntry => {
    const matches = input.attachmentManifest.filter(object => object.source_path_hash && object.source_path_hash === entry.source_path_hash
      && (!entry.sha256 || digest(entry.sha256) === digest(object.sha256)));
    const object = matches.length === 1 ? matches[0] : undefined;
    return object?.sha256 && object.storage_ref ? { ...entry, sha256: digest(object.sha256), ...(object.size_bytes !== undefined ? { size_bytes: object.size_bytes } : {}), storage_ref: object.storage_ref } : entry;
  };
  const attachments = {
    turnDelta: { ...sourceAttachments.turnDelta, entries: sourceAttachments.turnDelta.entries.map(bind) },
    effectiveContext: { ...sourceAttachments.effectiveContext, entries: sourceAttachments.effectiveContext.entries.map(bind) },
  };
  // Digests from the frozen object pass supplement source-ledger identities.
  const uploadHashes = new Set([...input.attachmentManifest, ...attachments.effectiveContext.entries]
    .map(entry => digest(entry.sha256)).filter(value => /^[a-f0-9]{64}$/.test(value)));
  const artifacts = input.artifactManifest.map(entry => {
    if (!uploadHashes.has(digest(entry.sha256))) return entry;
    reasons.add('cross_ledger_collision');
    return { ...entry, status: 'partial' as const, reason: 'cross_ledger_collision' };
  });
  const productFailed = input.runStatus === 'failed'
    || input.resultDeliveryState === 'no_result' || input.resultDeliveryState === 'delivery_failed';
  if (!input.resultDeliveryState) reasons.add('product_outcome_missing');
  if (!input.attachments) reasons.add('attachment_context_missing');
  if (artifacts.some(entry => !entry.sha256 || entry.size_bytes === undefined)) reasons.add('snapshot_incomplete');
  // A successful upload result is still not a readback receipt.
  reasons.add('trace_not_materialized');
  if (artifacts.length || input.attachmentManifest.length) reasons.add('object_not_materialized');
  const exact = input.prompt?.sections.find(section => section.kind === 'odNextExactFinalText');
  const exactSend = input.prompt?.odNextExactSend;
  const promptMetadata = exactSend ? { availability: 'exact', boundary: exactSend.boundary, sha256: exactSend.sha256, bytes: exactSend.utf8Bytes } : row(exact?.metadata);
  const identityExact = promptMetadata.availability === 'exact' && promptMetadata.boundary === 'hostComposed'
    && /^[a-f0-9]{64}$/.test(digest(promptMetadata.sha256));
  if (!identityExact) reasons.add('prompt_identity_missing');
  const codex = input.agentId === 'codex';
  const turnUsage = input.turnUsage ?? (!codex && input.usage ? {
    input: input.usage.inputTokens ?? 0, output: input.usage.outputTokens ?? 0,
    total: input.usage.totalTokens ?? ((input.usage.inputTokens ?? 0) + (input.usage.outputTokens ?? 0)),
  } : null);
  if (!turnUsage) reasons.add('usage_unavailable');
  return {
    schema: 'open-design.eval-context/v2' as const,
    productOutcome: {
      runStatus: input.runStatus, resultDeliveryState: input.resultDeliveryState ?? 'unknown',
      endedWithUnfinishedWork: input.endedWithUnfinishedWork ?? false,
      toolErrorCount: input.toolErrorCount,
      ...(input.failureCode ? { failureCode: input.failureCode } : {}),
      ...(input.failureStage ? { failureStage: input.failureStage } : {}),
    },
    evaluationOutcome: input.runStatus === 'canceled' ? 'canceled' : productFailed ? 'failed' : 'unknown',
    attachments,
    artifacts: { snapshotStatus: reasons.has('snapshot_incomplete') ? 'partial' : 'complete', entries: artifacts },
    usage: {
      scope: turnUsage ? 'turn' : 'unknown', status: turnUsage ? 'derived' : 'unavailable',
      ...(turnUsage ? { turn: turnUsage } : {}),
      ...(codex && input.usage ? { sessionCumulative: input.usage } : {}),
    },
    prompt: {
      identityAvailability: identityExact ? 'exact' : 'missing',
      payloadAvailability: exact?.redactedContent ? 'redacted' : 'missing',
      ...(identityExact ? { sha256: promptMetadata.sha256, bytes: promptMetadata.bytes } : {}),
    },
    delivery: {
      trace: { status: 'queued', materialization: 'unknown' },
      objects: { status: artifacts.length ? 'queued' : 'not_required', materialization: 'unknown' },
      feedback: { status: 'not_checked' }, materializationEvidence: {},
    },
    completeness: { status: 'partial', reasons: [...reasons] },
  };
}

export type EvalContextV2 = ReturnType<typeof buildEvalContext>;
