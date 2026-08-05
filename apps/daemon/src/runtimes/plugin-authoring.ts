export interface PluginAuthoringRunReference {
  pluginId?: string | null;
  appliedPluginSnapshotId?: string | null;
}

export interface PluginSnapshotReference {
  pluginId?: string | null;
}

export function isPluginAuthoringRun(
  run: PluginAuthoringRunReference | null | undefined,
  getSnapshot: (snapshotId: string) => PluginSnapshotReference | null,
): boolean {
  if (run?.pluginId === 'od-plugin-authoring') return true;
  if (!run?.appliedPluginSnapshotId) return false;
  const snapshot = getSnapshot(run.appliedPluginSnapshotId);
  return snapshot?.pluginId === 'od-plugin-authoring';
}
