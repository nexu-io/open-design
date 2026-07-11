// Transport home for the plugin-folder agent-action cluster: installing a
// generated plugin folder into the plugin registry, and starting/polling its
// GitHub-publish / Open-Design-PR share workflow. Already shared best-effort
// transport in `state/projects` (consumed by other components too); this file
// narrows it to what the project-view slice's port needs so the slice itself
// never imports that module directly.
import {
  installGeneratedPluginFolder as installGeneratedPluginFolderTransport,
  startGeneratedPluginShareTask as startGeneratedPluginShareTaskTransport,
  waitGeneratedPluginShareTask as waitGeneratedPluginShareTaskTransport,
  type PluginShareTaskSnapshot,
  type PluginShareTaskStart,
} from '../../state/projects';
import type { PluginInstallOutcome } from '@open-design/contracts';

/** Install a generated plugin folder into the plugin registry. */
export async function installGeneratedPluginFolder(
  projectId: string,
  relativePath: string,
): Promise<PluginInstallOutcome> {
  return installGeneratedPluginFolderTransport(projectId, relativePath);
}

/** Start a plugin-folder GitHub share workflow (publish repo / open-design PR). */
export async function startGeneratedPluginShareTask(
  projectId: string,
  relativePath: string,
  action: 'publish-github' | 'contribute-open-design',
): Promise<PluginShareTaskStart> {
  return startGeneratedPluginShareTaskTransport(projectId, relativePath, action);
}

/** Long-poll a plugin-folder share task for new progress/terminal status. */
export async function waitGeneratedPluginShareTask(
  taskId: string,
  since: number,
  timeoutMs = 25_000,
): Promise<PluginShareTaskSnapshot> {
  return waitGeneratedPluginShareTaskTransport(taskId, since, timeoutMs);
}
