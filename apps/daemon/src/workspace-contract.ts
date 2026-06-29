import type {
  OrchestratorWorkspace,
  RunWorkspace,
} from '@open-design/contracts';

const ORCHESTRATOR_WORKSPACE_KIND = 'scratch';
const ORCHESTRATOR_WRITEBACK = 'external';
const ORCHESTRATOR_WORKSPACE_KEYS = new Set([
  'kind',
  'sourceLabel',
  'sourceRef',
  'baseRevision',
  'writeback',
]);

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function plainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeOrchestratorWorkspace(value: unknown) {
  const parsed = parseOrchestratorWorkspace(value);
  return parsed.ok ? parsed.value : null;
}

export function parseOrchestratorWorkspace(value: unknown): {
  ok: true;
  value: OrchestratorWorkspace | null;
} | {
  ok: false;
  message: string;
} {
  if (value == null) return { ok: true, value: null };
  const record = plainObject(value);
  if (!record) {
    return {
      ok: false,
      message: 'orchestratorWorkspace must be an object when provided',
    };
  }
  const unknownKey = Object.keys(record).find((key) => !ORCHESTRATOR_WORKSPACE_KEYS.has(key));
  if (unknownKey) {
    return {
      ok: false,
      message: `orchestratorWorkspace contains unsupported field: ${unknownKey}`,
    };
  }
  if (stringField(record.kind) !== ORCHESTRATOR_WORKSPACE_KIND) {
    return {
      ok: false,
      message: 'orchestratorWorkspace.kind must be "scratch"',
    };
  }
  if (record.writeback != null && stringField(record.writeback) !== ORCHESTRATOR_WRITEBACK) {
    return {
      ok: false,
      message: 'orchestratorWorkspace.writeback must be "external"',
    };
  }
  for (const key of ['sourceLabel', 'sourceRef', 'baseRevision']) {
    if (record[key] != null && !stringField(record[key])) {
      return {
        ok: false,
        message: `orchestratorWorkspace.${key} must be a non-empty string when provided`,
      };
    }
  }

  const result: OrchestratorWorkspace = {
    kind: ORCHESTRATOR_WORKSPACE_KIND,
    writeback: ORCHESTRATOR_WRITEBACK,
  };
  const sourceLabel = stringField(record.sourceLabel);
  const sourceRef = stringField(record.sourceRef);
  const baseRevision = stringField(record.baseRevision);
  if (sourceLabel) result.sourceLabel = sourceLabel;
  if (sourceRef) result.sourceRef = sourceRef;
  if (baseRevision) result.baseRevision = baseRevision;
  return { ok: true, value: result };
}

export function isOrchestratorScratchWorkspace(metadata: unknown): boolean {
  const record = plainObject(metadata);
  return !!record && normalizeOrchestratorWorkspace(record.orchestratorWorkspace) !== null;
}

export function projectWorkspaceProvenance(metadata: unknown): RunWorkspace {
  const record = plainObject(metadata);
  const baseDir = stringField(record?.baseDir);
  const orchestratorWorkspace = normalizeOrchestratorWorkspace(record?.orchestratorWorkspace);
  if (orchestratorWorkspace) {
    return {
      storage: {
        kind: 'folder-backed',
        baseDir,
      },
      provenance: {
        ...orchestratorWorkspace,
        kind: 'orchestrator-scratch',
        writeback: ORCHESTRATOR_WRITEBACK,
      },
    };
  }
  if (baseDir) {
    return {
      storage: {
        kind: 'folder-backed',
        baseDir,
      },
      provenance: {
        kind: 'user-local',
        writeback: 'in-place',
      },
    };
  }
  return {
    storage: {
      kind: 'od-owned',
      baseDir: null,
    },
    provenance: null,
  };
}
