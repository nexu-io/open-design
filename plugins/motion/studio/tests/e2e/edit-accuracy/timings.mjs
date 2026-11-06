#!/usr/bin/env node
// Rewrites timings.json, the seconds `shardCases` packs shards by, as each case's median over the given first runs
// of merge-queue shards: bun run --cwd packages/studio test:edit-accuracy:timings -- <run1/results.json...>
import { readFileSync, writeFileSync } from "node:fs";

const seconds = new Map();
for (const file of process.argv.slice(2))
  for (const c of JSON.parse(readFileSync(file, "utf8")).cases)
    seconds.set(c.id, [...(seconds.get(c.id) ?? []), c.seconds]);

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const timings = Object.fromEntries(
  [...seconds].sort(([a], [b]) => a.localeCompare(b)).map(([id, s]) => [id, +median(s).toFixed(1)]),
);
writeFileSync(new URL("timings.json", import.meta.url), `${JSON.stringify(timings, null, 2)}\n`);
