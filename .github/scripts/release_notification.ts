import { appendFileSync } from "node:fs";

import { decodeReleaseFeishuBot } from "./lib/feishu/client.ts";
import {
  buildReleaseFeishuCard,
  loadReleaseNotificationDetails,
  type ReleaseNotificationInput,
  isNotificationReleaseChannel,
} from "./lib/feishu/release.ts";
import {
  createFeishuSignedEnvelope,
  optionalEnv,
  postFeishuWebhook,
} from "./lib/feishu/client.ts";

function summary(line: string): void {
  const path = optionalEnv("GITHUB_STEP_SUMMARY");
  if (path.length > 0) appendFileSync(path, `${line}\n`, "utf8");
  console.log(line);
}

const bot = decodeReleaseFeishuBot(optionalEnv("RELEASE_FEISHU_BOT"));
if (bot == null) {
  summary("Feishu: not configured");
} else {
  const channel = optionalEnv("RELEASE_CHANNEL");
  if (!isNotificationReleaseChannel(channel)) {
    throw new Error(`unsupported release notification channel: ${channel}`);
  }
  const input: ReleaseNotificationInput = {
    activationCompletedAt: optionalEnv("RELEASE_ACTIVATION_COMPLETED_AT"),
    actor: optionalEnv("RELEASE_ACTOR"),
    branch: optionalEnv("RELEASE_BRANCH"),
    channel,
    commit: optionalEnv("RELEASE_COMMIT"),
    eventName: optionalEnv("RELEASE_EVENT_NAME"),
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
    runAttempt: optionalEnv("RELEASE_RUN_ATTEMPT"),
    runNumber: optionalEnv("RELEASE_RUN_NUMBER"),
    runUrl: optionalEnv("RELEASE_RUN_URL"),
    stream: optionalEnv("RELEASE_NOTIFICATION_STREAM", "release"),
    version: optionalEnv("RELEASE_VERSION"),
    winX64Smoke: optionalEnv("RELEASE_WIN_X64_SMOKE"),
    winX64Url: optionalEnv("RELEASE_WIN_X64_URL"),
    triggeringActor: optionalEnv("RELEASE_TRIGGERING_ACTOR"),
    workflowName: optionalEnv("RELEASE_WORKFLOW_NAME"),
  };
  const details = await loadReleaseNotificationDetails(
    input,
    fetch,
    optionalEnv("RELEASE_GITHUB_TOKEN"),
  );
  const card = buildReleaseFeishuCard(input, details);
  await postFeishuWebhook(bot.webhook, createFeishuSignedEnvelope(card, bot.signSecret));
  summary(`Feishu: delivered ${channel} ${input.version || "validation"}`);
}
