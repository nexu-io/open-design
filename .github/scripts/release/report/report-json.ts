import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

type JsonRecord = Record<string, unknown>;

function optional(name: string, fallback = ""): string {
  const value = process.env[name];
  return value == null || value.length === 0 ? fallback : value;
}

function readJsonFile(path: string): JsonRecord | null {
  if (!existsSync(path) || !statSync(path).isFile()) return null;
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")) as JsonRecord;
}

function resolvePath(value: string): string {
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
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

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function objectOrNull(value: unknown): JsonRecord | null {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickBuildArtifacts(build: JsonRecord | null): JsonRecord {
  if (build == null) return {};
  const keys = [
    "appPath",
    "dmgPath",
    "installerPath",
    "latestYmlPath",
    "outputRoot",
    "portableZipPath",
    "zipPath",
  ];
  const artifacts: JsonRecord = {};
  for (const key of keys) {
    const value = build[key];
    if (typeof value === "string" && value.length > 0) {
      artifacts[key] = value;
    }
  }
  const sizeReport = objectOrNull(build.sizeReport);
  if (sizeReport != null) {
    artifacts.sizeReport = sizeReport;
  }
  return artifacts;
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

const platform = optional("REPORT_PLATFORM", optional("RELEASE_PLATFORM", "unknown"));
const runnerTemp = optional("RUNNER_TEMP", ".");
const reportRoot = resolvePath(optional("REPORT_ROOT", join(runnerTemp, "release-report", platform)));
const reportJsonPath = resolvePath(optional("REPORT_JSON_PATH", join(reportRoot, "report.json")));
const buildJsonPath = optional("BUILD_JSON_PATH");
const buildLogPath = optional("BUILD_LOG_PATH");
const indexPath = optional("INDEX_PATH");
const smokeSummary = readJsonFile(join(reportRoot, "summary.json"));
const suiteResult = readJsonFile(join(reportRoot, "suite-result.json"));
const manifest = readJsonFile(join(reportRoot, "manifest.json"));
const build = buildJsonPath.length > 0 ? readJsonFile(resolvePath(buildJsonPath)) : readJsonFile(join(reportRoot, "tools-pack.json"));
const index = indexPath.length > 0 ? readJsonFile(resolvePath(indexPath)) : null;
const sourceStatus = optional("REPORT_STATUS", String(index?.status ?? suiteResult?.status ?? "unknown"));
const buildTimings = arrayOrEmpty(build?.timings);
const releaseScriptTimings = arrayOrEmpty(build?.releaseScriptTimings ?? index?.timings);
const smokeTimings = arrayOrEmpty(smokeSummary?.timings);
const cacheReport = objectOrNull(build?.cacheReport);
const cacheEntries = arrayOrEmpty(cacheReport?.entries ?? index?.cache);
const buildSegments = arrayOrEmpty(build?.segments ?? index?.buildSegments);
const totalDurationMs = numberOrNull(index?.durationMs)
  ?? numberOrNull(suiteResult?.durationMs)
  ?? null;

mkdirSync(dirname(reportJsonPath), { recursive: true });

const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  channel: optional("RELEASE_CHANNEL", String(index?.channel ?? manifest?.channel ?? "")),
  platform,
  releaseVersion: optional("RELEASE_VERSION", String(index?.releaseVersion ?? manifest?.releaseVersion ?? "")),
  status: sourceStatus,
  github: {
    branch: optional("GITHUB_REF_NAME", String(index?.branch ?? "")),
    commit: optional("GITHUB_SHA", String(index?.commit ?? manifest?.commit ?? "")),
    repository: optional("GITHUB_REPOSITORY"),
    runAttempt: Number(optional("GITHUB_RUN_ATTEMPT", "0")),
    runId: Number(optional("GITHUB_RUN_ID", "0")),
    workflow: optional("GITHUB_WORKFLOW"),
  },
  inputs: {
    namespace: optional("REPORT_NAMESPACE", String(index?.namespace ?? manifest?.namespace ?? "")),
    signed: index?.signed ?? optional("RELEASE_SIGNED"),
    signingRequested: index?.signingRequested ?? optional("REPORT_SIGNING_REQUESTED"),
    smokeMode: optional("REPORT_SMOKE_MODE", String(index?.smokeMode ?? "")),
    target: optional("REPORT_TARGET", String(index?.target ?? "")),
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
  smoke: {
    manifest,
    summary: smokeSummary,
    suiteResult,
  },
  files: listFiles(reportRoot).filter((file) => file.path !== normalizePath(relative(reportRoot, reportJsonPath))),
  fileName: basename(reportJsonPath),
};

writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`wrote release report json: ${reportJsonPath}`);
