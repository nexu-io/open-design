import { createHash } from "node:crypto";
import {
  lstat,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { relative, resolve } from "node:path";

import type { ServerTarget } from "./config.js";

export const SERVER_RELEASE_SCHEMA_VERSION = 1;
export const SERVER_RELEASE_PRODUCT = "open-design-server";
export const SERVER_RELEASE_MANIFEST = "RELEASE.json";
export const SERVER_DAEMON_ENTRYPOINT = "apps/daemon/dist/daemon-cli.mjs";

export type ServerReleaseFile = {
  executable: boolean;
  path: string;
  sha256: string;
  size: number;
};

export type ServerReleaseManifest = {
  appVersion: string;
  daemonEntrypoint: typeof SERVER_DAEMON_ENTRYPOINT;
  files: ServerReleaseFile[];
  nativeDependencies: Record<string, string>;
  nodeAbi: string;
  nodeMajor: 24;
  product: typeof SERVER_RELEASE_PRODUCT;
  releaseDigest: string;
  releaseId: string;
  resourceRoot: "resources";
  schemaVersion: typeof SERVER_RELEASE_SCHEMA_VERSION;
  target: ServerTarget;
  webRoot: "apps/web/out";
};

function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function comparePaths(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

async function collectFiles(
  releaseRoot: string,
  current: string,
  files: ServerReleaseFile[],
): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((left, right) => comparePaths(left.name, right.name));
  for (const entry of entries) {
    const path = resolve(current, entry.name);
    const relativePath = toPosixPath(relative(releaseRoot, path));
    if (relativePath === SERVER_RELEASE_MANIFEST) continue;
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) {
      throw new Error(`server release must not contain symlinks: ${relativePath}`);
    }
    if (metadata.isDirectory()) {
      await collectFiles(releaseRoot, path, files);
      continue;
    }
    if (!metadata.isFile()) {
      throw new Error(`server release contains unsupported filesystem entry: ${relativePath}`);
    }
    const bytes = await readFile(path);
    files.push({
      executable: (metadata.mode & 0o111) !== 0,
      path: relativePath,
      sha256: sha256(bytes),
      size: metadata.size,
    });
  }
}

export async function collectServerReleaseFiles(
  releaseRoot: string,
): Promise<ServerReleaseFile[]> {
  const files: ServerReleaseFile[] = [];
  await collectFiles(resolve(releaseRoot), resolve(releaseRoot), files);
  return files.sort((left, right) =>
    comparePaths(left.path, right.path)
  );
}

function releaseDigest(files: ServerReleaseFile[]): string {
  return sha256(JSON.stringify(files));
}

export async function writeServerReleaseManifest(options: {
  appVersion: string;
  nativeDependencies?: Record<string, string>;
  nodeAbi: string;
  releaseId: string;
  releaseRoot: string;
  target: ServerTarget;
}): Promise<ServerReleaseManifest> {
  const files = await collectServerReleaseFiles(options.releaseRoot);
  const manifest: ServerReleaseManifest = {
    appVersion: options.appVersion,
    daemonEntrypoint: SERVER_DAEMON_ENTRYPOINT,
    files,
    nativeDependencies: options.nativeDependencies ?? {},
    nodeAbi: options.nodeAbi,
    nodeMajor: 24,
    product: SERVER_RELEASE_PRODUCT,
    releaseDigest: releaseDigest(files),
    releaseId: options.releaseId,
    resourceRoot: "resources",
    schemaVersion: SERVER_RELEASE_SCHEMA_VERSION,
    target: options.target,
    webRoot: "apps/web/out",
  };
  await writeFile(
    resolve(options.releaseRoot, SERVER_RELEASE_MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

function isServerTarget(value: unknown): value is ServerTarget {
  if (value == null || typeof value !== "object") return false;
  const target = value as { arch?: unknown; platform?: unknown };
  return (
    (target.arch === "arm64" || target.arch === "x64") &&
    (target.platform === "darwin" ||
      target.platform === "linux" ||
      target.platform === "win32")
  );
}

export async function readServerReleaseManifest(
  releaseRoot: string,
): Promise<ServerReleaseManifest> {
  const raw = JSON.parse(
    await readFile(resolve(releaseRoot, SERVER_RELEASE_MANIFEST), "utf8"),
  ) as Partial<ServerReleaseManifest>;
  if (
    raw.schemaVersion !== SERVER_RELEASE_SCHEMA_VERSION ||
    raw.product !== SERVER_RELEASE_PRODUCT ||
    typeof raw.appVersion !== "string" ||
    typeof raw.releaseId !== "string" ||
    typeof raw.nodeAbi !== "string" ||
    raw.nodeMajor !== 24 ||
    raw.daemonEntrypoint !== SERVER_DAEMON_ENTRYPOINT ||
    raw.resourceRoot !== "resources" ||
    raw.webRoot !== "apps/web/out" ||
    typeof raw.releaseDigest !== "string" ||
    !/^[0-9a-f]{64}$/.test(raw.releaseDigest) ||
    !isServerTarget(raw.target) ||
    !Array.isArray(raw.files) ||
    raw.nativeDependencies == null ||
    typeof raw.nativeDependencies !== "object"
  ) {
    throw new Error(`invalid server release manifest: ${releaseRoot}`);
  }
  return raw as ServerReleaseManifest;
}

export async function verifyServerRelease(
  releaseRoot: string,
): Promise<ServerReleaseManifest> {
  const manifest = await readServerReleaseManifest(releaseRoot);
  const actualFiles = await collectServerReleaseFiles(releaseRoot);
  const actualDigest = releaseDigest(actualFiles);
  if (
    actualDigest !== manifest.releaseDigest ||
    JSON.stringify(actualFiles) !== JSON.stringify(manifest.files)
  ) {
    throw new Error(`server release file verification failed: ${releaseRoot}`);
  }
  const entrypoint = resolve(releaseRoot, manifest.daemonEntrypoint);
  const entrypointMetadata = await stat(entrypoint).catch(() => null);
  if (entrypointMetadata == null || !entrypointMetadata.isFile()) {
    throw new Error(`server daemon entrypoint is missing: ${entrypoint}`);
  }
  return manifest;
}
