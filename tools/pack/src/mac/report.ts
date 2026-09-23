import { join } from "node:path";

import type { ToolPackConfig } from "../config/index.js";
import { PathSizeIndex } from "../metrics/path-size-index.js";
import { MAC_PREBUNDLED_APP_DIR_NAME } from "./prebundle.js";
import {
  ELECTRON_BUILDER_ASAR,
  ELECTRON_BUILDER_BUILD_DEPENDENCIES_FROM_SOURCE,
  ELECTRON_BUILDER_FILE_PATTERNS,
  ELECTRON_REBUILD_MODE,
  ELECTRON_REBUILD_NATIVE_MODULES,
  MAC_ELECTRON_LANGUAGES,
  WEB_STANDALONE_RESOURCE_NAME,
} from "./constants.js";
import { sizeExistingFileBytes } from "./fs.js";
import type { ElectronBuilderTarget, MacPackResult, MacPaths, MacSizeReport } from "./types.js";

function resolveDarwinArchToken(): "arm64" | "x64" {
  return process.arch === "arm64" ? "arm64" : "x64";
}

function isBetterSqlite3SourceResidue(path: string): boolean {
  return (
    path.includes("/node_modules/better-sqlite3/deps/") ||
    path.includes("/node_modules/better-sqlite3/build/Release/obj/")
  );
}

export async function collectMacSizeReport(
  config: ToolPackConfig,
  paths: MacPaths,
  artifacts: Pick<MacPackResult, "dmgPath" | "zipPath">,
  targets: ElectronBuilderTarget[],
): Promise<MacSizeReport> {
  const sizeIndex = await PathSizeIndex.create(config.roots.output.namespaceRoot);
  const appResourcesRoot = join(paths.appPath, "Contents", "Resources");
  const appNodeModulesRoot = join(appResourcesRoot, "app", "node_modules");
  const electronFrameworksRoot = join(paths.appPath, "Contents", "Frameworks");
  const electronFrameworkResourcesRoot = join(
    electronFrameworksRoot,
    "Electron Framework.framework",
    "Versions",
    "A",
    "Resources",
  );
  const darwinArch = resolveDarwinArchToken();

  return {
    appBytes: sizeIndex.sizePathBytes(paths.appPath),
    builder: {
      asar: ELECTRON_BUILDER_ASAR,
      compression: config.macCompression,
      electronLanguages: MAC_ELECTRON_LANGUAGES,
      filePatterns: ELECTRON_BUILDER_FILE_PATTERNS,
      nativeRebuild: {
        buildFromSource: ELECTRON_BUILDER_BUILD_DEPENDENCIES_FROM_SOURCE,
        mode: ELECTRON_REBUILD_MODE,
        modules: ELECTRON_REBUILD_NATIVE_MODULES,
      },
      targets,
      webOutputMode: config.webOutputMode,
    },
    dmgBytes: artifacts.dmgPath == null ? null : await sizeExistingFileBytes(artifacts.dmgPath),
    generatedAt: new Date().toISOString(),
    outputRootBytes: sizeIndex.sizePathBytes(config.roots.output.namespaceRoot),
    resourceRootBytes: sizeIndex.sizePathBytes(paths.resourceRoot),
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    topLevel: {
      appResourcesBytes: sizeIndex.sizePathBytes(join(appResourcesRoot, "app")),
      electronFrameworksBytes: sizeIndex.sizePathBytes(electronFrameworksRoot),
      resourcesBytes: sizeIndex.sizePathBytes(appResourcesRoot),
    },
    tracked: {
      appNodeModulesBytes: sizeIndex.sizePathBytes(appNodeModulesRoot),
      betterSqlite3Bytes: sizeIndex.sizePathBytes(join(appNodeModulesRoot, "better-sqlite3")),
      betterSqlite3SourceResidueBytes: sizeIndex.sizePathBytes(paths.appPath, {
        includeFile: isBetterSqlite3SourceResidue,
      }),
      bundledNodeBytes: sizeIndex.sizePathBytes(join(paths.resourceRoot, "bin", "node")),
      electronLocalesBytes: sizeIndex.sumChildDirectorySizes(electronFrameworkResourcesRoot, (name) => name.endsWith(".lproj")),
      markdownBytes: sizeIndex.sizePathBytes(paths.appPath, { includeFile: (path) => path.endsWith(".md") }),
      nextBytes: sizeIndex.sizePathBytes(join(appNodeModulesRoot, "next")),
      nextSwcBytes: sizeIndex.sumChildDirectorySizes(join(appNodeModulesRoot, "@next"), (name) => name.startsWith("swc-darwin-")),
      prebundledRuntimeBytes: sizeIndex.sizePathBytes(join(appResourcesRoot, "app", MAC_PREBUNDLED_APP_DIR_NAME)),
      sharpLibvipsBytes: sizeIndex.sizePathBytes(join(appNodeModulesRoot, "@img", `sharp-libvips-darwin-${darwinArch}`)),
      sourcemapBytes: sizeIndex.sizePathBytes(paths.appPath, { includeFile: (path) => path.endsWith(".map") }),
      tsbuildInfoBytes: sizeIndex.sizePathBytes(paths.appPath, { includeFile: (path) => path.endsWith(".tsbuildinfo") }),
      webCopiedStandaloneBytes: sizeIndex.sizePathBytes(join(appResourcesRoot, WEB_STANDALONE_RESOURCE_NAME)),
      webNextCacheBytes: sizeIndex.sizePathBytes(join(appNodeModulesRoot, "@open-design", "web", ".next", "cache")),
      webPackageBytes: sizeIndex.sizePathBytes(join(appNodeModulesRoot, "@open-design", "web")),
      webPackageStandaloneBytes: sizeIndex.sizePathBytes(join(appNodeModulesRoot, "@open-design", "web", ".next", "standalone")),
    },
    zipBytes: artifacts.zipPath == null ? null : await sizeExistingFileBytes(artifacts.zipPath),
  };
}
