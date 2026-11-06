#!/usr/bin/env node

import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertFreshToolBuildFromMeta, writeToolBuildMetadataFromMeta } from "./index.ts";

async function main(argv: string[]): Promise<void> {
  const [command, toolRootArg] = argv;
  if (command !== "write" && command !== "check") {
    throw new Error(`usage: ${basename(fileURLToPath(import.meta.url))} <write|check> [tool-root]`);
  }
  const toolRoot = toolRootArg == null ? process.cwd() : resolve(toolRootArg);
  const result = command === "write"
    ? await writeToolBuildMetadataFromMeta(toolRoot)
    : await assertFreshToolBuildFromMeta(toolRoot);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

await main(process.argv.slice(2));
