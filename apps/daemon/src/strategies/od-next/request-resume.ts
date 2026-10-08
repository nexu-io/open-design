import {
  OD_NEXT_PRODUCTION_MARKER_PROTOCOL,
  parseOdNextPromptBundleV2,
  renderOdNextProductionReadyInstructions,
  type OdNextPromptBundleV2,
} from '@open-design/contracts';
import type { StrategyTaskExecutionRecord } from '../task-store.js';

export function usesProductionMarker(task: Pick<StrategyTaskExecutionRecord, 'promptBundle'>): boolean {
  try {
    return parseOdNextPromptBundleV2(task.promptBundle.text).coreSystemPrompt.outputContract
      .startsWith(OD_NEXT_PRODUCTION_MARKER_PROTOCOL);
  } catch { return false; }
}

function splitClientInstructions(bundle: OdNextPromptBundleV2): { gate: string; custom: string } {
  const client = bundle.context.clientSystemPrompt ?? '';
  const key = /^Plan-to-production continuation:[\s\S]*?<od-production-ready key="([a-f0-9]+)" \/>/.exec(client)?.[1];
  const gate = key ? renderOdNextProductionReadyInstructions(key) : '';
  return { gate, custom: gate && client.startsWith(gate) ? client.slice(gate.length) : client };
}

/** Compare instruction bodies, never per-task snapshot IDs or nonce-bearing text. */
function stableInstructions(bundle: OdNextPromptBundleV2): string {
  return JSON.stringify({
    core: bundle.coreSystemPrompt,
    skills: bundle.sessionSkills,
    stages: bundle.activeStages,
    taskType: bundle.taskMetadata.taskType,
    configuration: bundle.taskMetadata.taskConfiguration,
    stableContext: bundle.context.stableRequestContext,
    research: bundle.context.researchCommandContract,
    mcp: bundle.context.connectedExternalMcp,
    browser: bundle.context.browserUnavailableGuard,
    custom: splitClientInstructions(bundle).custom,
  });
}

/** Null means send the full frozen bundle; never depend on a stale instruction set. */
export function composeResumedRequest(task: Pick<StrategyTaskExecutionRecord, 'promptBundle' | 'taskExecutionId'>, previous: Pick<StrategyTaskExecutionRecord, 'promptBundle'>): string | null {
  if (!usesProductionMarker(task) || !usesProductionMarker(previous)) return null;
  const current = parseOdNextPromptBundleV2(task.promptBundle.text);
  const prior = parseOdNextPromptBundleV2(previous.promptBundle.text);
  if (stableInstructions(current) !== stableInstructions(prior)) return null;
  const { gate } = splitClientInstructions(current);
  if (!gate) return null;
  const context = current.context;
  const parts = [
    'Follow the current user request. For a new design deliverable, finish an actionable plan before production; do not build in the planning turn. For an existing actionable plan, continue directly when requested.',
    gate,
    contextDelta('Runtime capabilities', runtimeCapabilities(context.runtimeFacts), runtimeCapabilities(prior.context.runtimeFacts)),
    contextDelta('Runtime tool environment', context.runtimeToolEnvironment, prior.context.runtimeToolEnvironment),
    contextDelta('Workspace input references', context.requestInputFacts, prior.context.requestInputFacts),
    contextDelta('Selected run context', context.runContext, prior.context.runContext),
    context.formOverride,
    contextDelta('Attachment references', current.taskMetadata.attachments, prior.taskMetadata.attachments),
    current.taskMetadata.titleDirective,
    `Current user request:\n${current.userFirstPrompt}`,
  ];
  return parts.filter(part => typeof part === 'string' && part.trim()).join('\n\n');
}

function contextDelta(label: string, current: string | undefined, previous: string | undefined): string {
  if ((current ?? '') === (previous ?? '')) return '';
  return current?.trim()
    ? `${label} updated; this replaces the previous value:\n${current}`
    : `${label}: cleared. The previous value no longer applies to this turn.`;
}

/** Strip audit-only snapshot identifiers while retaining the actual capability facts. */
function runtimeCapabilities(text: string | undefined): string {
  if (!text?.trim()) return '';
  const start = text.indexOf('{');
  if (start < 0) return text;
  try {
    const facts = JSON.parse(text.slice(start)) as Record<string, unknown>;
    const { appliedSnapshot: _snapshot, capabilitySnapshotHash: _hash, ...capabilities } = facts;
    return JSON.stringify(capabilities);
  } catch { return text; }
}
