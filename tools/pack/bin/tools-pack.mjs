#!/usr/bin/env node

import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const entryDir = dirname(fileURLToPath(import.meta.url));
const distEntry = resolve(entryDir, "../dist/index.mjs");
const srcDir = resolve(entryDir, "../src");

if (!existsSync(distEntry)) {
  throw new Error(
    `tools-pack dist entry not found at ${distEntry}. Run "pnpm --filter @open-design/tools-pack build" first.`,
  );
}

// Check for stale dist in dev/workspace mode
function isStale() {
  try {
    const distStat = statSync(distEntry);
    const distTime = distStat.mtimeMs;

    // Recursively check all source files under src/
    function checkDir(dir) {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = resolve(dir, entry.name);
          if (entry.isDirectory()) {
            if (checkDir(fullPath)) return true;
          } else {
            const fileStat = statSync(fullPath);
            if (fileStat.mtimeMs > distTime) return true;
          }
        }
      } catch {
        // Skip inaccessible directories
      }
      return false;
    }

    return checkDir(srcDir);
  } catch {
    return false;
  }
}

if (isStale() && process.env.NODE_ENV !== "production") {
  console.warn(
    "[tools-pack] WARNING: dist is stale relative to source. " +
    'Run "pnpm --filter @open-design/tools-pack build" to rebuild.'
  );
}

await import(pathToFileURL(distEntry).href);
