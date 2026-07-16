// Posts a generic notice to a Feishu (Lark) custom-bot webhook as an interactive
// card: a colored header title plus a markdown body, with no download buttons.
//
// This is the lightweight sibling of feishu.ts (the build/download card). It is
// for events that are NOT a package build — e.g. cut-patch-release announcing
// that the Thursday patch cut was skipped because the week's minor has not
// shipped stable yet. The signing + retry transport mirrors feishu.ts so both
// notifiers behave identically against the same bot.
//
// Inputs (all via env):
//   FEISHU_WEBHOOK        (required) custom-bot webhook URL
//   FEISHU_SIGN_SECRET    (optional) signing secret when the bot enables 签名校验
//   NOTICE_TITLE          (required) header title, e.g. "⏭️ 周四小版本已跳过"
//   NOTICE_TEMPLATE       (optional) header color: blue | orange | red | grey | green … (default "orange")
//   NOTICE_BODY           (required) card body, rendered as lark_md markdown
//   RUN_URL               (optional) link back to the GitHub Actions run

import { createHmac } from "node:crypto";

type FeishuCard = Record<string, unknown>;

function required(name: string): string {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  const value = process.env[name];
  return value == null || value.length === 0 ? fallback : value;
}

const webhook = required("FEISHU_WEBHOOK");
const signSecret = optional("FEISHU_SIGN_SECRET");
const title = required("NOTICE_TITLE");
const template = optional("NOTICE_TEMPLATE", "orange");
const body = required("NOTICE_BODY");
const runUrl = optional("RUN_URL");

function buildCard(): FeishuCard {
  const elements: Record<string, unknown>[] = [{ tag: "div", text: { tag: "lark_md", content: body } }];
  if (runUrl.length > 0) {
    elements.push({
      tag: "note",
      elements: [{ tag: "lark_md", content: `[GitHub Actions run](${runUrl})` }],
    });
  }
  return {
    config: { wide_screen_mode: true },
    header: {
      template,
      title: { tag: "plain_text", content: title },
    },
    elements,
  };
}

function signedEnvelope(card: FeishuCard): Record<string, unknown> {
  const envelope = { msg_type: "interactive", card };
  if (signSecret.length === 0) return envelope;
  // Feishu signing: HMAC-SHA256 over empty bytes, keyed by `${timestamp}\n${secret}`.
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const stringToSign = `${timestamp}\n${signSecret}`;
  const sign = createHmac("sha256", stringToSign).update("").digest("base64");
  return { timestamp, sign, ...envelope };
}

function sleep(attempt: number): Promise<void> {
  const ms = Math.min(1000 * 2 ** (attempt - 1), 15000);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function post(payload: Record<string, unknown>): Promise<void> {
  const attempts = 5;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let res;
    try {
      res = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
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
