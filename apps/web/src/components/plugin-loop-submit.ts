// #5824 / #6333 round-2 (nettee, 2026-08-02): the Home @-mention
// multi-skill compose flow stages an ordered `skillIds` array on the
// submit payload (the first entry becomes the project's primary
// `skillId`, later entries ride along as composed-skill blocks via the
// daemon's `skillIds` field). The array was correctly forwarded to
// POST /api/projects from `App.handleCreateProject` (9624316), but
// `EntryShell.handlePluginLoopSubmit` previously only forwarded
// `payload.skillId` into `onCreateProject`, so the multi-skill list was
// silently dropped at this submit seam — `App.handleCreateProject`
// never saw it and the Home auto-send hand-off landed with no
// `od:auto-send-skillIds:*` entry, breaking the end-to-end link.
//
// This module extracts the `buildCreateProjectArgsFromPluginLoopSubmit`
// spread rule into a pure helper so the seam can be unit-tested without
// driving the full plugin-loop UI. `EntryShell.handlePluginLoopSubmit`
// now delegates to this helper, and the helper has a regression test
// asserting `payload.skillIds` (>1 entries) lands on the produced
// create-project args while `skillId` defaults to the primary.

import type { PluginLoopSubmit } from './PluginLoopHome';

/**
 * Shape of the args `EntryShell.handlePluginLoopSubmit` passes into
 * `onCreateProject`. We only model the fields this helper is
 * responsible for spreading; callers may merge additional fields
 * (metadata, plugin snapshot id, attachments, …) on top.
 */
export interface PluginLoopCreateProjectArgs {
  name: string;
  skillId: string | null;
  /**
   * The multi-skill compose list. Absent on the single-skill /
   * no-skill flow (`payload.skillIds` is null / undefined / length <=
   * 1) so the daemon's primary `skillId` binding is the only contract
   * in that case. Forwarded as-is (no de-dup, no reordering) when
   * the user staged more than one skill via @-mention.
   */
  skillIds?: string[];
  designSystemId: string | null;
  pendingPrompt: string;
  pluginId?: string;
  pluginType?: string;
  appliedPluginSnapshotId?: string;
  pluginInputs?: Record<string, unknown>;
  initialRunContext?: PluginLoopSubmit['initialRunContext'];
  conversationMode?: PluginLoopSubmit['conversationMode'];
  pendingFiles?: PluginLoopSubmit['attachments'];
  autoSendFirstMessage: true;
  amrGatePrechecked: boolean;
  // The exhaustive literal list above mirrors the spread block the
  // EntryShell handler used to inline. Keeping the surface typed
  // surfaces drift between the helper and the call-site; the EntryShell
  // component adds metadata + linkedDirs / examplePromptContext by
  // merging on top of this helper's output.
}

/**
 * Build the `onCreateProject` args from a `PluginLoopSubmit` payload.
 *
 * The function is intentionally pure — it does not touch state, network,
 * or sessionStorage. The EntryShell component keeps responsibility
 * for deriving `name`, `metadata`, `linkedDirs`, `examplePromptContext`,
 * and the AMR balance pre-check flag, then merges those on top of the
 * object returned here.
 *
 * Round-2 review regression: `payload.skillIds` MUST reach
 * `onCreateProject` (and therefore `App.handleCreateProject`'s
 * `od:auto-send-skillIds:<projectId>` stash) when the user staged more
 * than one skill. The single-skill flow does NOT spread `skillIds` so
 * the daemon's primary `skillId` binding is the only contract in that
 * case (mirrors the previous behavior — the `length > 1` guard avoids
 * leaking an empty / single-element array that would shadow
 * `skillId`).
 */
export function buildCreateProjectArgsFromPluginLoopSubmit(
  payload: PluginLoopSubmit,
  context: {
    name: string;
    amrGatePrechecked: boolean;
  },
): Omit<PluginLoopCreateProjectArgs, 'designSystemId' | 'metadata' | 'pendingPrompt'> & {
  designSystemId: string | null;
  pendingPrompt: string;
} {
  return {
    name: context.name,
    skillId: payload.skillId ?? null,
    // Forward the multi-skill compose list so Home @-mention
    // (`@skill-a @skill-b`) does not silently degrade to a
    // single-skill create at this submit seam.
    ...(payload.skillIds && payload.skillIds.length > 1
      ? { skillIds: payload.skillIds }
      : {}),
    designSystemId: payload.designSystemId ?? null,
    pendingPrompt: payload.prompt,
    ...(payload.pluginId ? { pluginId: payload.pluginId } : {}),
    ...(payload.pluginType ? { pluginType: payload.pluginType } : {}),
    ...(payload.appliedPluginSnapshotId
      ? { appliedPluginSnapshotId: payload.appliedPluginSnapshotId }
      : {}),
    ...(payload.pluginInputs ? { pluginInputs: payload.pluginInputs } : {}),
    ...(payload.initialRunContext ? { initialRunContext: payload.initialRunContext } : {}),
    ...(payload.conversationMode ? { conversationMode: payload.conversationMode } : {}),
    ...(payload.attachments && payload.attachments.length > 0
      ? { pendingFiles: payload.attachments }
      : {}),
    autoSendFirstMessage: true,
    amrGatePrechecked: context.amrGatePrechecked,
  };
}
