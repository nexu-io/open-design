import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type {
  AutomationOutputSink,
  AutomationReviewPolicy,
  AutomationSourceKind,
  AutomationTemplate,
  AutomationTemplateStageKind,
  AutomationTokenCompressionMode,
  AutomationTriggerKind,
} from '@open-design/contracts';

export const BUILT_IN_AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'ingest-source-memory-tree',
    title: 'Ingest source into memory tree',
    description: 'Turn uploaded, URL, repo, connector, artifact, or chat content into reviewable memory nodes.',
    purpose: 'Keep durable project and user knowledge available to future agent runs.',
    triggerKinds: ['manual', 'schedule', 'connector'],
    sourceKinds: ['upload', 'url', 'repo', 'connector', 'artifact', 'chat'],
    stages: [
      { id: 'ingest', kind: 'ingest', title: 'Capture source' },
      { id: 'canonicalize', kind: 'canonicalize', title: 'Canonicalize content' },
      { id: 'classify', kind: 'classify', title: 'Classify memory scope' },
      { id: 'propose', kind: 'propose', title: 'Propose memory nodes' },
    ],
    outputSinks: ['memory'],
    reviewPolicy: 'always',
    tokenCompression: 'balanced',
    tags: ['memory', 'ingestion'],
  },
  {
    id: 'extract-design-system',
    title: 'Extract design system',
    description: 'Draft a DESIGN.md from brand docs, screenshots, repos, connectors, websites, or strong artifacts.',
    purpose: 'Make the design-system tree evolve from real source material and successful outputs.',
    triggerKinds: ['manual', 'connector', 'project-event'],
    sourceKinds: ['upload', 'url', 'repo', 'connector', 'artifact'],
    stages: [
      { id: 'ingest', kind: 'ingest', title: 'Capture design source' },
      { id: 'compress', kind: 'compress', title: 'Compact source context' },
      { id: 'agent-run', kind: 'agent-run', title: 'Draft DESIGN.md' },
      { id: 'propose', kind: 'propose', title: 'Create design-system proposal' },
    ],
    outputSinks: ['design-system', 'memory'],
    reviewPolicy: 'always',
    tokenCompression: 'balanced',
    tags: ['design-system', 'self-evolution'],
  },
  {
    id: 'crystallize-run-into-skill',
    title: 'Crystallize successful run into skill',
    description: 'Convert a completed run into a draft SKILL.md, examples, and follow-up test prompts.',
    purpose: 'Let repeated design work become reusable agent capability.',
    triggerKinds: ['manual', 'project-event'],
    sourceKinds: ['artifact', 'chat'],
    stages: [
      { id: 'classify', kind: 'classify', title: 'Find reusable workflow' },
      { id: 'agent-run', kind: 'agent-run', title: 'Draft skill files' },
      { id: 'propose', kind: 'propose', title: 'Create skill proposal' },
    ],
    outputSinks: ['skill', 'memory'],
    reviewPolicy: 'always',
    tokenCompression: 'balanced',
    tags: ['skills', 'crystallization'],
  },
  {
    id: 'connector-digest-design-context',
    title: 'Connector digest to design context',
    description: 'Pull trusted connector updates into memory and artifact-ready design context.',
    purpose: 'Use scheduled connector activity as input for later design work without manual prompting.',
    triggerKinds: ['schedule', 'connector'],
    sourceKinds: ['connector'],
    stages: [
      { id: 'ingest', kind: 'ingest', title: 'Pull connector updates' },
      { id: 'redact', kind: 'redact', title: 'Redact sensitive details' },
      { id: 'compress', kind: 'compress', title: 'Summarize high-volume updates' },
      { id: 'propose', kind: 'propose', title: 'Propose memory updates' },
    ],
    outputSinks: ['memory', 'artifact'],
    reviewPolicy: 'trusted-source',
    tokenCompression: 'aggressive',
    tags: ['connectors', 'digest'],
  },
  {
    id: 'compress-project-context',
    title: 'Compress project context',
    description: 'Rewrite oversized source packets and memory nodes into compact, traceable context.',
    purpose: 'Control token pressure while preserving originals and provenance.',
    triggerKinds: ['manual', 'schedule'],
    sourceKinds: ['upload', 'url', 'repo', 'connector', 'artifact', 'chat'],
    stages: [
      { id: 'classify', kind: 'classify', title: 'Select oversized context' },
      { id: 'compress', kind: 'compress', title: 'Apply compression policy' },
      { id: 'propose', kind: 'propose', title: 'Propose compact nodes' },
    ],
    outputSinks: ['memory'],
    reviewPolicy: 'always',
    tokenCompression: 'aggressive',
    tags: ['compression', 'tokens'],
  },
  {
    id: 'promote-artifact-style',
    title: 'Promote artifact style',
    description: 'Extract reusable visual rules from a strong artifact into a design-system variant.',
    purpose: 'Turn successful generated design direction into reusable project style.',
    triggerKinds: ['manual', 'project-event'],
    sourceKinds: ['artifact'],
    stages: [
      { id: 'classify', kind: 'classify', title: 'Score artifact style' },
      { id: 'agent-run', kind: 'agent-run', title: 'Extract visual rules' },
      { id: 'propose', kind: 'propose', title: 'Create design-system variant proposal' },
    ],
    outputSinks: ['design-system', 'memory'],
    reviewPolicy: 'always',
    tokenCompression: 'balanced',
    tags: ['design-system', 'artifacts'],
  },
];

export function listAutomationTemplates(): AutomationTemplate[] {
  return BUILT_IN_AUTOMATION_TEMPLATES;
}

export function getAutomationTemplate(id: string): AutomationTemplate | null {
  return BUILT_IN_AUTOMATION_TEMPLATES.find((template) => template.id === id) ?? null;
}

const STORE_DIR = 'automation-templates';
const STORE_FILE = 'templates.json';
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{1,95}$/;
const TRIGGER_KINDS = new Set<AutomationTriggerKind>([
  'manual',
  'schedule',
  'connector',
  'project-event',
]);
const SOURCE_KINDS = new Set<AutomationSourceKind>([
  'upload',
  'url',
  'repo',
  'connector',
  'artifact',
  'chat',
]);
const STAGE_KINDS = new Set<AutomationTemplateStageKind>([
  'ingest',
  'canonicalize',
  'redact',
  'compress',
  'classify',
  'propose',
  'agent-run',
  'apply',
  'notify',
]);
const OUTPUT_SINKS = new Set<AutomationOutputSink>([
  'memory',
  'skill',
  'design-system',
  'automation-template',
  'artifact',
]);
const REVIEW_POLICIES = new Set<AutomationReviewPolicy>([
  'always',
  'trusted-source',
  'auto-apply',
]);
const COMPRESSION_MODES = new Set<AutomationTokenCompressionMode>([
  'off',
  'balanced',
  'aggressive',
]);

function storePath(dataDir: string): string {
  return path.join(dataDir, STORE_DIR, STORE_FILE);
}

function cleanId(value: unknown): string {
  if (typeof value !== 'string') return '';
  const id = value.trim();
  return SAFE_ID.test(id) ? id : '';
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`automation template ${key} is required`);
  }
  return value.trim();
}

function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

function cleanEnumArray<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  fallback: T[],
): T[] {
  const raw = Array.isArray(value) ? value : [];
  const out: T[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !allowed.has(item as T)) continue;
    const typed = item as T;
    if (!out.includes(typed)) out.push(typed);
  }
  return out.length > 0 ? out : fallback;
}

function cleanReviewPolicy(value: unknown): AutomationReviewPolicy {
  return typeof value === 'string' && REVIEW_POLICIES.has(value as AutomationReviewPolicy)
    ? value as AutomationReviewPolicy
    : 'always';
}

function cleanCompressionMode(value: unknown): AutomationTokenCompressionMode {
  return typeof value === 'string' && COMPRESSION_MODES.has(value as AutomationTokenCompressionMode)
    ? value as AutomationTokenCompressionMode
    : 'balanced';
}

export function normalizeAutomationTemplate(input: unknown): AutomationTemplate {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('automation template must be an object');
  }
  const raw = input as Record<string, unknown>;
  const id = cleanId(raw.id);
  if (!id) throw new Error('automation template id must be a safe slug');
  const rawStages = Array.isArray(raw.stages) ? raw.stages : [];
  const stages = rawStages
    .map((stage): AutomationTemplate['stages'][number] | null => {
      if (!stage || typeof stage !== 'object' || Array.isArray(stage)) return null;
      const stageRaw = stage as Record<string, unknown>;
      const stageId = cleanId(stageRaw.id);
      const kind = stageRaw.kind;
      const title = stageRaw.title;
      if (!stageId || typeof title !== 'string' || !title.trim()) return null;
      if (typeof kind !== 'string' || !STAGE_KINDS.has(kind as AutomationTemplateStageKind)) {
        return null;
      }
      return {
        id: stageId,
        kind: kind as AutomationTemplateStageKind,
        title: title.trim(),
        ...(typeof stageRaw.description === 'string' && stageRaw.description.trim()
          ? { description: stageRaw.description.trim() }
          : {}),
      };
    })
    .filter((stage): stage is AutomationTemplate['stages'][number] => Boolean(stage));
  if (stages.length === 0) throw new Error('automation template requires at least one valid stage');
  return {
    id,
    title: requiredString(raw, 'title'),
    description: requiredString(raw, 'description'),
    purpose: requiredString(raw, 'purpose'),
    triggerKinds: cleanEnumArray(raw.triggerKinds, TRIGGER_KINDS, ['manual']),
    sourceKinds: cleanEnumArray(raw.sourceKinds, SOURCE_KINDS, ['chat']),
    stages,
    outputSinks: cleanEnumArray(raw.outputSinks, OUTPUT_SINKS, ['memory']),
    reviewPolicy: cleanReviewPolicy(raw.reviewPolicy),
    tokenCompression: cleanCompressionMode(raw.tokenCompression),
    ...(cleanStringArray(raw.tags).length > 0 ? { tags: cleanStringArray(raw.tags) } : {}),
  };
}

async function readUserAutomationTemplates(dataDir: string): Promise<AutomationTemplate[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fsp.readFile(storePath(dataDir), 'utf8'));
  } catch {
    return [];
  }
  const rawTemplates = Array.isArray((parsed as { templates?: unknown }).templates)
    ? (parsed as { templates: unknown[] }).templates
    : [];
  const out: AutomationTemplate[] = [];
  for (const raw of rawTemplates) {
    try {
      out.push(normalizeAutomationTemplate(raw));
    } catch {
      continue;
    }
  }
  return out;
}

async function writeUserAutomationTemplates(
  dataDir: string,
  templates: AutomationTemplate[],
): Promise<void> {
  const file = storePath(dataDir);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify({ templates }, null, 2));
}

export async function listAllAutomationTemplates(dataDir: string): Promise<AutomationTemplate[]> {
  const userTemplates = await readUserAutomationTemplates(dataDir);
  const builtInIds = new Set(BUILT_IN_AUTOMATION_TEMPLATES.map((template) => template.id));
  return [
    ...BUILT_IN_AUTOMATION_TEMPLATES,
    ...userTemplates.filter((template) => !builtInIds.has(template.id)),
  ];
}

export async function getAnyAutomationTemplate(
  dataDir: string,
  id: string,
): Promise<AutomationTemplate | null> {
  return (await listAllAutomationTemplates(dataDir)).find((template) => template.id === id) ?? null;
}

export async function upsertUserAutomationTemplate(
  dataDir: string,
  input: unknown,
): Promise<AutomationTemplate> {
  const template = normalizeAutomationTemplate(input);
  if (BUILT_IN_AUTOMATION_TEMPLATES.some((builtIn) => builtIn.id === template.id)) {
    throw new Error(`cannot overwrite built-in automation template ${template.id}`);
  }
  const current = await readUserAutomationTemplates(dataDir);
  const next = current.filter((existing) => existing.id !== template.id);
  next.push(template);
  next.sort((a, b) => a.id.localeCompare(b.id));
  await writeUserAutomationTemplates(dataDir, next);
  return template;
}
