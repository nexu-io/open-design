// Braze IAM authoring persistence. Owns the braze_messages / braze_variants
// tables and their CRUD. Mirrors the migrate-submodule pattern of
// media-tasks.ts / plugins/persistence.ts: migrateBraze(db) is invoked from
// db.ts migrate(). Produced HTML lives as a project file (artifactPath); only
// workflow state + plan JSON live here. See DATA-MODEL-BRAZE.md.

import type Database from 'better-sqlite3';
import type {
  BrazeMessage,
  BrazeMessageStatus,
  BrazeVariant,
  BrazeVariantStatus,
  BrazeIamFormat,
  BrazeDeliveryModel,
  BrazePlan,
} from '@marketing-ax/contracts';

type SqliteDb = Database.Database;

export function migrateBraze(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS braze_messages (
      id                 TEXT PRIMARY KEY,
      project_id         TEXT NOT NULL,
      conversation_id    TEXT NOT NULL,
      brand_id           TEXT,
      title              TEXT NOT NULL,
      goal               TEXT,
      iam_format         TEXT NOT NULL,
      delivery_model     TEXT,
      trigger_event      TEXT,
      trigger_props_json TEXT,
      segment_json       TEXT,
      tone               TEXT,
      emphasis           TEXT,
      variant_count      INTEGER NOT NULL DEFAULT 1,
      plan_json          TEXT,
      brief_path         TEXT,
      status             TEXT NOT NULL,
      created_at         INTEGER NOT NULL,
      updated_at         INTEGER NOT NULL,
      FOREIGN KEY(project_id)      REFERENCES projects(id)      ON DELETE CASCADE,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_braze_messages_project
      ON braze_messages(project_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS braze_variants (
      id            TEXT PRIMARY KEY,
      message_id    TEXT NOT NULL,
      label         TEXT NOT NULL,
      artifact_path TEXT,
      status        TEXT NOT NULL,
      position      INTEGER NOT NULL,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      FOREIGN KEY(message_id) REFERENCES braze_messages(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_braze_variants_message
      ON braze_variants(message_id, position);
  `);
  // 기존 DB에 brief_path 없으면 추가(CREATE TABLE IF NOT EXISTS는 기존 테이블 무변경).
  const cols = db.prepare(`PRAGMA table_info(braze_messages)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'brief_path')) {
    db.exec(`ALTER TABLE braze_messages ADD COLUMN brief_path TEXT`);
  }
}

// --- row shapes (snake_case from SQLite) ---

interface RawMessageRow {
  id: string;
  project_id: string;
  conversation_id: string;
  brand_id: string | null;
  title: string;
  goal: string | null;
  iam_format: string;
  delivery_model: string | null;
  trigger_event: string | null;
  trigger_props_json: string | null;
  segment_json: string | null;
  tone: string | null;
  emphasis: string | null;
  variant_count: number;
  plan_json: string | null;
  brief_path: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

interface RawVariantRow {
  id: string;
  message_id: string;
  label: string;
  artifact_path: string | null;
  status: string;
  position: number;
  created_at: number;
  updated_at: number;
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

const iso = (ms: number): string => new Date(ms).toISOString();

function mapVariant(row: RawVariantRow): BrazeVariant {
  return {
    id: row.id,
    messageId: row.message_id,
    label: row.label,
    artifactPath: row.artifact_path,
    status: row.status as BrazeVariantStatus,
    position: row.position,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapMessage(row: RawMessageRow, variants: BrazeVariant[]): BrazeMessage {
  return {
    id: row.id,
    projectId: row.project_id,
    conversationId: row.conversation_id,
    brandId: row.brand_id,
    title: row.title,
    goal: row.goal,
    iamFormat: row.iam_format as BrazeIamFormat,
    deliveryModel: row.delivery_model as BrazeDeliveryModel | null,
    triggerEvent: row.trigger_event,
    triggerProps: parseJson(row.trigger_props_json),
    segment: parseJson(row.segment_json),
    tone: row.tone,
    emphasis: row.emphasis,
    variantCount: row.variant_count,
    plan: parseJson<BrazePlan>(row.plan_json),
    briefPath: row.brief_path,
    status: row.status as BrazeMessageStatus,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    variants,
  };
}

// --- inserts / updates ---

export interface BrazeMessageInsert {
  id: string;
  projectId: string;
  conversationId: string;
  title: string;
  goal?: string | null;
  brandId?: string | null;
  iamFormat?: BrazeIamFormat;
  status?: BrazeMessageStatus;
  now: number;
}

export function insertBrazeMessage(db: SqliteDb, m: BrazeMessageInsert): void {
  db.prepare(`
    INSERT INTO braze_messages (
      id, project_id, conversation_id, brand_id, title, goal,
      iam_format, variant_count, status, created_at, updated_at
    ) VALUES (
      @id, @projectId, @conversationId, @brandId, @title, @goal,
      @iamFormat, 1, @status, @now, @now
    )
  `).run({
    id: m.id,
    projectId: m.projectId,
    conversationId: m.conversationId,
    brandId: m.brandId ?? null,
    title: m.title,
    goal: m.goal ?? null,
    // Format is provisional until the interview; default to custom_html.
    iamFormat: m.iamFormat ?? 'custom_html',
    status: m.status ?? 'interviewing',
    now: m.now,
  });
}

// Columns the routes may patch. Undefined fields are left untouched.
export interface BrazeMessagePatch {
  brandId?: string | null;
  iamFormat?: BrazeIamFormat;
  deliveryModel?: BrazeDeliveryModel | null;
  triggerEvent?: string | null;
  triggerProps?: unknown;
  segment?: unknown;
  tone?: string | null;
  emphasis?: string | null;
  variantCount?: number;
  plan?: BrazePlan | null;
  briefPath?: string | null;
  status?: BrazeMessageStatus;
}

export function updateBrazeMessage(
  db: SqliteDb,
  id: string,
  patch: BrazeMessagePatch,
  now: number,
): void {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id, now };
  const set = (col: string, key: string, value: unknown) => {
    sets.push(`${col} = @${key}`);
    params[key] = value;
  };
  if (patch.brandId !== undefined) set('brand_id', 'brandId', patch.brandId);
  if (patch.iamFormat !== undefined) set('iam_format', 'iamFormat', patch.iamFormat);
  if (patch.deliveryModel !== undefined) set('delivery_model', 'deliveryModel', patch.deliveryModel);
  if (patch.triggerEvent !== undefined) set('trigger_event', 'triggerEvent', patch.triggerEvent);
  if (patch.triggerProps !== undefined) set('trigger_props_json', 'triggerProps', patch.triggerProps === null ? null : JSON.stringify(patch.triggerProps));
  if (patch.segment !== undefined) set('segment_json', 'segment', patch.segment === null ? null : JSON.stringify(patch.segment));
  if (patch.tone !== undefined) set('tone', 'tone', patch.tone);
  if (patch.emphasis !== undefined) set('emphasis', 'emphasis', patch.emphasis);
  if (patch.variantCount !== undefined) set('variant_count', 'variantCount', patch.variantCount);
  if (patch.plan !== undefined) set('plan_json', 'plan', patch.plan === null ? null : JSON.stringify(patch.plan));
  if (patch.briefPath !== undefined) set('brief_path', 'briefPath', patch.briefPath);
  if (patch.status !== undefined) set('status', 'status', patch.status);
  if (sets.length === 0) return;
  db.prepare(`UPDATE braze_messages SET ${sets.join(', ')}, updated_at = @now WHERE id = @id`).run(params);
}

export function getBrazeMessage(db: SqliteDb, id: string): BrazeMessage | null {
  const row = db.prepare(`SELECT * FROM braze_messages WHERE id = ?`).get(id) as RawMessageRow | undefined;
  if (!row) return null;
  return mapMessage(row, listBrazeVariants(db, id));
}

export function listBrazeMessages(db: SqliteDb, projectId: string): BrazeMessage[] {
  const rows = db.prepare(
    `SELECT * FROM braze_messages WHERE project_id = ? ORDER BY updated_at DESC`,
  ).all(projectId) as RawMessageRow[];
  return rows.map((row) => mapMessage(row, listBrazeVariants(db, row.id)));
}

export function deleteBrazeMessage(db: SqliteDb, id: string): void {
  db.prepare(`DELETE FROM braze_messages WHERE id = ?`).run(id);
}

// --- variants ---

export interface BrazeVariantInsert {
  id: string;
  messageId: string;
  label: string;
  position: number;
  status?: BrazeVariantStatus;
  artifactPath?: string | null;
  now: number;
}

export function insertBrazeVariant(db: SqliteDb, v: BrazeVariantInsert): void {
  db.prepare(`
    INSERT INTO braze_variants (id, message_id, label, artifact_path, status, position, created_at, updated_at)
    VALUES (@id, @messageId, @label, @artifactPath, @status, @position, @now, @now)
  `).run({
    id: v.id,
    messageId: v.messageId,
    label: v.label,
    artifactPath: v.artifactPath ?? null,
    status: v.status ?? 'pending',
    position: v.position,
    now: v.now,
  });
}

export function listBrazeVariants(db: SqliteDb, messageId: string): BrazeVariant[] {
  const rows = db.prepare(
    `SELECT * FROM braze_variants WHERE message_id = ? ORDER BY position ASC`,
  ).all(messageId) as RawVariantRow[];
  return rows.map(mapVariant);
}

export function getBrazeVariant(db: SqliteDb, id: string): BrazeVariant | null {
  const row = db.prepare(`SELECT * FROM braze_variants WHERE id = ?`).get(id) as RawVariantRow | undefined;
  return row ? mapVariant(row) : null;
}

export interface BrazeVariantPatch {
  status?: BrazeVariantStatus;
  artifactPath?: string | null;
}

export function updateBrazeVariant(
  db: SqliteDb,
  id: string,
  patch: BrazeVariantPatch,
  now: number,
): void {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id, now };
  if (patch.status !== undefined) {
    sets.push('status = @status');
    params.status = patch.status;
  }
  if (patch.artifactPath !== undefined) {
    sets.push('artifact_path = @artifactPath');
    params.artifactPath = patch.artifactPath;
  }
  if (sets.length === 0) return;
  db.prepare(`UPDATE braze_variants SET ${sets.join(', ')}, updated_at = @now WHERE id = @id`).run(params);
}
