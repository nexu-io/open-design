#!/usr/bin/env -S node --experimental-strip-types

import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { ensure, fail } from "./lib/control.ts";
import { git, gitPathSetDigest, type GitHashPath } from "./lib/git.ts";
import { canonicalJson, digest, type Digest } from "./lib/json.ts";

type Declaration = Readonly<{
  extraDigests: readonly string[];
  hashPaths: readonly GitHashPath[];
  schemaVersion: number;
}>;

const KEY_PATTERN = /^[a-z][a-z0-9.-]*$/u;
const EXTRA_PATTERN = /^[a-z][a-z0-9]*$/u;
const CONTROL_PATHS = [
  ".github/actions/hash-skip/action.yml",
  ".github/scripts/hash_skip.ts",
  ".github/scripts/lib/control.ts",
  ".github/scripts/lib/git.ts",
  ".github/scripts/lib/json.ts",
] as const;

function repoPath(value: unknown, label: string): string {
  const text = ensure.text(value, label).replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+$/u, "");
  if (isAbsolute(text) || text === ".." || text.startsWith("../") || text.includes("/../")) {
    fail(`${label} must be repository-relative`);
  }
  return text;
}

function strings(value: unknown, label: string): readonly string[] {
  const entries = ensure.array(value, label).map((entry, index) => ensure.text(entry, `${label}[${index}]`)).sort();
  ensure.that(new Set(entries).size === entries.length, `${label} must not contain duplicates`);
  return Object.freeze(entries);
}

function hashPath(value: unknown, label: string): GitHashPath {
  if (typeof value === "string") return Object.freeze({ path: repoPath(value, label) });
  const input = ensure.record(value, label);
  ensure.exactKeys(input, ["excludeDirectoryNames", "excludePaths", "normalizePackageVersion", "normalizeTextLineEndings", "path"], label);
  for (const field of ["normalizePackageVersion", "normalizeTextLineEndings"] as const) {
    ensure.that(input[field] == null || typeof input[field] === "boolean", `${label}.${field} must be boolean`);
  }
  return Object.freeze({
    ...(input.excludeDirectoryNames == null ? {} : { excludeDirectoryNames: strings(input.excludeDirectoryNames, `${label}.excludeDirectoryNames`) }),
    ...(input.excludePaths == null ? {} : { excludePaths: strings(input.excludePaths, `${label}.excludePaths`).map((entry) => repoPath(entry, `${label}.excludePaths`)) }),
    ...(input.normalizePackageVersion === true ? { normalizePackageVersion: true } : {}),
    ...(input.normalizeTextLineEndings === true ? { normalizeTextLineEndings: true } : {}),
    path: repoPath(input.path, `${label}.path`),
  });
}

function declaration(root: string, key: string, ref: string): Declaration {
  ensure.that(KEY_PATTERN.test(key), `invalid hash_skip key: ${key}`);
  const path = `.github/hash_skip/${key}.json`;
  let value: unknown;
  try { value = JSON.parse(git(["show", `${ref}:${path}`], root).toString("utf8")); } catch (error) {
    fail(`invalid hash_skip declaration ${key}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const input = ensure.record(value, `hash_skip ${key}`);
  ensure.exactKeys(input, ["extraDigests", "hashPaths", "schemaVersion"], `hash_skip ${key}`);
  const extraDigests = strings(input.extraDigests, `hash_skip ${key}.extraDigests`);
  ensure.that(extraDigests.every((name) => EXTRA_PATTERN.test(name)), `hash_skip ${key}.extraDigests contains an invalid name`);
  const hashPaths = ensure.array(input.hashPaths, `hash_skip ${key}.hashPaths`).map((entry, index) => hashPath(entry, `hash_skip ${key}.hashPaths[${index}]`));
  ensure.that(hashPaths.length > 0, `hash_skip ${key}.hashPaths must not be empty`);
  return Object.freeze({ extraDigests, hashPaths: Object.freeze(hashPaths), schemaVersion: ensure.integer(input.schemaVersion, `hash_skip ${key}.schemaVersion`) });
}

function extraDigests(definition: Declaration): Readonly<Record<string, Digest>> {
  return Object.freeze(Object.fromEntries(definition.extraDigests.map((name) => {
    const env = `HASH_SKIP_EXTRA_${name.replace(/([a-z0-9])([A-Z])/gu, "$1_$2").toUpperCase()}`;
    return [name, ensure.digest(process.env[env], env)];
  })));
}

function resolveKey(root: string, key: string, ref: string, mode = "normal"): Readonly<{ cacheKey: string; hash: Digest; marker: string }> {
  ensure.that(["complete", "normal", "quarantine", "verify"].includes(mode), "hash_skip mode must be complete, normal, quarantine, or verify");
  const commit = git(["rev-parse", "--verify", `${ref}^{commit}`], root).toString("utf8").trim();
  const definition = declaration(root, key, commit);
  const source = gitPathSetDigest(root, commit, definition.hashPaths, { domain: "open-design/hash-skip/source/v1", label: key });
  const control = gitPathSetDigest(root, commit, CONTROL_PATHS.map((path) => ({ path })), { domain: "open-design/hash-skip/control/v1", label: "hash_skip control" });
  const hash = digest(canonicalJson({ control, definition, domain: "open-design/hash-skip/v1", extras: extraDigests(definition), key, source }));
  const token = hash.slice("sha256:".length);
  const marker = `.tmp/hash_skip/${token}/success.json`;
  const absoluteMarker = join(root, marker);
  mkdirSync(dirname(absoluteMarker), { recursive: true });
  writeFileSync(absoluteMarker, `${JSON.stringify({ hash, key, schemaVersion: 1 })}\n`);
  return Object.freeze({ cacheKey: `hash-skip-v1-${key}-${token}`, hash, marker });
}

function emit(result: ReturnType<typeof resolveKey>): void {
  const output = process.env.GITHUB_OUTPUT;
  if (output == null) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else appendFileSync(output, `cache_key=${result.cacheKey}\nhash=${result.hash}\nmarker=${result.marker}\n`);
}

function init(root: string): void {
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "hash-skip@open-design.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "hash_skip self-check"], { cwd: root });
}

function selfCheck(): void {
  const root = mkdtempSync(join(tmpdir(), "open-design-hash-skip-"));
  try {
    init(root);
    for (const path of CONTROL_PATHS) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), `${path}\n`); }
    mkdirSync(join(root, ".github", "hash_skip"), { recursive: true });
    writeFileSync(join(root, ".github", "hash_skip", "probe.json"), JSON.stringify({ extraDigests: ["runtime"], hashPaths: ["source.txt"], schemaVersion: 1 }));
    writeFileSync(join(root, "source.txt"), "one\n");
    execFileSync("git", ["add", "."], { cwd: root }); execFileSync("git", ["commit", "-qm", "one"], { cwd: root });
    process.env.HASH_SKIP_EXTRA_RUNTIME = digest("node24");
    const first = resolveKey(root, "probe", "HEAD");
    ensure.that(first.marker.startsWith(".tmp/hash_skip/") && !isAbsolute(first.marker), "cache marker must be repository-relative and cross-runner portable");
    ensure.that(first.hash === resolveKey(root, "probe", "HEAD").hash, "same inputs produced different hashes");
    const completed = resolveKey(root, "probe", "HEAD", "complete");
    ensure.that(first.hash === completed.hash && first.cacheKey === completed.cacheKey && first.marker === completed.marker, "normal and complete modes produced asymmetric identities");
    writeFileSync(join(root, "source.txt"), "two\n"); execFileSync("git", ["add", "."], { cwd: root }); execFileSync("git", ["commit", "-qm", "two"], { cwd: root });
    const sourceChanged = resolveKey(root, "probe", "HEAD");
    ensure.that(first.hash !== sourceChanged.hash, "source change did not invalidate hash");
    process.env.HASH_SKIP_EXTRA_RUNTIME = digest("node25");
    ensure.that(sourceChanged.hash !== resolveKey(root, "probe", "HEAD").hash, "extra digest change did not invalidate hash");
    process.stdout.write("hash_skip self-check OK\n");
  } finally { rmSync(root, { force: true, recursive: true }); }
}

const [key, ...args] = process.argv.slice(2);
if (key == null || key === "--help") process.stdout.write("Usage: hash_skip.ts <key> [--root <path>] [--ref <git-ref>] | self-check\n");
else if (key === "self-check") selfCheck();
else {
  ensure.that(args.length % 2 === 0, "hash_skip options must be pairs");
  const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, index) => [args[index * 2]!.replace(/^--/u, ""), args[index * 2 + 1]!]));
  ensure.exactKeys(options, ["mode", "ref", "root"], "hash_skip options");
  emit(resolveKey(resolve(options.root ?? process.cwd()), key, options.ref ?? "HEAD", options.mode ?? "normal"));
}
