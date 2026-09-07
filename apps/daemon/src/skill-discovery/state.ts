import type Database from 'better-sqlite3';
import { SKILL_DISCOVERY_MAX_SUPERSEDED_V1 } from '@open-design/contracts';

type SqliteDb = Database.Database;

export type SkillDiscoveryStatus =
  | 'pending'
  | 'resolved_skill'
  | 'resolved_none'
  | 'clarification';

export type LoadedDiscoverySkillRole = 'primary' | 'auxiliary';

export interface LoadedDiscoverySkillRef {
  id: string;
  kind: 'task-profile' | 'functional';
  role: LoadedDiscoverySkillRole;
  version: string;
  candidateDigest: string;
  contentDigest: string;
  catalogRevision: string;
  purposeDigest: string;
  loadedAt: number;
  runId: string;
}

export interface SkillDiscoveryState {
  schemaVersion: 1;
  conversationId: string;
  projectId: string;
  catalogRevision: string;
  status: SkillDiscoveryStatus;
  bootstrapRunId: string;
  activeRunId: string;
  activePrimary: LoadedDiscoverySkillRef | null;
  activeAuxiliaries: LoadedDiscoverySkillRef[];
  superseded: LoadedDiscoverySkillRef[];
  lastResolution: {
    kind: 'skill' | 'none' | 'clarify';
    runId: string;
    at: number;
  } | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface SkillDiscoverySearchFilters {
  role?: LoadedDiscoverySkillRole;
  outputKind?: string;
  limit?: number;
}

export interface SkillDiscoverySearchCandidateEvidence {
  id: string;
  score: number;
}

type StoredStateRow = {
  conversationId: string;
  projectId: string;
  catalogRevision: string;
  status: string;
  bootstrapRunId: string;
  activeRunId: string;
  activePrimaryJson: string | null;
  activeAuxiliariesJson: string;
  supersededJson: string;
  lastResolutionJson: string | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
};

export class SkillDiscoveryStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillDiscoveryStateError';
  }
}

export function migrateSkillDiscoveryState(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_discovery_conversations (
      conversation_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      schema_version INTEGER NOT NULL CHECK (schema_version = 1),
      catalog_revision TEXT NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN ('pending', 'resolved_skill', 'resolved_none', 'clarification')
      ),
      bootstrap_run_id TEXT NOT NULL,
      active_run_id TEXT NOT NULL,
      active_primary_json TEXT,
      active_auxiliaries_json TEXT NOT NULL,
      superseded_json TEXT NOT NULL,
      last_resolution_json TEXT,
      revision INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS skill_discovery_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('search', 'load', 'reuse', 'replace', 'deactivate', 'resolve_none', 'clarify')),
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_skill_discovery_events_conversation
      ON skill_discovery_events(conversation_id, id);
  `);

  migrateSkillDiscoveryEventsDeactivateKind(db);
}

export function ensureSkillDiscoveryForRun(
  db: SqliteDb,
  input: {
    projectId: string;
    conversationId: string;
    runId: string;
    catalogRevision: string;
    now?: number;
  },
): SkillDiscoveryState {
  assertIdentifier(input.projectId, 'projectId');
  assertIdentifier(input.conversationId, 'conversationId');
  assertIdentifier(input.runId, 'runId');
  assertIdentifier(input.catalogRevision, 'catalogRevision');
  const now = input.now ?? Date.now();
  const ensure = db.transaction(() => {
    const existing = readSkillDiscoveryState(db, input.conversationId);
    if (!existing) {
      db.prepare(`
        INSERT INTO skill_discovery_conversations (
          conversation_id, project_id, schema_version, catalog_revision,
          status, bootstrap_run_id, active_run_id, active_primary_json,
          active_auxiliaries_json, superseded_json, last_resolution_json,
          revision, created_at, updated_at
        ) VALUES (?, ?, 1, ?, 'pending', ?, ?, NULL, '[]', '[]', NULL, 1, ?, ?)
      `).run(
        input.conversationId,
        input.projectId,
        input.catalogRevision,
        input.runId,
        input.runId,
        now,
        now,
      );
      return requiredState(db, input.conversationId);
    }
    if (existing.projectId !== input.projectId) {
      throw new SkillDiscoveryStateError(
        'Skill discovery conversation is bound to a different project.',
      );
    }
    const catalogChanged = existing.catalogRevision !== input.catalogRevision;
    const runChanged = existing.activeRunId !== input.runId;
    const reopenClarification = existing.status === 'clarification' && runChanged;
    if (catalogChanged) {
      const invalidated = retainRecentSuperseded([
        ...existing.superseded,
        ...(existing.activePrimary ? [existing.activePrimary] : []),
        ...existing.activeAuxiliaries,
      ]);
      db.prepare(`
        UPDATE skill_discovery_conversations
           SET active_run_id = ?,
               catalog_revision = ?,
               bootstrap_run_id = ?,
               status = 'pending',
               active_primary_json = NULL,
               active_auxiliaries_json = '[]',
               superseded_json = ?,
               last_resolution_json = NULL,
               revision = revision + 1,
               updated_at = ?
         WHERE conversation_id = ?
      `).run(
        input.runId,
        input.catalogRevision,
        input.runId,
        JSON.stringify(invalidated),
        now,
        input.conversationId,
      );
    } else if (runChanged) {
      db.prepare(`
        UPDATE skill_discovery_conversations
           SET active_run_id = ?,
               status = ?,
               revision = revision + 1,
               updated_at = ?
         WHERE conversation_id = ?
      `).run(
        input.runId,
        reopenClarification ? 'pending' : existing.status,
        now,
        input.conversationId,
      );
    }
    return requiredState(db, input.conversationId);
  });
  return ensure.immediate();
}

export function readSkillDiscoveryState(
  db: SqliteDb,
  conversationId: string,
): SkillDiscoveryState | null {
  const row = db.prepare(`
    SELECT conversation_id AS conversationId,
           project_id AS projectId,
           catalog_revision AS catalogRevision,
           status,
           bootstrap_run_id AS bootstrapRunId,
           active_run_id AS activeRunId,
           active_primary_json AS activePrimaryJson,
           active_auxiliaries_json AS activeAuxiliariesJson,
           superseded_json AS supersededJson,
           last_resolution_json AS lastResolutionJson,
           revision,
           created_at AS createdAt,
           updated_at AS updatedAt
      FROM skill_discovery_conversations
     WHERE conversation_id = ?
  `).get(conversationId) as StoredStateRow | undefined;
  return row ? normalizeStateRow(row) : null;
}

export function recordSkillDiscoverySearch(
  db: SqliteDb,
  input: {
    conversationId: string;
    runId: string;
    queryDigest: string;
    filters: SkillDiscoverySearchFilters;
    candidates: readonly SkillDiscoverySearchCandidateEvidence[];
    catalogRevision: string;
    now?: number;
  },
): SkillDiscoveryState {
  const state = requiredState(db, input.conversationId);
  assertRunScope(state, input.runId);
  const filters = normalizeSearchFilters(input.filters);
  const candidates = normalizeSearchCandidateEvidence(input.candidates);
  const now = input.now ?? Date.now();
  insertEvent(db, {
    conversationId: input.conversationId,
    runId: input.runId,
    kind: 'search',
    payload: {
      queryDigest: requireDigest(input.queryDigest, 'queryDigest'),
      filters,
      candidates,
      catalogRevision: input.catalogRevision,
    },
    now,
  });
  return state;
}

export interface SkillDiscoveryLoadInput {
  conversationId: string;
  runId: string;
  loaded: Omit<LoadedDiscoverySkillRef, 'loadedAt' | 'runId'>;
  conflictsWith: readonly string[];
  replaceId?: string | undefined;
  now?: number;
  /** Compare-and-swap guard for a plan made before an asynchronous materialization. */
  expectedStateRevision?: number | undefined;
}

export interface SkillDiscoveryLoadPlan {
  expectedStateRevision: number;
  plannedAt: number;
  loaded: LoadedDiscoverySkillRef;
  activePrimary: LoadedDiscoverySkillRef | null;
  activeAuxiliaries: LoadedDiscoverySkillRef[];
  superseded: LoadedDiscoverySkillRef[];
  status: SkillDiscoveryStatus;
  lastResolution: SkillDiscoveryState['lastResolution'];
  eventKind: 'load' | 'reuse' | 'replace';
}

/**
 * Pure load planner shared by route preflight and the transactional commit.
 * A catalog revision change invalidates every prior active ref before normal
 * role/quota/conflict checks, so one ledger can never mix catalog revisions.
 */
export function planSkillDiscoveryLoad(
  state: SkillDiscoveryState,
  input: Omit<SkillDiscoveryLoadInput, 'expectedStateRevision'>,
): SkillDiscoveryLoadPlan {
  const now = input.now ?? Date.now();
  assertDecisionMutationAllowed(state, input.runId);
  const loaded = normalizeLoadedRef({
    ...input.loaded,
    loadedAt: now,
    runId: input.runId,
  });
  const catalogChanged = state.catalogRevision !== loaded.catalogRevision;
  const invalidatedActive = catalogChanged
    ? [
        ...(state.activePrimary ? [state.activePrimary] : []),
        ...state.activeAuxiliaries,
      ]
    : [];
  const planningState = catalogChanged
    ? {
        ...state,
        catalogRevision: loaded.catalogRevision,
        status: 'pending' as const,
        activePrimary: null,
        activeAuxiliaries: [],
        superseded: [...state.superseded, ...invalidatedActive],
        lastResolution: null,
      }
    : state;

  if (
    loaded.role === 'primary'
    && planningState.activePrimary
    && (
      planningState.activePrimary.id !== loaded.id
      || planningState.activePrimary.contentDigest !== loaded.contentDigest
    )
    && input.replaceId !== planningState.activePrimary.id
  ) {
    throw new SkillDiscoveryStateError(
      `Loading a second primary requires replaceId=${planningState.activePrimary.id}.`,
    );
  }
  const conflicts = new Set(uniqueIds(input.conflictsWith));
  const active = [
    ...(planningState.activePrimary ? [planningState.activePrimary] : []),
    ...planningState.activeAuxiliaries,
  ];
  const conflicting = active.filter((candidate) => (
    candidate.id !== loaded.id && conflicts.has(candidate.id)
  ));
  const unreplaceableConflict = conflicting.find((candidate) => !(
    loaded.role === 'primary'
    && planningState.activePrimary?.id === candidate.id
    && input.replaceId === candidate.id
  ));
  if (unreplaceableConflict) {
    throw new SkillDiscoveryStateError(
      `Skill ${loaded.id} conflicts with active Skill ${unreplaceableConflict.id}.`,
    );
  }

  let activePrimary = planningState.activePrimary;
  let activeAuxiliaries = [...planningState.activeAuxiliaries];
  const superseded = [...planningState.superseded];
  let eventKind: 'load' | 'reuse' | 'replace' = 'load';

  if (loaded.role === 'primary') {
    if (activeAuxiliaries.some((candidate) => candidate.id === loaded.id)) {
      throw new SkillDiscoveryStateError(
        `Skill ${loaded.id} is already active as an auxiliary.`,
      );
    }
    if (activePrimary) {
      if (
        activePrimary.id === loaded.id
        && activePrimary.contentDigest === loaded.contentDigest
      ) {
        eventKind = 'reuse';
        loaded.loadedAt = activePrimary.loadedAt;
      } else {
        if (input.replaceId !== activePrimary.id) {
          throw new SkillDiscoveryStateError(
            `Loading a second primary requires replaceId=${activePrimary.id}.`,
          );
        }
        superseded.push(activePrimary);
        eventKind = 'replace';
      }
    }
    activePrimary = loaded;
  } else {
    if (activePrimary?.id === loaded.id) {
      throw new SkillDiscoveryStateError(
        `Skill ${loaded.id} is already active as the primary.`,
      );
    }
    const existingIndex = activeAuxiliaries.findIndex(
      (candidate) => candidate.id === loaded.id,
    );
    if (existingIndex >= 0) {
      const existing = activeAuxiliaries[existingIndex]!;
      if (existing.contentDigest !== loaded.contentDigest) {
        throw new SkillDiscoveryStateError(
          `Auxiliary Skill ${loaded.id} changed digest and must be explicitly removed before reload.`,
        );
      }
      loaded.loadedAt = existing.loadedAt;
      activeAuxiliaries[existingIndex] = loaded;
      eventKind = 'reuse';
    } else {
      if (activeAuxiliaries.length >= 2) {
        throw new SkillDiscoveryStateError(
          'Skill discovery permits at most 2 active auxiliary Skills.',
        );
      }
      activeAuxiliaries.push(loaded);
    }
  }

  const status: SkillDiscoveryStatus = activePrimary
    ? 'resolved_skill'
    : planningState.status;
  const resolution = activePrimary
    ? { kind: 'skill' as const, runId: input.runId, at: now }
    : planningState.lastResolution;
  return {
    expectedStateRevision: state.revision,
    plannedAt: now,
    loaded,
    activePrimary,
    activeAuxiliaries,
    superseded: retainRecentSuperseded(superseded),
    status,
    lastResolution: resolution,
    eventKind,
  };
}

export function applySkillDiscoveryLoad(
  db: SqliteDb,
  input: SkillDiscoveryLoadInput,
): SkillDiscoveryState {
  const apply = db.transaction(() => {
    const state = requiredState(db, input.conversationId);
    if (
      input.expectedStateRevision !== undefined
      && state.revision !== input.expectedStateRevision
    ) {
      throw new SkillDiscoveryStateError(
        'Skill discovery state changed after load preflight; retry from current status.',
      );
    }
    const plan = planSkillDiscoveryLoad(state, input);
    db.prepare(`
      UPDATE skill_discovery_conversations
         SET catalog_revision = ?,
             status = ?,
             active_primary_json = ?,
             active_auxiliaries_json = ?,
             superseded_json = ?,
             last_resolution_json = ?,
             revision = revision + 1,
             updated_at = ?
       WHERE conversation_id = ?
    `).run(
      plan.loaded.catalogRevision,
      plan.status,
      plan.activePrimary ? JSON.stringify(plan.activePrimary) : null,
      JSON.stringify(plan.activeAuxiliaries),
      JSON.stringify(plan.superseded),
      plan.lastResolution ? JSON.stringify(plan.lastResolution) : null,
      plan.plannedAt,
      input.conversationId,
    );
    insertEvent(db, {
      conversationId: input.conversationId,
      runId: input.runId,
      kind: plan.eventKind,
      payload: {
        id: plan.loaded.id,
        kind: plan.loaded.kind,
        role: plan.loaded.role,
        version: plan.loaded.version,
        candidateDigest: plan.loaded.candidateDigest,
        contentDigest: plan.loaded.contentDigest,
        catalogRevision: plan.loaded.catalogRevision,
        purposeDigest: plan.loaded.purposeDigest,
        ...(input.replaceId ? { replaceId: input.replaceId } : {}),
      },
      now: plan.plannedAt,
    });
    return requiredState(db, input.conversationId);
  });
  return apply.immediate();
}

export function deactivateSkillDiscoveryAuxiliary(
  db: SqliteDb,
  input: {
    conversationId: string;
    runId: string;
    id: string;
    reasonDigest: string;
    now?: number;
  },
): SkillDiscoveryState {
  const now = input.now ?? Date.now();
  const deactivate = db.transaction(() => {
    const state = requiredState(db, input.conversationId);
    assertDecisionMutationAllowed(state, input.runId);
    assertIdentifier(input.id, 'id');
    const auxiliaryIndex = state.activeAuxiliaries.findIndex(
      (candidate) => candidate.id === input.id,
    );
    if (auxiliaryIndex < 0) {
      throw new SkillDiscoveryStateError(
        `Auxiliary Skill ${input.id} is not active.`,
      );
    }
    const activeAuxiliaries = [...state.activeAuxiliaries];
    const [removed] = activeAuxiliaries.splice(auxiliaryIndex, 1);
    if (!removed) {
      throw new SkillDiscoveryStateError(
        `Auxiliary Skill ${input.id} is not active.`,
      );
    }
    const reasonDigest = requireDigest(input.reasonDigest, 'reasonDigest');
    db.prepare(`
      UPDATE skill_discovery_conversations
         SET active_auxiliaries_json = ?,
             superseded_json = ?,
             revision = revision + 1,
             updated_at = ?
       WHERE conversation_id = ?
    `).run(
      JSON.stringify(activeAuxiliaries),
      JSON.stringify(retainRecentSuperseded([...state.superseded, removed])),
      now,
      input.conversationId,
    );
    insertEvent(db, {
      conversationId: input.conversationId,
      runId: input.runId,
      kind: 'deactivate',
      payload: {
        id: removed.id,
        role: removed.role,
        contentDigest: removed.contentDigest,
        catalogRevision: removed.catalogRevision,
        reasonDigest,
      },
      now,
    });
    return requiredState(db, input.conversationId);
  });
  return deactivate.immediate();
}

export function resolveSkillDiscovery(
  db: SqliteDb,
  input: {
    conversationId: string;
    runId: string;
    resolution: 'none' | 'clarify';
    reasonDigest: string;
    now?: number;
  },
): SkillDiscoveryState {
  const now = input.now ?? Date.now();
  const resolve = db.transaction(() => {
    const state = requiredState(db, input.conversationId);
    assertDecisionMutationAllowed(state, input.runId);
    const status: SkillDiscoveryStatus = input.resolution === 'none'
      ? state.activePrimary ? 'resolved_skill' : 'resolved_none'
      : 'clarification';
    const lastResolution = {
      kind: input.resolution,
      runId: input.runId,
      at: now,
    };
    db.prepare(`
      UPDATE skill_discovery_conversations
         SET status = ?,
             last_resolution_json = ?,
             revision = revision + 1,
             updated_at = ?
       WHERE conversation_id = ?
    `).run(status, JSON.stringify(lastResolution), now, input.conversationId);
    insertEvent(db, {
      conversationId: input.conversationId,
      runId: input.runId,
      kind: input.resolution === 'none' ? 'resolve_none' : 'clarify',
      payload: { reasonDigest: requireDigest(input.reasonDigest, 'reasonDigest') },
      now,
    });
    return requiredState(db, input.conversationId);
  });
  return resolve.immediate();
}

export function isSkillDiscoveryWrapperBlocked(
  state: Pick<SkillDiscoveryState, 'status'> | null | undefined,
): boolean {
  return state?.status === 'pending' || state?.status === 'clarification';
}

export function renderSkillDiscoveryLifecycleCapsule(
  state: SkillDiscoveryState,
): string {
  const primary = state.activePrimary
    ? `${state.activePrimary.id} (${state.activePrimary.contentDigest})`
    : 'none';
  const auxiliaries = state.activeAuxiliaries.length > 0
    ? state.activeAuxiliaries
      .map((skill) => `${skill.id} (${skill.contentDigest})`)
      .join(', ')
    : 'none';
  const superseded = state.superseded.length > 0
    ? state.superseded
      .map((skill) => `${skill.id} (${skill.contentDigest})`)
      .join(', ')
    : 'none';
  const lastResolution = state.lastResolution
    ? `${state.lastResolution.kind} (run=${state.lastResolution.runId}, at=${state.lastResolution.at})`
    : 'none';
  const lines = [
    '# Open Design Skill lifecycle capsule',
    '',
    `- Schema: \`open-design.skill-discovery-state/v1\``,
    `- Catalog revision: \`${state.catalogRevision}\``,
    `- Decision state: \`${state.status}\``,
    `- Active primary: ${primary}`,
    `- Active auxiliaries: ${auxiliaries}`,
    `- Superseded: ${superseded}`,
    `- Last resolution: ${lastResolution}`,
    '- Quota: one primary and at most two auxiliaries.',
    '- On later user turns, decide autonomously whether the task changed enough to reuse, replace, augment, deactivate, resolve none, or clarify. Do not run a mandatory classifier on every turn.',
    '- This capsule is an index, not a Skill body. If the native session no longer contains a required body, call `od tools skills load` again using the exact id and digest from the injected official catalog before task-dependent action.',
  ];
  if (state.status === 'pending' || state.status === 'clarification') {
    lines.push(
      '',
      '## Required discovery action before mutation',
      '',
      '- Wrong selection is more harmful than no selection. Compare the current request semantically with every record in the accompanying official metadata catalog; do not force the nearest candidate.',
      '- Inspect current state: `"$OD_NODE_BIN" "$OD_BIN" tools skills status --rehydrate --json`.',
      '- Load a supported candidate directly from its catalog record: `"$OD_NODE_BIN" "$OD_BIN" tools skills load --id <id> --catalog-revision <revision> --candidate-digest <candidateDigest> --role primary|auxiliary --purpose \'<why-it-fits>\' --json`.',
      '- If no primary is appropriate: `"$OD_NODE_BIN" "$OD_BIN" tools skills resolve --none --reason \'<why-no-primary-fits>\' --json`.',
      '- If one material answer is required: `"$OD_NODE_BIN" "$OD_BIN" tools skills resolve --clarify --reason \'<missing-material-choice>\' --json`, then ask the user. Clarification remains blocked until the answer arrives on a later Run.',
      '- Only a successful primary load or `resolve --none` unlocks mutation-capable Open Design wrappers. Loading auxiliaries alone does not.',
    );
  }
  return lines.join('\n');
}

function requiredState(db: SqliteDb, conversationId: string): SkillDiscoveryState {
  const state = readSkillDiscoveryState(db, conversationId);
  if (!state) {
    throw new SkillDiscoveryStateError('Skill discovery state is not initialized.');
  }
  return state;
}

function assertRunScope(state: SkillDiscoveryState, runId: string): void {
  if (state.activeRunId !== runId) {
    throw new SkillDiscoveryStateError(
      'Skill discovery request does not belong to the active conversation run.',
    );
  }
}

function assertDecisionMutationAllowed(state: SkillDiscoveryState, runId: string): void {
  assertRunScope(state, runId);
  if (
    state.status === 'clarification'
    && state.lastResolution?.kind === 'clarify'
    && state.lastResolution.runId === runId
  ) {
    throw new SkillDiscoveryStateError(
      'Skill discovery clarification must wait for a later run before changing the decision.',
    );
  }
}

function normalizeStateRow(row: StoredStateRow): SkillDiscoveryState {
  const status = normalizeStatus(row.status);
  const activePrimary = parseJson(row.activePrimaryJson, null);
  const activeAuxiliaries = parseJson(row.activeAuxiliariesJson, []);
  const persistedSuperseded = parseJson(row.supersededJson, []);
  const lastResolution = parseJson(row.lastResolutionJson, null);
  if (
    activePrimary !== null && !isLoadedRef(activePrimary)
    || !Array.isArray(activeAuxiliaries) || !activeAuxiliaries.every(isLoadedRef)
    || !Array.isArray(persistedSuperseded) || !persistedSuperseded.every(isLoadedRef)
    || lastResolution !== null && !isResolution(lastResolution)
  ) {
    throw new SkillDiscoveryStateError('Persisted Skill discovery state is malformed.');
  }
  return {
    schemaVersion: 1,
    conversationId: row.conversationId,
    projectId: row.projectId,
    catalogRevision: row.catalogRevision,
    status,
    bootstrapRunId: row.bootstrapRunId,
    activeRunId: row.activeRunId,
    activePrimary,
    activeAuxiliaries,
    superseded: retainRecentSuperseded(persistedSuperseded),
    lastResolution,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function retainRecentSuperseded(
  values: LoadedDiscoverySkillRef[],
): LoadedDiscoverySkillRef[] {
  return values.slice(-SKILL_DISCOVERY_MAX_SUPERSEDED_V1);
}

function normalizeLoadedRef(input: LoadedDiscoverySkillRef): LoadedDiscoverySkillRef {
  assertIdentifier(input.id, 'loaded.id');
  if (input.kind !== 'task-profile' && input.kind !== 'functional') {
    throw new SkillDiscoveryStateError('loaded.kind is invalid.');
  }
  if (input.role !== 'primary' && input.role !== 'auxiliary') {
    throw new SkillDiscoveryStateError('loaded.role is invalid.');
  }
  assertIdentifier(input.version, 'loaded.version');
  requireDigest(input.candidateDigest, 'loaded.candidateDigest');
  requireDigest(input.contentDigest, 'loaded.contentDigest');
  assertIdentifier(input.catalogRevision, 'loaded.catalogRevision');
  requireDigest(input.purposeDigest, 'loaded.purposeDigest');
  assertIdentifier(input.runId, 'loaded.runId');
  if (!Number.isFinite(input.loadedAt)) {
    throw new SkillDiscoveryStateError('loaded.loadedAt is invalid.');
  }
  return { ...input };
}

function normalizeStatus(value: string): SkillDiscoveryStatus {
  if (
    value === 'pending'
    || value === 'resolved_skill'
    || value === 'resolved_none'
    || value === 'clarification'
  ) return value;
  throw new SkillDiscoveryStateError('Persisted Skill discovery status is invalid.');
}

function parseJson(value: string | null, fallback: unknown): any {
  if (value === null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    throw new SkillDiscoveryStateError('Persisted Skill discovery JSON is malformed.');
  }
}

function isLoadedRef(value: unknown): value is LoadedDiscoverySkillRef {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LoadedDiscoverySkillRef>;
  return typeof candidate.id === 'string'
    && (candidate.kind === 'task-profile' || candidate.kind === 'functional')
    && (candidate.role === 'primary' || candidate.role === 'auxiliary')
    && typeof candidate.version === 'string'
    && typeof candidate.candidateDigest === 'string'
    && typeof candidate.contentDigest === 'string'
    && typeof candidate.catalogRevision === 'string'
    && typeof candidate.purposeDigest === 'string'
    && typeof candidate.loadedAt === 'number'
    && typeof candidate.runId === 'string';
}

function isResolution(value: unknown): value is SkillDiscoveryState['lastResolution'] {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { kind?: unknown; runId?: unknown; at?: unknown };
  return (candidate.kind === 'skill' || candidate.kind === 'none' || candidate.kind === 'clarify')
    && typeof candidate.runId === 'string'
    && typeof candidate.at === 'number';
}

function insertEvent(
  db: SqliteDb,
  input: {
    conversationId: string;
    runId: string;
    kind: 'search' | 'load' | 'reuse' | 'replace' | 'deactivate' | 'resolve_none' | 'clarify';
    payload: Record<string, unknown>;
    now: number;
  },
): void {
  db.prepare(`
    INSERT INTO skill_discovery_events (
      conversation_id, run_id, kind, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    input.conversationId,
    input.runId,
    input.kind,
    JSON.stringify(input.payload),
    input.now,
  );
}

function normalizeSearchFilters(
  input: SkillDiscoverySearchFilters,
): { role: LoadedDiscoverySkillRole | null; outputKind: string | null; limit: number | null } {
  if (input.role !== undefined && input.role !== 'primary' && input.role !== 'auxiliary') {
    throw new SkillDiscoveryStateError('search filter role is invalid.');
  }
  if (input.outputKind !== undefined) {
    assertIdentifier(input.outputKind, 'search filter outputKind');
  }
  if (
    input.limit !== undefined
    && (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 5)
  ) {
    throw new SkillDiscoveryStateError('search filter limit must be an integer from 1 to 5.');
  }
  return {
    role: input.role ?? null,
    outputKind: input.outputKind ?? null,
    limit: input.limit ?? null,
  };
}

function normalizeSearchCandidateEvidence(
  values: readonly SkillDiscoverySearchCandidateEvidence[],
): SkillDiscoverySearchCandidateEvidence[] {
  if (values.length > 5) {
    throw new SkillDiscoveryStateError('search evidence permits at most 5 candidates.');
  }
  const result: SkillDiscoverySearchCandidateEvidence[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    assertIdentifier(value.id, 'search candidate id');
    if (seen.has(value.id)) {
      throw new SkillDiscoveryStateError(
        `search candidate evidence contains duplicate id ${value.id}.`,
      );
    }
    if (!Number.isSafeInteger(value.score)) {
      throw new SkillDiscoveryStateError('search candidate score must be a safe integer.');
    }
    seen.add(value.id);
    result.push({ id: value.id, score: value.score });
  }
  return result;
}

function migrateSkillDiscoveryEventsDeactivateKind(db: SqliteDb): void {
  const sql = db.prepare(`
    SELECT sql
      FROM sqlite_master
     WHERE type = 'table' AND name = 'skill_discovery_events'
  `).pluck().get();
  if (typeof sql !== 'string' || sql.includes("'deactivate'")) return;

  const migrate = db.transaction(() => {
    db.exec(`
      DROP INDEX IF EXISTS idx_skill_discovery_events_conversation;
      ALTER TABLE skill_discovery_events RENAME TO skill_discovery_events_legacy;

      CREATE TABLE skill_discovery_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('search', 'load', 'reuse', 'replace', 'deactivate', 'resolve_none', 'clarify')),
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      INSERT INTO skill_discovery_events (
        id, conversation_id, run_id, kind, payload_json, created_at
      )
      SELECT id, conversation_id, run_id, kind, payload_json, created_at
        FROM skill_discovery_events_legacy;

      DROP TABLE skill_discovery_events_legacy;

      CREATE INDEX idx_skill_discovery_events_conversation
        ON skill_discovery_events(conversation_id, id);
    `);
  });
  migrate.immediate();
}

function uniqueIds(values: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    assertIdentifier(value, 'Skill id');
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function assertIdentifier(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SkillDiscoveryStateError(`${field} must be a non-empty string.`);
  }
}

function requireDigest(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value)) {
    throw new SkillDiscoveryStateError(`${field} must be a sha256 digest.`);
  }
  return value;
}
