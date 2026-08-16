import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

export type ContentIdentitySource = Readonly<{
  excludeDirectoryNames?: readonly string[];
  excludePaths?: readonly string[];
  normalizePackageVersion?: boolean;
  normalizeTextLineEndings?: boolean;
  path: string;
}>;

export type ContentIdentityInput = Readonly<{
  id: string;
  parameters?: Readonly<Record<string, unknown>>;
  root: string;
  schemaVersion: number;
  sources: readonly ContentIdentitySource[];
}>;

export type ContentIdentityEntry = Readonly<{
  digest?: `sha256:${string}`;
  kind: "directory" | "file" | "symlink";
  mode: number;
  path: string;
  size?: number;
  target?: string;
}>;

export type ContentIdentityResult = Readonly<{
  digest: `sha256:${string}`;
  entries: readonly ContentIdentityEntry[];
  formatVersion: 1;
  id: string;
  parameters: Readonly<Record<string, unknown>>;
  schemaVersion: number;
  sources: readonly ContentIdentitySource[];
}>;

export const CONTENT_IDENTITY_FORMAT_VERSION = 1 as const;

function sha256(value: string | Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function normalizePath(value: string): string {
  return value.split("\\").join("/").replace(/^\.\//u, "");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value != null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]));
  }
  if (value === undefined) throw new Error("content identity parameters cannot contain undefined");
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function assertRelativeRepoPath(value: string, label: string): string {
  const normalized = normalizePath(value);
  if (
    normalized.length === 0
    || isAbsolute(value)
    || normalized === ".."
    || normalized.startsWith("../")
  ) throw new Error(`${label} must stay inside the identity root: ${value}`);
  return normalized;
}

function isExcluded(relativePath: string, source: ContentIdentitySource): boolean {
  const exclusions = (source.excludePaths ?? []).map((entry) => assertRelativeRepoPath(entry, "identity exclusion"));
  return exclusions.some((entry) => relativePath === entry || relativePath.startsWith(`${entry}/`));
}

async function normalizedFileBody(path: string, source: ContentIdentitySource): Promise<Buffer> {
  let body = await readFile(path);
  if (source.normalizePackageVersion === true && normalizePath(path).endsWith("/package.json")) {
    try {
      const parsed = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
      delete parsed.version;
      body = Buffer.from(`${canonicalJson(parsed)}\n`, "utf8");
    } catch {
      // The owning build will report malformed JSON. Identity remains byte-exact.
    }
  }
  if (source.normalizeTextLineEndings === true && !body.includes(0)) {
    body = Buffer.from(body.toString("utf8").replace(/\r\n?/gu, "\n"), "utf8");
  }
  return body;
}

async function inspectSource(root: string, source: ContentIdentitySource): Promise<ContentIdentityEntry[]> {
  const sourcePath = assertRelativeRepoPath(source.path, "identity source");
  const absoluteSource = resolve(root, sourcePath);
  if (relative(resolve(root), absoluteSource).startsWith("..")) {
    throw new Error(`identity source escapes root: ${source.path}`);
  }
  const entries: ContentIdentityEntry[] = [];

  async function visit(absolutePath: string, relativePath: string): Promise<void> {
    const sourceRelative = normalizePath(relative(sourcePath, relativePath));
    if (sourceRelative !== "" && isExcluded(sourceRelative, source)) return;
    const metadata = await lstat(absolutePath);
    if (metadata.isSymbolicLink()) {
      entries.push({ kind: "symlink", mode: 0o777, path: relativePath, target: normalizePath(await readlink(absolutePath)) });
      return;
    }
    if (metadata.isDirectory()) {
      entries.push({ kind: "directory", mode: 0o755, path: relativePath });
      const children = (await readdir(absolutePath, { withFileTypes: true }))
        .sort((left, right) => left.name.localeCompare(right.name));
      const excludedNames = new Set(source.excludeDirectoryNames ?? []);
      for (const child of children) {
        if (excludedNames.has(child.name)) continue;
        await visit(join(absolutePath, child.name), normalizePath(join(relativePath, child.name)));
      }
      return;
    }
    if (!metadata.isFile()) throw new Error(`unsupported identity input kind: ${relativePath}`);
    const body = await normalizedFileBody(absolutePath, source);
    const mode = (metadata.mode & 0o111) === 0 ? 0o644 : 0o755;
    entries.push({ digest: sha256(body), kind: "file", mode, path: relativePath, size: body.byteLength });
  }

  await visit(absoluteSource, sourcePath);
  return entries;
}

export async function resolveContentIdentity(input: ContentIdentityInput): Promise<ContentIdentityResult> {
  if (!/^[a-z][a-z0-9._-]*$/u.test(input.id)) throw new Error(`invalid content identity id: ${input.id}`);
  if (!Number.isSafeInteger(input.schemaVersion) || input.schemaVersion < 1) {
    throw new Error("content identity schemaVersion must be a positive integer");
  }
  if (input.sources.length === 0) throw new Error(`content identity ${input.id} requires at least one source`);
  const sources = [...input.sources].sort((left, right) => left.path.localeCompare(right.path));
  const entries = (await Promise.all(sources.map(async (source) => await inspectSource(input.root, source))))
    .flat()
    .sort((left, right) => left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind));
  const duplicate = entries.find((entry, index) => index > 0 && entries[index - 1]?.path === entry.path);
  if (duplicate != null) throw new Error(`content identity ${input.id} contains duplicate path: ${duplicate.path}`);
  const parameters = canonicalize(input.parameters ?? {}) as Readonly<Record<string, unknown>>;
  const digest = sha256(canonicalJson({
    entries,
    formatVersion: CONTENT_IDENTITY_FORMAT_VERSION,
    id: input.id,
    parameters,
    schemaVersion: input.schemaVersion,
    sources,
  }));
  return Object.freeze({
    digest,
    entries: Object.freeze(entries),
    formatVersion: CONTENT_IDENTITY_FORMAT_VERSION,
    id: input.id,
    parameters,
    schemaVersion: input.schemaVersion,
    sources,
  });
}
