import { join } from "node:path";

import type { ToolPackConfig } from "../config.js";
import {
  ELECTRON_BUILDER_ASAR,
  ELECTRON_BUILDER_BUILD_DEPENDENCIES_FROM_SOURCE,
  ELECTRON_BUILDER_FILE_PATTERNS,
  ELECTRON_BUILDER_NODE_GYP_REBUILD,
  ELECTRON_BUILDER_NPM_REBUILD,
  ELECTRON_REBUILD_MODE,
  ELECTRON_REBUILD_NATIVE_MODULES,
  WEB_STANDALONE_RESOURCE_NAME,
} from "./constants.js";
import { PathSizeIndex, pathExists, sizeExistingFileBytes } from "./fs.js";
import type { WinBuiltAppManifest, WinPaths, WinSizeReport } from "./types.js";

function isBetterSqlite3SourceResidue(path: string): boolean {
  return (
    path.includes("/node_modules/better-sqlite3/deps/") ||
    path.includes("/node_modules/better-sqlite3/build/Release/obj/")
  );
}

export function resolveWinTargets(to: ToolPackConfig["to"]): Array<"dir" | "nsis"> {
  switch (to) {
    case "dir":
      return ["dir"];
    case "all":
      return ["dir", "nsis"];
    case "nsis":
      return ["nsis"];
    default:
      throw new Error(`unsupported win target: ${to}`);
  }
}

export async function collectWinSizeReport(
  config: ToolPackConfig,
  paths: WinPaths,
  builtApp: WinBuiltAppManifest | null,
): Promise<WinSizeReport> {
  const unpackedRoot = builtApp?.unpackedRoot ?? paths.unpackedRoot;
  const sizeIndex = await PathSizeIndex.create(unpackedRoot);
  const namespaceSizeIndex = await PathSizeIndex.create(config.roots.output.namespaceRoot);
  const appResourcesRoot = join(unpackedRoot, "resources");
  const appNodeModulesRoot = join(appResourcesRoot, "app", "node_modules");
  const copiedStandaloneRoot = join(appResourcesRoot, WEB_STANDALONE_RESOURCE_NAME);
  const copiedStandaloneNodeModulesRoot = join(copiedStandaloneRoot, "node_modules");
  const copiedStandaloneWebNodeModulesRoot = join(copiedStandaloneRoot, "apps", "web", "node_modules");
  const electronLocalesRoot = join(unpackedRoot, "locales");
  const rootWebPackageRoot = join(appNodeModulesRoot, "@open-design", "web");
  return {
    builder: {
      asar: ELECTRON_BUILDER_ASAR,
      buildDependenciesFromSource: ELECTRON_BUILDER_BUILD_DEPENDENCIES_FROM_SOURCE,
      filePatterns: ELECTRON_BUILDER_FILE_PATTERNS,
      nativeRebuild: {
        buildFromSource: ELECTRON_BUILDER_BUILD_DEPENDENCIES_FROM_SOURCE,
        mode: ELECTRON_REBUILD_MODE,
        modules: ELECTRON_REBUILD_NATIVE_MODULES,
      },
      nodeGypRebuild: ELECTRON_BUILDER_NODE_GYP_REBUILD,
      npmRebuild: ELECTRON_BUILDER_NPM_REBUILD,
      targets: resolveWinTargets(config.to),
      webOutputMode: config.webOutputMode,
    },
    generatedAt: new Date().toISOString(),
    installerBytes: await sizeExistingFileBytes(paths.setupPath),
    outputRootBytes: namespaceSizeIndex.sizePathBytes(config.roots.output.namespaceRoot),
    resourceRootBytes: sizeIndex.sizePathBytes(join(appResourcesRoot, "open-design")),
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    topLevel: {
      appResourcesBytes: sizeIndex.sizePathBytes(join(appResourcesRoot, "app")),
      copiedStandaloneBytes: sizeIndex.sizePathBytes(copiedStandaloneRoot),
      electronLocalesBytes: sizeIndex.sizePathBytes(electronLocalesRoot),
      resourcesBytes: sizeIndex.sizePathBytes(appResourcesRoot),
    },
    tracked: {
      appNodeModulesBytes: sizeIndex.sizePathBytes(appNodeModulesRoot),
      betterSqlite3Bytes: sizeIndex.sizePathBytes(join(appNodeModulesRoot, "better-sqlite3")),
      betterSqlite3SourceResidueBytes: sizeIndex.sizePathBytes(unpackedRoot, {
        includeFile: isBetterSqlite3SourceResidue,
      }),
      bundledNodeBytes: sizeIndex.sizePathBytes(join(paths.resourceRoot, "bin", "node.exe")),
      copiedStandaloneNextBytes:
        sizeIndex.sizePathBytes(join(copiedStandaloneNodeModulesRoot, "next")) +
        sizeIndex.sizePathBytes(join(copiedStandaloneWebNodeModulesRoot, "next")),
      copiedStandaloneNextSwcBytes:
        sizeIndex.sumChildDirectorySizes(join(copiedStandaloneNodeModulesRoot, "@next"), (name) => name.startsWith("swc-win32-")) +
        sizeIndex.sumChildDirectorySizes(join(copiedStandaloneWebNodeModulesRoot, "@next"), (name) => name.startsWith("swc-win32-")),
      copiedStandaloneNodeModulesBytes: sizeIndex.sizePathBytes(copiedStandaloneNodeModulesRoot),
      copiedStandalonePnpmHoistedNextBytes: sizeIndex.sizePathBytes(
        join(copiedStandaloneNodeModulesRoot, ".pnpm", "node_modules", "next"),
      ),
      copiedStandaloneSharpLibvipsBytes: sizeIndex.sizePathBytes(
        join(copiedStandaloneNodeModulesRoot, "@img", "sharp-libvips-win32-x64"),
      ),
      copiedStandaloneSourcemapBytes: sizeIndex.sizePathBytes(copiedStandaloneRoot, {
        includeFile: (path) => path.endsWith(".map"),
      }),
      copiedStandaloneTsbuildInfoBytes: sizeIndex.sizePathBytes(copiedStandaloneRoot, {
        includeFile: (path) => path.endsWith(".tsbuildinfo"),
      }),
      copiedStandaloneWebNextBytes: sizeIndex.sizePathBytes(join(copiedStandaloneWebNodeModulesRoot, "next")),
      copiedStandaloneWebNodeModulesBytes: sizeIndex.sizePathBytes(copiedStandaloneWebNodeModulesRoot),
      electronLocalesBytes: sizeIndex.sizePathBytes(electronLocalesRoot),
      markdownBytes: sizeIndex.sizePathBytes(unpackedRoot, { includeFile: (path) => path.endsWith(".md") }),
      nextBytes: sizeIndex.sizePathBytes(join(appNodeModulesRoot, "next")),
      nextSwcBytes: sizeIndex.sumChildDirectorySizes(join(appNodeModulesRoot, "@next"), (name) => name.startsWith("swc-win32-")),
      sharpLibvipsBytes: sizeIndex.sizePathBytes(join(appNodeModulesRoot, "@img", "sharp-libvips-win32-x64")),
      sourcemapBytes: sizeIndex.sizePathBytes(unpackedRoot, { includeFile: (path) => path.endsWith(".map") }),
      tsbuildInfoBytes: sizeIndex.sizePathBytes(unpackedRoot, { includeFile: (path) => path.endsWith(".tsbuildinfo") }),
      webCopiedStandaloneBytes: sizeIndex.sizePathBytes(copiedStandaloneRoot),
      webNextCacheBytes: sizeIndex.sizePathBytes(join(rootWebPackageRoot, ".next", "cache")),
      webPackageAppBytes: sizeIndex.sizePathBytes(join(rootWebPackageRoot, "app")),
      webPackageBytes: sizeIndex.sizePathBytes(rootWebPackageRoot),
      webPackageDistBytes: sizeIndex.sizePathBytes(join(rootWebPackageRoot, "dist")),
      webPackagePublicBytes: sizeIndex.sizePathBytes(join(rootWebPackageRoot, "public")),
      webPackageSrcBytes: sizeIndex.sizePathBytes(join(rootWebPackageRoot, "src")),
      webPackageStandaloneBytes: sizeIndex.sizePathBytes(join(rootWebPackageRoot, ".next", "standalone")),
    },
    unpackedBytes: (await pathExists(unpackedRoot)) ? sizeIndex.sizePathBytes(unpackedRoot) : null,
  };
}
