// Spec §23.3.3 — bundled-scenario pipeline fallback.
//
// When a consumer plugin omits `od.pipeline`, the runtime consults the
// caller's bundled scenario list (passed via RegistryView.scenarios)
// and returns the matching scenario's pipeline. The match is by
// `taskKind`. Scenario plugins themselves never fall back (a scenario
// without a pipeline is the identity case and not allowed by the
// SKILL.md substrate landed in §3.N4).
//
// This module is pure — no fs, no SQLite, no network — so the daemon's
// apply path stays pure even when the fallback fires.

import type { PluginManifest, PluginPipeline } from '@open-design/contracts';
import type { ScenarioRegistryEntry } from './resolve.js';

export interface ResolvePipelineInput {
  manifest: PluginManifest;
  scenarios?: ReadonlyArray<ScenarioRegistryEntry> | undefined;
}

export interface ResolvePipelineResult {
  pipeline: PluginPipeline | undefined;
  // 'declared' = the manifest carried `od.pipeline` itself.
  // 'scenario' = the manifest omitted it; we fell back to a scenario.
  // 'none'     = no declared pipeline AND no matching scenario.
  source: 'declared' | 'scenario' | 'none';
  // When source='scenario', the scenario plugin id used for the
  // fallback. Useful for the run service's audit log so a reviewer
  // can attribute "why did this run start with stage X" to the
  // scenario plugin instead of the consumer.
  scenarioId?: string;
}

export function resolveAppliedPipeline(input: ResolvePipelineInput): ResolvePipelineResult {
  const declared = input.manifest.od?.pipeline;
  if (declared && Array.isArray(declared.stages) && declared.stages.length > 0) {
    return { pipeline: declared, source: 'declared' };
  }
  // Scenario plugins never fall back to themselves.
  const kind = input.manifest.od?.kind;
  if (kind === 'scenario') return { pipeline: undefined, source: 'none' };
  const taskKind = (input.manifest.od?.taskKind ?? 'new-generation') as ScenarioRegistryEntry['taskKind'];
  const scenarios = input.scenarios ?? [];
  for (const candidate of scenarios) {
    if (candidate.taskKind !== taskKind) continue;
    if (!candidate.pipeline || !Array.isArray(candidate.pipeline.stages)) continue;
    if (candidate.pipeline.stages.length === 0) continue;
    return { pipeline: candidate.pipeline, source: 'scenario', scenarioId: candidate.id };
  }
  return { pipeline: undefined, source: 'none' };
}
