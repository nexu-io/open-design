// Posts a packaged build notification to a Feishu (Lark) custom-bot webhook as
// an interactive card: version, branch, commit, per-platform download buttons,
// and the changelog since the previously published build of the same channel.
//
// Inputs (all via env):
//   FEISHU_WEBHOOK        (required) custom-bot webhook URL
//   FEISHU_SIGN_SECRET    (optional) signing secret when the bot enables 签名校验
//   CHANNEL_LABEL         display channel name, e.g. "Nightly" (default "Nightly")
//   VERSION               (required) build version, e.g. 0.9.0.nightly.1
//   BRANCH                git branch that was built
//   COMMIT                commit SHA that was built
//   PREVIOUS_COMMIT       changelog baseline (last published build); empty on cold start
//   CHANGELOG_FILE        path to a file holding `git log` output (one commit per line)
//   BUILD_STATE           build result (success | ...) — drives header color
//   STREAM_LABEL          human label for the trigger (e.g. "release 分支推送" / "每日定时")
//   REPO                  owner/name
//   RUN_URL               link back to the GitHub Actions run
//   MAC_ARM64_URL         macOS arm64 download URL (optional)
//   MAC_INTEL_URL         macOS x64 (Intel) download URL (optional)
//   WIN_URL               Windows x64 download URL (optional)
//   LINUX_URL             Linux x64 download URL (optional)

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

function required(name) {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optional(name, fallback = "") {
  const value = process.env[name];
  return value == null || value.length === 0 ? fallback : value;
}

const webhook = required("FEISHU_WEBHOOK");
const signSecret = optional("FEISHU_SIGN_SECRET");
const channelLabel = optional("CHANNEL_LABEL", "Nightly");
const version = required("VERSION");
const branch = optional("BRANCH");
const commit = optional("COMMIT");
const previousCommit = optional("PREVIOUS_COMMIT");
const changelogFile = optional("CHANGELOG_FILE");
const buildState = optional("BUILD_STATE", "success");
const streamLabel = optional("STREAM_LABEL", "构建");
const repo = optional("REPO");
const runUrl = optional("RUN_URL");

const MAX_CHANGELOG_LINES = 30;

// Download buttons, in display order. Empty URLs are skipped, so the set of
// buttons reflects exactly the platforms this build published.
const DOWNLOADS = [
  { label: "macOS (Apple Silicon)", url: optional("MAC_ARM64_URL") },
  { label: "macOS (Intel)", url: optional("MAC_INTEL_URL") },
  { label: "Windows", url: optional("WIN_URL") },
  { label: "Linux", url: optional("LINUX_URL") },
];

function downloadButtons() {
  const present = DOWNLOADS.filter((d) => d.url.length > 0);
  return present.map((d, index) => ({
    tag: "button",
    text: { tag: "plain_text", content: `下载 ${d.label}` },
    type: index === 0 ? "primary" : "default",
    url: d.url,
  }));
}

function readChangelog() {
  if (changelogFile.length === 0) return { lines: [], truncated: false, total: 0 };
  let raw = "";
  try {
    raw = readFileSync(changelogFile, "utf8");
  } catch {
    return { lines: [], truncated: false, total: 0 };
  }
  const all = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const truncated = all.length > MAX_CHANGELOG_LINES;
  return { lines: truncated ? all.slice(0, MAX_CHANGELOG_LINES) : all, truncated, total: all.length };
}

function changelogMarkdown() {
  const { lines, truncated, total } = readChangelog();
  if (previousCommit.length === 0) {
    return `首个 ${channelLabel} 包,无上个版本可对比。`;
  }
  if (lines.length === 0) {
    return `与上个 ${channelLabel} 包之间没有新增提交。`;
  }
  const body = lines.map((line) => `- ${line}`).join("\n");
  if (truncated) {
    return `${body}\n- …还有 ${total - lines.length} 条提交(共 ${total} 条)`;
  }
  return body;
}

function headerTemplate() {
  return buildState === "success" ? "blue" : "red";
}

function buildCard() {
  const shortCommit = commit.length >= 7 ? commit.slice(0, 7) : commit;
  const fields = [];
  if (branch.length > 0) {
    fields.push({ is_short: true, text: { tag: "lark_md", content: `**分支**\n${branch}` } });
  }
  if (shortCommit.length > 0) {
    const link = repo.length > 0 ? `[\`${shortCommit}\`](https://github.com/${repo}/commit/${commit})` : `\`${shortCommit}\``;
    fields.push({ is_short: true, text: { tag: "lark_md", content: `**提交**\n${link}` } });
  }
  fields.push({ is_short: true, text: { tag: "lark_md", content: `**渠道**\n${channelLabel}` } });
  fields.push({ is_short: true, text: { tag: "lark_md", content: `**触发**\n${streamLabel}` } });

  const elements = [{ tag: "div", fields }];
  elements.push({
    tag: "div",
    text: { tag: "lark_md", content: `**自上个 ${channelLabel} 新增提交**\n${changelogMarkdown()}` },
  });

  const buttons = downloadButtons();
  if (buttons.length > 0) {
    elements.push({ tag: "hr" });
    elements.push({ tag: "action", actions: buttons });
  }

  if (runUrl.length > 0) {
    elements.push({
      tag: "note",
      elements: [{ tag: "lark_md", content: `[GitHub Actions run](${runUrl})` }],
    });
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      template: headerTemplate(),
      title: { tag: "plain_text", content: `🚀 Open Design ${channelLabel} ${version}` },
    },
    elements,
  };
}

function signedEnvelope(card) {
  const body = { msg_type: "interactive", card };
  if (signSecret.length === 0) return body;
  // Feishu signing: HMAC-SHA256 over empty bytes, keyed by `${timestamp}\n${secret}`.
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const stringToSign = `${timestamp}\n${signSecret}`;
  const sign = createHmac("sha256", stringToSign).update("").digest("base64");
  return { timestamp, sign, ...body };
}

function sleep(attempt) {
  const ms = Math.min(1000 * 2 ** (attempt - 1), 15000);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function post(body) {
  const attempts = 5;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let res;
    try {
      res = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (error) {
      console.warn(`[feishu] POST attempt ${attempt}/${attempts} threw: ${error instanceof Error ? error.message : String(error)}`);
      if (attempt === attempts) throw error;
      await sleep(attempt);
      continue;
    }
    const text = await res.text();
    let code = null;
    try {
      const parsed = JSON.parse(text);
      code = parsed.code ?? parsed.StatusCode ?? null;
    } catch {
      // non-JSON body
    }
    if (res.ok && (code === 0 || code === null)) {
      console.log(`[feishu] delivered (HTTP ${res.status}, code ${code ?? "n/a"})`);
      return;
    }
    console.warn(`[feishu] POST attempt ${attempt}/${attempts} HTTP ${res.status} code ${code}: ${text.slice(0, 500)}`);
    // Bot rate-limit (code 9499) and 5xx are retryable; a 4xx config error is not.
    const retryable = res.status === 429 || res.status >= 500 || code === 9499;
    if (!retryable || attempt === attempts) {
      throw new Error(`Feishu webhook failed: HTTP ${res.status} code ${code}`);
    }
    await sleep(attempt);
  }
}

await post(signedEnvelope(buildCard()));
