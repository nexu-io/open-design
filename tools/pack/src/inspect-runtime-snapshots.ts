import type { DesktopStatusSnapshot } from "@open-design/sidecar/protocol";

import type { ToolPackConfig } from "./config.js";
import {
  readLauncherRuntimeSnapshot,
  readToolPackLauncherRuntimeSnapshot,
  type ToolPackLauncherRuntimeSnapshot,
} from "./launcher-runtime-snapshot.js";
import {
  readToolPackUpdateCacheLifecycleSnapshot,
  readUpdateCacheLifecycleSnapshot,
  type ToolPackUpdateCacheLifecycleSnapshot,
} from "./update-cache-lifecycle-snapshot.js";

export type ToolPackInspectSnapshotSource = {
  kind: "installed-runtime" | "tools-pack-runtime";
  note: string;
  root: string | null;
};

export type ToolPackInspectRuntimeSnapshots = {
  launcher: ToolPackLauncherRuntimeSnapshot | null;
  launcherSource: ToolPackInspectSnapshotSource;
  updateCache: ToolPackUpdateCacheLifecycleSnapshot | null;
  updateCacheSource: ToolPackInspectSnapshotSource;
};

export async function resolveToolPackInspectRuntimeSnapshots(
  config: ToolPackConfig,
  status: DesktopStatusSnapshot | null,
): Promise<ToolPackInspectRuntimeSnapshots> {
  if (status == null) {
    const [launcher, updateCache] = await Promise.all([
      readToolPackLauncherRuntimeSnapshot(config),
      readToolPackUpdateCacheLifecycleSnapshot(config),
    ]);
    return {
      launcher,
      launcherSource: {
        kind: "tools-pack-runtime",
        note: "desktop IPC is offline; snapshot is read from the tools-pack runtime root",
        root: launcher.root,
      },
      updateCache,
      updateCacheSource: {
        kind: "tools-pack-runtime",
        note: "desktop IPC is offline; snapshot is read from the tools-pack runtime root",
        root: updateCache.updateRoot,
      },
    };
  }

  const updatePaths = status.update?.paths;
  const launcherRoot = updatePaths?.launcherRoot ?? null;
  const launcherRuntimePath = updatePaths?.launcherRuntimePath ?? null;
  const launcher = launcherRoot == null || status.update == null
    ? null
    : await readLauncherRuntimeSnapshot({
        channel: status.update.channel,
        namespace: config.namespace,
        root: launcherRoot,
      });
  const launcherPathMatches = launcher == null
    || launcherRuntimePath == null
    || launcher.runtimePath === launcherRuntimePath;
  const updateRoot = updatePaths?.downloadRoot ?? null;
  const updateCache = updateRoot == null || status.update == null
    ? null
    : await readUpdateCacheLifecycleSnapshot({ platform: status.update.platform, updateRoot });

  return {
    launcher: launcherPathMatches ? launcher : null,
    launcherSource: {
      kind: "installed-runtime",
      note: launcherRoot == null
        ? "running Shell did not expose its launcher root"
        : launcherPathMatches
          ? "snapshot is read from the launcher root reported by the running Shell"
          : "running Shell reported inconsistent launcher root and runtime paths",
      root: launcherRoot,
    },
    updateCache,
    updateCacheSource: {
      kind: "installed-runtime",
      note: updateRoot == null
        ? "running Shell did not expose its update root"
        : "snapshot is read from the update root reported by the running Shell",
      root: updateRoot,
    },
  };
}
