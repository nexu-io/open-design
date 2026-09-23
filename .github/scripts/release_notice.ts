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

import {
  createFeishuSignedEnvelope,
  optionalEnv as optional,
  postFeishuWebhook,
  requiredEnv as required,
  type FeishuCard,
} from "./lib/feishu/client.ts";

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

await postFeishuWebhook(webhook, createFeishuSignedEnvelope(buildCard(), signSecret));
