#!/usr/bin/env bash
set -euo pipefail

summary_title="${SUMMARY_TITLE:-tools-pack build}"
build_json_path="${BUILD_JSON_PATH:-$RUNNER_TEMP/tools-pack-build.json}"
if [ ! -f "$build_json_path" ]; then
  {
    echo "### $summary_title"
    echo
    echo "Build JSON was not found at \`$build_json_path\`."
  } >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi

BUILD_JSON_PATH="$build_json_path" SUMMARY_TITLE="$summary_title" node --input-type=module <<'NODE' >> "$GITHUB_STEP_SUMMARY"
import { readFileSync } from "node:fs";

const build = JSON.parse(readFileSync(process.env.BUILD_JSON_PATH, "utf8"));
const cell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
const code = (value) => `\`${cell(value).replace(/`/g, "'")}\``;
const seconds = (value) => `${(Number(value) / 1000).toFixed(1)}s`;

console.log(`### ${process.env.SUMMARY_TITLE}`);
console.log("");
console.log("| Phase | Duration |");
console.log("| --- | ---: |");
for (const timing of build.timings ?? []) {
  console.log(`| ${code(timing.phase)} | ${seconds(timing.durationMs)} |`);
}
console.log("");
console.log("| Cache node | Status | Reason | Duration |");
console.log("| --- | --- | --- | ---: |");
for (const entry of build.cacheReport?.entries ?? []) {
  console.log(`| ${code(entry.nodeId)} | ${code(entry.status)} | ${cell(entry.reason)} | ${seconds(entry.durationMs)} |`);
}
NODE
