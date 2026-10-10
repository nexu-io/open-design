// Linux after-pack hook: materialize the Next.js standalone web runtime into
// the packaged resources so the packaged web sidecar can boot from it.
//
// This is the Linux counterpart of the shared mac/win hook at
// tools/pack/resources/web-standalone-after-pack.cjs and registers through the
// same electron-builder `afterPack` config key and the same
// OD_TOOLS_PACK_WEB_STANDALONE_HOOK_CONFIG env contract. It is a separate file
// because the Linux lane needs a strictly smaller pipeline: the shared hook's
// sharp pruning, hyperframes runtime copies, win-only dedupe/prune audits, and
// mac ad-hoc code signing are all platform-owned behavior this lane does not
// perform (the assembled Linux app already carries the linux native module set,
// verified by assertLinuxNativeModules).
//
// Layout produced (matching apps/packaged/src/config.ts
// resolvePackagedWebStandaloneRoot and the shared hook's resource layout):
//   <appOutDir>/resources/open-design-web-standalone/
//     node_modules/...            (traced standalone closure)
//     apps/web/server.js          (or server.js at the resource root)
//     apps/web/package.json
//     apps/web/node_modules/...   (app-local + hoisted peer deps)
//     apps/web/.next/...          (+ .next/static overlay)
//     apps/web/public/...
const { access, cp, lstat, mkdir, readFile, readdir, realpath, rm, stat, symlink, writeFile } = require("node:fs/promises");
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
    resourceName,
    standaloneSourceRoot,
    webPublicSourceRoot,
    webStaticSourceRoot,
    workspaceRoot,
  };
}

// On Linux the packaged app root is flat: electron-builder places the app at
// <appOutDir>/resources/app and extra resources under <appOutDir>/resources.
function resolveResourcesRoot(context) {
  if (context == null || typeof context.appOutDir !== "string" || context.appOutDir.length === 0) {
    throw new Error("[tools-pack web-standalone] electron-builder context.appOutDir is missing");
  }
  return path.join(context.appOutDir, "resources");
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
  // Symlinks are copied verbatim: the workspace standalone tree was already
  // normalized by the workspace-build stage (dangling links stripped, peer
  // deps hoisted as tree-internal relative links), so verbatim copy keeps the
  // closure intact without duplicating linked content.
  await cp(sourcePath, destinationPath, { recursive: true, verbatimSymlinks: true });
}

async function copyOptional(sourcePath, destinationPath) {
  if (!(await pathExists(sourcePath))) return false;
  await copyRequired(sourcePath, destinationPath);
  return true;
}

// pnpm-shaped standalone trees keep dependency packages only inside
// node_modules/.pnpm, exposed through the .pnpm/node_modules public-hoist
// area (and per-package relative links) — plain Node resolution from
// server.js cannot see them. Without top-level entries, requires like
// react/package.json escape through the ANCESTOR node_modules chain, which
// silently "works" on the build machine and dies on a user machine where no
// ancestor node_modules exists. Mirror the shared mac/win hook's
// linkPnpmPublicHoist: link every public-hoist entry to the copied tree's
// node_modules root as a relative symlink so the resource stays
// self-contained.
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
        const scopedDestination = path.join(nodeModulesRoot, entry.name, scopedEntry);
        if (await linkHoistEntry(path.join(sourcePath, scopedEntry), scopedDestination)) {
          linked.push(scopedDestination);
        }
      }
      continue;
    }

    const destinationPath = path.join(nodeModulesRoot, entry.name);
    if (await linkHoistEntry(sourcePath, destinationPath)) linked.push(destinationPath);
  }

  return linked;
}

async function linkHoistEntry(sourcePath, destinationPath) {
  if (await pathLstatExists(destinationPath)) return false;
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await symlink(path.relative(path.dirname(destinationPath), sourcePath), destinationPath);
  return true;
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

async function installStandaloneResource(config, resourcesRoot) {
  const sourceWebRoot = await resolveStandaloneSourceWebRoot(config.standaloneSourceRoot);
  const destinationRoot = path.join(resourcesRoot, config.resourceName);
  const destinationWebRoot = path.join(destinationRoot, "apps", "web");

  await rm(destinationRoot, { force: true, recursive: true });
  await mkdir(destinationWebRoot, { recursive: true });

  await copyRequired(path.join(config.standaloneSourceRoot, "node_modules"), path.join(destinationRoot, "node_modules"));
  await copyRequired(path.join(sourceWebRoot, "server.js"), path.join(destinationWebRoot, "server.js"));
  const copiedPackageJson = await copyOptional(path.join(sourceWebRoot, "package.json"), path.join(destinationWebRoot, "package.json"));
  const copiedNestedNodeModules = await copyOptional(path.join(sourceWebRoot, "node_modules"), path.join(destinationWebRoot, "node_modules"));
  const linkedHoistEntries = await linkPnpmPublicHoist(destinationRoot);
  await copyRequired(path.join(sourceWebRoot, ".next"), path.join(destinationWebRoot, ".next"));
  const copiedStatic = await copyOptional(config.webStaticSourceRoot, path.join(destinationWebRoot, ".next", "static"));
  const copiedPublic = await copyOptional(config.webPublicSourceRoot, path.join(destinationWebRoot, "public"));

  return {
    copiedNestedNodeModules,
    copiedPackageJson,
    copiedPublic,
    copiedStatic,
    destinationRoot,
    destinationWebRoot,
    linkedHoistEntries,
    sourceWebRoot,
  };
}

async function removePathAndRecord(targetPath, reason, removedPaths) {
  const existed = await pathLstatExists(targetPath);
  const bytes = await sizePathBytes(targetPath);
  await rm(targetPath, { force: true, recursive: true });
  if (existed || bytes > 0) {
    removedPaths.push({ bytes, path: targetPath, reason });
  }
}

async function pruneBrokenSymlinks(root, current = root, removedPaths = []) {
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
      await removePathAndRecord(current, "copied broken symlink", removedPaths);
    }
    return removedPaths;
  }

  if (!metadata.isDirectory()) return removedPaths;

  const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    await pruneBrokenSymlinks(root, path.join(current, entry.name), removedPaths);
  }
  return removedPaths;
}

// Self-containment is the property this hook exists to ship: on a user machine
// nothing above the packaged resource can satisfy a require, so every symlink
// in the copied tree must resolve strictly inside it. Resolution escapes that
// the build machine would mask (ancestor node_modules chains) fail the package
// here instead of at runtime.
async function collectSymlinkContainmentViolations(root, current = root, violations = []) {
  let metadata;
  try {
    metadata = await lstat(current);
  } catch {
    return violations;
  }

  if (metadata.isSymbolicLink()) {
    const resolved = await realpath(current).catch(() => null);
    if (resolved == null || !isWithin(await realpath(root), resolved)) {
      violations.push(path.relative(root, current).split(path.sep).join("/"));
    }
    return violations;
  }

  if (!metadata.isDirectory()) return violations;

  const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    await collectSymlinkContainmentViolations(root, path.join(current, entry.name), violations);
  }
  return violations;
}

async function assertResolvedInside(root, moduleName, resolvedPath) {
  // Resolve through symlinks on both sides: node resolves module paths through
  // symlinked node_modules entries, so the audit must compare real paths.
  const [realRoot, realResolved] = await Promise.all([realpath(root), realpath(resolvedPath)]);
  if (!isWithin(realRoot, realResolved)) {
    throw new Error(`[tools-pack web-standalone] ${moduleName} resolved outside copied standalone: ${resolvedPath}`);
  }
}

async function auditCopiedStandalone(config, installResult) {
  const serverPath = path.join(installResult.destinationWebRoot, "server.js");
  const staticRoot = path.join(installResult.destinationWebRoot, ".next", "static");
  const publicRoot = path.join(installResult.destinationWebRoot, "public");
  const nodeModulesRoot = path.join(installResult.destinationRoot, "node_modules");
  const requiredPaths = [serverPath, nodeModulesRoot];
  if (await pathExists(config.webStaticSourceRoot)) requiredPaths.push(staticRoot);
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
    await assertResolvedInside(installResult.destinationRoot, moduleName, resolvedPath);
    resolvedModules[moduleName] = resolvedPath;
  }

  return {
    bytes: await sizePathBytes(installResult.destinationRoot),
    destinationRoot: installResult.destinationRoot,
    destinationWebRoot: installResult.destinationWebRoot,
    nodeModulesBytes: await sizePathBytes(nodeModulesRoot),
    resolvedModules,
    serverPath,
  };
}

async function runWebStandaloneAfterPack(context) {
  if (context?.electronPlatformName !== "linux") {
    throw new Error(`[tools-pack web-standalone] unsupported platform: ${context?.electronPlatformName ?? "unknown"}`);
  }

  const config = await readHookConfig();
  const resourcesRoot = resolveResourcesRoot(context);
  if (!(await pathExists(resourcesRoot))) {
    throw new Error(`[tools-pack web-standalone] resources root not found: ${resourcesRoot}`);
  }

  const installResult = await installStandaloneResource(config, resourcesRoot);
  const brokenSymlinkPrune = await pruneBrokenSymlinks(installResult.destinationRoot, installResult.destinationRoot);
  const externalSymlinks = await collectSymlinkContainmentViolations(installResult.destinationRoot, installResult.destinationRoot);
  if (externalSymlinks.length > 0) {
    throw new Error(`[tools-pack web-standalone] copied standalone has symlinks resolving outside the resource: ${externalSymlinks.join(", ")}`);
  }
  const copiedAudit = await auditCopiedStandalone(config, installResult);
  const report = {
    appOutDir: context.appOutDir,
    brokenSymlinkPrune,
    copiedAudit,
    externalSymlinks,
    generatedAt: new Date().toISOString(),
    linkedHoistEntries: installResult.linkedHoistEntries,
    platformName: context.electronPlatformName,
    resourcesRoot,
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
    });
    throw error;
  }
};
