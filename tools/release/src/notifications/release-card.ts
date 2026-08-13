import { readFileSync } from "node:fs";

import type { FeishuCard } from "./feishu-client.ts";
import { loadReleaseRunFailures, type ReleaseRunFailure } from "./run-diagnostics.ts";

type JsonRecord = Record<string, unknown>;
type FeishuElement = Record<string, unknown>;

export type ReleaseNotificationInput = {
  branch: string;
  channel: "beta" | "preview" | "prerelease" | "stable";
  changelogFile: string;
  commit: string;
  macArm64Smoke: string;
  macArm64Url: string;
  macX64Smoke: string;
  macX64Url: string;
  metadataUrl: string;
  previousCommit: string;
  releaseMode: string;
  releaseResult: string;
  releaseState: string;
  repository: string;
  runUrl: string;
  stream: string;
  version: string;
  winX64Smoke: string;
  winX64Url: string;
};

type ColdStartDetail = {
  bodyBytes: number;
  budgetBytes: number;
  launcherBytes: number;
  nativeBytes: number;
  requiredBytes: number;
  target: string;
  timing?: {
    readinessBudgetMs: number;
    readinessDurationMs: number;
    totalDurationMs: number;
  };
};

export type ReleaseNotificationDetails = {
  coldStarts: ColdStartDetail[];
  failures: ReleaseRunFailure[];
  warnings: string[];
};

const channelProfiles = {
  beta: { label: "Beta" },
  preview: { label: "Preview" },
  prerelease: { label: "Prerelease" },
  stable: { label: "Stable" },
} as const;

function record(value: unknown): JsonRecord | null {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function readChangelog(path: string): string[] {
  if (path.length === 0) return [];
  try {
    return readFileSync(path, "utf8").split("\n").map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_[\]])/gu, "\\$1");
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function notificationState(input: ReleaseNotificationInput): "complete" | "failed" | "partial" | "validation" {
  if (input.releaseResult !== "success") return "failed";
  if (input.releaseState === "partial") return "partial";
  if (["metadata", "prepublish", "validation", "false"].includes(input.releaseMode)) return "validation";
  return input.version.length > 0 && input.metadataUrl.length > 0 ? "complete" : "validation";
}

function coldStartFromMetadata(metadata: JsonRecord): ColdStartDetail[] {
  const closure = record(metadata.closure);
  const required = record(closure?.required);
  const targets = record(required?.targets);
  const blobs = record(closure?.blobs);
  const body = record(required?.body);
  const launcher = record(required?.launcher);
  if (targets == null || blobs == null || body == null || launcher == null) return [];
  const component = (value: JsonRecord | null): { digest: string; bytes: number } | null => {
    const digest = typeof value?.blob === "string" ? value.blob : "";
    const artifact = record(blobs[digest]);
    const bytes = positiveInteger(artifact?.size);
    return digest.length > 0 && bytes != null ? { bytes, digest } : null;
  };
  const commonBody = component(body);
  const commonLauncher = component(launcher);
  if (commonBody == null || commonLauncher == null) return [];
  return Object.entries(targets).flatMap(([target, targetValue]) => {
    const native = component(record(record(targetValue)?.native));
    if (native == null) return [];
    const unique = new Map([
      [commonBody.digest, commonBody.bytes],
      [commonLauncher.digest, commonLauncher.bytes],
      [native.digest, native.bytes],
    ]);
    return [{
      bodyBytes: commonBody.bytes,
      budgetBytes: 30_000_000,
      launcherBytes: commonLauncher.bytes,
      nativeBytes: native.bytes,
      requiredBytes: [...unique.values()].reduce((total, bytes) => total + bytes, 0),
      target,
    }];
  });
}

async function acceptanceTiming(metadataUrl: string, target: string, fetchImpl: typeof fetch) {
  const acceptanceUrl = new URL(`acceptance/${target.replace("darwin-arm64", "mac_arm64").replace("darwin-x64", "mac_x64").replace("win32-x64", "win_x64")}.json`, metadataUrl);
  const response = await fetchImpl(acceptanceUrl);
  if (!response.ok) return undefined;
  const credential = record(await response.json());
  const timing = record(record(credential?.coldStart)?.timing);
  const readinessBudgetMs = positiveInteger(timing?.readinessBudgetMs);
  const readinessDurationMs = positiveInteger(timing?.readinessDurationMs);
  const totalDurationMs = positiveInteger(timing?.totalDurationMs);
  return readinessBudgetMs == null || readinessDurationMs == null || totalDurationMs == null
    ? undefined
    : { readinessBudgetMs, readinessDurationMs, totalDurationMs };
}

export async function loadReleaseNotificationDetails(
  input: ReleaseNotificationInput,
  fetchImpl: typeof fetch = fetch,
  githubToken = "",
): Promise<ReleaseNotificationDetails> {
  const state = notificationState(input);
  const smokeFailed = [input.macArm64Smoke, input.macX64Smoke, input.winX64Smoke].includes("failure");
  if (!["failed", "partial"].includes(state) && !smokeFailed) {
    return { coldStarts: [], failures: [], warnings: [] };
  }
  const warnings: string[] = [];
  let coldStarts: ColdStartDetail[] = [];
  let failures: ReleaseRunFailure[] = [];
  if (input.metadataUrl.length > 0) {
    try {
      const response = await fetchImpl(input.metadataUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const metadata = record(await response.json());
      if (metadata == null) throw new Error("metadata is not an object");
      coldStarts = coldStartFromMetadata(metadata);
      if (input.channel === "beta") {
        await Promise.all(coldStarts.map(async (entry) => {
          entry.timing = await acceptanceTiming(input.metadataUrl, entry.target, fetchImpl);
        }));
      }
    } catch (error) {
      warnings.push(`未能读取发布元数据：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (state === "failed") {
    try {
      failures = await loadReleaseRunFailures({
        fetchImpl,
        repository: input.repository,
        runUrl: input.runUrl,
        token: githubToken,
      });
    } catch (error) {
      warnings.push(`未能读取失败步骤：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { coldStarts, failures, warnings };
}

function bytes(value: number): string {
  return `${(value / 1_000_000).toFixed(2)} MB`;
}

function seconds(value: number): string {
  return `${(value / 1_000).toFixed(1)}s`;
}

function targetLabel(target: string): string {
  return {
    "darwin-arm64": "Apple 芯片",
    "darwin-x64": "Intel",
    "win32-x64": "Windows",
  }[target] ?? target;
}

function coldStartMarkdown(details: ReleaseNotificationDetails): string {
  return details.coldStarts.map((entry) => {
    const timing = entry.timing == null
      ? ""
      : `\n启动 ${seconds(entry.timing.totalDurationMs - entry.timing.readinessDurationMs)}`
        + ` · 就绪 ${seconds(entry.timing.readinessDurationMs)}/${seconds(entry.timing.readinessBudgetMs)}`
        + ` · 总计 ${seconds(entry.timing.totalDurationMs)}`;
    return `**${targetLabel(entry.target)}** · ${bytes(entry.requiredBytes)} / ${bytes(entry.budgetBytes)}`
      + `\nbody ${bytes(entry.bodyBytes)} · launcher ${bytes(entry.launcherBytes)} · native ${bytes(entry.nativeBytes)}`
      + timing;
  }).join("\n\n");
}

function failureMarkdown(details: ReleaseNotificationDetails): string {
  return details.failures.map((failure) => {
    const label = truncate(
      failure.step.length > 0 ? `${failure.job} · ${failure.step}` : failure.job,
      100,
    );
    return failure.url.length > 0
      ? `- [${escapeMarkdown(label)}](${failure.url})`
      : `- ${escapeMarkdown(label)}`;
  }).join("\n");
}

function changelogMarkdown(lines: string[], repository: string): string {
  return lines.slice(0, 5).map((line) => {
    const match = line.match(/^(.*) \(([0-9a-f]{7,40})\)$/u);
    const subject = truncate(match?.[1]?.trim() || line, 90);
    const commit = match?.[2] ?? "";
    const suffix = commit.length === 0
      ? ""
      : repository.length > 0
        ? ` · [${commit.slice(0, 7)}](https://github.com/${repository}/commit/${commit})`
        : ` · ${commit.slice(0, 7)}`;
    return `- ${escapeMarkdown(subject)}${suffix}`;
  }).join("\n");
}

export function buildReleaseFeishuCard(
  input: ReleaseNotificationInput,
  details: ReleaseNotificationDetails,
): FeishuCard {
  const state = notificationState(input);
  const profile = channelProfiles[input.channel];
  const smokeFailures = [
    ["macOS arm64", input.macArm64Smoke],
    ["macOS x64", input.macX64Smoke],
    ["Windows x64", input.winX64Smoke],
  ].filter(([, result]) => result === "failure").map(([label]) => `${label} smoke 失败`);
  const warning = state === "partial" || smokeFailures.length > 0 || details.warnings.length > 0;
  const icon = state === "failed" ? "🚨" : state === "validation" ? "🧪" : warning ? "⚠️" : "🚀";
  const stateLabel = {
    complete: warning ? "发布完成（有告警）" : "发布完成",
    failed: "发布失败",
    partial: "部分完成",
    validation: "验证完成",
  }[state];
  const shortCommit = input.commit.slice(0, 7);
  const fields: FeishuElement[] = [];
  if (input.branch.length > 0) fields.push({
    is_short: true,
    text: { tag: "lark_md", content: `**分支**\n${escapeMarkdown(input.branch)}` },
  });
  if (shortCommit.length > 0) fields.push({
    is_short: true,
    text: {
      tag: "lark_md",
      content: input.repository.length > 0
        ? `**提交**\n[${shortCommit}](https://github.com/${input.repository}/commit/${input.commit})`
        : `**提交**\n${shortCommit}`,
    },
  });
  const elements: FeishuElement[] = fields.length > 0
    ? [{ tag: "div", fields }, { tag: "hr" }]
    : [];
  const notices = [...smokeFailures, ...details.warnings];
  if (details.failures.length > 0) elements.push({
    tag: "div",
    text: { tag: "lark_md", content: `**失败位置**\n${failureMarkdown(details)}` },
  });
  if (notices.length > 0) elements.push({
    tag: "div",
    text: {
      tag: "lark_md",
      content: `**告警**\n${notices.map((line) => `- ${escapeMarkdown(line)}`).join("\n")}`,
    },
  });
  if (details.coldStarts.length > 0) elements.push({ tag: "div", text: { tag: "lark_md", content: `**Closure 冷启动**\n${coldStartMarkdown(details)}` } });
  const changelog = readChangelog(input.changelogFile);
  if (changelog.length > 0) elements.push({
    tag: "div",
    text: {
      tag: "lark_md",
      content: `**变更**\n${changelogMarkdown(changelog, input.repository)}`,
    },
  });
  const downloads = [
    ["Apple 芯片", input.macArm64Url],
    ["Intel", input.macX64Url],
    ["Windows", input.winX64Url],
  ].filter(([, url]) => url.length > 0);
  if (downloads.length > 0 && state !== "failed") elements.push({
    tag: "action",
    actions: downloads.map(([label, url], index) => ({
      tag: "button",
      text: { tag: "plain_text", content: label },
      type: index === 0 ? "primary" : "default",
      url,
    })),
  });
  const links = [
    input.metadataUrl.length > 0 ? `[发布详情](${input.metadataUrl})` : "",
    input.runUrl.length > 0 ? `[GitHub Actions](${input.runUrl})` : "",
  ].filter(Boolean);
  if (links.length > 0) elements.push({
    tag: "note",
    elements: [{ tag: "lark_md", content: links.join(" · ") }],
  });
  return {
    config: { wide_screen_mode: true },
    header: {
      template: state === "failed" ? "red" : warning ? "orange" : state === "complete" ? "green" : "blue",
      title: {
        tag: "plain_text",
        content: `${icon} ${profile.label} ${input.version || "(未生成版本)"} ${stateLabel}`,
      },
    },
    elements,
  };
}

export const releaseNotificationInternals = { coldStartFromMetadata, notificationState };
