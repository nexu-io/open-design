// @ts-nocheck

const ORCHESTRATOR_WORKSPACE_KIND = 'scratch';
const ORCHESTRATOR_WRITEBACK = 'external';

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function plainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeOrchestratorWorkspace(value: unknown) {
  const record = plainObject(value);
  if (!record) return null;
  if (stringField(record.kind) !== ORCHESTRATOR_WORKSPACE_KIND) return null;

  const result: Record<string, unknown> = {
    kind: ORCHESTRATOR_WORKSPACE_KIND,
    writeback: ORCHESTRATOR_WRITEBACK,
  };
  const sourceLabel = stringField(record.sourceLabel);
  const sourceRef = stringField(record.sourceRef);
  const baseRevision = stringField(record.baseRevision);
  if (sourceLabel) result.sourceLabel = sourceLabel;
  if (sourceRef) result.sourceRef = sourceRef;
  if (baseRevision) result.baseRevision = baseRevision;
  return result;
}

export function isOrchestratorScratchWorkspace(metadata: unknown): boolean {
  const record = plainObject(metadata);
  return !!record && normalizeOrchestratorWorkspace(record.orchestratorWorkspace) !== null;
}
