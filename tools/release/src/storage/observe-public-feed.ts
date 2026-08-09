import { appendFileSync } from "node:fs";

import { optional, required, writeJson } from "./common.ts";
import { observePublicFeed } from "./public-feed.ts";

const publicOrigin = required("RELEASE_PUBLIC_ORIGIN");
const releaseVersion = required("RELEASE_VERSION");
const latestMetadataUrl = required("RELEASE_LATEST_METADATA_URL");
const versionMetadataUrl = required("RELEASE_METADATA_URL");
const reportPath = optional("RELEASE_PUBLIC_FEED_REPORT_PATH");
const summaryPath = optional("GITHUB_STEP_SUMMARY");

try {
  const observation = await observePublicFeed({
    expectedVersion: releaseVersion,
    latestMetadataUrl,
    publicOrigin,
    versionMetadataUrl,
  });
  if (reportPath.length > 0) writeJson(reportPath, observation);
  if (summaryPath.length > 0) {
    appendFileSync(summaryPath, [
      "### Public beta feed observation",
      "",
      `- version: \`${releaseVersion}\``,
      `- public objects probed: \`${observation.probes.length}\``,
      `- status: \`${observation.status}\``,
      "",
    ].join("\n"), "utf8");
  }
  console.log(JSON.stringify(observation, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (reportPath.length > 0) {
    writeJson(reportPath, {
      checkedAt: new Date().toISOString(),
      error: message,
      expectedVersion: releaseVersion,
      latestMetadataUrl,
      status: "failed",
      versionMetadataUrl,
    });
  }
  if (summaryPath.length > 0) {
    appendFileSync(summaryPath, [
      "### Public beta feed observation",
      "",
      `- version: \`${releaseVersion}\``,
      "- status: `failed` (non-blocking beta observation)",
      `- error: ${message.replace(/[\r\n]+/g, " ")}`,
      "",
    ].join("\n"), "utf8");
  }
  throw error;
}
