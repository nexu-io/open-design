import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import type { CatalogDocument, CatalogPluginRecord, CatalogRecord } from "./schema.ts";

export type StageCatalogEntryAssetsOptions = {
  catalog: CatalogDocument;
  repoRoot: string;
  stagingDir: string;
};

function normalizedRelativePath(path: string): string {
  return path.split(sep).join("/");
}

function rootsForRecord(
  record: CatalogRecord,
  repoRoot: string,
): { sourceRoot: string; targetRoot: string } | null {
  if (record.type === "skill") {
    return {
      sourceRoot: join(repoRoot, "skills", record.id),
      targetRoot: `entries/skills/${record.id}`,
    };
  }
  if (record.type === "template") {
    return record.origin === "design-template"
      ? {
          sourceRoot: join(repoRoot, "design-templates", record.id),
          targetRoot: `entries/templates/${record.id}`,
        }
      : {
          sourceRoot: join(repoRoot, "templates/live-artifacts", record.id.replace(/^live-/, "")),
          targetRoot: `entries/templates/${record.id}`,
        };
  }
  if (record.type === "plugin") {
    return null;
  }
  return null;
}

function pluginBucketRoots(
  record: CatalogPluginRecord,
  repoRoot: string,
): { sourceRoot: string; targetRoot: string } {
  return record.bucket === "community"
    ? {
        sourceRoot: join(repoRoot, "plugins/community"),
        targetRoot: "entries/plugins/community",
      }
    : {
        sourceRoot: join(repoRoot, "plugins/_official", record.bucket),
        targetRoot: `entries/plugins/${record.bucket}`,
      };
}

function copyRegularTree(sourceRoot: string, targetRoot: string, written: string[], stagingDir: string): void {
  for (const name of readdirSync(sourceRoot).sort((a, b) => a.localeCompare(b))) {
    if (name === ".DS_Store" || name === ".git" || name === "node_modules") continue;
    const source = join(sourceRoot, name);
    const target = join(targetRoot, name);
    const stat = lstatSync(source);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      mkdirSync(target, { recursive: true });
      copyRegularTree(source, target, written, stagingDir);
      continue;
    }
    if (!stat.isFile()) continue;
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    chmodSync(target, stat.mode);
    written.push(normalizedRelativePath(relative(stagingDir, target)));
  }
}

/** Copy runnable preview roots so every entryPath resolves inside the snapshot. */
export function stageCatalogEntryAssets(options: StageCatalogEntryAssetsOptions): string[] {
  const repoRoot = resolve(options.repoRoot);
  const stagingDir = resolve(options.stagingDir);
  const written: string[] = [];
  const stagedPluginBuckets = new Set<string>();

  for (const record of options.catalog.records) {
    if (record.type === "craft" || record.type === "system") continue;
    const entryPath = record.preview?.entryPath;
    if (!entryPath) continue;

    if (record.type === "plugin") {
      const roots = pluginBucketRoots(record, repoRoot);
      const recordRoot = `${roots.targetRoot}/${record.slug}`;
      if (entryPath !== recordRoot && !entryPath.startsWith(`${recordRoot}/`)) {
        throw new Error(`preview entry escapes its snapshot root for plugin:${record.id}: ${entryPath}`);
      }
      if (!existsSync(roots.sourceRoot)) {
        throw new Error(`preview entry source root missing for plugin:${record.id}`);
      }
      if (!stagedPluginBuckets.has(roots.targetRoot)) {
        const targetRoot = join(stagingDir, roots.targetRoot);
        mkdirSync(targetRoot, { recursive: true });
        copyRegularTree(roots.sourceRoot, targetRoot, written, stagingDir);
        stagedPluginBuckets.add(roots.targetRoot);
      }
      if (!existsSync(join(stagingDir, entryPath))) {
        throw new Error(`preview entry was not staged for plugin:${record.id}: ${entryPath}`);
      }
      continue;
    }

    const roots = rootsForRecord(record, repoRoot);
    if (!roots || !existsSync(roots.sourceRoot)) {
      throw new Error(`preview entry source root missing for ${record.type}:${record.id}`);
    }
    if (entryPath !== roots.targetRoot && !entryPath.startsWith(`${roots.targetRoot}/`)) {
      throw new Error(`preview entry escapes its snapshot root for ${record.type}:${record.id}: ${entryPath}`);
    }

    const targetRoot = join(stagingDir, roots.targetRoot);
    mkdirSync(targetRoot, { recursive: true });
    copyRegularTree(roots.sourceRoot, targetRoot, written, stagingDir);
    if (!existsSync(join(stagingDir, entryPath))) {
      throw new Error(`preview entry was not staged for ${record.type}:${record.id}: ${entryPath}`);
    }
  }

  return written.sort((a, b) => a.localeCompare(b));
}
