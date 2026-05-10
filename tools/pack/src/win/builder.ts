import { execFile } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { hashJson, hashPath, ToolPackCache } from "../cache.js";
import type { ToolPackConfig } from "../config.js";
import { winResources } from "../resources.js";
import { buildCustomWinNsisInstaller } from "./custom-installer.js";
import {
  ELECTRON_BUILDER_ASAR,
  ELECTRON_BUILDER_BUILD_DEPENDENCIES_FROM_SOURCE,
  ELECTRON_BUILDER_FILE_PATTERNS,
  ELECTRON_BUILDER_NODE_GYP_REBUILD,
  ELECTRON_BUILDER_NPM_REBUILD,
  NSIS_INSTALLER_LANGUAGE_BY_WEB_LOCALE,
  PRODUCT_NAME,
  WEB_STANDALONE_HOOK_CONFIG_ENV,
  WEB_STANDALONE_RESOURCE_NAME,
} from "./constants.js";
import { pathExists, removeTree } from "./fs.js";
import {
  readPackagedVersion,
  writeBuiltAppManifest,
  writePackagedConfig,
} from "./manifest.js";
import { ensureNsisPersianLanguageAlias, writeNsisInclude } from "./nsis.js";
import { sanitizeNamespace } from "./paths.js";
import { resolveWinTargets } from "./report.js";
import type { ResourceTreeResult } from "./resources.js";
import type {
  ElectronBuilderDirCacheMetadata,
  WinBuiltAppManifest,
  WinPaths,
} from "./types.js";

const execFileAsync = promisify(execFile);

async function assertWebStandaloneOutput(config: ToolPackConfig): Promise<void> {
  const webRoot = join(config.workspaceRoot, "apps", "web");
  const standaloneSourceRoot = join(webRoot, ".next", "standalone");
  const candidates = [
    join(standaloneSourceRoot, "apps", "web", "server.js"),
    join(standaloneSourceRoot, "server.js"),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return;
  }

  throw new Error("Next.js standalone server output was not produced under apps/web/.next/standalone");
}

async function writeWebStandaloneHookConfig(config: ToolPackConfig, paths: WinPaths): Promise<string> {
  const webRoot = join(config.workspaceRoot, "apps", "web");
  await assertWebStandaloneOutput(config);

  await mkdir(dirname(paths.webStandaloneHookConfigPath), { recursive: true });
  await writeFile(
    paths.webStandaloneHookConfigPath,
    `${JSON.stringify(
      {
        auditReportPath: paths.webStandaloneHookAuditPath,
        pruneCopiedSharp: true,
        pruneRootNext: true,
        pruneRootSharp: true,
        resourceName: WEB_STANDALONE_RESOURCE_NAME,
        standaloneSourceRoot: join(webRoot, ".next", "standalone"),
        version: 1,
        webPublicSourceRoot: join(webRoot, "public"),
        webStaticSourceRoot: join(webRoot, ".next", "static"),
        workspaceRoot: config.workspaceRoot,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return paths.webStandaloneHookConfigPath;
}

async function runElectronBuilderRaw(config: ToolPackConfig, paths: WinPaths, projectDir: string): Promise<void> {
  const namespaceToken = sanitizeNamespace(config.namespace);
  const packagedVersion = await readPackagedVersion(config);
  const webStandaloneHookConfigPath = config.webOutputMode === "standalone"
    ? await writeWebStandaloneHookConfig(config, paths)
    : null;
  const builderConfig = {
    appId: "io.open-design.desktop",
    afterPack: webStandaloneHookConfigPath == null ? undefined : winResources.webStandaloneAfterPackHook,
    asar: ELECTRON_BUILDER_ASAR,
    buildDependenciesFromSource: ELECTRON_BUILDER_BUILD_DEPENDENCIES_FROM_SOURCE,
    compression: "maximum",
    directories: { output: paths.appBuilderOutputRoot },
    electronDist: config.electronDistPath,
    electronVersion: config.electronVersion,
    executableName: PRODUCT_NAME,
    extraMetadata: {
      main: "./main.cjs",
      name: "open-design-packaged-app",
      productName: PRODUCT_NAME,
      version: packagedVersion,
    },
    extraResources: [
      { from: paths.resourceRoot, to: "open-design" },
      { from: paths.packagedConfigPath, to: "open-design-config.json" },
    ],
    files: [...ELECTRON_BUILDER_FILE_PATTERNS],
    forceCodeSigning: false,
    icon: paths.winIconPath,
    nodeGypRebuild: ELECTRON_BUILDER_NODE_GYP_REBUILD,
    npmRebuild: ELECTRON_BUILDER_NPM_REBUILD,
    nsis: {
      allowElevation: false,
      allowToChangeInstallationDirectory: true,
      artifactName: `${PRODUCT_NAME}-${namespaceToken}-setup.\${ext}`,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      deleteAppDataOnUninstall: false,
      displayLanguageSelector: false,
      include: paths.nsisIncludePath,
      installerLanguages: Object.values(NSIS_INSTALLER_LANGUAGE_BY_WEB_LOCALE),
      language: "1033",
      multiLanguageInstaller: true,
      oneClick: false,
      perMachine: false,
      shortcutName: PRODUCT_NAME,
      warningsAsErrors: false,
    },
    productName: PRODUCT_NAME,
    publish: [{ provider: "generic", url: "https://updates.invalid/open-design" }],
    win: {
      artifactName: `${PRODUCT_NAME}-${namespaceToken}.\${ext}`,
      icon: paths.winIconPath,
      target: resolveWinTargets(config.to).map((target) => ({ arch: ["x64"], target })),
    },
  };

  await removeTree(paths.appBuilderOutputRoot);
  await mkdir(dirname(paths.appBuilderConfigPath), { recursive: true });
  await writeNsisInclude(config, paths);
  await writeFile(paths.appBuilderConfigPath, `${JSON.stringify(builderConfig, null, 2)}\n`, "utf8");
  const build = async () => {
    await execFileAsync(process.execPath, [
      config.electronBuilderCliPath,
      "--win",
      "--projectDir",
      projectDir,
      "--config",
      paths.appBuilderConfigPath,
      "--publish",
      "never",
    ], {
      cwd: config.workspaceRoot,
      env: {
        ...process.env,
        CSC_IDENTITY_AUTO_DISCOVERY: "false",
        ...(webStandaloneHookConfigPath == null ? {} : { [WEB_STANDALONE_HOOK_CONFIG_ENV]: webStandaloneHookConfigPath }),
      },
    });
  };
  await ensureNsisPersianLanguageAlias(config);
  try {
    await build();
  } catch (error) {
    const output = `${(error as { stdout?: unknown }).stdout ?? ""}\n${(error as { stderr?: unknown }).stderr ?? ""}`;
    if (output.includes("Persian.nlf") && await ensureNsisPersianLanguageAlias(config)) {
      await build();
      return;
    }
    throw error;
  }
}

function createCacheLocalWinPaths(paths: WinPaths, entryRoot: string): WinPaths {
  return {
    ...paths,
    appBuilderConfigPath: join(entryRoot, "builder-config.json"),
    appBuilderOutputRoot: join(entryRoot, "builder"),
    nsisIncludePath: join(entryRoot, "nsis", "installer.nsh"),
    webStandaloneHookAuditPath: join(entryRoot, "web-standalone-after-pack-audit.json"),
    webStandaloneHookConfigPath: join(entryRoot, "web-standalone-after-pack-config.json"),
  };
}

function rewriteAuditPaths(value: unknown, fromRoot: string, toRoot: string): unknown {
  if (typeof value === "string") return value.split(fromRoot).join(toRoot);
  if (Array.isArray(value)) return value.map((entry) => rewriteAuditPaths(entry, fromRoot, toRoot));
  if (value == null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, rewriteAuditPaths(entry, fromRoot, toRoot)]),
  );
}

async function materializeCachedElectronBuilderAudit(entryRoot: string, paths: WinPaths): Promise<void> {
  if (!(await pathExists(join(entryRoot, "web-standalone-after-pack-audit.json")))) return;
  const raw = JSON.parse(await readFile(join(entryRoot, "web-standalone-after-pack-audit.json"), "utf8")) as unknown;
  const appPath = typeof (raw as { appPath?: unknown }).appPath === "string"
    ? (raw as { appPath: string }).appPath
    : null;
  const sourceBuilderRoot = appPath == null ? join(entryRoot, "builder") : dirname(appPath);
  await mkdir(dirname(paths.webStandaloneHookAuditPath), { recursive: true });
  await writeFile(
    paths.webStandaloneHookAuditPath,
    `${JSON.stringify(rewriteAuditPaths(raw, sourceBuilderRoot, paths.appBuilderOutputRoot), null, 2)}\n`,
    "utf8",
  );
}

async function rewriteUnpackedAppPackageVersion(unpackedRoot: string, packagedVersion: string): Promise<void> {
  const packageJsonPath = join(unpackedRoot, "resources", "app", "package.json");
  if (!(await pathExists(packageJsonPath))) return;
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as Record<string, unknown>;
  packageJson.version = packagedVersion;
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

export async function materializeCachedUnpackedForInstaller(
  cachedUnpackedRoot: string,
  paths: WinPaths,
  packagedVersion?: string,
): Promise<WinBuiltAppManifest> {
  await removeTree(paths.unpackedRoot);
  await mkdir(dirname(paths.unpackedRoot), { recursive: true });
  await cp(cachedUnpackedRoot, paths.unpackedRoot, { recursive: true });
  await cp(paths.packagedConfigPath, join(paths.unpackedRoot, "resources", "open-design-config.json"));
  if (packagedVersion != null) await rewriteUnpackedAppPackageVersion(paths.unpackedRoot, packagedVersion);
  return {
    appBuilderOutputRoot: paths.appBuilderOutputRoot,
    cacheEntryPath: null,
    configPath: paths.packagedConfigPath,
    executablePath: paths.unpackedExePath,
    source: "namespace",
    unpackedRoot: paths.unpackedRoot,
    version: 1,
    webStandaloneHookAuditPath: (await pathExists(paths.webStandaloneHookAuditPath)) ? paths.webStandaloneHookAuditPath : null,
  };
}

export async function runElectronBuilder(
  config: ToolPackConfig,
  paths: WinPaths,
  cache: ToolPackCache,
  packagedAppKey: string,
  getPackagedAppRoot: () => Promise<string>,
  resourceTree: ResourceTreeResult,
): Promise<void> {
  const packagedVersion = await readPackagedVersion(config);
  const key = hashJson({
    afterPackHook: config.webOutputMode === "standalone" ? await hashPath(winResources.webStandaloneAfterPackHook) : null,
    asar: ELECTRON_BUILDER_ASAR,
    buildDependenciesFromSource: ELECTRON_BUILDER_BUILD_DEPENDENCIES_FROM_SOURCE,
    electronBuilderCliPath: config.electronBuilderCliPath,
    electronVersion: config.electronVersion,
    filePatterns: ELECTRON_BUILDER_FILE_PATTERNS,
    node: "win.electron-builder-dir",
    nodeGypRebuild: ELECTRON_BUILDER_NODE_GYP_REBUILD,
    npmRebuild: ELECTRON_BUILDER_NPM_REBUILD,
    packagedAppKey,
    packagedVersion,
    packagedConfigSchemaVersion: 1,
    portable: config.portable,
    platform: "win32",
    resourceTreeKey: resourceTree.key,
    schemaVersion: 5,
    target: "dir",
    webOutputMode: config.webOutputMode,
    winIcon: await hashPath(winResources.icon),
  });
  const auditOutput = "web-standalone-after-pack-audit.json";
  const node = {
    id: "win.electron-builder-dir",
    key,
    outputs: ["builder", ...(config.webOutputMode === "standalone" ? [auditOutput] : [])],
    invalidate: async () => null,
    build: async ({ entryRoot }: { entryRoot: string }): Promise<ElectronBuilderDirCacheMetadata> => {
      const packagedAppRoot = await getPackagedAppRoot();
      await runElectronBuilderRaw(
        { ...config, to: "dir" },
        { ...createCacheLocalWinPaths(paths, entryRoot), resourceRoot: resourceTree.resourceRoot },
        packagedAppRoot,
      );
      return { packagedAppKey, packagedVersion };
    },
  };
  let manifest = await cache.readHit({
    materialize: [],
    node,
  });
  if (manifest == null) {
    const packagedAppRoot = await getPackagedAppRoot();
    manifest = await cache.acquire({
      materialize: [],
      node: {
        ...node,
        build: async ({ entryRoot }: { entryRoot: string }): Promise<ElectronBuilderDirCacheMetadata> => {
          await runElectronBuilderRaw(
            { ...config, to: "dir" },
            { ...createCacheLocalWinPaths(paths, entryRoot), resourceRoot: resourceTree.resourceRoot },
            packagedAppRoot,
          );
          return { packagedAppKey, packagedVersion };
        },
      },
    });
  }

  const cachedBuilderRoot = join(manifest.entryPath, "builder");
  const cachedUnpackedRoot = join(cachedBuilderRoot, "win-unpacked");
  const cachedExecutablePath = join(cachedUnpackedRoot, `${PRODUCT_NAME}.exe`);
  await removeTree(paths.appBuilderOutputRoot);
  await writePackagedConfig(config, paths, packagedVersion);
  await materializeCachedElectronBuilderAudit(manifest.entryPath, paths);
  await writeBuiltAppManifest(paths, {
    appBuilderOutputRoot: cachedBuilderRoot,
    cacheEntryPath: manifest.entryPath,
    configPath: paths.packagedConfigPath,
    executablePath: cachedExecutablePath,
    source: "cache",
    unpackedRoot: cachedUnpackedRoot,
    webStandaloneHookAuditPath: (await pathExists(paths.webStandaloneHookAuditPath)) ? paths.webStandaloneHookAuditPath : null,
  });
  if (config.to === "nsis" || config.to === "all") {
    await buildCustomWinNsisInstaller(config, paths, await materializeCachedUnpackedForInstaller(cachedUnpackedRoot, paths, packagedVersion));
  }
}
