import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".scss", ".sass"]);
const GENERATED_OR_RUNTIME_SEGMENTS = new Set([
  ".od",
  ".tmp",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
]);

type SourceKind = "ts" | "js" | "style" | "test";

type SourceRecord = {
  repositoryPath: string;
  extension: string;
  lines: number;
  bytes: number;
  kind: SourceKind;
  scope: string;
  resourceLike: boolean;
};

type Bucket = {
  label: string;
  min: number;
  maxExclusive: number | null;
};

type BucketStats = {
  bucket: Bucket;
  files: number;
  lines: number;
  bytes: number;
  nonTestFiles: number;
  testFiles: number;
};

type GroupStats = {
  key: string;
  files: number;
  lines: number;
  bytes: number;
};

type RecommendationAction = "split-now" | "survey-first" | "defer-resource";

type Recommendation = {
  action: RecommendationAction;
  reason: string;
  record: SourceRecord;
};

type OutputFormat = "text" | "markdown" | "json";

type Options = {
  binSize: number;
  format: OutputFormat;
  top: number;
  largeThreshold: number;
};

const defaultOptions: Options = {
  binSize: 5_000,
  format: "text",
  top: 40,
  largeThreshold: 5_000,
};

function usage(): string {
  return [
    "Usage: tsx scripts/source-check.ts [--format text|markdown|json] [--bin-size 5000] [--top 40] [--large-threshold 5000]",
    "",
    "Reports tracked code/style source file sizes. Docs, JSON/YAML data, HTML templates, and runtime output are excluded.",
  ].join("\n");
}

function parsePositiveInteger(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} must be a positive integer, got "${raw}".`);
  }
  return value;
}

function parseArgs(argv: string[]): Options {
  const options = { ...defaultOptions };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--format") {
      const value = argv[i + 1];
      if (value !== "text" && value !== "markdown" && value !== "json") {
        throw new Error("--format must be one of: text, markdown, json.");
      }
      options.format = value;
      i += 1;
      continue;
    }
    if (arg === "--bin-size") {
      const value = argv[i + 1];
      if (value === undefined) throw new Error("--bin-size requires a value.");
      options.binSize = parsePositiveInteger(value, "--bin-size");
      i += 1;
      continue;
    }
    if (arg === "--top") {
      const value = argv[i + 1];
      if (value === undefined) throw new Error("--top requires a value.");
      options.top = parsePositiveInteger(value, "--top");
      i += 1;
      continue;
    }
    if (arg === "--large-threshold") {
      const value = argv[i + 1];
      if (value === undefined) throw new Error("--large-threshold requires a value.");
      options.largeThreshold = parsePositiveInteger(value, "--large-threshold");
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function toRepositoryPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function hasSkippedSegment(repositoryPath: string): boolean {
  return repositoryPath.split("/").some((segment) => GENERATED_OR_RUNTIME_SEGMENTS.has(segment));
}

function isTestSource(repositoryPath: string): boolean {
  return (
    /(^|\/)(tests|__tests__|e2e|test)(\/|$)/.test(repositoryPath)
    || /\.(test|spec)\.[cm]?[jt]sx?$/.test(repositoryPath)
  );
}

function isResourceLike(repositoryPath: string): boolean {
  return (
    /\/i18n\/(locales|types)\.ts$/.test(repositoryPath)
    || /apps\/landing-page\/app\/(i18n|home-page-i18n|info-page-i18n)\.ts$/.test(repositoryPath)
    || /apps\/landing-page\/app\/_lib\/[\w-]*i18n\.ts$/.test(repositoryPath)
    || /remixicon\.css$/.test(repositoryPath)
  );
}

function sourceKind(repositoryPath: string, extension: string): SourceKind {
  if (isTestSource(repositoryPath)) return "test";
  if (extension === ".css" || extension === ".scss" || extension === ".sass") return "style";
  if (extension === ".js" || extension === ".jsx" || extension === ".mjs" || extension === ".cjs") return "js";
  return "ts";
}

function sourceScope(repositoryPath: string): string {
  const parts = repositoryPath.split("/");
  const first = parts[0] ?? "root";
  const second = parts[1];
  return second === undefined ? first : `${first}/${second}`;
}

function lineCount(source: string): number {
  if (source.length === 0) return 0;
  return source.split(/\r?\n/).length;
}

async function gitTrackedFiles(): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["ls-files"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return String(stdout).split("\n").filter(Boolean);
}

async function collectSourceRecords(): Promise<SourceRecord[]> {
  const files = await gitTrackedFiles();
  const records: SourceRecord[] = [];
  for (const repositoryPath of files) {
    if (hasSkippedSegment(repositoryPath)) continue;
    const extension = path.extname(repositoryPath);
    if (!SOURCE_EXTENSIONS.has(extension)) continue;
    const absolutePath = path.join(repoRoot, repositoryPath);
    const [source, fileStat] = await Promise.all([readFile(absolutePath, "utf8"), stat(absolutePath)]);
    records.push({
      repositoryPath,
      extension,
      lines: lineCount(source),
      bytes: fileStat.size,
      kind: sourceKind(repositoryPath, extension),
      scope: sourceScope(repositoryPath),
      resourceLike: isResourceLike(repositoryPath),
    });
  }
  return records.sort((a, b) => a.repositoryPath.localeCompare(b.repositoryPath));
}

function bucketFor(lines: number, binSize: number): Bucket {
  const min = Math.floor(lines / binSize) * binSize;
  const maxExclusive = min + binSize;
  if (min === 0) {
    return {
      label: `<${binSize}`,
      min,
      maxExclusive,
    };
  }
  return {
    label: `${min}-${maxExclusive - 1}`,
    min,
    maxExclusive,
  };
}

function bucketKey(bucket: Bucket): string {
  return `${bucket.min}:${bucket.maxExclusive ?? "up"}`;
}

function bucketStats(records: SourceRecord[], binSize: number): BucketStats[] {
  const byBucket = new Map<string, BucketStats>();
  for (const record of records) {
    const bucket = bucketFor(record.lines, binSize);
    const key = bucketKey(bucket);
    const stats = byBucket.get(key) ?? {
      bucket,
      files: 0,
      lines: 0,
      bytes: 0,
      nonTestFiles: 0,
      testFiles: 0,
    };
    stats.files += 1;
    stats.lines += record.lines;
    stats.bytes += record.bytes;
    if (record.kind === "test") stats.testFiles += 1;
    else stats.nonTestFiles += 1;
    byBucket.set(key, stats);
  }
  return [...byBucket.values()].sort((a, b) => a.bucket.min - b.bucket.min);
}

function groupStats(records: SourceRecord[], getKey: (record: SourceRecord) => string): GroupStats[] {
  const groups = new Map<string, GroupStats>();
  for (const record of records) {
    const key = getKey(record);
    const stats = groups.get(key) ?? { key, files: 0, lines: 0, bytes: 0 };
    stats.files += 1;
    stats.lines += record.lines;
    stats.bytes += record.bytes;
    groups.set(key, stats);
  }
  return [...groups.values()].sort((a, b) => b.lines - a.lines || b.files - a.files || a.key.localeCompare(b.key));
}

function recommendedAction(record: SourceRecord): Recommendation {
  if (record.resourceLike) {
    return {
      action: "defer-resource",
      reason: "size appears driven by locale data, icon CSS, or another mechanical resource surface",
      record,
    };
  }
  if (/^apps\/web\/src\/components\/[^/]+\.tsx$/.test(record.repositoryPath)) {
    return {
      action: "split-now",
      reason: "large React component with likely extractable panels, hooks, or providers and nearby component tests",
      record,
    };
  }
  if (record.repositoryPath === "apps/daemon/src/cli.ts") {
    return {
      action: "split-now",
      reason: "CLI subcommand families usually split cleanly while preserving the shared command map",
      record,
    };
  }
  return {
    action: "survey-first",
    reason: "shared runtime boundary; read ownership, routes, and validation coverage before editing",
    record,
  };
}

function recommendations(records: SourceRecord[], threshold: number): Recommendation[] {
  return records
    .filter((record) => record.kind !== "test" && record.lines >= threshold)
    .map((record) => recommendedAction(record))
    .sort((a, b) => {
      const priority: Record<RecommendationAction, number> = {
        "split-now": 0,
        "survey-first": 1,
        "defer-resource": 2,
      };
      return priority[a.action] - priority[b.action] || b.record.lines - a.record.lines;
    });
}

function number(value: number): string {
  return value.toLocaleString("en-US");
}

function formatText(records: SourceRecord[], options: Options): string {
  const totalLines = records.reduce((sum, record) => sum + record.lines, 0);
  const totalBytes = records.reduce((sum, record) => sum + record.bytes, 0);
  const largeRecords = records.filter((record) => record.lines >= options.largeThreshold);
  const largeNonTest = largeRecords.filter((record) => record.kind !== "test");
  const candidateRecords = largeNonTest.filter((record) => !record.resourceLike);
  const recommended = recommendations(records, options.largeThreshold);
  const lines: string[] = [
    `Source check (${options.binSize} LOC buckets)`,
    `Files: ${number(records.length)}  Lines: ${number(totalLines)}  Bytes: ${number(totalBytes)}`,
    `Large threshold: >=${number(options.largeThreshold)} LOC (${number(largeRecords.length)} files, ${number(largeNonTest.length)} non-test)`,
    "",
    "Buckets:",
  ];
  for (const stats of bucketStats(records, options.binSize)) {
    lines.push(
      `  ${stats.bucket.label.padEnd(12)} files=${String(stats.files).padStart(5)} lines=${number(stats.lines).padStart(9)} non-test=${String(stats.nonTestFiles).padStart(4)} test=${String(stats.testFiles).padStart(4)}`,
    );
  }
  lines.push("", "Large non-test files by scope:");
  for (const stats of groupStats(largeNonTest, (record) => record.scope)) {
    lines.push(`  ${stats.key.padEnd(32)} files=${String(stats.files).padStart(3)} lines=${number(stats.lines).padStart(9)}`);
  }
  lines.push("", `Top ${options.top} raw files:`);
  for (const record of [...records].sort((a, b) => b.lines - a.lines).slice(0, options.top)) {
    const resource = record.resourceLike ? " resource-like" : "";
    lines.push(`  ${String(record.lines).padStart(6)} ${record.kind.padEnd(5)}${resource.padEnd(14)} ${record.repositoryPath}`);
  }
  lines.push("", `Top ${Math.min(options.top, candidateRecords.length)} decomposition candidates (non-test, non-resource-like, >=${number(options.largeThreshold)} LOC):`);
  for (const record of [...candidateRecords].sort((a, b) => b.lines - a.lines).slice(0, options.top)) {
    lines.push(`  ${String(record.lines).padStart(6)} ${record.scope.padEnd(24)} ${record.repositoryPath}`);
  }
  lines.push("", "Recommended actions:");
  for (const item of recommended.slice(0, options.top)) {
    lines.push(
      `  ${item.action.padEnd(15)} ${String(item.record.lines).padStart(6)} ${item.record.repositoryPath} - ${item.reason}`,
    );
  }
  lines.push(
    "",
    "Helper: start with split-now items that have nearby tests. Treat resource-like files as data organization work, not source decomposition. For survey-first items, read the owning AGENTS.md and map route/CLI/UI boundaries before moving code.",
  );
  return lines.join("\n");
}

function markdownTable(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function formatMarkdown(records: SourceRecord[], options: Options): string {
  const totalLines = records.reduce((sum, record) => sum + record.lines, 0);
  const totalBytes = records.reduce((sum, record) => sum + record.bytes, 0);
  const largeRecords = records.filter((record) => record.lines >= options.largeThreshold);
  const largeNonTest = largeRecords.filter((record) => record.kind !== "test");
  const candidateRecords = largeNonTest.filter((record) => !record.resourceLike);
  const recommended = recommendations(records, options.largeThreshold);
  return [
    `# Source Check`,
    "",
    `- Bucket size: ${number(options.binSize)} LOC`,
    `- Files: ${number(records.length)}`,
    `- Lines: ${number(totalLines)}`,
    `- Bytes: ${number(totalBytes)}`,
    `- Large threshold: >=${number(options.largeThreshold)} LOC (${number(largeRecords.length)} files, ${number(largeNonTest.length)} non-test)`,
    "",
    "## Buckets",
    "",
    markdownTable(
      ["Bucket", "Files", "Lines", "Non-test", "Test"],
      bucketStats(records, options.binSize).map((stats) => [
        stats.bucket.label,
        number(stats.files),
        number(stats.lines),
        number(stats.nonTestFiles),
        number(stats.testFiles),
      ]),
    ),
    "",
    "## Large Non-test Files By Scope",
    "",
    markdownTable(
      ["Scope", "Files", "Lines"],
      groupStats(largeNonTest, (record) => record.scope).map((stats) => [stats.key, number(stats.files), number(stats.lines)]),
    ),
    "",
    `## Top ${options.top} Raw Files`,
    "",
    markdownTable(
      ["LOC", "Kind", "File"],
      [...records].sort((a, b) => b.lines - a.lines).slice(0, options.top).map((record) => [
        number(record.lines),
        `${record.kind}${record.resourceLike ? " / resource-like" : ""}`,
        `\`${record.repositoryPath}\``,
      ]),
    ),
    "",
    `## Decomposition Candidates`,
    "",
    markdownTable(
      ["LOC", "Scope", "File"],
      [...candidateRecords].sort((a, b) => b.lines - a.lines).slice(0, options.top).map((record) => [
        number(record.lines),
        record.scope,
        `\`${record.repositoryPath}\``,
      ]),
    ),
    "",
    "## Recommended Actions",
    "",
    markdownTable(
      ["Action", "LOC", "File", "Reason"],
      recommended.slice(0, options.top).map((item) => [
        `\`${item.action}\``,
        number(item.record.lines),
        `\`${item.record.repositoryPath}\``,
        item.reason,
      ]),
    ),
    "",
    "Helper: start with `split-now` items that have nearby tests. Treat resource-like files as data organization work, not source decomposition. For `survey-first` items, read the owning `AGENTS.md` and map route/CLI/UI boundaries before moving code.",
  ].join("\n");
}

function formatJson(records: SourceRecord[], options: Options): string {
  const largeRecords = records.filter((record) => record.lines >= options.largeThreshold);
  const largeNonTest = largeRecords.filter((record) => record.kind !== "test");
  return JSON.stringify(
    {
      options,
      summary: {
        files: records.length,
        lines: records.reduce((sum, record) => sum + record.lines, 0),
        bytes: records.reduce((sum, record) => sum + record.bytes, 0),
        largeFiles: largeRecords.length,
        largeNonTestFiles: largeNonTest.length,
      },
      buckets: bucketStats(records, options.binSize),
      largeNonTestByScope: groupStats(largeNonTest, (record) => record.scope),
      recommendations: recommendations(records, options.largeThreshold),
      top: [...records].sort((a, b) => b.lines - a.lines).slice(0, options.top),
    },
    null,
    2,
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const records = await collectSourceRecords();
  if (options.format === "json") {
    console.log(formatJson(records, options));
  } else if (options.format === "markdown") {
    console.log(formatMarkdown(records, options));
  } else {
    console.log(formatText(records, options));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
