// Default scenario plugin bindings (plan §3.3 of plugin-driven-flow-plan).
//
// Both the web client (`EntryShell.handleCreate`) and the daemon
// (`/api/projects` + `/api/runs`) need to know which bundled scenario
// plugin to bind when the caller didn't pick one explicitly. Keeping
// the mapping in contracts lets both sides import the same table so the
// client and the server never disagree about what counts as the
// "default" plugin for a given project kind / task kind.
//
// Creation defaults use the retained scenario infrastructure without pinning
// a visual template. The four OD Next task profiles are selected independently
// from exact task metadata; untyped tasks choose Skills through Discovery.
// Media kinds keep od-media-generation for their media contract.

import type {
  ProjectKind,
  ProjectMetadata,
  ProjectScenarioTaskProfile,
} from '../api/projects.js';
import type { AppliedPluginSnapshot } from './apply.js';

export type TaskKind = AppliedPluginSnapshot['taskKind'];

// Current default routers plus legacy ids retained for persisted bindings.
// New defaults below use only the retained scenario infrastructure.
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
  | 'example-live-artifact'
  | 'example-hyperframes'
  | 'example-simple-deck'
  | 'example-web-clone'
  | 'example-web-prototype'
  | 'example-webgl-experience';

export const DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID =
  'od-default' satisfies DefaultScenarioPluginId;

const AUTOMATIC_STRATEGY_TASK_PROFILE_BY_ROUTE_ID = {
  prototype: 'prototype',
  deck: 'ppt',
  marketing: 'marketing',
  hyperframes: 'hyperframes',
} as const satisfies Record<string, ProjectScenarioTaskProfile>;

/**
 * Resolve the product-owned OD Next route selected by a task-type surface.
 *
 * Keyed by the exact first-level task type, not by broad project kind and not
 * by second-level scene. A second-level scene refines WHAT to build, never
 * WHETHER the parent task type's route applies, so surfaces fold a nested
 * scene onto its parent before asking: `wireframe` and `mobile` are catalog
 * action ids, never route ids, and stay unrouted here on purpose.
 */
export function automaticStrategyTaskProfileForRouteId(
  routeId: string | null | undefined,
): ProjectScenarioTaskProfile | null {
  if (!routeId) return null;
  return AUTOMATIC_STRATEGY_TASK_PROFILE_BY_ROUTE_ID[
    routeId as keyof typeof AUTOMATIC_STRATEGY_TASK_PROFILE_BY_ROUTE_ID
  ] ?? null;
}

/**
 * Re-derive the OD Next route from exact project metadata alone.
 *
 * This is the fail-closed half of the routing contract: the web hand-off and
 * the daemon both run it against the metadata a create actually carries, so a
 * claimed route survives only when the metadata independently describes the
 * same OD Next task.
 *
 * `intent` is the only field that can move a project OFF a route, because it
 * is the only one that names a different pipeline (`web-clone`,
 * `live-artifact`, `webgl-experience`, `document`, …); the two intents that own
 * their own route are admitted explicitly and every other intent is unrouted.
 *
 * A second-level scene deliberately does NOT narrow the route. `fidelity` and
 * `platformTargets` describe WHAT a Prototype should be — the Prototype task
 * profile already branches on wireframe/lo-fi fidelity and on mobile platform
 * targets — so the Wireframe and Mobile scenes ride the Prototype route with
 * their refinements intact. They stay in the parameter type to record that the
 * route decision has seen them and chosen not to gate on them.
 */
export function automaticStrategyTaskProfileForProjectMetadata(
  metadata: Pick<ProjectMetadata, 'kind' | 'intent' | 'fidelity' | 'platform' | 'platformTargets'>
    | null
    | undefined,
): ProjectScenarioTaskProfile | null {
  if (metadata?.intent === 'marketing') {
    return metadata.kind === 'prototype' ? 'marketing' : null;
  }
  if (metadata?.intent === 'hyperframes') {
    return metadata.kind === 'video' ? 'hyperframes' : null;
  }
  if (metadata?.intent != null) return null;
  if (metadata?.kind === 'deck') return 'ppt';
  if (metadata?.kind !== 'prototype') return null;
  return 'prototype';
}

export const DEFAULT_SCENARIO_PLUGIN_BY_KIND: Record<ProjectKind, DefaultScenarioPluginId> = {
  prototype: 'od-new-generation',
  deck:      'od-new-generation',
  template:  'od-new-generation',
  brand:     'od-new-generation',
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

export function defaultScenarioPluginIdForProjectMetadata(
  metadata: Pick<ProjectMetadata, 'kind' | 'intent'> | null | undefined,
): DefaultScenarioPluginId | null {
  if (metadata?.intent === 'live-artifact'
    || metadata?.intent === 'web-clone'
    || metadata?.intent === 'webgl-experience'
    || metadata?.intent === 'hyperframes'
    || metadata?.intent === 'marketing') return 'od-new-generation';
  return defaultScenarioPluginIdForKind(metadata?.kind);
}

/**
 * Return the only OD Next profile an exact daemon-owned automatic binding may
 * carry. Broad kinds such as `image` and `video` deliberately resolve to no
 * profile unless the product metadata names an approved route.
 */
export function defaultScenarioTaskProfileForProjectMetadata(
  metadata: Pick<ProjectMetadata, 'kind' | 'intent' | 'fidelity' | 'platform' | 'platformTargets'>
    | null
    | undefined,
  pluginId: string,
): ProjectScenarioTaskProfile | null {
  if (pluginId !== 'od-new-generation') return null;
  return automaticStrategyTaskProfileForProjectMetadata(metadata);
}

export function defaultScenarioPluginIdForTaskKind(
  taskKind: TaskKind | undefined,
): DefaultScenarioPluginId | null {
  if (!taskKind) return null;
  return DEFAULT_SCENARIO_PLUGIN_BY_TASK_KIND[taskKind] ?? null;
}
