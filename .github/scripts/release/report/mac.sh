#!/usr/bin/env bash
set -euo pipefail

summary_title="${SUMMARY_TITLE:-tools-pack build}"
build_json_path="${BUILD_JSON_PATH:-$RUNNER_TEMP/tools-pack-build.json}"
report_root="${REPORT_ROOT:-$RUNNER_TEMP/release-report/mac}"
report_zip_path="${REPORT_ZIP_PATH:-$RUNNER_TEMP/release-report/mac-report.zip}"
write_step_summary="${WRITE_STEP_SUMMARY:-true}"

create_report_zip() {
  local root="$1"
  local zip_path="$2"
  if ! command -v zip >/dev/null 2>&1; then
    echo "zip is required to package release report artifacts" >&2
    return 1
  fi
  mkdir -p "$root" "$(dirname "$zip_path")"
  rm -f "$zip_path"
  (
    cd "$root"
    zip -qr "$zip_path" .
  )
  echo "wrote release report zip: $zip_path"
}

if [ "$write_step_summary" != "false" ] && [ ! -f "$build_json_path" ]; then
  {
    echo "### $summary_title"
    echo
    echo "Build JSON was not found at \`$build_json_path\`."
  } >> "$GITHUB_STEP_SUMMARY"
elif [ "$write_step_summary" != "false" ]; then
  BUILD_JSON_PATH="$build_json_path" SUMMARY_TITLE="$summary_title" node --input-type=module <<'NODE' >> "$GITHUB_STEP_SUMMARY"
import { readFileSync } from "node:fs";

const build = JSON.parse(readFileSync(process.env.BUILD_JSON_PATH, "utf8"));
const cell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
const code = (value) => `\`${cell(value).replace(/`/g, "'")}\``;
const seconds = (value) => `${(Number(value) / 1000).toFixed(1)}s`;

console.log(`### ${process.env.SUMMARY_TITLE}`);
if (build.cacheReport?.root != null) {
  console.log("");
  console.log(`cacheRoot=${code(build.cacheReport.root)}`);
}
if ((build.releaseScriptTimings ?? []).length > 0) {
  console.log("");
  console.log("| Release script step | Status | Duration |");
  console.log("| --- | --- | ---: |");
  for (const timing of build.releaseScriptTimings ?? []) {
    console.log(`| ${code(timing.step)} | ${code(timing.status)} | ${seconds(timing.durationMs)} |`);
  }
}
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
const materialized = (build.cacheReport?.entries ?? [])
  .flatMap((entry) => (entry.materialized ?? []).map((target) => ({
    nodeId: entry.nodeId,
    ...target,
  })))
  .sort((left, right) => Number(right.durationMs) - Number(left.durationMs))
  .slice(0, 10);
if (materialized.length > 0) {
  console.log("");
  console.log("| Materialized cache output | Mode | Duration |");
  console.log("| --- | --- | ---: |");
  for (const entry of materialized) {
    const mode = entry.skipped === true ? "reused" : "copied";
    console.log(`| ${code(`${entry.nodeId}:${entry.from}`)} | ${code(mode)} | ${seconds(entry.durationMs)} |`);
  }
}
NODE
fi

REPORT_PLATFORM="${REPORT_PLATFORM:-mac}" \
REPORT_ROOT="$report_root" \
REPORT_ZIP_PATH="$report_zip_path" \
BUILD_JSON_PATH="$build_json_path" \
node --experimental-strip-types .github/scripts/release/report/report-json.ts

create_report_zip "$report_root" "$report_zip_path"
