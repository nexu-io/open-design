// Pure decision + rendering for the prerelease card's last-resort alert.
//
// The progressive card (release-prerelease-card.yml) is now the ONLY prerelease
// notification, and every way it can break is silent: the pipeline stays green,
// the packages ship, and the channel hears nothing. This module decides whether
// that happened and renders the one plain notice that goes out instead.
//
// Two rules shape everything here.
//
//   1. It must never fire on a healthy release. A fallback that also posts on
//      good days is just a second card, and a channel that gets two messages
//      per release stops reading either.
//   2. It must not depend on the card's own credentials. The alert is delivered
//      by the custom-bot webhook (FEISHU_RELEASE_WEBHOOK), which is a different
//      bot with a different secret from the application bot the card uses — so
//      "the app bot's credentials expired" is a failure the alert survives. A
//      fallback sharing the primary's credentials covers nothing.
//
// Everything in this file is pure so the "when do we alert" question can be
// tested without a network or a workflow run.

/**
 * What the caller has observed about the card lane.
 *
 * `dispatch` is release-prerelease.yml, which only knows whether it managed to
 * dispatch the card workflow at all. `watch` is release-prerelease-card.yml
 * itself, which knows how its own watcher job ended AND whether that watcher
 * ever got a card into the chat — two different facts, because the watcher
 * swallows Feishu failures by design and exits 0 anyway.
 */
export type CardLaneProbe =
  | { stage: "dispatch"; dispatched: boolean }
  | { stage: "watch"; jobResult: string; deliveredFinalCard: boolean };

export type CardLaneSilence =
  /** The card workflow was never asked to run, so no card exists at all. */
  | "never-dispatched"
  /** The watcher job did not finish successfully; any card it posted is frozen mid-release. */
  | "watcher-not-completed"
  /** The watcher finished cleanly but never got the card's final state into the chat. */
  | "card-not-delivered";

/**
 * The alert condition, in one place.
 *
 * A green watcher job is NOT proof of a delivered card: `sendCard`/`patchCard`
 * failures are caught on purpose (one Feishu hiccup must not end a two-hour
 * watch) and the job still exits 0. Expired application-bot credentials, or the
 * bot being removed from the chat, look exactly like a successful run. Only the
 * watcher's own delivery report separates them.
 */
export function cardLaneSilence(probe: CardLaneProbe): CardLaneSilence | null {
  if (probe.stage === "dispatch") return probe.dispatched ? null : "never-dispatched";
  if (probe.jobResult !== "success") return "watcher-not-completed";
  return probe.deliveredFinalCard ? null : "card-not-delivered";
}

/** Whether a package actually shipped. Never guessed — `unknown` is a real answer. */
export type PackagePublication = "published" | "absent" | "unknown";

/** Outcome of a HEAD against the version metadata object. */
export type MetadataProbe = "found" | "missing" | "error" | "skipped";

/**
 * The R2 key `publish-metadata` writes this build's version metadata to, which
 * is the same URL release-prerelease.yml exports as `version_metadata_url`.
 * Keep in step with `versionPrefix` in tools/release/src/storage/publish-metadata.ts.
 */
export function versionMetadataUrl(publicOrigin: string, channel: string, version: string): string {
  const origin = publicOrigin.replace(/\/+$/u, "");
  if (origin.length === 0 || version.length === 0 || channel.length === 0) return "";
  return `${origin}/${channel}/versions/${version}/metadata.json`;
}

/**
 * "Did a package actually ship?" — deliberately NOT the workflow conclusion,
 * which goes red for a failed advisory lane while the packages sit downloadable
 * in R2. A non-empty `version_metadata_url` means the publish job wrote
 * metadata; when the caller does not hold that output, the metadata object
 * itself is the next best authority.
 */
export function resolvePackagePublication(input: {
  declaredMetadataUrl: string;
  probe: MetadataProbe;
}): PackagePublication {
  if (input.declaredMetadataUrl.length > 0) return "published";
  if (input.probe === "found") return "published";
  if (input.probe === "missing") return "absent";
  return "unknown";
}

/** Whether the build pipeline had finished when the alert was composed. */
export type PipelineProgress = "running" | "finished" | "unknown";

export type FallbackNoticeInput = {
  silence: CardLaneSilence;
  channelLabel: string;
  /** Empty when the pipeline died before it resolved a version. */
  version: string;
  branch: string;
  commit: string;
  publication: PackagePublication;
  /** The authoritative metadata URL, when the caller holds or built one. */
  metadataUrl: string;
  pipeline: PipelineProgress;
  originRunUrl: string;
  cardRunUrl: string;
  /** Raw per-job results, so the reader can tell the failure modes apart. */
  laneSummary: string;
};

export type FallbackNotice = {
  title: string;
  template: string;
  body: string;
  runUrl: string;
};

const SILENCE_TEXT: Record<CardLaneSilence, string> = {
  "never-dispatched": "进度卡片工作流从未被调起，本次发布没有任何卡片。",
  "watcher-not-completed": "进度卡片 job 未正常结束，卡片可能缺失，或停在中间状态不再更新。",
  "card-not-delivered": "进度卡片 job 正常结束，但卡片从未送进群——应用机器人凭证失效或被移出群的典型症状。",
};

function publicationLine(input: FallbackNoticeInput): string {
  if (input.publication === "published") {
    const suffix = input.metadataUrl.length > 0 ? ` — ${input.metadataUrl}` : "";
    return `✅ 已发布，包在 R2 上可以下载${suffix}`;
  }
  // Naming the object that would prove publication turns "go check yourself"
  // into one clickable check, which matters most on the early alert: the card
  // can die minutes into a build that goes on to publish perfectly.
  const hint = input.metadataUrl.length > 0 ? `；发布后 version metadata 会出现在 ${input.metadataUrl}` : "";
  if (input.publication === "unknown") {
    const check = input.metadataUrl.length > 0 ? `，请自行核对 ${input.metadataUrl}` : "";
    return `❓ 未知，本条消息发出时无法确认 version metadata${check}`;
  }
  if (input.pipeline === "running") {
    return `⏳ 尚未发布，打包流水线仍在进行${hint}`;
  }
  if (input.pipeline === "finished") {
    return `❌ 未发布，打包流水线已结束且 version metadata 不存在${hint}`;
  }
  return `❌ 未发布，本条消息发出时 version metadata 不存在${hint}`;
}

/**
 * The alert has to stand on its own: whoever reads it should not have to guess
 * which release it is about, whether they can still install something, or where
 * to look. It carries the version, the publication verdict, why the card lane
 * went quiet, and both run links.
 */
export function renderFallbackNotice(input: FallbackNoticeInput): FallbackNotice {
  const version = input.version.length > 0 ? `\`${input.version}\`` : "未确定（流水线未产出版本号）";
  const branch = input.branch.length > 0 ? `\`${input.branch}\`` : "未确定";
  const commit = input.commit.length > 0 ? `\`${input.commit.slice(0, 10)}\`` : "未确定";

  const lines = [
    `${input.channelLabel} 的飞书进度卡片这次没有正常送达。本条是兜底告警，走自定义机器人 webhook 发出，和卡片用的应用机器人不是同一套凭证。`,
    "",
    `**版本**: ${version}`,
    `**分支 / 提交**: ${branch} @ ${commit}`,
    `**发包状态**: ${publicationLine(input)}`,
    `**卡片链路**: ${SILENCE_TEXT[input.silence]}`,
  ];
  if (input.laneSummary.length > 0) lines.push(`**各 job 结果**: ${input.laneSummary}`);
  lines.push("", "**去哪看**");
  if (input.originRunUrl.length > 0) lines.push(`- 打包流水线: ${input.originRunUrl}`);
  if (input.cardRunUrl.length > 0) lines.push(`- 进度卡片 run: ${input.cardRunUrl}`);

  const versionSuffix = input.version.length > 0 ? ` · ${input.version}` : "";
  return {
    title: `🚨 ${input.channelLabel} 进度卡片失联${versionSuffix}`,
    // Packages that shipped are a different incident from packages that never
    // did: one broke only the notification, the other broke the release.
    template: input.publication === "published" ? "orange" : "red",
    body: lines.join("\n"),
    runUrl: input.originRunUrl.length > 0 ? input.originRunUrl : input.cardRunUrl,
  };
}
