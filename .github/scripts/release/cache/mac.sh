#!/usr/bin/env bash
set -euo pipefail

cache_root="${CACHE_ROOT:-$RUNNER_TEMP/tools-pack-cache}"
if [ ! -d "$cache_root" ]; then
  echo "tools-pack cache root does not exist; nothing to prune"
  exit 0
fi

rm -rf "$cache_root/locks"
CACHE_ROOT="$cache_root" node --input-type=module <<'NODE'
import { rmSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const cacheRoot = process.env.CACHE_ROOT;
const entryRoot = join(cacheRoot, "entries");
const maxBytes = 6 * 1024 * 1024 * 1024;
const entries = [];

function directoryBytes(path) {
  let total = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) total += directoryBytes(child);
    else total += statSync(child).size;
  }
  return total;
}

try {
  for (const node of readdirSync(entryRoot, { withFileTypes: true })) {
    if (!node.isDirectory()) continue;
    const nodeRoot = join(entryRoot, node.name);
    for (const entry of readdirSync(nodeRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(nodeRoot, entry.name);
      const size = directoryBytes(path);
      entries.push({ node: node.name, path, size, mtimeMs: statSync(path).mtimeMs });
    }
  }
} catch {
  console.log("tools-pack cache entries root does not exist; nothing to prune");
  process.exit(0);
}

entries.sort((left, right) => right.mtimeMs - left.mtimeMs);
let keptBytes = 0;
let removedBytes = 0;
let removedCount = 0;
for (const entry of entries) {
  if (keptBytes + entry.size <= maxBytes) {
    keptBytes += entry.size;
    continue;
  }
  rmSync(entry.path, { force: true, recursive: true });
  removedBytes += entry.size;
  removedCount += 1;
}
console.log(`keptBytes=${keptBytes} removedBytes=${removedBytes} removedCount=${removedCount} maxBytes=${maxBytes}`);
NODE
