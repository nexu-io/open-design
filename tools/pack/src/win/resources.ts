import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { hashJson, hashPath, ToolPackCache } from "../cache/index.js";
import type { ToolPackConfig } from "../config/index.js";
import { copyBundledResourceTrees, packBundledDshRuntime, winResources } from "../resources/index.js";
import {
  copyOptionalVelaCliBinary,
  resolveOptionalVelaCliBinary,
  resolveOptionalVelaCliOpenCodeCompanionTree,
} from "../vela-cli.js";
import type { WinPaths, ResourceTreeCacheMetadata } from "./types.js";

const RESOURCE_TREE_CACHE_SCHEMA_VERSION = 7;

async function createResourceTreeCacheKey(config: ToolPackConfig, workspaceBuildKey: string): Promise<string> {
  const velaCliBin = await resolveOptionalVelaCliBinary({
    requireBundled: config.requireVelaCli,
  });
  const velaOpenCodeCompanion =
    velaCliBin == null
      ? null
      : await resolveOptionalVelaCliOpenCodeCompanionTree(velaCliBin);
  return hashJson({
    assetsCommunityPets: await hashPath(join(config.workspaceRoot, "assets", "community-pets")),
    assetsFrames: await hashPath(join(config.workspaceRoot, "assets", "frames")),
    craft: await hashPath(join(config.workspaceRoot, "craft")),
    designSystems: await hashPath(join(config.workspaceRoot, "design-systems")),
    designTemplates: await hashPath(join(config.workspaceRoot, "design-templates")),
    node: "win.resource-tree",
    pluginOfficial: await hashPath(join(config.workspaceRoot, "plugins", "_official")),
    pluginPreviews: await hashPath(join(config.workspaceRoot, "data", "plugin-previews")),
    pluginRegistry: await hashPath(join(config.workspaceRoot, "plugins", "registry")),
    promptTemplates: await hashPath(join(config.workspaceRoot, "prompt-templates")),
    schemaVersion: RESOURCE_TREE_CACHE_SCHEMA_VERSION,
    skills: await hashPath(join(config.workspaceRoot, "skills")),
    sevenZipDll: await hashPath(winResources.sevenZipDll),
    sevenZipExe: await hashPath(winResources.sevenZipExe),
    requireVelaCli: config.requireVelaCli,
    velaCliBin: velaCliBin ? await hashPath(velaCliBin) : null,
    velaOpenCodeCompanion: velaOpenCodeCompanion
      ? await hashPath(velaOpenCodeCompanion)
      : null,
    workspaceBuildKey,
  });
}

export type ResourceTreeResult = {
  key: string;
  resourceRoot: string;
};

export async function prepareResourceTree(
  config: ToolPackConfig,
  paths: WinPaths,
  cache: ToolPackCache,
  options: { bundleAgentRuntimes?: boolean; materialize: boolean },
  workspaceBuildKey = "workspace-build-not-provided",
): Promise<ResourceTreeResult> {
  const key = await createResourceTreeCacheKey(config, workspaceBuildKey);
  const node = {
    id: "win.resource-tree",
    key,
    outputs: ["open-design"],
    invalidate: async () => null,
    build: async ({ entryRoot }: { entryRoot: string }): Promise<ResourceTreeCacheMetadata> => {
      const resourceRoot = join(entryRoot, "open-design");
      await mkdir(resourceRoot, { recursive: true });
      await copyBundledResourceTrees({
        workspaceRoot: config.workspaceRoot,
        resourceRoot,
      });
      if (options.bundleAgentRuntimes === true) {
        await packBundledDshRuntime({
          workspaceRoot: config.workspaceRoot,
          resourceRoot,
        });
      }
      await mkdir(join(resourceRoot, "bin"), { recursive: true });
      await cp(winResources.sevenZipExe, join(resourceRoot, "bin", "7z.exe"));
      await cp(winResources.sevenZipDll, join(resourceRoot, "bin", "7z.dll"));
      await copyOptionalVelaCliBinary({
        platform: "win",
        requireBundled: config.requireVelaCli,
        resourceRoot,
      });
      return { resourceName: "open-design" };
    },
  };
  const manifest = await cache.acquire({
    materialize: options.materialize ? [{ from: "open-design", to: paths.resourceRoot }] : [],
    node,
  });
  return {
    key,
    resourceRoot: options.materialize ? paths.resourceRoot : join(manifest.entryPath, "open-design"),
  };
}

export async function copyWinIcon(paths: WinPaths): Promise<void> {
  await mkdir(dirname(paths.winIconPath), { recursive: true });
  await cp(winResources.icon, paths.winIconPath);
}
