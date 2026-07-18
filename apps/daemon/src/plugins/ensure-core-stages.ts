// Core quality-stage floor for design-artifact generation.
//
// Why: template / community plugins frequently declare a generate-only
// pipeline — `stages: [{ id: 'generate', atoms: ['file-write','live-artifact'] }]`
// — so they can ship a locked reference seed without re-running
// discovery. But `resolveAppliedPipeline` returns that declaration
// verbatim (`source: 'declared'`), so it REPLACES the core scenario
// pipeline. The `plan` (TodoWrite) and `critique` (5-dimension quality /
// anti-slop) stages then never run: the agent generates with no
// harness-driven critique loop and, at best, narrates a self-evaluation
// inline — unverifiable theater. Observed symptom: "using a plugin
// skipped the five-stage main flow — no todolist, no real anti-slop".
//
// This floor guarantees that any pipeline producing a code/document
// design artifact (a `generate` stage whose atoms include `file-write`
// or `live-artifact`) carries a `plan` and a `critique` stage, whether
// the artifact came from a free-form prompt (od-default / od-new-generation,
// which already declare both — a no-op here) or a template/plugin.
//
// Deliberately OUT OF SCOPE:
//   - Pure media generation (image/video/audio) stays generate-only; a
//     raw image/video/audio has nothing for critique-theater to score.
//     This is gated on the manifest's media `mode` (image/video/audio),
//     NOT on atom shape alone: bundled media scenarios such as
//     `image-poster` / `audio-jingle` ship an example-driven
//     `generate: [file-write, live-artifact]` pipeline (they seed an
//     `example.html`), so the atom shape is indistinguishable from a
//     code/document artifact. The media `mode` is the only explicit
//     non-media signal, so it must win before the atom-shape check.
//   - `task-type` / `discovery` question forms are NOT injected: a
//     template already knows its task type and locked direction, and
//     re-raising those GenUI surfaces would interrogate the user for
//     answers the template already encodes.
//   - The injected `plan` carries only `todo-write`, NOT
//     `direction-picker`: a template's direction is fixed by its
//     reference seed, so we add the todolist without re-exploring
//     directions the template intentionally locked.
//
// Pure module — no fs / SQLite / network — so the daemon's apply path
// stays pure.

import type { PluginPipeline, PipelineStage } from '@open-design/contracts';

// Atoms whose presence in a `generate` stage mark the output as a
// code/document artifact that benefits from plan + critique.
const DESIGN_ARTIFACT_ATOMS = new Set(['file-write', 'live-artifact']);

// Manifest media modes whose output is a raw image/video/audio asset.
// A pipeline in any of these modes stays generate-only even when its
// atoms look like a code artifact (bundled media scenarios seed an
// `example.html`, so the atom shape alone is not decisive).
const MEDIA_MODES = new Set(['image', 'video', 'audio']);

// Mirrors the `plan` / `critique` stages declared by the bundled
// od-new-generation scenario, minus `direction-picker` (see header).
function buildPlanStage(): PipelineStage {
  return { id: 'plan', atoms: ['todo-write'] };
}
function buildCritiqueStage(): PipelineStage {
  return {
    id:     'critique',
    atoms:  ['critique-theater'],
    repeat: true,
    until:  'critique.score>=4 || iterations>=3',
  };
}

export interface EnsureCoreStagesInput {
  pipeline: PluginPipeline | undefined;
  taskKind: string;
  // Manifest `od.mode` (image/video/audio/web/deck/...). Media modes are
  // excluded from injection regardless of atom shape.
  mode?: string | undefined;
  // How `resolveAppliedPipeline` produced `pipeline`: 'declared' (the
  // manifest carried `od.pipeline`) vs 'scenario' (it omitted it and we
  // fell back to a bundled scenario). The fallback keys on `taskKind`
  // ONLY (see pipeline-fallback.ts), so a media manifest with no
  // `od.pipeline` falls back to the full new-generation scenario
  // (discovery -> plan -> generate -> critique). We need `source` to
  // collapse that scenario-derived media pipeline back to generate-only.
  source?: 'declared' | 'scenario' | 'none' | undefined;
}

// Returns the pipeline with `plan` + `critique` guaranteed when the
// pipeline produces a design artifact; otherwise returns it unchanged
// (same reference when nothing is injected).
export function ensureCoreQualityStages(input: EnsureCoreStagesInput): PluginPipeline | undefined {
  const { pipeline, taskKind, mode, source } = input;
  if (!pipeline || !Array.isArray(pipeline.stages)) return pipeline;
  // Scope to the design-generation taskKind; migration / authoring /
  // media-generation flows own their own stage contracts.
  if (taskKind !== 'new-generation') return pipeline;
  // Pure media (image/video/audio) stays generate-only. Two shapes reach
  // here for a media manifest:
  //   - It DECLARED its own pipeline (every shipped media plugin ships an
  //     example-driven generate-only pipeline) — leave it verbatim; never
  //     inject plan/critique even though the atoms look like a code artifact.
  //   - It OMITTED `od.pipeline` and fell back to the new-generation
  //     scenario (the fallback keys on taskKind only, ignoring mode), so it
  //     arrives as discovery -> plan -> generate -> critique. Collapse that
  //     back to the generate stage so media stays generate-only as promised.
  if (mode && MEDIA_MODES.has(mode)) {
    if (source === 'scenario') {
      const generate = pipeline.stages.find((s) => s.id === 'generate');
      if (generate) return { ...pipeline, stages: [generate] };
    }
    return pipeline;
  }

  const stages = pipeline.stages;
  const generateIdx = stages.findIndex(
    (s) => s.id === 'generate' && (s.atoms ?? []).some((a) => DESIGN_ARTIFACT_ATOMS.has(a)),
  );
  // Not a design-artifact generate pipeline (e.g. pure image/video media).
  if (generateIdx < 0) return pipeline;

  const hasStage = (id: string): boolean => stages.some((s) => s.id === id);
  const needPlan = !hasStage('plan');
  const needCritique = !hasStage('critique');
  if (!needPlan && !needCritique) return pipeline;

  // Insert plan immediately BEFORE and critique immediately AFTER the
  // matched generate stage so the restored loop is exactly
  // plan -> generate -> critique. The runner executes stages strictly in
  // declaration order, so a pipeline with post-generate work (e.g.
  // generate -> handoff) must keep critique between generate and handoff —
  // appending critique to the very end would let downstream stages consume
  // or publish output before the quality loop runs.
  const next: PipelineStage[] = [];
  for (const [i, stage] of stages.entries()) {
    if (i === generateIdx && needPlan) next.push(buildPlanStage());
    next.push(stage);
    if (i === generateIdx && needCritique) next.push(buildCritiqueStage());
  }

  return { ...pipeline, stages: next };
}
