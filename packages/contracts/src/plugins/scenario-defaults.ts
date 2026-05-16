// Default scenario plugin bindings (plan §3.3 of plugin-driven-flow-plan).
//
// Both the web client (`EntryShell.handleCreate`) and the daemon
// (`/api/projects` + `/api/runs`) need to know which bundled scenario
// plugin to bind when the caller didn't pick one explicitly. Keeping
// the mapping in contracts lets both sides import the same table so the
// client and the server never disagree about what counts as the
// "default" plugin for a given project kind / task kind.
//
// Kind → scenario plugin mapping. Surfaces that have a battle-tested
// bundled skill+template (decks, web prototypes) point to the
// specialised plugin so the agent gets a real seed (`assets/template.html`),
// a layout vocabulary (`references/layouts.md`), and a P0 checklist —
// instead of routing through the generic od-new-generation router and
// re-inventing every slide/section's CSS from scratch. The latter is
// the root cause of decks that overflow the 1080px canvas, mismatched
// type scales, and "different aesthetic every turn" drift.
//
// Generic / catch-all kinds (template, other) keep od-new-generation,
// which runs discovery → plan → generate → critique without a
// surface-specific seed. Media kinds keep od-media-generation, which
// dispatches through the media contract instead of emitting HTML.

import type { ProjectKind } from '../api/projects.js';
import type { AppliedPluginSnapshot } from './apply.js';

export type TaskKind = AppliedPluginSnapshot['taskKind'];

// Plugin ids the kind/task-kind defaults can resolve to. Two tiers:
//   1. `od-*` scenarios (under `plugins/_official/scenarios/`) — generic
//      routers / pipelines without per-surface templates.
//   2. `example-*` scenarios (under `plugins/_official/examples/`) —
//      specialised bundled skills that ship a seed template + layout
//      vocabulary + checklist. Promoted to first-class defaults here so
//      the chip rail / project create paths bind them without the user
//      having to manually pick the skill.
// Kept as a string-literal union so a typo surfaces as a type error in
// both the web shell and the daemon resolver.
export type DefaultScenarioPluginId =
  | 'od-default'
  | 'od-new-generation'
  | 'od-media-generation'
  | 'od-plugin-authoring'
  | 'od-figma-migration'
  | 'od-code-migration'
  | 'od-tune-collab'
  | 'example-simple-deck'
  | 'example-web-prototype';

export const DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID =
  'od-default' satisfies DefaultScenarioPluginId;

export const DEFAULT_SCENARIO_PLUGIN_BY_KIND: Record<ProjectKind, DefaultScenarioPluginId> = {
  // Prototypes bind to web-prototype's seed template (single-file HTML,
  // 1280×800 frame, section layouts library, P0 checklist).
  prototype: 'example-web-prototype',
  // Decks bind to simple-deck's seed (1920×1080 canvas, 8-pattern
  // layout vocabulary including cover / body / big-stat / pipeline /
  // closing, plus an overflow checklist that catches the
  // "headline + subtitle + absolute footer" collision).
  deck:      'example-simple-deck',
  template:  'od-new-generation',
  image:     'od-media-generation',
  video:     'od-media-generation',
  audio:     'od-media-generation',
  other:     'od-new-generation',
};

export const DEFAULT_SCENARIO_PLUGIN_BY_TASK_KIND: Record<TaskKind, DefaultScenarioPluginId> = {
  'new-generation':  'od-new-generation',
  'figma-migration': 'od-figma-migration',
  'code-migration':  'od-code-migration',
  'tune-collab':     'od-tune-collab',
};

export function defaultScenarioPluginIdForKind(
  kind: ProjectKind | undefined,
): DefaultScenarioPluginId | null {
  if (!kind) return null;
  return DEFAULT_SCENARIO_PLUGIN_BY_KIND[kind] ?? null;
}

export function defaultScenarioPluginIdForTaskKind(
  taskKind: TaskKind | undefined,
): DefaultScenarioPluginId | null {
  if (!taskKind) return null;
  return DEFAULT_SCENARIO_PLUGIN_BY_TASK_KIND[taskKind] ?? null;
}
