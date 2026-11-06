// Pure rendering for the progressive prerelease Feishu card.
//
// One card tracks one prerelease from "the pipeline started" to "every lane has
// reported". Because a Feishu PATCH replaces the whole card, rendering has to be
// a total function of the state — no incremental edits, no memory of what the
// previous card said. Everything in this module is pure so the state machine can
// be tested without a network, `now` included: the card carries live durations,
// and a module that read the clock itself could not be asserted on.
//
// The single-writer rule lives at the workflow layer: exactly one job
// (release-prerelease-card.yml) owns the message. Three build jobs racing to
// PATCH the same card would each overwrite the other two's rows, because each
// only knows its own.

export type LaneStatus =
  | "pending"
  | "running"
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  /**
   * Expected, and never dispatched. Distinct from `pending` (a result is still
   * coming) and from `skipped` (a switch said not to run it): this lane should
   * have run, nothing will ever report on it, and somebody has to look.
   */
  | "never_started"
  | "unknown";

export type PlatformKey = "mac_arm64" | "mac_x64" | "win_x64" | "linux_x64";

/**
 * When a lane's job started and stopped, in epoch milliseconds.
 *
 * Straight off the GitHub jobs API the watcher already polls, so the card pays
 * nothing extra for it. Both fields are nullable and neither may be trusted on
 * its own — see `laneDurationText` for why the lane's STATUS, not the presence
 * of a timestamp, decides whether a duration is shown.
 */
export type LaneTiming = {
  startedAt: number | null;
  completedAt: number | null;
};

export type PlatformLane = {
  key: PlatformKey;
  label: string;
  /** Outcome of the build job that produces and publishes this platform. */
  build: LaneStatus;
  /** Public R2 download URL; empty until the platform is published. */
  downloadUrl: string;
  /** Packaged smoke outcome for this platform. `skipped` when not requested. */
  smoke: LaneStatus;
  /** Wall clock of this platform's build job. */
  timing: LaneTiming;
};

export type TestLane = {
  key: string;
  label: string;
  status: LaneStatus;
};

export type Changelog = {
  lines: string[];
  total: number;
  truncated: boolean;
};

export type PrereleaseCardState = {
  channelLabel: string;
  version: string;
  branch: string;
  commit: string;
  previousCommit: string;
  repo: string;
  originRunUrl: string;
  testsRunUrl: string;
  smokeRunUrl: string;
  changelog: Changelog;
  platforms: PlatformLane[];
  tests: TestLane[];
  expectTests: boolean;
  expectSmoke: boolean;
  /** Everything the card waits on has reported. */
  finished: boolean;
  /** The watcher hit its wall clock before everything reported. */
  timedOut: boolean;
  /** The moment this render describes, in epoch milliseconds. */
  now: number;
  /** When the origin run was created; null while the watcher has not read it. */
  runCreatedAt: number | null;
  /** When the publish job stopped; null while the pipeline is still going. */
  publishCompletedAt: number | null;
};

export type FeishuCard = Record<string, unknown>;
type FeishuElement = Record<string, unknown>;

export const PLATFORM_LABELS: Record<PlatformKey, string> = {
  mac_arm64: "macOS (Apple Silicon)",
  mac_x64: "macOS (Intel)",
  win_x64: "Windows",
  linux_x64: "Linux",
};

/** Display order for platform rows and download buttons. */
export const PLATFORM_ORDER: PlatformKey[] = ["mac_arm64", "mac_x64", "win_x64", "linux_x64"];

const MAX_CHANGELOG_LINES = 30;

const STATUS_GLYPH: Record<LaneStatus, string> = {
  pending: "⏳",
  running: "⏳",
  success: "✅",
  failure: "❌",
  cancelled: "⚠️",
  skipped: "⚪️",
  never_started: "🚨",
  unknown: "⏳",
};

const BUILD_STATUS_TEXT: Record<LaneStatus, string> = {
  pending: "排队中",
  running: "构建中",
  success: "已发布",
  failure: "构建失败",
  cancelled: "已取消",
  skipped: "本次未构建",
  never_started: "未触发",
  unknown: "状态未知",
};

const CHECK_STATUS_TEXT: Record<LaneStatus, string> = {
  pending: "排队中",
  running: "运行中",
  success: "通过",
  failure: "未通过",
  cancelled: "已取消",
  skipped: "未运行",
  never_started: "未触发（应运行，但没有被调起）",
  unknown: "状态未知",
};

export function isTerminal(status: LaneStatus): boolean {
  return (
    status === "success" ||
    status === "failure" ||
    status === "cancelled" ||
    status === "skipped" ||
    status === "never_started"
  );
}

/**
 * What the card has learned about a lane it expected but has found no job for.
 *
 * `runFound` — a workflow run carrying this origin's marker exists.
 * `runCompleted` — that run has finished, which is the only thing that proves a
 *   job is genuinely absent rather than not yet created by the API.
 * `discoveryExpired` — the dispatch window closed without a run ever appearing.
 */
export type LaneDiscovery = {
  runFound: boolean;
  runCompleted: boolean;
  discoveryExpired: boolean;
};

/**
 * Status for an expected lane the card has found no job for.
 *
 * The invariant: the same discovery window that lets the watcher stop waiting
 * on a lane must also change what that lane SAYS. A lane whose run never
 * appeared before that window closed was never dispatched, so "排队中" promises
 * a result that can never arrive — worse than saying nothing, because a reader
 * waits for it.
 */
export function undiscoveredLaneStatus(discovery: LaneDiscovery): LaneStatus {
  if (discovery.runCompleted) return "skipped";
  if (discovery.runFound) return "pending";
  return discovery.discoveryExpired ? "never_started" : "pending";
}

/** A lane that a human has to look at. `skipped` is a decision, not a problem. */
export function isBadNews(status: LaneStatus): boolean {
  return status === "failure" || status === "cancelled";
}

/**
 * Every platform this release owed a result on has reported, and not one of
 * them produced a package.
 *
 * This is the card's only "the release is dead" verdict, and it has to be the
 * strong form. The card is posted the moment the watcher starts, so "nothing
 * has shipped" is now the NORMAL opening state — the weaker "some platform has
 * reported and none of them shipped" was only ever equivalent because no card
 * existed before total failure, and it reads as 全部平台构建失败 while the other
 * platforms are still compiling.
 *
 * `skipped` lanes are excluded on both sides: a platform nobody asked for is a
 * decision, so it neither delays the verdict nor, on its own, constitutes one.
 */
export function allPlatformsFailed(state: PrereleaseCardState): boolean {
  const expected = state.platforms.filter((platform) => platform.build !== "skipped");
  if (expected.length === 0) return false;
  return expected.every((platform) => isTerminal(platform.build) && platform.build !== "success");
}

export function anyPackagePublished(state: PrereleaseCardState): boolean {
  return state.platforms.some((platform) => platform.build === "success");
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * An exact duration: `42s`, `11m42s`, `1h04m05s`.
 *
 * Zero-padded so two rows line up and a reader can compare them without doing
 * arithmetic — which is the whole reason the card carries seconds rather than
 * `702s`. Used only for durations that will never change again.
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const seconds = total % 60;
  if (hours > 0) return `${hours}h${pad(minutes)}m${pad(seconds)}s`;
  if (minutes > 0) return `${minutes}m${pad(seconds)}s`;
  return `${seconds}s`;
}

/**
 * The same duration for something still running, quantized to the minute.
 *
 * Not cosmetic. The watcher re-renders every 30 seconds and PATCHes whenever
 * the rendered card differs from the last one it delivered, so a live
 * second-by-second number would rewrite the message on every single poll for
 * the whole watch. At minute resolution the card changes only when a reader
 * would notice.
 */
export function formatElapsed(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${pad(minutes % 60)}m`;
}

/**
 * The time suffix for one lane, or "" when the lane has no honest number.
 *
 * The lane's STATUS decides, never the presence of a timestamp. Two reasons,
 * both of which produce a wrong number rather than a missing one:
 *   * GitHub stamps `started_at` on a job the moment it is QUEUED, so every
 *     pending lane carries one and rendering it would report the queue as build
 *     time.
 *   * A job that did no work — skipped, or a lane never dispatched at all —
 *     comes back with `started_at == completed_at`, and `用时 0s` next to
 *     "本次未构建" is noise at best and a fabrication at worst.
 */
export function laneDurationText(status: LaneStatus, timing: LaneTiming, now: number): string {
  if (status === "pending" || status === "unknown") return "";
  if (status === "skipped" || status === "never_started") return "";
  if (timing.startedAt == null) return "";
  if (status === "running") return `已用 ${formatElapsed(now - timing.startedAt)}`;
  if (timing.completedAt == null) return "";
  return `用时 ${formatDuration(timing.completedAt - timing.startedAt)}`;
}

/**
 * How long the whole round has taken: origin run created → publish stopped.
 *
 * The number the person cutting the release actually watches, and the one no
 * single lane can answer — the queue before the first build starts and the
 * upload after the last one finishes both live outside every platform row.
 */
export function totalElapsedText(state: PrereleaseCardState): string {
  if (state.runCreatedAt == null) return "";
  if (state.publishCompletedAt != null) {
    return `本轮总耗时 ${formatDuration(state.publishCompletedAt - state.runCreatedAt)}`;
  }
  return `本轮已用 ${formatElapsed(state.now - state.runCreatedAt)}`;
}

export function failureCount(state: PrereleaseCardState): number {
  let failures = 0;
  for (const platform of state.platforms) {
    if (isBadNews(platform.build)) failures += 1;
    if (isBadNews(platform.smoke)) failures += 1;
  }
  for (const test of state.tests) {
    if (isBadNews(test.status)) failures += 1;
  }
  return failures;
}

/**
 * Lanes that were expected and never dispatched.
 *
 * Counted separately from `failureCount` because the two say different things
 * to a reader: a failure means a check ran and disagreed, a never-started lane
 * means the pipeline did not do what it said it would. Both need a human, so
 * both colour the card — but the card must not report one as the other.
 */
export function neverStartedCount(state: PrereleaseCardState): number {
  let count = 0;
  for (const platform of state.platforms) {
    if (platform.build === "never_started") count += 1;
    if (platform.smoke === "never_started") count += 1;
  }
  for (const test of state.tests) {
    if (test.status === "never_started") count += 1;
  }
  return count;
}

export function headerTemplate(state: PrereleaseCardState): string {
  if (!anyPackagePublished(state)) {
    // "No package yet" is where every release starts, so it is blue until one
    // of two things makes it an incident: every expected platform reported and
    // none shipped, or the watcher gave up waiting.
    return allPlatformsFailed(state) || state.timedOut ? "red" : "blue";
  }
  if (failureCount(state) > 0 || neverStartedCount(state) > 0) return "orange";
  return state.finished && !state.timedOut ? "green" : "blue";
}

export function headerTitle(state: PrereleaseCardState): string {
  const name = `Open Design ${state.channelLabel} ${state.version}`;
  if (!anyPackagePublished(state)) {
    // Order matters: a run whose platforms all failed has a verdict, and saying
    // "等待产物超时" about it would report the watcher's clock instead of the
    // thing that actually went wrong.
    if (allPlatformsFailed(state)) return `🚨 ${name} · 全部平台构建失败`;
    if (state.timedOut) return `🚨 ${name} · 等待产物超时`;
    return `🚀 ${name} · 构建中`;
  }
  const failures = failureCount(state);
  const neverStarted = neverStartedCount(state);
  // "未通过" is a claim that something ran and disagreed. Never say it about a
  // lane that was never dispatched.
  if (failures > 0 && neverStarted > 0) return `⚠️ ${name} · ${failures} 项未通过、${neverStarted} 项未触发`;
  if (failures > 0) return `⚠️ ${name} · ${failures} 项未通过`;
  if (neverStarted > 0) return `⚠️ ${name} · ${neverStarted} 项未触发`;
  if (!state.finished || state.timedOut) return `🚀 ${name} · 进行中`;
  return `🚀 ${name}`;
}

function platformLine(platform: PlatformLane, now: number): string {
  const line = `${STATUS_GLYPH[platform.build]} ${platform.label} · ${BUILD_STATUS_TEXT[platform.build]}`;
  const duration = laneDurationText(platform.build, platform.timing, now);
  return duration.length > 0 ? `${line} · ${duration}` : line;
}

function checkLine(label: string, status: LaneStatus): string {
  return `${STATUS_GLYPH[status]} ${label} · ${CHECK_STATUS_TEXT[status]}`;
}

export function changelogMarkdown(state: PrereleaseCardState): string {
  if (state.previousCommit.length === 0) {
    return `首个 ${state.channelLabel} 包，无上个版本可对比。`;
  }
  if (state.changelog.lines.length === 0) {
    return `与上个 ${state.channelLabel} 包之间没有新增提交。`;
  }
  const body = state.changelog.lines.map((line) => `- ${line}`).join("\n");
  if (!state.changelog.truncated) return body;
  const rest = state.changelog.total - state.changelog.lines.length;
  return `${body}\n- …还有 ${rest} 条提交（共 ${state.changelog.total} 条）`;
}

export function readChangelogLines(raw: string): Changelog {
  const all = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const truncated = all.length > MAX_CHANGELOG_LINES;
  return { lines: truncated ? all.slice(0, MAX_CHANGELOG_LINES) : all, total: all.length, truncated };
}

function downloadButtons(state: PrereleaseCardState): FeishuElement[] {
  const ready = state.platforms.filter((platform) => platform.downloadUrl.length > 0);
  return ready.map((platform, index) => ({
    tag: "button",
    text: { tag: "plain_text", content: `下载 ${platform.label}` },
    type: index === 0 ? "primary" : "default",
    url: platform.downloadUrl,
  }));
}

export function renderPrereleaseCard(state: PrereleaseCardState): FeishuCard {
  const shortCommit = state.commit.length >= 7 ? state.commit.slice(0, 7) : state.commit;
  const fields: FeishuElement[] = [];
  if (state.branch.length > 0) {
    fields.push({ is_short: true, text: { tag: "lark_md", content: `**分支**\n${state.branch}` } });
  }
  if (shortCommit.length > 0) {
    const link = state.repo.length > 0
      ? `[\`${shortCommit}\`](https://github.com/${state.repo}/commit/${state.commit})`
      : `\`${shortCommit}\``;
    fields.push({ is_short: true, text: { tag: "lark_md", content: `**提交**\n${link}` } });
  }

  const elements: FeishuElement[] = [];
  if (fields.length > 0) elements.push({ tag: "div", fields });

  const platformLines = state.platforms.map((platform) => platformLine(platform, state.now)).join("\n");
  elements.push({ tag: "div", text: { tag: "lark_md", content: `**平台产物**\n${platformLines}` } });

  const checks: string[] = [];
  if (state.expectTests) {
    for (const test of state.tests) checks.push(checkLine(test.label, test.status));
  }
  if (state.expectSmoke) {
    for (const platform of state.platforms) {
      if (platform.smoke === "skipped") continue;
      checks.push(checkLine(`${platform.label} packaged smoke`, platform.smoke));
    }
  }
  if (checks.length > 0) {
    elements.push({
      tag: "div",
      text: {
        tag: "lark_md",
        content: `**验证**（不阻塞发布）\n${checks.join("\n")}`,
      },
    });
  }

  elements.push({
    tag: "div",
    text: { tag: "lark_md", content: `**自上个 ${state.channelLabel} 新增提交**\n${changelogMarkdown(state)}` },
  });

  if (state.timedOut) {
    elements.push({
      tag: "div",
      text: {
        tag: "lark_md",
        content: "**注意**\n看板任务已达到时间上限，上面的状态可能不是最终结果；点下方链接看运行本身。",
      },
    });
  }

  const buttons = downloadButtons(state);
  if (buttons.length > 0) {
    elements.push({ tag: "hr" });
    elements.push({ tag: "action", actions: buttons });
  }

  // Footer: the round's own clock first, then where to look. Both are metadata
  // about the release rather than about any one lane, so they share a line.
  const noteParts: string[] = [];
  const total = totalElapsedText(state);
  if (total.length > 0) noteParts.push(total);
  if (state.originRunUrl.length > 0) noteParts.push(`[打包运行](${state.originRunUrl})`);
  if (state.testsRunUrl.length > 0) noteParts.push(`[代码测试](${state.testsRunUrl})`);
  if (state.smokeRunUrl.length > 0) noteParts.push(`[包 smoke](${state.smokeRunUrl})`);
  if (noteParts.length > 0) {
    elements.push({ tag: "note", elements: [{ tag: "lark_md", content: noteParts.join(" · ") }] });
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      template: headerTemplate(state),
      title: { tag: "plain_text", content: headerTitle(state) },
    },
    elements,
  };
}
