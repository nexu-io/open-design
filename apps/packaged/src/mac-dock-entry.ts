import { execFile } from "node:child_process";
import { posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const execOptions = { timeout: 5_000, maxBuffer: 1024 * 1024, windowsHide: true } as const;

export type MacDockTile = { type: string | null; url: string | null; bundleIdentifier: string | null };
type MacDockPaths = {
  canonicalAppBundlePath: string;
  knownAppBundlePaths?: readonly string[];
  versionsRoot?: string;
  appBundleName?: string;
};
type MacDockPlan = { keepIndex: number; removeIndices: number[]; replacementUrl: string | null; replacementLabel: string };
type MacDockExec = (command: string, args: string[], options: typeof execOptions) => Promise<{ stdout: string }>;
type MacDockSnapshot = { revision: string; tiles: MacDockTile[]; managed?: boolean };

export type MacDockRepairResult =
  | { status: "repaired"; removedEntries: number }
  | { status: "unchanged" | "conflict" | "skipped" }
  | { status: "failed"; error: unknown };

function normalizedMacPath(value: string): string | null {
  if (!posix.isAbsolute(value) || value.includes("\0") || value.includes("\\")) return null;
  const withoutTrailingSlash = value.replace(/\/+$/, "");
  if (posix.normalize(withoutTrailingSlash) !== withoutTrailingSlash) return null;
  return withoutTrailingSlash;
}

function dockTilePath(tile: MacDockTile): string | null {
  if (tile.type !== "file-tile" || typeof tile.url !== "string") return null;
  try {
    const url = new URL(tile.url);
    if (url.protocol !== "file:" || url.host !== "" || url.search !== "" || url.hash !== "") return null;
    // Reject URL-normalized traversal as well as noncanonical filesystem paths.
    if (/(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/i.test(tile.url)) return null;
    return normalizedMacPath(fileURLToPath(url, { windows: false }));
  } catch {
    return null;
  }
}

/**
 * Only the caller's installed bundle and exact channel/namespace payload layout
 * are owned. A matching bundle ID does not authorize changing custom installs.
 * Keep the first owned position and never add a pin the user did not choose.
 */
export function planMacDockEntries(tiles: readonly MacDockTile[], paths: MacDockPaths): MacDockPlan | null {
  const canonical = normalizedMacPath(paths.canonicalAppBundlePath);
  if (canonical == null || !canonical.endsWith(".app")) return null;
  const knownPaths = new Set([canonical, ...(paths.knownAppBundlePaths ?? []).flatMap((path) => {
    const normalized = normalizedMacPath(path);
    return normalized?.endsWith(".app") ? [normalized] : [];
  })]);
  const versionsRoot = paths.versionsRoot ? normalizedMacPath(paths.versionsRoot) : null;
  const bundleName = paths.appBundleName ?? posix.basename(canonical);
  const matched: { index: number; path: string }[] = [];
  for (const [index, tile] of tiles.entries()) {
    const path = dockTilePath(tile);
    if (path == null) continue;
    let owned = knownPaths.has(path);
    if (!owned && versionsRoot != null && posix.basename(bundleName) === bundleName) {
      const relative = posix.relative(versionsRoot, path).split("/");
      owned = relative.length === 3 && relative[0] !== "" && !relative[0]!.includes("..")
        && relative[1] === "payload" && relative[2] === bundleName;
    }
    if (owned) matched.push({ index, path });
  }
  const first = matched[0];
  if (!first || (matched.length === 1 && first.path === canonical)) return null;
  return {
    keepIndex: first.index,
    removeIndices: matched.slice(1).map(({ index }) => index),
    replacementUrl: first.path === canonical ? null : pathToFileURL(canonical, { windows: false }).href,
    replacementLabel: posix.basename(canonical, ".app"),
  };
}

function nativePreferencesPrelude(domain: string): string {
  return `ObjC.import("Foundation");
const preferenceDomain = ${JSON.stringify(domain)};
const defaults = $.NSUserDefaults.alloc.initWithSuiteName(preferenceDomain);
function isKind(value, kind) { return value && typeof value.isKindOfClass === "function" && value.isKindOfClass(kind); }
function string(value) { return isKind(value, $.NSString) ? ObjC.unwrap(value) : null; }
function entries() {
  const domain = defaults.persistentDomainForName(preferenceDomain);
  const value = isKind(domain, $.NSDictionary) ? domain.objectForKey("persistent-apps") : null;
  return isKind(value, $.NSArray) ? value : $.NSArray.array;
}
function isManaged() { return defaults.objectIsForcedForKey("persistent-apps"); }
`;
}

function readPreferencesScript(domain: string): string {
  return `${nativePreferencesPrelude(domain)}
const original = entries();
const data = $.NSPropertyListSerialization.dataWithPropertyListFormatOptionsError(original, $.NSPropertyListBinaryFormat_v1_0, 0, null);
const tiles = [];
for (let i = 0; i < original.count; i++) {
  const tile = original.objectAtIndex(i);
  let type = null, url = null, bundleIdentifier = null;
  if (isKind(tile, $.NSDictionary)) {
    type = string(tile.objectForKey("tile-type"));
    const tileData = tile.objectForKey("tile-data");
    if (isKind(tileData, $.NSDictionary)) {
      bundleIdentifier = string(tileData.objectForKey("bundle-identifier"));
      const fileData = tileData.objectForKey("file-data");
      if (isKind(fileData, $.NSDictionary)) url = string(fileData.objectForKey("_CFURLString"));
    }
  }
  tiles.push({ type, url, bundleIdentifier });
}
JSON.stringify({ revision: ObjC.unwrap(data.base64EncodedStringWithOptions(0)), tiles, managed: !!isManaged() });`;
}

function writePreferencesScript(domain: string, snapshot: MacDockSnapshot, plan: MacDockPlan): string {
  return `${nativePreferencesPrelude(domain)}
const revision = ${JSON.stringify(snapshot.revision)};
const plan = ${JSON.stringify(plan)};
const originalData = $.NSData.alloc.initWithBase64EncodedStringOptions(revision, 0);
const original = $.NSPropertyListSerialization.propertyListWithDataOptionsFormatError(originalData, 0, null, null);
const current = entries();
let status = "conflict";
if (!isManaged() && current.isEqualToArray(original)) {
  const updated = current.mutableCopy;
  if (plan.replacementUrl !== null) {
    const tile = current.objectAtIndex(plan.keepIndex).mutableCopy;
    const tileData = tile.objectForKey("tile-data").mutableCopy;
    const fileData = tileData.objectForKey("file-data").mutableCopy;
    fileData.setObjectForKey($(plan.replacementUrl), "_CFURLString");
    fileData.setObjectForKey($.NSNumber.numberWithInt(15), "_CFURLStringType");
    tileData.setObjectForKey(fileData, "file-data");
    tileData.setObjectForKey($(plan.replacementLabel), "file-label");
    // A bookmark for the old executable would otherwise override the new URL.
    tileData.removeObjectForKey("book");
    tileData.removeObjectForKey("file-bookmark");
    tile.setObjectForKey(tileData, "tile-data");
    updated.replaceObjectAtIndexWithObject(plan.keepIndex, tile);
  }
  for (let i = plan.removeIndices.length - 1; i >= 0; i--) updated.removeObjectAtIndex(plan.removeIndices[i]);
  defaults.setObjectForKey(updated, "persistent-apps");
  if (!defaults.synchronize) throw new Error("Dock preferences could not be saved");
  status = "repaired";
}
JSON.stringify({ status });`;
}

/**
 * Preserve opaque Dock plist values (including NSData bookmarks) in Foundation.
 * Compare the original native array again before writing only persistent-apps,
 * so concurrent Dock edits or managed settings cause the repair to be skipped.
 */
export async function repairMacDockEntries(input: MacDockPaths & {
  platform?: NodeJS.Platform;
  exec?: MacDockExec;
  preferencesDomain?: string;
  restartDock?: boolean;
}): Promise<MacDockRepairResult> {
  if ((input.platform ?? process.platform) !== "darwin") return { status: "skipped" };
  const canonical = normalizedMacPath(input.canonicalAppBundlePath);
  if (canonical == null || !canonical.endsWith(".app")) return { status: "skipped" };
  const domain = input.preferencesDomain ?? "com.apple.dock";
  const exec = input.exec ?? execFileAsync;
  try {
    const result = await exec("/usr/bin/osascript", ["-l", "JavaScript", "-e", readPreferencesScript(domain)], execOptions);
    const snapshot = JSON.parse(result.stdout) as MacDockSnapshot;
    if (snapshot.managed) return { status: "skipped" };
    if (typeof snapshot.revision !== "string" || !Array.isArray(snapshot.tiles)) throw new Error("Invalid Dock preferences snapshot");
    const plan = planMacDockEntries(snapshot.tiles, input);
    if (plan == null) return { status: "unchanged" };
    const applied = await exec("/usr/bin/osascript", ["-l", "JavaScript", "-e", writePreferencesScript(domain, snapshot, plan)], execOptions);
    const status = (JSON.parse(applied.stdout) as { status?: string }).status;
    if (status === "conflict") return { status: "conflict" };
    if (status !== "repaired") throw new Error("Invalid Dock preferences repair result");
    if (input.restartDock !== false) await exec("/usr/bin/killall", ["Dock"], execOptions);
    return { status: "repaired", removedEntries: plan.removeIndices.length };
  } catch (error: unknown) {
    return { status: "failed", error };
  }
}
