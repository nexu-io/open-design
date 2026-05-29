import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import type Database from 'better-sqlite3';
import type {
  SkillPluginCandidate,
  SkillPluginCandidateSourceRef,
} from '@open-design/contracts';
import { OPEN_DESIGN_PLUGIN_SPEC_VERSION } from '@open-design/contracts';
import { validatePluginFolder, flattenValidationDiagnostics } from './validate.js';

type SqliteDb = Database.Database;
type DbRow = Record<string, unknown>;

const MAX_SOURCE_BYTES = 96_000;
const SAFE_SLUG = /^[a-z0-9][a-z0-9._-]*$/;

export interface DetectSkillPluginCandidateInput {
  projectId: string;
  runId?: string | null;
  conversationId?: string | null;
  assistantMessageId?: string | null;
  message?: unknown;
  attachments?: unknown;
  projectRoot: string;
  now?: number;
}

export interface SkillPluginDraftGenerationResult {
  ok: boolean;
  candidate: SkillPluginCandidate;
  draftPath: string;
  folder: string;
  validation: {
    ok: boolean;
    diagnostics: Array<{ severity: 'error' | 'warning' | 'info'; code: string; message: string }>;
  };
}

export async function detectSkillPluginCandidate(input: DetectSkillPluginCandidateInput): Promise<Omit<SkillPluginCandidate, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { fingerprint: string } | null> {
  const refs: SkillPluginCandidateSourceRef[] = [];
  const seen = new Set<string>();
  const addRef = (ref: SkillPluginCandidateSourceRef) => {
    const key = `${ref.kind}:${ref.value}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(ref);
  };

  const message = typeof input.message === 'string' ? input.message : '';
  for (const rel of referencedMarkdownPaths(message)) {
    const ref = await readCandidateFile(input.projectRoot, rel);
    if (ref) addRef(ref);
  }
  if (Array.isArray(input.attachments)) {
    for (const raw of input.attachments) {
      if (typeof raw !== 'string') continue;
      const ref = await readCandidateFile(input.projectRoot, raw);
      if (ref) addRef(ref);
    }
  }
  for (const url of referencedPluginUrls(message)) {
    addRef({
      kind: 'url',
      value: url,
      label: url,
      reason: 'Referenced repository or plugin-like URL.',
    });
  }

  const eligible = refs.filter((ref) => isEligibleSourceRef(ref));
  if (eligible.length === 0) return null;

  const primary = eligible[0]!;
  const title = deriveCandidateTitle(primary);
  const description = deriveCandidateDescription(primary);
  const fingerprint = sha256(eligible.map((ref) => `${ref.kind}:${ref.value}:${ref.content ? sha256(ref.content) : ''}`).join('\n'));
  return {
    projectId: input.projectId,
    runId: input.runId ?? null,
    conversationId: input.conversationId ?? null,
    assistantMessageId: input.assistantMessageId ?? null,
    title,
    description,
    confidence: primary.value.endsWith('SKILL.md') || primary.value.includes('/SKILL.md') ? 0.95 : 0.78,
    sourceRefs: eligible,
    provenance: {
      summary: `Detected from ${eligible.map((ref) => ref.label || ref.value).join(', ')} after a successful run.`,
      detectedAt: input.now ?? Date.now(),
    },
    draftPath: null,
    fingerprint,
  };
}

export function insertSkillPluginCandidate(
  db: SqliteDb,
  candidate: Omit<SkillPluginCandidate, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { fingerprint: string },
  now = Date.now(),
): SkillPluginCandidate | null {
  const existing = db.prepare(
    `SELECT * FROM skill_plugin_candidates WHERE project_id = ? AND fingerprint = ?`,
  ).get(candidate.projectId, candidate.fingerprint) as DbRow | undefined;
  if (existing) return rowToCandidate(existing);
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO skill_plugin_candidates
       (id, project_id, run_id, conversation_id, assistant_message_id, fingerprint, status,
        title, description, confidence, source_refs_json, provenance_json, draft_path,
        created_at, updated_at, dismissed_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  ).run(
    id,
    candidate.projectId,
    candidate.runId ?? null,
    candidate.conversationId ?? null,
    candidate.assistantMessageId ?? null,
    candidate.fingerprint,
    candidate.title,
    candidate.description,
    candidate.confidence,
    JSON.stringify(candidate.sourceRefs),
    JSON.stringify(candidate.provenance),
    candidate.draftPath ?? null,
    now,
    now,
  );
  return getSkillPluginCandidate(db, id);
}

export function listSkillPluginCandidates(db: SqliteDb, projectId: string, includeDismissed = false): SkillPluginCandidate[] {
  const rows = db.prepare(
    `SELECT * FROM skill_plugin_candidates
      WHERE project_id = ? ${includeDismissed ? '' : `AND status != 'dismissed'`}
      ORDER BY created_at DESC`,
  ).all(projectId) as DbRow[];
  return rows.map(rowToCandidate);
}

export function getSkillPluginCandidate(db: SqliteDb, id: string): SkillPluginCandidate | null {
  const row = db.prepare(`SELECT * FROM skill_plugin_candidates WHERE id = ?`).get(id) as DbRow | undefined;
  return row ? rowToCandidate(row) : null;
}

export function dismissSkillPluginCandidate(db: SqliteDb, projectId: string, id: string, now = Date.now()): SkillPluginCandidate | null {
  const result = db.prepare(
    `UPDATE skill_plugin_candidates
        SET status = 'dismissed', dismissed_at = ?, updated_at = ?
      WHERE project_id = ? AND id = ?`,
  ).run(now, now, projectId, id);
  if (result.changes === 0) return null;
  return getSkillPluginCandidate(db, id);
}

export async function generateSkillPluginDraft(
  db: SqliteDb,
  projectRoot: string,
  projectId: string,
  id: string,
  now = Date.now(),
): Promise<SkillPluginDraftGenerationResult | null> {
  const candidate = getSkillPluginCandidate(db, id);
  if (!candidate || candidate.projectId !== projectId || candidate.status === 'dismissed') return null;
  const slug = uniqueSlug(slugify(candidate.title || 'skill-plugin'));
  const draftPath = `plugin-source/${slug}`;
  const folder = path.join(projectRoot, ...draftPath.split('/'));
  await fs.mkdir(path.join(folder, 'references'), { recursive: true });
  await fs.writeFile(path.join(folder, 'SKILL.md'), synthesizeSkill(candidate), 'utf8');
  await fs.writeFile(path.join(folder, 'open-design.json'), JSON.stringify(buildManifest(slug, candidate), null, 2) + '\n', 'utf8');
  await fs.writeFile(path.join(folder, 'references', 'provenance.json'), JSON.stringify({
    candidateId: candidate.id,
    projectId: candidate.projectId,
    runId: candidate.runId,
    conversationId: candidate.conversationId,
    provenance: candidate.provenance,
    sourceRefs: candidate.sourceRefs.map((ref) => ({ ...ref, content: undefined })),
  }, null, 2) + '\n', 'utf8');
  let copied = 0;
  for (const ref of candidate.sourceRefs) {
    if (ref.kind !== 'file' || typeof ref.content !== 'string') continue;
    if (Buffer.byteLength(ref.content, 'utf8') > MAX_SOURCE_BYTES) continue;
    copied += 1;
    await fs.writeFile(path.join(folder, 'references', `source-${copied}-${path.basename(ref.value) || 'source.md'}`), ref.content, 'utf8');
  }
  const validationResult = await validatePluginFolder({ folder });
  const diagnostics = flattenValidationDiagnostics(validationResult).map((d) => ({
    severity: d.severity,
    code: d.code,
    message: d.message,
  }));
  db.prepare(
    `UPDATE skill_plugin_candidates
        SET draft_path = ?, updated_at = ?
      WHERE id = ?`,
  ).run(draftPath, now, id);
  const updated = getSkillPluginCandidate(db, id) ?? candidate;
  return {
    ok: validationResult.ok,
    candidate: updated,
    draftPath,
    folder,
    validation: { ok: validationResult.ok, diagnostics },
  };
}

function rowToCandidate(row: DbRow): SkillPluginCandidate {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    runId: nullableString(row.run_id),
    conversationId: nullableString(row.conversation_id),
    assistantMessageId: nullableString(row.assistant_message_id),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    confidence: Number(row.confidence ?? 0),
    status: row.status === 'dismissed' ? 'dismissed' : 'active',
    sourceRefs: parseJsonArray(row.source_refs_json),
    provenance: parseJsonObject(row.provenance_json, { summary: '', detectedAt: Number(row.created_at ?? Date.now()) }) as SkillPluginCandidate['provenance'],
    draftPath: nullableString(row.draft_path),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
    dismissedAt: nullableNumber(row.dismissed_at),
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseJsonArray(value: unknown): SkillPluginCandidateSourceRef[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: unknown, fallback: Record<string, unknown>): Record<string, unknown> {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function referencedMarkdownPaths(message: string): string[] {
  const out = new Set<string>();
  const re = /(?:^|[\s('"`])(@?[\w./ -]*(?:SKILL\.md|[A-Za-z0-9._-]+\.md))(?:$|[\s)'"`,])/gu;
  for (const match of message.matchAll(re)) {
    const value = String(match[1] ?? '').replace(/^@/, '').trim();
    if (value && !/^https?:\/\//iu.test(value)) out.add(value);
  }
  return Array.from(out);
}

function referencedPluginUrls(message: string): string[] {
  const out = new Set<string>();
  const re = /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[^\s)'"`<>]*)?/gu;
  for (const match of message.matchAll(re)) {
    const url = match[0];
    if (isExplicitSkillPluginUrl(url)) out.add(url);
  }
  return Array.from(out);
}

async function readCandidateFile(projectRoot: string, rel: string): Promise<SkillPluginCandidateSourceRef | null> {
  const normalized = rel.split(/[\\/]+/u).filter(Boolean);
  if (normalized.length === 0 || normalized.some((seg) => seg === '..')) return null;
  const abs = path.join(projectRoot, ...normalized);
  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  const base = path.basename(abs);
  if (base !== 'SKILL.md' && !base.endsWith('.md')) return null;
  if (stat.size > MAX_SOURCE_BYTES) {
    return { kind: 'file', value: normalized.join('/'), label: normalized.join('/'), size: stat.size, reason: 'Source file is too large to copy safely.' };
  }
  const content = await fs.readFile(abs, 'utf8');
  return { kind: 'file', value: normalized.join('/'), label: normalized.join('/'), content, size: stat.size, copied: true };
}

function isEligibleSourceRef(ref: SkillPluginCandidateSourceRef): boolean {
  if (ref.kind === 'url') return isExplicitSkillPluginUrl(ref.value);
  if (path.basename(ref.value) === 'SKILL.md') return true;
  const content = ref.content ?? '';
  if (!content) return false;
  const hasSkillSignal = /(^|\n)#{1,3}\s*(When to use|Usage|Workflow|Inputs|Outputs|Instructions|Capabilities)\b/iu.test(content)
    || /\b(skill|agent skill|reusable workflow|use this skill)\b/iu.test(content);
  const hasSubstance = content.trim().length >= 160;
  return hasSkillSignal && hasSubstance;
}

function isExplicitSkillPluginUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hostname !== 'github.com') return false;
  return /\/(?:SKILL\.md|open-design\.json)$/u.test(decodeURIComponent(url.pathname));
}

function deriveCandidateTitle(ref: SkillPluginCandidateSourceRef): string {
  const heading = ref.content?.match(/^#\s+(.+)$/mu)?.[1]?.trim();
  if (heading) return heading.slice(0, 80);
  const base = path.basename(ref.value).replace(/\.md$/iu, '');
  return titleize(base === 'SKILL' ? path.basename(path.dirname(ref.value)) || 'Skill plugin' : base);
}

function deriveCandidateDescription(ref: SkillPluginCandidateSourceRef): string {
  const paragraph = ref.content
    ?.split(/\n{2,}/u)
    .map((part) => part.trim())
    .find((part) => part && !part.startsWith('#'));
  if (paragraph) return paragraph.replace(/\s+/gu, ' ').slice(0, 220);
  return ref.kind === 'url'
    ? 'This repo looks like it could work as a plugin.'
    : 'Reusable skill material detected from a project file.';
}

function synthesizeSkill(candidate: SkillPluginCandidate): string {
  const source = candidate.sourceRefs.find((ref) => ref.content)?.content?.trim();
  if (source) return `${source}\n\n## Provenance\n\nFormalized by Open Design from candidate ${candidate.id}.\n`;
  return [
    `# ${candidate.title}`,
    '',
    candidate.description,
    '',
    '## When to use',
    '',
    'Use this skill when the workflow described by the source material should be repeated inside Open Design.',
    '',
    '## Workflow',
    '',
    '- Review the provenance in `references/provenance.json`.',
    '- Follow the linked source material conservatively.',
    '- Ask for clarification when the source material is incomplete.',
    '',
    '## Provenance',
    '',
    `Formalized by Open Design from candidate ${candidate.id}.`,
    '',
  ].join('\n');
}

function buildManifest(slug: string, candidate: SkillPluginCandidate) {
  return {
    $schema: 'https://open-design.ai/schemas/plugin.v1.json',
    specVersion: OPEN_DESIGN_PLUGIN_SPEC_VERSION,
    name: slug,
    title: candidate.title,
    version: '0.1.0',
    description: candidate.description,
    od: {
      kind: 'skill',
      taskKind: 'new-generation',
      context: {
        skills: [{ path: './SKILL.md' }],
      },
      capabilities: ['prompt:inject'],
    },
  };
}

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9._-]+/gu, '-').replace(/(^[-._]+|[-._]+$)/gu, '');
  return SAFE_SLUG.test(slug) ? slug : 'skill-plugin';
}

function uniqueSlug(slug: string): string {
  return `${slug}-${Date.now().toString(36)}`;
}

function titleize(value: string): string {
  return value.replace(/[-_.]+/gu, ' ').replace(/\b\w/gu, (c) => c.toUpperCase()).trim() || 'Skill plugin';
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
