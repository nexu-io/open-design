import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

type JsonRecord = Record<string, unknown>;

function required(name: string): string {
  const value = process.env[name];
  if (value == null || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function optional(name: string, fallback = ""): string {
  const value = process.env[name];
  return value == null || value.length === 0 ? fallback : value;
}

function resolvePath(value: string): string {
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

function readJsonFile(path: string): JsonRecord | null {
  if (!existsSync(path) || !statSync(path).isFile()) return null;
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")) as JsonRecord;
}

function objectOrNull(value: unknown): JsonRecord | null {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizePath(value: string): string {
  return value.split(sep).join("/");
}

function listFiles(root: string): Array<{ bytes: number; path: string }> {
  if (!existsSync(root) || !statSync(root).isDirectory()) return [];
  const files: Array<{ bytes: number; path: string }> = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()) {
        files.push({
          bytes: statSync(path).size,
          path: normalizePath(relative(root, path)),
        });
      }
    }
  };
  visit(root);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return files;
}

function topDurations(entries: unknown[], key: string, limit: number): JsonRecord[] {
  return entries
    .map((entry) => objectOrNull(entry))
    .filter((entry): entry is JsonRecord => entry != null)
    .filter((entry) => numberOrNull(entry.durationMs) != null)
    .sort((left, right) => Number(right.durationMs) - Number(left.durationMs))
    .slice(0, limit)
    .map((entry) => {
      const label = entry[key] ?? entry.step ?? entry.phase ?? entry.nodeId ?? entry.name ?? null;
      return {
        ...(label == null ? {} : { [key]: label }),
        durationMs: entry.durationMs,
        ...(entry.status == null ? {} : { status: entry.status }),
        ...(entry.reason == null ? {} : { reason: entry.reason }),
      };
    });
}

function pickBuildArtifacts(build: JsonRecord | null): JsonRecord {
  if (build == null) return {};
  const keys = ["appPath", "dmgPath", "installerPath", "latestYmlPath", "outputRoot", "payloadPath", "portableZipPath", "zipPath"];
  const artifacts: JsonRecord = {};
  for (const key of keys) {
    const value = build[key];
    if (typeof value === "string" && value.length > 0) artifacts[key] = value;
  }
  const sizeReport = objectOrNull(build.sizeReport);
  if (sizeReport != null) artifacts.sizeReport = sizeReport;
  return artifacts;
}

function cell(value: unknown): string {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

function code(value: unknown): string {
  return `\`${cell(value).replace(/`/g, "'")}\``;
}

function seconds(value: unknown): string {
  return `${(Number(value) / 1000).toFixed(1)}s`;
}

const releaseTarget = required("RELEASE_TARGET");
const reportRoot = resolvePath(required("RELEASE_REPORT_DIR"));
const reportJsonPath = resolvePath(required("RELEASE_REPORT_JSON_PATH"));
const reportSummaryPath = resolvePath(required("RELEASE_REPORT_SUMMARY_PATH"));
const buildJsonPath = optional("BUILD_JSON_PATH");
const buildLogPath = optional("BUILD_LOG_PATH");
const indexPath = optional("INDEX_PATH");
const smokeSummary = readJsonFile(join(reportRoot, "summary.json"));
const suiteResult = readJsonFile(join(reportRoot, "suite-result.json"));
const manifest = readJsonFile(join(reportRoot, "manifest.json"));
const build = buildJsonPath.length > 0 ? readJsonFile(resolvePath(buildJsonPath)) : null;
const index = indexPath.length > 0 ? readJsonFile(resolvePath(indexPath)) : null;
const sourceStatus = optional("REPORT_STATUS", String(index?.status ?? suiteResult?.status ?? "unknown"));
const buildTimings = arrayOrEmpty(build?.timings);
const releaseScriptTimings = arrayOrEmpty(build?.releaseScriptTimings ?? index?.timings);
const smokeTimings = arrayOrEmpty(smokeSummary?.timings);
const cacheReport = objectOrNull(build?.cacheReport);
const cacheEntries = arrayOrEmpty(cacheReport?.entries ?? index?.cache);
const buildSegments = arrayOrEmpty(build?.segments ?? index?.buildSegments);
const totalDurationMs = numberOrNull(index?.durationMs) ?? numberOrNull(suiteResult?.durationMs) ?? null;

const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  channel: optional("RELEASE_CHANNEL", String(index?.channel ?? manifest?.channel ?? "")),
  releaseTarget,
  releaseVersion: optional("RELEASE_VERSION", String(index?.releaseVersion ?? manifest?.releaseVersion ?? "")),
  status: sourceStatus,
  github: {
    branch: optional("RELEASE_BRANCH", String(index?.branch ?? "")),
    commit: optional("RELEASE_COMMIT", String(index?.commit ?? manifest?.commit ?? "")),
    repository: optional("RELEASE_REPOSITORY"),
    runAttempt: Number(optional("RELEASE_RUN_ATTEMPT", "0")),
    runId: Number(optional("RELEASE_RUN_ID", "0")),
    workflow: optional("RELEASE_WORKFLOW"),
  },
  inputs: {
    namespace: optional("RELEASE_NAMESPACE", String(index?.namespace ?? manifest?.namespace ?? "")),
    signed: index?.signed ?? optional("RELEASE_SIGNED"),
    smokeMode: optional("RELEASE_SMOKE_MODE", String(index?.smokeMode ?? "")),
    target: optional("RELEASE_BUILD_TARGET", String(index?.target ?? "")),
  },
  paths: {
    reportRoot,
    ...(buildJsonPath.length === 0 ? {} : { buildJsonPath: resolvePath(buildJsonPath) }),
    ...(buildLogPath.length === 0 ? {} : { buildLogPath: resolvePath(buildLogPath) }),
    ...(indexPath.length === 0 ? {} : { indexPath: resolvePath(indexPath) }),
  },
  timings: {
    totalDurationMs,
    releaseScript: releaseScriptTimings,
    build: buildTimings,
    smoke: smokeTimings,
    slowest: {
      releaseScript: topDurations(releaseScriptTimings, "step", 12),
      build: topDurations(buildTimings, "phase", 12),
      smoke: topDurations(smokeTimings, "step", 16),
      cache: topDurations(cacheEntries, "nodeId", 12),
      buildSegments: topDurations(buildSegments, "phase", 12),
    },
  },
  build: {
    artifacts: pickBuildArtifacts(build),
    cache: cacheReport ?? (cacheEntries.length > 0 ? { entries: cacheEntries } : null),
    segments: buildSegments,
  },
  reportFiles: listFiles(reportRoot),
};

mkdirSync(dirname(reportJsonPath), { recursive: true });
writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const lines = [
  `### ${optional("REPORT_TITLE", `${releaseTarget} release report`)}`,
  "",
  `- status: ${code(sourceStatus)}`,
  `- target: ${code(releaseTarget)}`,
  `- version: ${code(report.releaseVersion)}`,
];
if (releaseScriptTimings.length > 0) {
  lines.push("", "| Release script step | Status | Duration |", "| --- | --- | ---: |");
  for (const timing of releaseScriptTimings.map((entry) => objectOrNull(entry)).filter((entry): entry is JsonRecord => entry != null)) {
    lines.push(`| ${code(timing.step)} | ${code(timing.status)} | ${seconds(timing.durationMs)} |`);
  }
}
if (buildTimings.length > 0) {
  lines.push("", "| Build phase | Duration |", "| --- | ---: |");
  for (const timing of buildTimings.map((entry) => objectOrNull(entry)).filter((entry): entry is JsonRecord => entry != null)) {
    lines.push(`| ${code(timing.phase)} | ${seconds(timing.durationMs)} |`);
  }
}
if (cacheEntries.length > 0) {
  lines.push("", "| Cache node | Status | Reason | Duration |", "| --- | --- | --- | ---: |");
  for (const entry of cacheEntries.map((item) => objectOrNull(item)).filter((entry): entry is JsonRecord => entry != null)) {
    lines.push(`| ${code(entry.nodeId)} | ${code(entry.status)} | ${cell(entry.reason)} | ${seconds(entry.durationMs)} |`);
  }
}

mkdirSync(dirname(reportSummaryPath), { recursive: true });
writeFileSync(reportSummaryPath, `${lines.join("\n")}\n`, "utf8");
console.log(`wrote release report ${reportJsonPath}`);
