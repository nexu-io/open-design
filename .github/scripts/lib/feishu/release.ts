import type { FeishuCard } from "./client.ts";
import {
  loadReleaseRunContext,
  loadReleaseRunFailures,
  loadReleaseChangelog,
  type ReleaseRunContext,
  type ReleaseRunFailure,
} from "../http.ts";

type JsonRecord = Record<string, unknown>;
type FeishuElement = Record<string, unknown>;
const EXACT_RELEASE_NAME_PATTERN = /^[a-z0-9]{1,12}$/;

export function isNotificationReleaseChannel(value: unknown): value is string {
  return typeof value === "string"
    && (value === "stable" || value === "prerelease" || EXACT_RELEASE_NAME_PATTERN.test(value));
}

function releaseChannelDisplayLabel(channel: string): string {
  if (channel === "stable") return "Stable";
  if (channel === "prerelease") return "Prerelease";
  if (!EXACT_RELEASE_NAME_PATTERN.test(channel)) throw new Error(`unsupported release notification channel: ${channel}`);
  return channel[0]!.toUpperCase() + channel.slice(1);
}

export type ReleaseNotificationInput = {
  activationCompletedAt: string;
  actor: string;
  branch: string;
  channel: string;
  commit: string;
  eventName: string;
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
  runAttempt: string;
  runNumber: string;
  runUrl: string;
  stream: string;
  version: string;
  winX64Smoke: string;
  winX64Url: string;
  triggeringActor: string;
  workflowName: string;
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
  changelog: string[];
  coldStarts: ColdStartDetail[];
  execution: ReleaseRunContext | null;
  failures: ReleaseRunFailure[];
  warnings: string[];
};

function record(value: unknown): JsonRecord | null {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_[\]])/gu, "\\$1");
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function notificationState(input: ReleaseNotificationInput): "candidate" | "failed" | "partial" | "published" | "promoted" | "validation" {
  if (input.releaseResult !== "success") return "failed";
  if (input.releaseState === "partial") return "partial";
  if (input.releaseMode === "candidate") return "candidate";
  if (["metadata", "prepublish", "validation", "false"].includes(input.releaseMode)) return "validation";
  if (input.version.length === 0 || input.metadataUrl.length === 0) return "validation";
  return input.releaseMode === "promote" ? "promoted" : "published";
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
  let execution: ReleaseRunContext | null = null;
  let changelog: string[] = [];
  try {
    [execution, changelog] = await Promise.all([
      loadReleaseRunContext({
        fetchImpl,
        repository: input.repository,
        runUrl: input.runUrl,
        token: githubToken,
      }),
      loadReleaseChangelog({
        commit: input.commit,
        fetchImpl,
        previousCommit: input.previousCommit,
        repository: input.repository,
        token: githubToken,
      }),
    ]);
  } catch {
    // Execution metadata is presentational. A GitHub API outage must not turn a
    // successful release card into a warning or change the release outcome.
  }
  if (!["failed", "partial"].includes(state) && !smokeFailed) {
    return { changelog, coldStarts: [], execution, failures: [], warnings: [] };
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
      if (input.channel !== "stable" && input.channel !== "prerelease") {
        await Promise.all(coldStarts.map(async (entry) => {
          const timing = await acceptanceTiming(input.metadataUrl, entry.target, fetchImpl);
          if (timing != null) entry.timing = timing;
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
  return { changelog, coldStarts, execution, failures, warnings };
}

function bytes(value: number): string {
  return `${(value / 1_000_000).toFixed(2)} MB`;
}

function seconds(value: number): string {
  return `${(value / 1_000).toFixed(1)}s`;
}

function duration(value: number): string {
  const totalSeconds = Math.max(0, Math.round(value / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours > 0 ? `${hours}h` : "", minutes > 0 ? `${minutes}m` : "", `${seconds}s`]
    .filter(Boolean)
    .join(" ");
}

function actorMarkdown(actor: string): string {
  const escaped = escapeMarkdown(actor);
  return actor.length > 0
    ? `[@${escaped}](https://github.com/${encodeURIComponent(actor)})`
    : "未知";
}

function commitMarkdown(input: ReleaseNotificationInput): string {
  const shortCommit = input.commit.slice(0, 7);
  if (shortCommit.length === 0) return "";
  return input.repository.length > 0
    ? `[${shortCommit}](https://github.com/${input.repository}/commit/${input.commit})`
    : shortCommit;
}

function executionTimingMarkdown(input: ReleaseNotificationInput, execution: ReleaseRunContext | null): string {
  if (execution == null) return "";
  const activationMs = Date.parse(input.activationCompletedAt);
  const hasActivation = Number.isFinite(activationMs)
    && activationMs >= execution.runStartedAtMs
    && activationMs <= execution.observedAtMs;
  const releaseMs = hasActivation ? activationMs - execution.runStartedAtMs : execution.durationMs;
  const notificationMs = hasActivation ? execution.observedAtMs - activationMs : 0;
  return [
    `发布 ${duration(releaseMs)}`,
    hasActivation ? `通知 ${duration(notificationMs)}` : "",
    execution.queueDurationMs > 0 ? `排队 ${duration(execution.queueDurationMs)}` : "",
  ].filter(Boolean).join(" · ");
}

function triggerLabel(eventName: string): string {
  return {
    push: "Push",
    repository_dispatch: "外部调度",
    schedule: "定时",
    workflow_call: "复用工作流",
    workflow_dispatch: "手动",
    workflow_run: "上游工作流",
  }[eventName] ?? (eventName.length > 0 ? eventName : "未知");
}

function releaseModeLabel(mode: string): string {
  if (mode === "candidate") return "publish=false · 公开候选 / 无 latest 入口";
  if (["false", "metadata", "prepublish", "validation"].includes(mode)) return "publish=false · 内部验证";
  if (mode === "promote") return "publish=true · 晋升 latest";
  return "publish=true · 不晋升";
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
  const channelLabel = releaseChannelDisplayLabel(input.channel);
  const smokeFailures = [
    ["macOS arm64", input.macArm64Smoke],
    ["macOS x64", input.macX64Smoke],
    ["Windows x64", input.winX64Smoke],
  ].filter(([, result]) => result === "failure").map(([label]) => `${label} smoke 失败`);
  const warning = state === "partial" || smokeFailures.length > 0 || details.warnings.length > 0;
  const icon = state === "failed" ? "🚨" : state === "validation" ? "🧪" : state === "candidate" ? "📦" : warning ? "⚠️" : "🚀";
  const stateLabel = {
    candidate: warning ? "候选就绪（有告警）" : "候选就绪 · 公开下载 / 无 latest 入口",
    failed: "发布失败",
    partial: "部分完成",
    promoted: warning ? "发布并晋升完成（有告警）" : "发布并晋升完成",
    published: warning ? "不可变发布完成（有告警）" : "不可变发布完成 · 未晋升",
    validation: "验证完成",
  }[state];
  const fields: FeishuElement[] = [];
  const rerunActor = input.triggeringActor.length > 0 && input.triggeringActor !== input.actor
    ? ` · 重跑 ${actorMarkdown(input.triggeringActor)}`
    : "";
  const source = [escapeMarkdown(input.branch), commitMarkdown(input)].filter(Boolean).join(" · ");
  fields.push({
    is_short: false,
    text: {
      tag: "lark_md",
      content: `**触发** · ${actorMarkdown(input.actor)}${rerunActor} · ${escapeMarkdown(triggerLabel(input.eventName))}`
        + (source.length > 0 ? ` · ${source}` : ""),
    },
  });
  fields.push({
    is_short: false,
    text: { tag: "lark_md", content: `**模式** · ${releaseModeLabel(input.releaseMode)}` },
  });
  if (input.runNumber.length > 0) {
    const attempt = Number.parseInt(input.runAttempt, 10);
    const attemptLabel = Number.isSafeInteger(attempt) && attempt > 1 ? ` · 第 ${attempt} 次执行` : "";
    const runLabel = `${input.workflowName || "Workflow"} #${input.runNumber}${attemptLabel}`;
    fields.push({
      is_short: false,
      text: {
        tag: "lark_md",
        content: `**执行** · ${input.runUrl.length > 0
          ? `[${escapeMarkdown(runLabel)}](${input.runUrl})`
          : escapeMarkdown(runLabel)}`
          + (details.execution?.pullRequest != null
            ? ` · [PR #${details.execution.pullRequest.number}](${details.execution.pullRequest.url})`
            : "")
          + (details.execution != null
            ? ` · ${executionTimingMarkdown(input, details.execution)}`
            : ""),
      },
    });
  }
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
  if (details.changelog.length > 0) elements.push({
    tag: "div",
    text: {
      tag: "lark_md",
      content: `**变更**\n${changelogMarkdown(details.changelog, input.repository)}`,
    },
  });
  const downloads = ([
    ["Mac Arm", input.macArm64Url],
    ["Mac x64", input.macX64Url],
    ["Win x64", input.winX64Url],
  ] satisfies Array<[string, string]>).filter(([, url]) => url.length > 0);
  if (downloads.length > 0 && state !== "failed") elements.push({
    tag: "action",
    actions: downloads.map(([label, url], index) => ({
      tag: "button",
      text: { tag: "plain_text", content: state === "candidate" ? `候选 · ${label}` : label },
      type: index === 0 ? "primary" : "default",
      url,
    })),
  });
  if (state === "candidate" && input.repository.length > 0) {
    const workflow = input.channel === "stable"
      ? "release-stable-promote.yml"
      : "distribution-exact-accept.yml";
    elements.push({
      tag: "action",
      actions: [{
        tag: "button",
        text: { tag: "plain_text", content: "发布 / 晋升候选" },
        type: "primary",
        url: `https://github.com/${input.repository}/actions/workflows/${workflow}`,
      }],
    });
  }
  const links = [
    input.metadataUrl.length > 0 ? `[${state === "candidate" ? "候选清单" : "发布详情"}](${input.metadataUrl})` : "",
    input.runUrl.length > 0 ? `[GitHub Actions](${input.runUrl})` : "",
  ].filter(Boolean);
  if (links.length > 0) elements.push({
    tag: "note",
    elements: [{ tag: "lark_md", content: links.join(" · ") }],
  });
  return {
    config: { wide_screen_mode: true },
    header: {
      template: state === "failed" ? "red" : warning ? "orange" : state === "published" || state === "promoted" ? "green" : "blue",
      title: {
        tag: "plain_text",
        content: `${icon} ${channelLabel} ${input.version || "(未生成版本)"} ${stateLabel}`,
      },
    },
    elements,
  };
}

export const releaseNotificationInternals = { coldStartFromMetadata, notificationState };
