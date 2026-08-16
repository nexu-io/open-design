import type Database from 'better-sqlite3';
import type { InstalledPluginRecord } from '@open-design/contracts';
import {
  readTeamResourceMaterialization,
  teamResourceMaterializationDir,
} from '../collab/team-resource-materialization.js';
import { isSafePluginId } from './installer.js';
import {
  getInstalledPlugin,
  resolvePluginFolder,
  resolveWorkspaceTeamPluginWithBindingGate,
  workspaceTeamPluginBindingAllowsRead,
} from './registry.js';

const TEAM_PLUGIN_SOURCE_PREFIX = 'team:plugin:';

function workspaceIdFromTeamPluginSource(
  source: string,
  pluginId: string,
): string | null {
  const suffix = `:${pluginId}`;
  if (!source.startsWith(TEAM_PLUGIN_SOURCE_PREFIX) || !source.endsWith(suffix)) {
    return null;
  }
  const workspaceId = source.slice(
    TEAM_PLUGIN_SOURCE_PREFIX.length,
    -suffix.length,
  ).trim();
  return workspaceId || null;
}

/**
 * Select the local registry partition that belongs to an exact plugin source.
 *
 * PRODUCT INVARIANT: this is filesystem provenance, not membership authority.
 * It lets a locally materialized Team plugin resolve the locally materialized
 * Skill and Design System records stored in the same catalogue partition. Do
 * not compare this Workspace with a project, fetch identity, or block Send.
 */
export function localPluginRegistryScope(
  plugin: { id?: unknown; source?: unknown },
): { workspaceId: string; workspaceMemberId: null } | undefined {
  if (typeof plugin.id !== 'string' || typeof plugin.source !== 'string') {
    return undefined;
  }
  const workspaceId = workspaceIdFromTeamPluginSource(plugin.source, plugin.id);
  return workspaceId ? { workspaceId, workspaceMemberId: null } : undefined;
}

/**
 * Resolve the exact record already selected from a local catalogue.
 *
 * PRODUCT INVARIANT: this is local identity resolution, not authorization.
 * The catalogue's Workspace partition and its SSE/poll reconciliation own
 * availability. Do not add a network membership check, compare against a new
 * project's Workspace, or turn this helper into a Send preflight. Remote
 * install/share/sync/move operations enforce their own current authority.
 */
export async function resolveLocalPluginBySource(input: {
  db: Database.Database;
  id: string;
  source: string;
  userPluginsRoot: string;
}): Promise<InstalledPluginRecord | null> {
  const { db, id, source, userPluginsRoot } = input;
  const installed = getInstalledPlugin(db, id);
  const workspaceId = workspaceIdFromTeamPluginSource(source, id);
  if (installed?.source === source) {
    return workspaceId && !workspaceTeamPluginBindingAllowsRead(db, workspaceId, id)
      ? null
      : installed;
  }

  if (!isSafePluginId(id)) return null;
  if (!workspaceId) return null;
  // A tombstone is a local catalogue fact, not a remote authorization check.
  // Reconciliation intentionally keeps the materialized directory recoverable,
  // so fence both sides of async filesystem parsing to prevent stale bytes from
  // becoming a new apply/project after the local binding has retired.
  return resolveWorkspaceTeamPluginWithBindingGate({
    bindingAllowsRead: () => workspaceTeamPluginBindingAllowsRead(db, workspaceId, id),
    resolve: async () => {
      const marker = await readTeamResourceMaterialization(
        userPluginsRoot,
        workspaceId,
        id,
        id,
      );
      if (
        !marker
        || marker.kind !== 'plugin'
        || marker.resourceId !== id
        || marker.workspaceId !== workspaceId
        || marker.sourceKey !== source
      ) return null;

      const resolved = await resolvePluginFolder({
        folder: teamResourceMaterializationDir(userPluginsRoot, workspaceId, id, id),
        folderId: id,
        sourceKind: 'user',
        source,
      });
      return resolved.ok ? resolved.record : null;
    },
  });
}
