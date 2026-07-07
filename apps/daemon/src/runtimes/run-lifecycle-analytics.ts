import { projectKindFromMetadataToTracking } from '@open-design/contracts/analytics';
import {
  countDesignSystemPreviewModules,
  countNewArtifacts,
  didRunCreateDesignSystemFile,
} from './run-artifacts.js';
import { scanRunEventsForUsageAnalytics } from '../run-analytics-observability.js';
import { runResultFromStatus } from '../run-result.js';

export interface RunEventRecordLike {
  event: string;
  data: unknown;
}

export interface ProjectMetadataForAnalytics {
  kind?: string | null;
  videoModel?: string | null;
  fidelity?: string | null;
  intent?: string | null;
  platform?: string | null;
  platformTargets?: readonly string[] | null;
  importedFrom?: unknown;
}

export interface RunRetrySideEffects {
  userVisibleOutputSeen: boolean;
  toolCallSeen: boolean;
  artifactWriteSeen: boolean;
  liveArtifactSeen: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function resolveRunProjectKindForAnalytics({
  hintProjectKind,
  projectMetadata,
}: {
  hintProjectKind?: unknown;
  projectMetadata?: ProjectMetadataForAnalytics | null;
}): string | null {
  if (typeof hintProjectKind === 'string') return hintProjectKind;
  if (projectMetadata?.importedFrom === 'design-system') return 'design_system';
  // Brand-extraction backing projects (kind:'brand', importedFrom:
  // 'brand-extraction') ARE design systems — a brand is one source for a DS,
  // not a separate object. Report them as design_system so DS-project runs
  // (creation + later edits) drill down cleanly. See design-system tracking spec §1.
  if (projectMetadata?.importedFrom === 'brand-extraction') return 'design_system';
  // Derive straight from the persisted metadata: videoModel splits HyperFrames
  // (kind=video) out of generic video, and the prototype/other subtype fields
  // (fidelity / intent / platform) split wireframe/mobile/live_artifact/document
  // out so the run's project_kind matches the Home card the user picked. The
  // web-supplied `hintProjectKind` already encodes all of this when set.
  return projectKindFromMetadataToTracking(projectMetadata);
}

// Scans run.events newest→oldest to extract usage token counts and the
// agent-reported model name. The scan must not short-circuit on usage
// before reaching the model signal: usage is a terminal event while
// status:initializing/model is emitted at the very start of the run.
export function scanRunEventsForFinishedProps(
  events: RunEventRecordLike[],
  reqBodyModel: unknown,
): {
  inputTokens?: number;
  outputTokens?: number;
  agentReportedModel: string | null;
} {
  const usage = scanRunEventsForUsageAnalytics(events, reqBodyModel, 0);
  return {
    ...(usage.input_tokens !== undefined ? { inputTokens: usage.input_tokens } : {}),
    ...(usage.output_tokens !== undefined ? { outputTokens: usage.output_tokens } : {}),
    agentReportedModel: usage.agent_reported_model,
  };
}

export function scanRunEventsForRetrySideEffects(events: unknown): RunRetrySideEffects {
  const sideEffects: RunRetrySideEffects = {
    userVisibleOutputSeen: false,
    toolCallSeen: false,
    artifactWriteSeen: false,
    liveArtifactSeen: false,
  };
  const records = Array.isArray(events) ? events : [];
  for (const rec of records) {
    if (!isRecord(rec)) continue;
    if (rec.event === 'stdout') {
      const data = isRecord(rec.data) ? rec.data : {};
      const chunk = data.chunk;
      if (typeof chunk === 'string' ? chunk.length > 0 : chunk !== undefined) {
        sideEffects.userVisibleOutputSeen = true;
      }
    }
    const data = isRecord(rec.data) ? rec.data : null;
    if (!data) continue;
    if (data.type === 'text_delta' || data.type === 'thinking_delta') {
      const delta = typeof data.delta === 'string' ? data.delta : '';
      if (delta.length > 0) sideEffects.userVisibleOutputSeen = true;
    }
    if (data.type === 'tool_use') sideEffects.toolCallSeen = true;
    if (data.type === 'artifact') sideEffects.artifactWriteSeen = true;
    if (data.type === 'live_artifact' || rec.event === 'live_artifact') {
      sideEffects.liveArtifactSeen = true;
    }
  }
  if (
    countNewArtifacts(records) > 0 ||
    didRunCreateDesignSystemFile(records) ||
    countDesignSystemPreviewModules(records) > 0
  ) {
    sideEffects.artifactWriteSeen = true;
  }
  return sideEffects;
}

export function retryFinalResultForRunStatus(status: string, retryAttemptCount?: number | null) {
  const result = runResultFromStatus(status);
  if ((retryAttemptCount ?? 0) <= 0) {
    return result === 'failed' ? 'suppressed' : 'not_attempted';
  }
  if (result === 'success') return 'success';
  if (result === 'failed') return 'failed';
  return 'suppressed';
}

export function runRetryEventsForAnalytics(events: unknown): RunEventRecordLike[] {
  return (Array.isArray(events) ? events : []).filter((rec): rec is RunEventRecordLike => (
    isRecord(rec) &&
    typeof rec.event === 'string' &&
    'data' in rec &&
    (rec.event === 'run_retry_attempted' || rec.event === 'run_retry_finished')
  ));
}
