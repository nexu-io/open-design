import { join } from "node:path";

import type { ToolPackConfig } from "../config.js";
import { MAC_PREBUNDLED_APP_DIR_NAME } from "../mac-prebundle.js";
import {
  ELECTRON_BUILDER_ASAR,
  ELECTRON_BUILDER_FILE_PATTERNS,
  MAC_ELECTRON_LANGUAGES,
  WEB_STANDALONE_RESOURCE_NAME,
} from "./constants.js";
import { sizeExistingFileBytes, sizePathBytes, sumChildDirectorySizes } from "./fs.js";
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
    appBytes: await sizePathBytes(paths.appPath),
    builder: {
      asar: ELECTRON_BUILDER_ASAR,
      compression: config.macCompression,
      electronLanguages: MAC_ELECTRON_LANGUAGES,
      filePatterns: ELECTRON_BUILDER_FILE_PATTERNS,
      targets,
      webOutputMode: config.webOutputMode,
    },
    dmgBytes: artifacts.dmgPath == null ? null : await sizeExistingFileBytes(artifacts.dmgPath),
    generatedAt: new Date().toISOString(),
    outputRootBytes: await sizePathBytes(config.roots.output.namespaceRoot),
    resourceRootBytes: await sizePathBytes(paths.resourceRoot),
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    topLevel: {
      appResourcesBytes: await sizePathBytes(join(appResourcesRoot, "app")),
      electronFrameworksBytes: await sizePathBytes(electronFrameworksRoot),
      resourcesBytes: await sizePathBytes(appResourcesRoot),
    },
    tracked: {
      appNodeModulesBytes: await sizePathBytes(appNodeModulesRoot),
      betterSqlite3Bytes: await sizePathBytes(join(appNodeModulesRoot, "better-sqlite3")),
      betterSqlite3SourceResidueBytes: await sizePathBytes(paths.appPath, {
        includeFile: isBetterSqlite3SourceResidue,
      }),
      bundledNodeBytes: await sizePathBytes(join(paths.resourceRoot, "bin", "node")),
      electronLocalesBytes: await sumChildDirectorySizes(electronFrameworkResourcesRoot, (name) => name.endsWith(".lproj")),
      markdownBytes: await sizePathBytes(paths.appPath, { includeFile: (path) => path.endsWith(".md") }),
      nextBytes: await sizePathBytes(join(appNodeModulesRoot, "next")),
      nextSwcBytes: await sumChildDirectorySizes(join(appNodeModulesRoot, "@next"), (name) => name.startsWith("swc-darwin-")),
      prebundledRuntimeBytes: await sizePathBytes(join(appResourcesRoot, "app", MAC_PREBUNDLED_APP_DIR_NAME)),
      sharpLibvipsBytes: await sizePathBytes(join(appNodeModulesRoot, "@img", `sharp-libvips-darwin-${darwinArch}`)),
      sourcemapBytes: await sizePathBytes(paths.appPath, { includeFile: (path) => path.endsWith(".map") }),
      tsbuildInfoBytes: await sizePathBytes(paths.appPath, { includeFile: (path) => path.endsWith(".tsbuildinfo") }),
      webCopiedStandaloneBytes: await sizePathBytes(join(appResourcesRoot, WEB_STANDALONE_RESOURCE_NAME)),
      webNextCacheBytes: await sizePathBytes(join(appNodeModulesRoot, "@open-design", "web", ".next", "cache")),
      webPackageBytes: await sizePathBytes(join(appNodeModulesRoot, "@open-design", "web")),
      webPackageStandaloneBytes: await sizePathBytes(join(appNodeModulesRoot, "@open-design", "web", ".next", "standalone")),
    },
    zipBytes: artifacts.zipPath == null ? null : await sizeExistingFileBytes(artifacts.zipPath),
  };
}
