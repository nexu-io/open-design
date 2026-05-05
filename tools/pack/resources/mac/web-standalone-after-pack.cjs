const { access, cp, lstat, mkdir, readFile, readdir, rm, stat, symlink, writeFile } = require("node:fs/promises");
const { createRequire } = require("node:module");
const path = require("node:path");

const CONFIG_ENV = "OD_TOOLS_PACK_WEB_STANDALONE_HOOK_CONFIG";
const STANDALONE_RESOURCE_NAME = "open-design-web-standalone";
const REQUIRED_MODULES = ["next/package.json", "react/package.json", "react-dom/package.json", "styled-jsx/package.json"];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(record, key) {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`[tools-pack web-standalone] config.${key} must be a non-empty string`);
  }
  return value;
}

function requireBoolean(record, key) {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`[tools-pack web-standalone] config.${key} must be a boolean`);
  }
  return value;
}

function requireAbsolutePath(record, key) {
  const value = requireString(record, key);
  if (!path.isAbsolute(value)) {
    throw new Error(`[tools-pack web-standalone] config.${key} must be absolute: ${value}`);
  }
  return path.resolve(value);
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative.length === 0 || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function pathLstatExists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readHookConfig() {
  const configPath = process.env[CONFIG_ENV];
  if (configPath == null || configPath.length === 0) {
    throw new Error(`[tools-pack web-standalone] missing ${CONFIG_ENV}`);
  }
  if (!path.isAbsolute(configPath)) {
    throw new Error(`[tools-pack web-standalone] ${CONFIG_ENV} must be absolute: ${configPath}`);
  }

  const raw = JSON.parse(await readFile(configPath, "utf8"));
  if (!isRecord(raw) || raw.version !== 1) {
    throw new Error("[tools-pack web-standalone] hook config must be an object with version=1");
  }

  const workspaceRoot = requireAbsolutePath(raw, "workspaceRoot");
  const standaloneSourceRoot = requireAbsolutePath(raw, "standaloneSourceRoot");
  const webStaticSourceRoot = requireAbsolutePath(raw, "webStaticSourceRoot");
  const webPublicSourceRoot = requireAbsolutePath(raw, "webPublicSourceRoot");
  const auditReportPath = requireAbsolutePath(raw, "auditReportPath");
  const resourceName = requireString(raw, "resourceName");
  if (resourceName !== STANDALONE_RESOURCE_NAME) {
    throw new Error(`[tools-pack web-standalone] unsupported resourceName: ${resourceName}`);
  }

  for (const [key, value] of Object.entries({ standaloneSourceRoot, webStaticSourceRoot, webPublicSourceRoot })) {
    if (!isWithin(workspaceRoot, value)) {
      throw new Error(`[tools-pack web-standalone] config.${key} must stay under workspaceRoot: ${value}`);
    }
  }

  return {
    auditReportPath,
    pruneCopiedSharp: requireBoolean(raw, "pruneCopiedSharp"),
    pruneRootNext: requireBoolean(raw, "pruneRootNext"),
    pruneRootSharp: requireBoolean(raw, "pruneRootSharp"),
    resourceName,
    standaloneSourceRoot,
    webPublicSourceRoot,
    webStaticSourceRoot,
    workspaceRoot,
  };
}

function resolveAppPath(context) {
  if (context == null || typeof context.appOutDir !== "string" || context.appOutDir.length === 0) {
    throw new Error("[tools-pack web-standalone] electron-builder context.appOutDir is missing");
  }
  const productFilename = context.packager?.appInfo?.productFilename;
  if (typeof productFilename !== "string" || productFilename.length === 0) {
    throw new Error("[tools-pack web-standalone] electron-builder productFilename is missing");
  }
  return path.join(context.appOutDir, `${productFilename}.app`);
}

async function sizePathBytes(filePath) {
  let metadata;
  try {
    metadata = await lstat(filePath);
  } catch {
    return 0;
  }

  if (!metadata.isDirectory()) return metadata.size;

  const entries = await readdir(filePath, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) {
    total += await sizePathBytes(path.join(filePath, entry.name));
  }
  return total;
}

async function copyRequired(sourcePath, destinationPath) {
  if (!(await pathExists(sourcePath))) {
    throw new Error(`[tools-pack web-standalone] required source missing: ${sourcePath}`);
  }
  await rm(destinationPath, { force: true, recursive: true });
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await cp(sourcePath, destinationPath, {
    dereference: false,
    recursive: true,
    verbatimSymlinks: true,
  });
}

async function copyOptional(sourcePath, destinationPath) {
  if (!(await pathExists(sourcePath))) return false;
  await copyRequired(sourcePath, destinationPath);
  return true;
}

async function linkRelative(sourcePath, destinationPath) {
  if (!(await pathExists(sourcePath))) return false;
  if (await pathLstatExists(destinationPath)) return false;
  await mkdir(path.dirname(destinationPath), { recursive: true });
  const relativeTarget = path.relative(path.dirname(destinationPath), sourcePath);
  await symlink(relativeTarget.length === 0 ? "." : relativeTarget, destinationPath);
  return true;
}

async function linkPnpmPublicHoist(destinationRoot) {
  const nodeModulesRoot = path.join(destinationRoot, "node_modules");
  const hoistRoot = path.join(nodeModulesRoot, ".pnpm", "node_modules");
  const entries = await readdir(hoistRoot, { withFileTypes: true }).catch(() => []);
  const linked = [];

  for (const entry of entries) {
    const sourcePath = path.join(hoistRoot, entry.name);
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      const scopedEntries = await readdir(sourcePath).catch(() => []);
      for (const scopedEntry of scopedEntries) {
        const scopedSource = path.join(sourcePath, scopedEntry);
        const scopedDestination = path.join(nodeModulesRoot, entry.name, scopedEntry);
        if (await linkRelative(scopedSource, scopedDestination)) linked.push(scopedDestination);
      }
      continue;
    }

    const destinationPath = path.join(nodeModulesRoot, entry.name);
    if (await linkRelative(sourcePath, destinationPath)) linked.push(destinationPath);
  }

  return linked;
}

async function resolveStandaloneSourceWebRoot(standaloneSourceRoot) {
  const candidates = [
    path.join(standaloneSourceRoot, "apps", "web"),
    standaloneSourceRoot,
  ];

  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, "server.js"))) return candidate;
  }

  throw new Error(`[tools-pack web-standalone] standalone server.js not found under ${standaloneSourceRoot}`);
}

async function installStandaloneResource(config, appPath) {
  const sourceWebRoot = await resolveStandaloneSourceWebRoot(config.standaloneSourceRoot);
  const destinationRoot = path.join(appPath, "Contents", "Resources", config.resourceName);
  const destinationWebRoot = path.join(destinationRoot, "apps", "web");

  await rm(destinationRoot, { force: true, recursive: true });
  await mkdir(destinationWebRoot, { recursive: true });

  await copyRequired(path.join(config.standaloneSourceRoot, "node_modules"), path.join(destinationRoot, "node_modules"));
  await copyRequired(path.join(sourceWebRoot, "server.js"), path.join(destinationWebRoot, "server.js"));
  await copyOptional(path.join(sourceWebRoot, "package.json"), path.join(destinationWebRoot, "package.json"));
  const copiedNestedNodeModules = await copyOptional(path.join(sourceWebRoot, "node_modules"), path.join(destinationWebRoot, "node_modules"));
  const linkedHoistEntries = await linkPnpmPublicHoist(destinationRoot);
  await copyRequired(path.join(sourceWebRoot, ".next"), path.join(destinationWebRoot, ".next"));
  const copiedStatic = await copyOptional(config.webStaticSourceRoot, path.join(destinationWebRoot, ".next", "static"));
  const copiedPublic = await copyOptional(config.webPublicSourceRoot, path.join(destinationWebRoot, "public"));

  return {
    copiedNestedNodeModules,
    copiedPublic,
    copiedStatic,
    destinationRoot,
    destinationWebRoot,
    linkedHoistEntries,
    sourceWebRoot,
  };
}

async function removePathAndRecord(targetPath, reason, removedPaths) {
  const existed = await pathExists(targetPath);
  const bytes = await sizePathBytes(targetPath);
  await rm(targetPath, { force: true, recursive: true });
  if (existed || bytes > 0) {
    removedPaths.push({ bytes, path: targetPath, reason });
  }
}

function isPrunablePnpmSharpEntry(name) {
  return name.startsWith("sharp@") || name.startsWith("@img+colour@") || name.startsWith("@img+sharp-");
}

function isPrunableImgEntry(name) {
  return name === "colour" || name.startsWith("sharp-");
}

async function pruneImgScope(scopePath, reason, removedPaths) {
  const entries = await readdir(scopePath).catch(() => []);
  for (const entry of entries) {
    if (isPrunableImgEntry(entry)) {
      await removePathAndRecord(path.join(scopePath, entry), reason, removedPaths);
    }
  }
}

async function pruneCopiedSharp(destinationRoot) {
  const nodeModulesRoot = path.join(destinationRoot, "node_modules");
  const pnpmRoot = path.join(nodeModulesRoot, ".pnpm");
  const removedPaths = [];

  await removePathAndRecord(path.join(nodeModulesRoot, "sharp"), "copied top-level sharp symlink", removedPaths);
  await pruneImgScope(path.join(nodeModulesRoot, "@img"), "copied top-level @img sharp symlink", removedPaths);
  await removePathAndRecord(path.join(pnpmRoot, "node_modules", "sharp"), "copied pnpm sharp symlink", removedPaths);
  await pruneImgScope(path.join(pnpmRoot, "node_modules", "@img"), "copied pnpm @img sharp symlink", removedPaths);

  const pnpmEntries = await readdir(pnpmRoot).catch(() => []);
  for (const entry of pnpmEntries) {
    if (isPrunablePnpmSharpEntry(entry)) {
      await removePathAndRecord(path.join(pnpmRoot, entry), "copied pnpm sharp package", removedPaths);
      continue;
    }

    if (entry.startsWith("next@")) {
      await removePathAndRecord(path.join(pnpmRoot, entry, "node_modules", "sharp"), "copied next sharp symlink", removedPaths);
    }
  }

  return removedPaths;
}

async function pruneBrokenSymlinks(root, current = root, removedPaths = [], reason = "broken symlink") {
  let metadata;
  try {
    metadata = await lstat(current);
  } catch {
    return removedPaths;
  }

  if (metadata.isSymbolicLink()) {
    try {
      await stat(current);
    } catch {
      await removePathAndRecord(current, reason, removedPaths);
    }
    return removedPaths;
  }

  if (!metadata.isDirectory()) return removedPaths;

  const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    await pruneBrokenSymlinks(root, path.join(current, entry.name), removedPaths, reason);
  }
  return removedPaths;
}

function isForbiddenCopiedEntry(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  const withRootSlash = `/${normalized}`;
  return (
    withRootSlash.includes("/node_modules/.pnpm/sharp@") ||
    withRootSlash.includes("/node_modules/.pnpm/@img+colour@") ||
    withRootSlash.includes("/node_modules/.pnpm/@img+sharp-") ||
    withRootSlash.includes("/node_modules/sharp") ||
    withRootSlash.includes("/node_modules/@img/colour") ||
    withRootSlash.includes("/node_modules/@img/sharp-") ||
    withRootSlash.includes("sharp-libvips") ||
    withRootSlash.includes("swc-darwin")
  );
}

async function collectClosureStats(root, current = root, stats = { brokenSymlinks: [], forbiddenEntries: [], symlinks: 0 }) {
  let metadata;
  try {
    metadata = await lstat(current);
  } catch {
    return stats;
  }

  const relativePath = path.relative(root, current);
  if (relativePath.length > 0 && isForbiddenCopiedEntry(relativePath)) {
    stats.forbiddenEntries.push(relativePath.split(path.sep).join("/"));
  }

  if (metadata.isSymbolicLink()) {
    stats.symlinks += 1;
    try {
      await stat(current);
    } catch {
      stats.brokenSymlinks.push(relativePath.split(path.sep).join("/"));
    }
    return stats;
  }

  if (!metadata.isDirectory()) return stats;

  const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    await collectClosureStats(root, path.join(current, entry.name), stats);
  }
  return stats;
}

function assertResolvedInside(root, moduleName, resolvedPath) {
  if (!isWithin(root, resolvedPath)) {
    throw new Error(`[tools-pack web-standalone] ${moduleName} resolved outside copied standalone: ${resolvedPath}`);
  }
}

async function auditCopiedStandalone(config, installResult) {
  const serverPath = path.join(installResult.destinationWebRoot, "server.js");
  const staticRoot = path.join(installResult.destinationWebRoot, ".next", "static");
  const publicRoot = path.join(installResult.destinationWebRoot, "public");
  const nodeModulesRoot = path.join(installResult.destinationRoot, "node_modules");
  const requiredPaths = [serverPath, staticRoot, nodeModulesRoot];
  if (await pathExists(config.webPublicSourceRoot)) requiredPaths.push(publicRoot);

  for (const requiredPath of requiredPaths) {
    if (!(await pathExists(requiredPath))) {
      throw new Error(`[tools-pack web-standalone] copied standalone audit missing: ${requiredPath}`);
    }
  }

  const localRequire = createRequire(serverPath);
  const resolvedModules = {};
  for (const moduleName of REQUIRED_MODULES) {
    const resolvedPath = localRequire.resolve(moduleName);
    assertResolvedInside(installResult.destinationRoot, moduleName, resolvedPath);
    resolvedModules[moduleName] = resolvedPath;
  }

  const closureStats = await collectClosureStats(installResult.destinationRoot);
  if (closureStats.brokenSymlinks.length > 0) {
    throw new Error(`[tools-pack web-standalone] copied standalone has broken symlinks: ${closureStats.brokenSymlinks.join(", ")}`);
  }
  if (closureStats.forbiddenEntries.length > 0) {
    throw new Error(`[tools-pack web-standalone] copied standalone has forbidden entries: ${closureStats.forbiddenEntries.join(", ")}`);
  }

  return {
    brokenSymlinks: closureStats.brokenSymlinks,
    bytes: await sizePathBytes(installResult.destinationRoot),
    destinationRoot: installResult.destinationRoot,
    destinationWebRoot: installResult.destinationWebRoot,
    forbiddenEntries: closureStats.forbiddenEntries,
    nodeModulesBytes: await sizePathBytes(nodeModulesRoot),
    resolvedModules,
    serverPath,
    symlinks: closureStats.symlinks,
  };
}

async function pruneRootNext(appPath) {
  const appNodeModulesRoot = path.join(appPath, "Contents", "Resources", "app", "node_modules");
  const removedPaths = [];

  const nextScopeRoot = path.join(appNodeModulesRoot, "@next");
  const nextScopeEntries = await readdir(nextScopeRoot).catch(() => []);
  for (const entry of nextScopeEntries) {
    if (entry.startsWith("swc-darwin-")) {
      await removePathAndRecord(path.join(nextScopeRoot, entry), "root next darwin swc package", removedPaths);
    }
  }

  await removePathAndRecord(
    path.join(appNodeModulesRoot, "@open-design", "web", ".next", "standalone"),
    "root @open-design/web standalone output",
    removedPaths,
  );

  return removedPaths;
}

async function pruneRootSharp(appPath) {
  const appNodeModulesRoot = path.join(appPath, "Contents", "Resources", "app", "node_modules");
  const pnpmRoot = path.join(appNodeModulesRoot, ".pnpm");
  const removedPaths = [];

  await removePathAndRecord(path.join(appNodeModulesRoot, "sharp"), "root sharp package", removedPaths);
  await pruneImgScope(path.join(appNodeModulesRoot, "@img"), "root @img sharp package", removedPaths);
  await removePathAndRecord(path.join(pnpmRoot, "node_modules", "sharp"), "root pnpm sharp symlink", removedPaths);
  await pruneImgScope(path.join(pnpmRoot, "node_modules", "@img"), "root pnpm @img sharp symlink", removedPaths);

  const pnpmEntries = await readdir(pnpmRoot).catch(() => []);
  for (const entry of pnpmEntries) {
    if (isPrunablePnpmSharpEntry(entry)) {
      await removePathAndRecord(path.join(pnpmRoot, entry), "root pnpm sharp package", removedPaths);
    }
  }

  return removedPaths;
}

async function auditNoBrokenSymlinks(root, label) {
  const stats = await collectClosureStats(root);
  if (stats.brokenSymlinks.length > 0) {
    throw new Error(`[tools-pack web-standalone] ${label} has broken symlinks: ${stats.brokenSymlinks.join(", ")}`);
  }
  return {
    brokenSymlinks: stats.brokenSymlinks,
    symlinks: stats.symlinks,
  };
}

async function runWebStandaloneAfterPack(context) {
  if (context?.electronPlatformName != null && context.electronPlatformName !== "darwin") return;

  const config = await readHookConfig();
  const appPath = resolveAppPath(context);
  if (!(await pathExists(appPath))) {
    throw new Error(`[tools-pack web-standalone] app bundle not found: ${appPath}`);
  }

  const installResult = await installStandaloneResource(config, appPath);
  const copiedPrune = config.pruneCopiedSharp ? await pruneCopiedSharp(installResult.destinationRoot) : [];
  const brokenSymlinkPrune = await pruneBrokenSymlinks(
    installResult.destinationRoot,
    installResult.destinationRoot,
    [],
    "copied broken symlink",
  );
  const copiedAudit = await auditCopiedStandalone(config, installResult);
  const rootPrune = config.pruneRootNext ? await pruneRootNext(appPath) : [];
  const rootSharpPrune = config.pruneRootSharp ? await pruneRootSharp(appPath) : [];
  const rootBrokenSymlinkPrune = await pruneBrokenSymlinks(
    path.join(appPath, "Contents", "Resources", "app", "node_modules"),
    path.join(appPath, "Contents", "Resources", "app", "node_modules"),
    [],
    "root broken symlink",
  );
  const rootSymlinkAudit = await auditNoBrokenSymlinks(
    path.join(appPath, "Contents", "Resources", "app", "node_modules"),
    "root app node_modules",
  );
  const report = {
    appPath,
    brokenSymlinkPrune,
    copiedAudit,
    copiedPrune,
    generatedAt: new Date().toISOString(),
    rootBrokenSymlinkPrune,
    rootPrune,
    rootSharpPrune,
    rootSymlinkAudit,
    sourceWebRoot: installResult.sourceWebRoot,
    version: 1,
  };

  await mkdir(path.dirname(config.auditReportPath), { recursive: true });
  await writeFile(config.auditReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

module.exports = async function webStandaloneAfterPack(context) {
  try {
    await runWebStandaloneAfterPack(context);
  } catch (error) {
    console.error(
      "[tools-pack web-standalone] after-pack hook failed:",
      error instanceof Error ? error.message : error,
    );
    console.error("[tools-pack web-standalone] electron-builder context:", {
      appOutDir: context?.appOutDir,
      electronPlatformName: context?.electronPlatformName,
      productFilename: context?.packager?.appInfo?.productFilename,
    });
    throw error;
  }
};
