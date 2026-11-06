import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  utimesSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";

import { assertValidCatalog } from "./validate.ts";
import {
  CATALOG_SCHEMA_VERSION,
  catalogRecordCounts,
  type CatalogDocument,
  type CatalogProvenance,
} from "./schema.ts";

export type PackCatalogOptions = {
  stagingDir: string;
  sourceCommit: string;
  exporterVersion: string;
};

export type PackCatalogResult = {
  stagingDir: string;
  checksumsPath: string;
  provenancePath: string;
  bundlePath: string;
  bundleSha256: string;
  catalog: CatalogDocument;
};

function sha256(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      if (name === ".DS_Store") continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) out.push(full);
    }
  }
  walk(root);
  return out.sort((a, b) => a.localeCompare(b));
}

function writeChecksums(stagingDir: string, excludeNames: Set<string>): string {
  const lines: string[] = [];
  for (const file of walkFiles(stagingDir)) {
    const rel = relative(stagingDir, file).split("\\").join("/");
    if (excludeNames.has(rel)) continue;
    lines.push(`${sha256(readFileSync(file))}  ${rel}`);
  }
  const body = `${lines.join("\n")}\n`;
  const path = join(stagingDir, "checksums.sha256");
  writeFileSync(path, body, "utf8");
  return path;
}

function normalizeSnapshotTimes(stagingDir: string, generatedAt: string): void {
  const timestamp = new Date(generatedAt);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`catalog generatedAt is not a valid ISO timestamp: ${generatedAt}`);
  }
  const directories = new Set<string>([stagingDir]);
  for (const file of walkFiles(stagingDir)) {
    utimesSync(file, timestamp, timestamp);
    let directory = resolve(file, "..");
    while (directory.startsWith(`${stagingDir}/`) && directory !== stagingDir) {
      directories.add(directory);
      directory = resolve(directory, "..");
    }
  }
  for (const directory of [...directories].sort((a, b) => b.length - a.length)) {
    utimesSync(directory, timestamp, timestamp);
  }
}

function createBundleTarZst(stagingDir: string, bundlePath: string, members: string[]): void {
  try {
    execFileSync("zstd", ["--version"], { stdio: "ignore" });
  } catch {
    throw new Error("zstd CLI is required to pack catalog bundles (install zstd)");
  }

  const tarPath = join(stagingDir, ".bundle.tar");
  try {
    execFileSync(
      "tar",
      [
        "--format=ustar",
        "--owner=0",
        "--group=0",
        "--numeric-owner",
        "-cf", tarPath,
        ...members,
      ],
      {
        cwd: stagingDir,
        env: { ...process.env, COPYFILE_DISABLE: "1" },
        stdio: "pipe",
      },
    );
    execFileSync("zstd", ["-f", "-q", "-o", bundlePath, tarPath], { stdio: "pipe" });
  } finally {
    if (existsSync(tarPath)) {
      try {
        unlinkSync(tarPath);
      } catch {
        // best-effort
      }
    }
  }
}

/**
 * Verify checksums.sha256 against files on disk. Rejects tampering / missing files.
 */
export function verifyCatalogChecksums(stagingDir: string): void {
  const checksumsPath = join(stagingDir, "checksums.sha256");
  if (!existsSync(checksumsPath)) {
    throw new Error("checksums.sha256 missing");
  }
  const lines = readFileSync(checksumsPath, "utf8").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    throw new Error("checksums.sha256 is empty");
  }
  for (const line of lines) {
    const m = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!m) throw new Error(`malformed checksums line: ${line}`);
    const expected = m[1]!;
    const rel = m[2]!;
    if (rel === "checksums.sha256" || rel === "bundle.tar.zst" || rel === "provenance.json") {
      // Provenance is sealed after the bundle and is verified separately.
      // Checksums cover catalog content, previews, and runnable entry assets.
      if (rel === "provenance.json" || rel === "bundle.tar.zst" || rel === "checksums.sha256") {
        continue;
      }
    }
    const full = join(stagingDir, rel);
    if (!existsSync(full)) throw new Error(`checksums list missing file: ${rel}`);
    const actual = sha256(readFileSync(full));
    if (actual !== expected) {
      throw new Error(`checksum mismatch for ${rel}: expected ${expected}, got ${actual}`);
    }
  }
}

/**
 * Finalize staging that already has catalog.json, previews/, and optional entries/.
 *
 * - checksums.sha256 hashes catalog.json + previews/** + entries/**
 * - bundle.tar.zst archives catalog.json + previews/** + entries/** + checksums.sha256
 * - provenance.json records exporter identity + bundleSha256 (sibling, not inside bundle)
 */
export function packCatalogSnapshot(options: PackCatalogOptions): PackCatalogResult {
  const stagingDir = resolve(options.stagingDir);
  mkdirSync(stagingDir, { recursive: true });

  const catalogPath = join(stagingDir, "catalog.json");
  if (!existsSync(catalogPath)) {
    throw new Error(`catalog.json missing in staging dir: ${stagingDir}`);
  }
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as CatalogDocument;
  assertValidCatalog(catalog);
  if (catalog.sourceCommit.toLowerCase() !== options.sourceCommit.toLowerCase()) {
    throw new Error(
      `catalog sourceCommit ${catalog.sourceCommit} does not match pack sourceCommit ${options.sourceCommit}`,
    );
  }

  for (const record of catalog.records) {
    const preview = record.type !== "craft" && "preview" in record ? record.preview : undefined;
    const path = preview?.path;
    if (!path) continue;
    const full = join(stagingDir, path);
    if (!existsSync(full)) {
      throw new Error(`incomplete bundle: missing preview ${path} for ${record.type}:${record.id}`);
    }
    const entryPath = preview?.entryPath;
    if (entryPath && !existsSync(join(stagingDir, entryPath))) {
      throw new Error(`incomplete bundle: missing preview entry ${entryPath} for ${record.type}:${record.id}`);
    }
  }

  for (const name of ["checksums.sha256", "provenance.json", "bundle.tar.zst", ".bundle.tar"]) {
    const full = join(stagingDir, name);
    if (existsSync(full)) unlinkSync(full);
  }

  const counts = catalogRecordCounts(catalog.records);

  // Content checksums cover catalog, previews, and runnable entry assets.
  const checksumsPath = writeChecksums(
    stagingDir,
    new Set(["checksums.sha256", "bundle.tar.zst", "provenance.json", ".bundle.tar"]),
  );

  normalizeSnapshotTimes(stagingDir, catalog.generatedAt);

  const bundlePath = join(stagingDir, "bundle.tar.zst");
  const contentMembers = walkFiles(stagingDir)
    .map((file) => relative(stagingDir, file).split("\\").join("/"))
    .filter((name) => name !== "bundle.tar.zst" && name !== ".bundle.tar" && name !== "provenance.json");
  createBundleTarZst(stagingDir, bundlePath, contentMembers);
  const bundleSha256 = sha256(readFileSync(bundlePath));

  const provenance: CatalogProvenance = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    sourceCommit: options.sourceCommit.toLowerCase(),
    generatedAt: catalog.generatedAt,
    exporterVersion: options.exporterVersion,
    bundleSha256,
    recordCounts: counts,
  };
  const provenancePath = join(stagingDir, "provenance.json");
  writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");

  verifyCatalogChecksums(stagingDir);

  return {
    stagingDir,
    checksumsPath,
    provenancePath,
    bundlePath,
    bundleSha256,
    catalog,
  };
}

export function writeCatalogJson(stagingDir: string, catalog: CatalogDocument): string {
  mkdirSync(stagingDir, { recursive: true });
  const path = join(stagingDir, "catalog.json");
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  return path;
}
