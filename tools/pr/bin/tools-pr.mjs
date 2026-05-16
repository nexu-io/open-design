#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const entryDir = dirname(fileURLToPath(import.meta.url));
const distEntry = resolve(entryDir, '../dist/index.mjs');
const requiredDistEntries = [distEntry];
const missingDistEntries = requiredDistEntries.filter((entry) => !existsSync(entry));

if (missingDistEntries.length > 0) {
  throw new Error(
    `tools-pr dist entries not found: ${missingDistEntries.join(', ')}. Run "pnpm --filter @open-design/tools-pr build" first.`,
  );
}

await import(pathToFileURL(distEntry).href);
