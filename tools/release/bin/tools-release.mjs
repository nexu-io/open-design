#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assertFreshToolBuildFromMeta } from "../../../packages/metatool/src/index.ts";

const entryDir = dirname(fileURLToPath(import.meta.url));
const toolRoot = resolve(entryDir, "..");
const distEntry = resolve(toolRoot, "dist/index.mjs");

await assertFreshToolBuildFromMeta(toolRoot);
await import(pathToFileURL(distEntry).href);
