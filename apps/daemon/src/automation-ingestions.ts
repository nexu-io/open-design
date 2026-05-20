import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type {
  AutomationCompressionReport,
  AutomationContentPacket,
  AutomationOutputSink,
  AutomationProvenanceRef,
  AutomationReviewPolicy,
  AutomationSensitivity,
  AutomationSourceIngestionResponse,
  AutomationSourceKind,
  AutomationTokenCompressionMode,
  CreateAutomationSourceIngestionRequest,
  JsonValue,
  MemoryType,
} from '@open-design/contracts';

import { createAutomationProposal } from './automation-proposals.js';
import { getAnyAutomationTemplate } from './automation-templates.js';

const STORE_DIR = 'automation-source-packets';
const STORE_FILE = 'packets.json';

const SOURCE_KINDS = new Set<AutomationSourceKind>([
  'upload',
  'url',
  'repo',
  'connector',
  'artifact',
  'chat',
]);
const SENSITIVITY_VALUES = new Set<AutomationSensitivity>([
  'public',
  'workspace',
  'private',
  'secret-adjacent',
]);
const COMPRESSION_MODES = new Set<AutomationTokenCompressionMode>([
  'off',
  'balanced',
  'aggressive',
]);
const REVIEW_POLICIES = new Set<AutomationReviewPolicy>([
  'always',
  'trusted-source',
  'auto-apply',
]);
const OUTPUT_SINKS = new Set<AutomationOutputSink>([
  'memory',
  'skill',
  'design-system',
  'automation-template',
  'artifact',
]);
const MEMORY_TYPES = new Set<MemoryType>(['user', 'feedback', 'project', 'reference']);

function storePath(dataDir: string): string {
  return path.join(dataDir, STORE_DIR, STORE_FILE);
}

async function writePackets(dataDir: string, packets: AutomationContentPacket[]): Promise<void> {
  const file = storePath(dataDir);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify({ packets }, null, 2));
}

export async function listAutomationSourcePackets(
  dataDir: string,
  opts: { limit?: number } = {},
): Promise<AutomationContentPacket[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fsp.readFile(storePath(dataDir), 'utf8'));
  } catch {
    return [];
  }
  const packets = Array.isArray((parsed as { packets?: unknown }).packets)
    ? ((parsed as { packets: AutomationContentPacket[] }).packets)
    : [];
  const sorted = packets.slice().sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  const limit = typeof opts.limit === 'number' && opts.limit > 0 ? Math.floor(opts.limit) : 0;
  return limit > 0 ? sorted.slice(0, limit) : sorted;
}

export async function getAutomationSourcePacket(
  dataDir: string,
  id: string,
): Promise<AutomationContentPacket | null> {
  const packets = await listAutomationSourcePackets(dataDir);
  return packets.find((packet) => packet.id === id) ?? null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalString(value: unknown): string | undefined {
  const text = asString(value);
  return text ? text : undefined;
}

function sourceKindFrom(value: unknown): AutomationSourceKind {
  if (typeof value === 'string' && SOURCE_KINDS.has(value as AutomationSourceKind)) {
    return value as AutomationSourceKind;
  }
  throw new Error('sourceKind must be one of upload, url, repo, connector, artifact, chat');
}

function sensitivityFrom(value: unknown): AutomationSensitivity {
  if (typeof value === 'string' && SENSITIVITY_VALUES.has(value as AutomationSensitivity)) {
    return value as AutomationSensitivity;
  }
  return 'workspace';
}

function compressionModeFrom(
  value: unknown,
  fallback: AutomationTokenCompressionMode,
): AutomationTokenCompressionMode {
  if (typeof value === 'string' && COMPRESSION_MODES.has(value as AutomationTokenCompressionMode)) {
    return value as AutomationTokenCompressionMode;
  }
  return fallback;
}

function reviewPolicyFrom(
  value: unknown,
  fallback: AutomationReviewPolicy,
): AutomationReviewPolicy {
  if (typeof value === 'string' && REVIEW_POLICIES.has(value as AutomationReviewPolicy)) {
    return value as AutomationReviewPolicy;
  }
  return fallback;
}

function memoryTypeFrom(value: unknown): MemoryType {
  if (typeof value === 'string' && MEMORY_TYPES.has(value as MemoryType)) {
    return value as MemoryType;
  }
  return 'project';
}

function outputSinksFrom(
  value: unknown,
  fallback: AutomationOutputSink[],
): AutomationOutputSink[] {
  const raw = Array.isArray(value) ? value : fallback;
  const out: AutomationOutputSink[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !OUTPUT_SINKS.has(item as AutomationOutputSink)) continue;
    const sink = item as AutomationOutputSink;
    if (!out.includes(sink)) out.push(sink);
  }
  return out.length > 0 ? out : ['memory'];
}

function estimateTokens(text: string): number {
  if (!text.trim()) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function slugify(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 60);
  return cleaned || `source-${randomUUID().slice(0, 8)}`;
}

function firstLineTitle(body: string): string {
  const line = body
    .split(/\r?\n/)
    .map((item) => item.replace(/^#+\s*/, '').trim())
    .find(Boolean);
  return line ? line.slice(0, 100) : '';
}

function compactMarkdown(
  body: string,
  mode: AutomationTokenCompressionMode,
  packetId: string,
): { body: string; report: AutomationCompressionReport } {
  const beforeTokens = estimateTokens(body);
  if (mode === 'off') {
    return {
      body,
      report: {
        mode,
        status: 'skipped',
        beforeTokens,
        afterTokens: beforeTokens,
        summary: 'Token compression disabled for this ingestion.',
        preservedSourcePacketId: packetId,
      },
    };
  }

  const maxChars = mode === 'aggressive' ? 1_600 : 3_200;
  if (body.length <= maxChars) {
    return {
      body,
      report: {
        mode,
        status: 'skipped',
        beforeTokens,
        afterTokens: beforeTokens,
        summary: 'Source packet was already below the compression threshold.',
        preservedSourcePacketId: packetId,
      },
    };
  }

  const head = body.slice(0, maxChars).trimEnd();
  const omittedTokens = estimateTokens(body.slice(maxChars));
  const compressed = [
    head,
    '',
    `> Automation compression preserved the original packet (${packetId}) and omitted roughly ${omittedTokens} tokens from this proposal preview.`,
  ].join('\n');
  const afterTokens = estimateTokens(compressed);
  return {
    body: compressed,
    report: {
      mode,
      status: 'applied',
      beforeTokens,
      afterTokens,
      summary:
        mode === 'aggressive'
          ? 'Kept the leading durable context and preserved the full source packet for audit.'
          : 'Trimmed oversized source context while preserving provenance to the full packet.',
      preservedSourcePacketId: packetId,
    },
  };
}

function buildProvenance(input: {
  sourceKind: AutomationSourceKind;
  sourceRef: string;
  title: string;
  connectorId?: string;
  accountLabel?: string;
}): AutomationProvenanceRef[] {
  const labelParts = [input.connectorId, input.accountLabel, input.title].filter(Boolean);
  return [
    {
      kind: input.sourceKind,
      label: labelParts.length > 0 ? labelParts.join(' / ') : input.title,
      ref: input.sourceRef,
      ...(input.sourceRef.startsWith('http://') || input.sourceRef.startsWith('https://')
        ? { url: input.sourceRef }
        : {}),
    },
  ];
}

function buildMemoryProposalPatch(input: {
  title: string;
  sourceKind: AutomationSourceKind;
  sourceRef: string;
  body: string;
  memoryType: MemoryType;
  packetId: string;
}) {
  return {
    format: 'json' as const,
    after: JSON.stringify(
      {
        name: input.title,
        description: `Ingested from ${input.sourceKind}: ${input.sourceRef}`,
        type: input.memoryType,
        body: [
          `# ${input.title}`,
          '',
          `Source: ${input.sourceKind} ${input.sourceRef}`,
          `Source packet: ${input.packetId}`,
          '',
          input.body,
        ].join('\n'),
      },
      null,
      2,
    ),
    diffSummary: 'Creates one editable memory-tree entry from the ingested source packet.',
  };
}

function buildDesignSystemProposalMarkdown(input: {
  title: string;
  sourceKind: AutomationSourceKind;
  sourceRef: string;
  body: string;
  packetId: string;
}): string {
  return [
    `# ${input.title} Design System`,
    '',
    '> Category: Self-evolved',
    '> Surface: web',
    '',
    '## Source Provenance',
    '',
    `- Source kind: ${input.sourceKind}`,
    `- Source ref: ${input.sourceRef}`,
    `- Source packet: ${input.packetId}`,
    '',
    '## Extracted Direction',
    '',
    input.body,
    '',
    '## Evolution Notes',
    '',
    '- Review, rename, and tighten tokens before promoting this into the active catalogue.',
  ].join('\n');
}

function buildSkillProposalMarkdown(input: {
  title: string;
  sourceKind: AutomationSourceKind;
  sourceRef: string;
  body: string;
  packetId: string;
}): string {
  const name = `${input.title} skill`;
  return [
    '---',
    `name: "${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
    `description: "Self-evolved from ${input.sourceKind} ${input.sourceRef}"`,
    'triggers:',
    `  - "${input.title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
    '---',
    '',
    `# ${name}`,
    '',
    `Source packet: ${input.packetId}`,
    '',
    '## When To Use',
    '',
    'Use this skill when a future request matches the workflow or reusable design guidance below.',
    '',
    '## Workflow',
    '',
    input.body,
  ].join('\n');
}

async function persistPacket(
  dataDir: string,
  packet: AutomationContentPacket,
): Promise<void> {
  const packets = await listAutomationSourcePackets(dataDir);
  const next = packets.filter((existing) => existing.id !== packet.id);
  next.push(packet);
  await writePackets(dataDir, next);
}

function jsonObjectFrom(value: unknown): Record<string, JsonValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, JsonValue>;
}

export async function ingestAutomationSource(
  dataDir: string,
  input: CreateAutomationSourceIngestionRequest,
): Promise<AutomationSourceIngestionResponse> {
  if (!input || typeof input !== 'object') {
    throw new Error('ingestion body is required');
  }
  const sourceKind = sourceKindFrom(input.sourceKind);
  const bodyMarkdown = typeof input.bodyMarkdown === 'string' ? input.bodyMarkdown.trim() : '';
  if (!bodyMarkdown) throw new Error('bodyMarkdown is required');

  const template = input.templateId ? await getAnyAutomationTemplate(dataDir, input.templateId) : null;
  const templateSinks = template?.outputSinks ?? ['memory'];
  const candidateSinks = outputSinksFrom(input.candidateSinks, templateSinks);
  const reviewPolicy = reviewPolicyFrom(input.reviewPolicy, template?.reviewPolicy ?? 'always');
  const tokenCompression = compressionModeFrom(
    input.tokenCompression,
    template?.tokenCompression ?? 'balanced',
  );
  const packetId = `packet_${randomUUID()}`;
  const sourceEventId = `source_event_${randomUUID()}`;
  const capturedAt = new Date().toISOString();
  const sourceRef =
    optionalString(input.sourceRef) ??
    optionalString(input.connectorId) ??
    optionalString(input.artifactId) ??
    optionalString(input.conversationId) ??
    sourceKind;
  const title =
    optionalString(input.title) ??
    firstLineTitle(bodyMarkdown) ??
    `${sourceKind} source`;
  const sensitivity = sensitivityFrom(input.sensitivity);
  const capabilityHints = Array.isArray(input.capabilityHints)
    ? input.capabilityHints.filter((hint): hint is string => typeof hint === 'string' && hint.length > 0)
    : input.connectorId
      ? [`connector:${input.connectorId}`]
      : [];
  const { body: proposalBody, report } = compactMarkdown(bodyMarkdown, tokenCompression, packetId);
  const originalTokens = estimateTokens(bodyMarkdown);
  const provenanceInput: {
    sourceKind: AutomationSourceKind;
    sourceRef: string;
    title: string;
    connectorId?: string;
    accountLabel?: string;
  } = {
    sourceKind,
    sourceRef,
    title,
  };
  const connectorId = optionalString(input.connectorId);
  const accountLabel = optionalString(input.accountLabel);
  if (connectorId) provenanceInput.connectorId = connectorId;
  if (accountLabel) provenanceInput.accountLabel = accountLabel;

  const metadata: Record<string, JsonValue> = jsonObjectFrom(input.metadata);
  if (template) metadata.templateId = template.id;
  const projectId = optionalString(input.projectId);
  const artifactId = optionalString(input.artifactId);
  const conversationId = optionalString(input.conversationId);
  if (projectId) metadata.projectId = projectId;
  if (connectorId) metadata.connectorId = connectorId;
  if (accountLabel) metadata.accountLabel = accountLabel;
  if (artifactId) metadata.artifactId = artifactId;
  if (conversationId) metadata.conversationId = conversationId;

  const packet: AutomationContentPacket = {
    id: packetId,
    sourceEventId,
    sourceKind,
    sourceRef,
    title,
    capturedAt,
    bodyMarkdown,
    provenance: buildProvenance(provenanceInput),
    attachments: [],
    sensitivity,
    capabilityHints,
    tokenStats: {
      originalTokens,
      canonicalTokens: originalTokens,
      compressedTokens: report.afterTokens,
      compressionRatio: originalTokens > 0 ? Number((report.afterTokens / originalTokens).toFixed(3)) : 1,
    },
    candidateSinks,
  };
  if (Object.keys(metadata).length > 0) packet.metadata = metadata;

  await persistPacket(dataDir, packet);

  const memoryType = memoryTypeFrom(input.memoryType);
  const proposals = [];
  if (candidateSinks.includes('memory')) {
    proposals.push(await createAutomationProposal(dataDir, {
      title: `Memory: ${title}`,
      summary: `Create a memory-tree entry from ${sourceKind} source ${sourceRef}.`,
      targetKind: 'memory-node',
      action: 'create',
      reviewPolicy,
      sourcePacketIds: [packet.id],
      patch: buildMemoryProposalPatch({
        title,
        sourceKind,
        sourceRef,
        body: proposalBody,
        memoryType,
        packetId: packet.id,
      }),
      compressionReport: report,
      metadata: {
        sourceKind,
        sourceRef,
        memoryType,
        ...(template ? { templateId: template.id } : {}),
      },
    }));
  }
  if (candidateSinks.includes('design-system')) {
    const slug = slugify(title);
    proposals.push(await createAutomationProposal(dataDir, {
      title: `Design system: ${title}`,
      summary: `Draft a DESIGN.md proposal from ${sourceKind} source ${sourceRef}.`,
      targetKind: 'design-system',
      action: 'create',
      reviewPolicy,
      sourcePacketIds: [packet.id],
      targetRef: `design-systems/${slug}/DESIGN.md`,
      patch: {
        format: 'markdown',
        after: buildDesignSystemProposalMarkdown({
          title,
          sourceKind,
          sourceRef,
          body: proposalBody,
          packetId: packet.id,
        }),
        diffSummary: 'Creates a reviewable DESIGN.md draft from the source packet.',
      },
      compressionReport: report,
      metadata: {
        sourceKind,
        sourceRef,
        slug,
        ...(template ? { templateId: template.id } : {}),
      },
    }));
  }
  if (candidateSinks.includes('skill')) {
    const slug = slugify(title);
    proposals.push(await createAutomationProposal(dataDir, {
      title: `Skill: ${title}`,
      summary: `Draft a reusable SKILL.md proposal from ${sourceKind} source ${sourceRef}.`,
      targetKind: 'skill',
      action: 'create',
      reviewPolicy,
      sourcePacketIds: [packet.id],
      targetRef: `skills/${slug}/SKILL.md`,
      patch: {
        format: 'markdown',
        after: buildSkillProposalMarkdown({
          title,
          sourceKind,
          sourceRef,
          body: proposalBody,
          packetId: packet.id,
        }),
        diffSummary: 'Creates a reviewable SKILL.md draft from the source packet.',
      },
      compressionReport: report,
      metadata: {
        sourceKind,
        sourceRef,
        slug,
        ...(template ? { templateId: template.id } : {}),
      },
    }));
  }

  return { packet, compressionReport: report, proposals };
}
