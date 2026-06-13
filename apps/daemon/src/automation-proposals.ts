import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type {
  AutomationEvolutionProposal,
  AutomationProposalStatus,
  CreateAutomationEvolutionProposalRequest,
  MemoryType,
} from '@open-design/contracts';

import {
  deleteMemoryEntry,
  readMemoryEntry,
  upsertMemoryEntry,
} from './memory.js';
import { upsertUserAutomationTemplate } from './automation-templates.js';

const STORE_DIR = 'automation-proposals';
const STORE_FILE = 'proposals.json';
const VALID_MEMORY_TYPES = new Set<MemoryType>(['user', 'feedback', 'project', 'reference']);
const SAFE_SLUG = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const VALID_STATUSES = new Set<AutomationProposalStatus>([
  'draft',
  'pending-review',
  'applied',
  'rejected',
  'superseded',
  'failed',
]);

function storePath(dataDir: string): string {
  return path.join(dataDir, STORE_DIR, STORE_FILE);
}

async function writeProposals(dataDir: string, proposals: AutomationEvolutionProposal[]): Promise<void> {
  const file = storePath(dataDir);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify({ proposals }, null, 2));
}

export async function listAutomationProposals(
  dataDir: string,
  opts: { status?: AutomationProposalStatus | 'all' } = {},
): Promise<AutomationEvolutionProposal[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fsp.readFile(storePath(dataDir), 'utf8'));
  } catch {
    return [];
  }
  const proposals = Array.isArray((parsed as { proposals?: unknown }).proposals)
    ? ((parsed as { proposals: AutomationEvolutionProposal[] }).proposals)
    : [];
  const filtered =
    opts.status && opts.status !== 'all'
      ? proposals.filter((proposal) => proposal.status === opts.status)
      : proposals;
  return filtered.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getAutomationProposal(
  dataDir: string,
  id: string,
): Promise<AutomationEvolutionProposal | null> {
  const proposals = await listAutomationProposals(dataDir, { status: 'all' });
  return proposals.find((proposal) => proposal.id === id) ?? null;
}

export async function createAutomationProposal(
  dataDir: string,
  input: CreateAutomationEvolutionProposalRequest & {
    id?: string;
    status?: AutomationProposalStatus;
  },
): Promise<AutomationEvolutionProposal> {
  const now = new Date().toISOString();
  if (!input || typeof input !== 'object') throw new Error('proposal body is required');
  if (typeof input.title !== 'string' || !input.title.trim()) {
    throw new Error('proposal title is required');
  }
  if (typeof input.summary !== 'string' || !input.summary.trim()) {
    throw new Error('proposal summary is required');
  }
  if (!input.patch || typeof input.patch !== 'object') {
    throw new Error('proposal patch is required');
  }
  const status =
    input.status && VALID_STATUSES.has(input.status)
      ? input.status
      : 'pending-review';
  const proposal: AutomationEvolutionProposal = {
    id:
      typeof input.id === 'string' && input.id.trim()
        ? input.id.trim()
        : `proposal_${randomUUID()}`,
    title: input.title.trim(),
    summary: input.summary.trim(),
    targetKind: input.targetKind,
    action: input.action,
    status,
    reviewPolicy: input.reviewPolicy ?? 'always',
    createdAt: now,
    updatedAt: now,
    sourcePacketIds: Array.isArray(input.sourcePacketIds)
      ? input.sourcePacketIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [],
    ...(typeof input.automationRunId === 'string' ? { automationRunId: input.automationRunId } : {}),
    ...(typeof input.targetRef === 'string' ? { targetRef: input.targetRef } : {}),
    patch: input.patch,
    ...(typeof input.confidence === 'number' ? { confidence: input.confidence } : {}),
    ...(input.compressionReport ? { compressionReport: input.compressionReport } : {}),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
  const proposals = await listAutomationProposals(dataDir, { status: 'all' });
  const next = proposals.filter((existing) => existing.id !== proposal.id);
  next.push(proposal);
  await writeProposals(dataDir, next);
  return proposal;
}

function assertReviewable(proposal: AutomationEvolutionProposal): void {
  if (proposal.status === 'pending-review' || proposal.status === 'draft') return;
  throw new Error(`proposal ${proposal.id} is ${proposal.status}, not reviewable`);
}

function safeMemoryType(value: unknown): MemoryType {
  return typeof value === 'string' && VALID_MEMORY_TYPES.has(value as MemoryType)
    ? (value as MemoryType)
    : 'project';
}

function parseJsonPatchAfter(proposal: AutomationEvolutionProposal): Record<string, unknown> {
  if (proposal.patch.format !== 'json') return {};
  const after = proposal.patch.after;
  if (typeof after !== 'string' || !after.trim()) return {};
  try {
    const parsed = JSON.parse(after);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new Error('proposal patch.after is not valid JSON');
  }
}

function withMemoryProvenance(body: string, proposal: AutomationEvolutionProposal): string {
  const text = String(body ?? '').trimEnd();
  const lines = text.split(/\r?\n/);
  const hasProposal = lines.some((line) => /^Proposal:\s*/i.test(line));
  const existingPackets = new Set(
    lines
      .map((line) => /^Source packet:\s*([A-Za-z0-9_-]+)\s*$/i.exec(line)?.[1])
      .filter((id): id is string => Boolean(id)),
  );
  const provenance: string[] = [];
  for (const packetId of proposal.sourcePacketIds ?? []) {
    if (!existingPackets.has(packetId)) provenance.push(`Source packet: ${packetId}`);
  }
  if (!hasProposal) provenance.push(`Proposal: ${proposal.id}`);
  if (provenance.length === 0) return text;
  return [text, '', ...provenance].join('\n');
}

async function applyMemoryProposal(dataDir: string, proposal: AutomationEvolutionProposal) {
  if (proposal.action === 'delete') {
    if (!proposal.targetRef) throw new Error('delete proposal requires targetRef');
    await deleteMemoryEntry(dataDir, proposal.targetRef);
    return { memoryId: proposal.targetRef, action: 'delete' };
  }

  const before = proposal.targetRef
    ? await readMemoryEntry(dataDir, proposal.targetRef)
    : null;
  const json = parseJsonPatchAfter(proposal);
  const metadata =
    proposal.metadata && typeof proposal.metadata === 'object' && !Array.isArray(proposal.metadata)
      ? proposal.metadata as Record<string, unknown>
      : {};
  const type = safeMemoryType(json.type ?? metadata.memoryType ?? before?.type);
  const body =
    typeof json.body === 'string'
      ? json.body
      : typeof json.markdown === 'string'
        ? json.markdown
        : proposal.patch.after ?? before?.body ?? '';
  const payload: Record<string, unknown> = {
    name:
      typeof json.name === 'string' && json.name.trim()
        ? json.name
        : before?.name ?? proposal.title,
    description:
      typeof json.description === 'string'
        ? json.description
        : before?.description ?? proposal.summary,
    type,
    body: withMemoryProvenance(body, proposal),
  };
  const id = typeof json.id === 'string' ? json.id : proposal.targetRef;
  if (id) payload.id = id;
  const entry = await upsertMemoryEntry(dataDir, payload, {});
  return { memoryId: entry.id, action: proposal.action };
}

function slugifyTarget(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 80);
  return SAFE_SLUG.test(cleaned) ? cleaned : `evolved-${Date.now().toString(36)}`;
}

function metadataRecord(proposal: AutomationEvolutionProposal): Record<string, unknown> {
  return proposal.metadata && typeof proposal.metadata === 'object' && !Array.isArray(proposal.metadata)
    ? proposal.metadata as Record<string, unknown>
    : {};
}

function targetSlugFor(proposal: AutomationEvolutionProposal, kind: 'design-system' | 'skill'): string {
  const expected = kind === 'design-system'
    ? /^design-systems\/([^/]+)\/DESIGN\.md$/
    : /^skills\/([^/]+)\/SKILL\.md$/;
  const fromRef = typeof proposal.targetRef === 'string' ? expected.exec(proposal.targetRef)?.[1] : '';
  if (fromRef && SAFE_SLUG.test(fromRef)) return fromRef;
  const metadata = metadataRecord(proposal);
  if (typeof metadata.slug === 'string' && SAFE_SLUG.test(metadata.slug)) return metadata.slug;
  return slugifyTarget(proposal.title);
}

function proposalAfterMarkdown(proposal: AutomationEvolutionProposal): string {
  if (typeof proposal.patch.after !== 'string' || !proposal.patch.after.trim()) {
    throw new Error('proposal patch.after markdown is required');
  }
  return proposal.patch.after.trimEnd() + '\n';
}

async function applyDesignSystemProposal(dataDir: string, proposal: AutomationEvolutionProposal) {
  const slug = targetSlugFor(proposal, 'design-system');
  const dir = path.join(dataDir, 'design-systems', slug);
  const file = path.join(dir, 'DESIGN.md');
  if (proposal.action === 'delete') {
    await fsp.rm(dir, { recursive: true, force: true });
    return { designSystemId: slug, action: 'delete', path: `design-systems/${slug}/DESIGN.md` };
  }
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(file, proposalAfterMarkdown(proposal), 'utf8');
  return { designSystemId: slug, action: proposal.action, path: `design-systems/${slug}/DESIGN.md` };
}

async function applySkillProposal(dataDir: string, proposal: AutomationEvolutionProposal) {
  const slug = targetSlugFor(proposal, 'skill');
  const dir = path.join(dataDir, 'skills', slug);
  const file = path.join(dir, 'SKILL.md');
  if (proposal.action === 'delete') {
    await fsp.rm(dir, { recursive: true, force: true });
    return { skillSlug: slug, action: 'delete', path: `skills/${slug}/SKILL.md` };
  }
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(file, proposalAfterMarkdown(proposal), 'utf8');
  return { skillSlug: slug, action: proposal.action, path: `skills/${slug}/SKILL.md` };
}

async function applyAutomationTemplateProposal(
  dataDir: string,
  proposal: AutomationEvolutionProposal,
) {
  if (proposal.action === 'delete') {
    throw new Error('automation-template delete proposals are not supported yet');
  }
  const patch = parseJsonPatchAfter(proposal);
  const template = await upsertUserAutomationTemplate(dataDir, patch);
  return {
    automationTemplateId: template.id,
    action: proposal.action,
    path: `automation-templates/${template.id}.json`,
  };
}

async function updateProposalStatus(
  dataDir: string,
  id: string,
  status: AutomationProposalStatus,
  metadataPatch: Record<string, unknown> = {},
): Promise<AutomationEvolutionProposal> {
  const proposals = await listAutomationProposals(dataDir, { status: 'all' });
  const index = proposals.findIndex((proposal) => proposal.id === id);
  if (index < 0) throw new Error('automation proposal not found');
  const current = proposals[index]!;
  const next: AutomationEvolutionProposal = {
    ...current,
    status,
    updatedAt: new Date().toISOString(),
  };
  if (Object.keys(metadataPatch).length > 0) {
    const currentMetadata =
      current.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata)
        ? current.metadata as Record<string, unknown>
        : {};
    next.metadata = {
      ...currentMetadata,
      ...metadataPatch,
    } as NonNullable<AutomationEvolutionProposal['metadata']>;
  } else if (current.metadata !== undefined) {
    next.metadata = current.metadata as NonNullable<AutomationEvolutionProposal['metadata']>;
  }
  proposals[index] = next;
  await writeProposals(dataDir, proposals);
  return next;
}

export async function applyAutomationProposal(dataDir: string, id: string) {
  const proposal = await getAutomationProposal(dataDir, id);
  if (!proposal) throw new Error('automation proposal not found');
  assertReviewable(proposal);
  let result;
  if (proposal.targetKind === 'memory-node') {
    result = await applyMemoryProposal(dataDir, proposal);
  } else if (proposal.targetKind === 'design-system') {
    result = await applyDesignSystemProposal(dataDir, proposal);
  } else if (proposal.targetKind === 'skill') {
    result = await applySkillProposal(dataDir, proposal);
  } else if (proposal.targetKind === 'automation-template') {
    result = await applyAutomationTemplateProposal(dataDir, proposal);
  } else {
    throw new Error(`proposal target ${proposal.targetKind} needs a specialized applier`);
  }
  const next = await updateProposalStatus(dataDir, id, 'applied', { appliedResult: result });
  return { proposal: next, result };
}

export async function rejectAutomationProposal(
  dataDir: string,
  id: string,
  reason?: string,
) {
  const proposal = await getAutomationProposal(dataDir, id);
  if (!proposal) throw new Error('automation proposal not found');
  assertReviewable(proposal);
  return updateProposalStatus(
    dataDir,
    id,
    'rejected',
    typeof reason === 'string' && reason.trim() ? { rejectedReason: reason.trim() } : {},
  );
}
