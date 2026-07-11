// Transport home for the chat context-chip's plugin/design-system details: the
// applied-plugin snapshot fetch, the plugin registry lookup backing "View
// details", and the duplicate-as-project action. These already live as
// shared best-effort/throwing transport in `state/projects` (consumed by
// several other components too); this file narrows them to what the
// project-view slice's port needs so the slice itself never imports
// `state/projects` directly.
import {
  duplicatePluginAsProject as duplicatePluginAsProjectTransport,
  fetchAppliedPluginSnapshot as fetchAppliedPluginSnapshotTransport,
  listPlugins as listPluginsTransport,
} from '../../state/projects';
import type {
  AppliedPluginSnapshot,
  InstalledPluginRecord,
  PluginDuplicateProjectResponse,
} from '@open-design/contracts';

/** Fetch an applied-plugin snapshot by id. Best-effort: resolves `null` on a
 *  non-ok response or a network error. */
export async function fetchAppliedPluginSnapshot(
  snapshotId: string,
): Promise<AppliedPluginSnapshot | null> {
  return fetchAppliedPluginSnapshotTransport(snapshotId);
}

/** List installed plugins, optionally including hidden ones. */
export async function listPlugins(options: {
  includeHidden?: boolean;
} = {}): Promise<InstalledPluginRecord[]> {
  return listPluginsTransport(options);
}

/** Duplicate an installed plugin as a new project. Throws on a non-ok
 *  response (the caller is expected to catch it). */
export async function duplicatePluginAsProject(
  pluginId: string,
  input: { name?: string } = {},
): Promise<PluginDuplicateProjectResponse> {
  return duplicatePluginAsProjectTransport(pluginId, input);
}
