// Authors: Leon Aburime using Claude Fable 5
// @ts-nocheck — carried over verbatim from server.ts's file-level @ts-nocheck.
// The moved bodies are untyped JS-in-TS; typing them is a later effort and new
// sibling code must NOT copy this.
/** @module run-event-analytics
 * Pure run-event scanners that derive analytics and retry signals from a run's
 * persisted `events` array.
 *
 * `resolveRunProjectKindForAnalytics` maps project metadata to a tracking
 * project-kind; `scanRunEventsForFinishedProps` extracts usage tokens and the
 * agent-reported model; `scanRunEventsForRetrySideEffects` detects
 * user-visible-output / tool-call / artifact-write / live-artifact activity;
 * the `filesystem*` helpers derive written file names and an empty-answer
 * fallback sentence; `retryFinalResultForRunStatus` and
 * `runRetryEventsForAnalytics` classify retry outcomes. Every function is pure —
 * it reads only its arguments and imported helpers, and depends on no daemon
 * module state. Each is paired with a `__forTest*` wrapper for the daemon test
 * suite.
 *
 * Extracted verbatim from apps/daemon/src/server.ts (strangler-fig slice 3).
 * server.ts imports the five functions it references
 * (`resolveRunProjectKindForAnalytics`, `scanRunEventsForRetrySideEffects`,
 * `filesystemWriteFileNamesFromRunEvents`, `filesystemEmptyAnswerFallbackText`,
 * `runRetryEventsForAnalytics`) and re-exports the seven `__forTest*` wrappers
 * back from here to preserve its public surface.
 */

import { runResultFromStatus } from './run-result.js';
import { scanRunEventsForUsageAnalytics } from './run-analytics-observability.js';
import {
  countDesignSystemPreviewModules,
  countNewArtifacts,
  didRunCreateDesignSystemFile,
} from './runtimes/run-artifacts.js';
import { projectKindFromMetadataToTracking } from '@open-design/contracts/analytics';

export function resolveRunProjectKindForAnalytics({
  hintProjectKind,
  projectMetadata,
}) {
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

export function __forTestResolveRunProjectKindForAnalytics(args) {
  return resolveRunProjectKindForAnalytics(args);
}

// Scans run.events newest→oldest to extract usage token counts and the
// agent-reported model name. The scan must not short-circuit on usage
// before reaching the model signal: usage is a terminal event while
// status:initializing/model is emitted at the very start of the run, so
// in reverse iteration usage is seen first. The loop continues until both
// usage tokens are found AND (the caller already has a model from reqBody
// OR the agent-reported model has been found).
function scanRunEventsForFinishedProps(events, reqBodyModel) {
  const usage = scanRunEventsForUsageAnalytics(events, reqBodyModel, 0);
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    agentReportedModel: usage.agent_reported_model,
  };
}

export function __forTestScanRunEventsForFinishedProps(events, reqBodyModel) {
  return scanRunEventsForFinishedProps(events, reqBodyModel);
}

export function scanRunEventsForRetrySideEffects(events) {
  const sideEffects = {
    userVisibleOutputSeen: false,
    toolCallSeen: false,
    artifactWriteSeen: false,
    liveArtifactSeen: false,
  };
  for (const rec of Array.isArray(events) ? events : []) {
    if (rec?.event === 'stdout') {
      const chunk = rec.data?.chunk;
      if (typeof chunk === 'string' ? chunk.length > 0 : chunk !== undefined) {
        sideEffects.userVisibleOutputSeen = true;
      }
    }
    const data = rec?.data;
    if (!data || typeof data !== 'object') continue;
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
    countNewArtifacts(events) > 0 ||
    didRunCreateDesignSystemFile(events) ||
    countDesignSystemPreviewModules(events) > 0
  ) {
    sideEffects.artifactWriteSeen = true;
  }
  return sideEffects;
}

export function __forTestScanRunEventsForRetrySideEffects(events) {
  return scanRunEventsForRetrySideEffects(events);
}

function fileNameFromToolInputPath(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).at(-1) ?? trimmed;
}

export function filesystemWriteFileNamesFromRunEvents(events) {
  const names = [];
  const seen = new Set();
  for (const rec of Array.isArray(events) ? events : []) {
    const data = rec?.data;
    if (!data || typeof data !== 'object') continue;
    if (data.type !== 'tool_use' && data.type !== 'artifact') continue;

    const toolName = typeof data.name === 'string' ? data.name : '';
    const isFileTool =
      data.type === 'artifact' ||
      /^(Write|Edit|MultiEdit|write_file|edit_file|replace_file)$/i.test(toolName);
    if (!isFileTool) continue;

    const input = data.input && typeof data.input === 'object' ? data.input : {};
    const candidate =
      fileNameFromToolInputPath(input.file_path) ||
      fileNameFromToolInputPath(input.filePath) ||
      fileNameFromToolInputPath(input.path) ||
      fileNameFromToolInputPath(input.filename) ||
      fileNameFromToolInputPath(data.path) ||
      fileNameFromToolInputPath(data.filePath) ||
      fileNameFromToolInputPath(data.name);
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    names.push(candidate);
  }
  return names;
}

export function __forTestFilesystemWriteFileNamesFromRunEvents(events) {
  return filesystemWriteFileNamesFromRunEvents(events);
}

export function filesystemEmptyAnswerFallbackText(fileNames) {
  if (!Array.isArray(fileNames) || fileNames.length === 0) {
    return 'Wrote project files.';
  }
  const shown = fileNames.slice(0, 3);
  if (fileNames.length === 1) {
    return `Wrote ${shown[0]}.`;
  }
  if (fileNames.length <= 3) {
    const last = shown.at(-1);
    const first = shown.slice(0, -1).join(', ');
    return `Wrote ${first} and ${last}.`;
  }
  return `Wrote ${shown.join(', ')}, and ${fileNames.length} files total.`;
}

export function __forTestFilesystemEmptyAnswerFallbackText(fileNames) {
  return filesystemEmptyAnswerFallbackText(fileNames);
}

function retryFinalResultForRunStatus(status, retryAttemptCount) {
  const result = runResultFromStatus(status);
  if ((retryAttemptCount ?? 0) <= 0) {
    return result === 'failed' ? 'suppressed' : 'not_attempted';
  }
  if (result === 'success') return 'success';
  if (result === 'failed') return 'failed';
  return 'suppressed';
}

export function __forTestRetryFinalResultForRunStatus(status, retryAttemptCount) {
  return retryFinalResultForRunStatus(status, retryAttemptCount);
}

export function runRetryEventsForAnalytics(events) {
  return (Array.isArray(events) ? events : []).filter((rec) =>
    rec?.event === 'run_retry_attempted' || rec?.event === 'run_retry_finished'
  );
}

export function __forTestRunRetryEventsForAnalytics(events) {
  return runRetryEventsForAnalytics(events);
}
