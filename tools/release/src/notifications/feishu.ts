import { appendFileSync } from "node:fs";

import { decodeReleaseFeishuBot } from "./bot-codec.ts";
import {
  buildReleaseFeishuCard,
  loadReleaseNotificationDetails,
  type ReleaseNotificationInput,
} from "./release-card.ts";
import {
  createFeishuSignedEnvelope,
  optionalEnv,
  postFeishuWebhook,
} from "./feishu-client.ts";

function summary(line: string): void {
  const path = optionalEnv("GITHUB_STEP_SUMMARY");
  if (path.length > 0) appendFileSync(path, `${line}\n`, "utf8");
  console.log(line);
}

const bot = decodeReleaseFeishuBot(optionalEnv("RELEASE_FEISHU_BOT"));
if (bot == null) {
  summary("Feishu: not configured");
} else {
  const channel = optionalEnv("RELEASE_CHANNEL") as ReleaseNotificationInput["channel"];
  if (!["beta", "preview", "prerelease", "stable"].includes(channel)) {
    throw new Error(`unsupported release notification channel: ${channel}`);
  }
  const input: ReleaseNotificationInput = {
    branch: optionalEnv("RELEASE_BRANCH"),
    channel,
    changelogFile: optionalEnv("RELEASE_CHANGELOG_FILE"),
    commit: optionalEnv("RELEASE_COMMIT"),
    macArm64Smoke: optionalEnv("RELEASE_MAC_ARM64_SMOKE"),
    macArm64Url: optionalEnv("RELEASE_MAC_ARM64_URL"),
    macX64Smoke: optionalEnv("RELEASE_MAC_X64_SMOKE"),
    macX64Url: optionalEnv("RELEASE_MAC_X64_URL"),
    metadataUrl: optionalEnv("RELEASE_METADATA_URL"),
    previousCommit: optionalEnv("RELEASE_PREVIOUS_COMMIT"),
    releaseMode: optionalEnv("RELEASE_MODE", "publish"),
    releaseResult: optionalEnv("RELEASE_RESULT", "success"),
    releaseState: optionalEnv("RELEASE_STATE", "complete"),
    repository: optionalEnv("RELEASE_REPOSITORY"),
    runUrl: optionalEnv("RELEASE_RUN_URL"),
    stream: optionalEnv("RELEASE_NOTIFICATION_STREAM", "release"),
    version: optionalEnv("RELEASE_VERSION"),
    winX64Smoke: optionalEnv("RELEASE_WIN_X64_SMOKE"),
    winX64Url: optionalEnv("RELEASE_WIN_X64_URL"),
  };
  const details = await loadReleaseNotificationDetails(input);
  const card = buildReleaseFeishuCard(input, details);
  await postFeishuWebhook(bot.webhook, createFeishuSignedEnvelope(card, bot.signSecret));
  summary(`Feishu: delivered ${channel} ${input.version || "validation"}`);
}
