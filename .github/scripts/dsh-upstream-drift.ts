/**
 * Watch upstream DeepSeek Harness releases and say something when we fall behind.
 *
 * Twice in one week the same failure shipped: `@deepseek-ai/dsh` published a new
 * release line, and nothing in this repo noticed. The first time it was a pin on
 * one release candidate; the second, a pin on one patch line. Both were found by
 * a person reporting that their install did not work.
 *
 * The existing drift check (`e2e/tests/dsh-installer-version-policy.test.ts`)
 * compares our installers against our agent def — the two halves of *our*
 * config. It stays green while both are equally out of date, which is exactly
 * what happened. This one compares them against the registry.
 *
 * Three places have to move together when upstream ships a new line, and this
 * names all three, because forgetting the third is the one that actually breaks
 * an install rather than merely warning about it:
 *
 *   1. `tools/release/resources/dsh-bootstrap/install-dsh.{sh,ps1}` — the
 *      version and the `--before` resolution window (canonical product source;
 *      landing `public/install-dsh.*` copies must stay byte-identical until
 *      extraction).
 *   2. `apps/daemon/src/runtimes/defs/deepseek-harness.ts` — the accepted
 *      release line.
 *   3. `packages/dsh-runtime/package.json` — the peer ranges. semver only lets a
 *      prerelease satisfy a range when a comparator carries the same
 *      major.minor.patch tuple AND its own prerelease tag, so every new upstream
 *      prerelease line needs its own comparator or the connection component
 *      cannot install at all.
 *
 * Commands:
 *   run [--dry-run]   Compare against the live registry; post to Feishu on drift.
 *                     `--dry-run` prints what it would post and exits 0.
 *   self-check        Exercise the classification against fixtures. No network.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const PACKAGE = "@deepseek-ai/dsh";
const REGISTRY = "https://registry.npmjs.org";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const INSTALLER_SH = "tools/release/resources/dsh-bootstrap/install-dsh.sh";
const AGENT_DEF = "apps/daemon/src/runtimes/defs/deepseek-harness.ts";
const PEER_MANIFEST = "packages/dsh-runtime/package.json";

export type DriftSeverity = "in-sync" | "behind" | "unsupported";

export interface DriftVerdict {
  severity: DriftSeverity;
  pinned: string;
  latest: string;
  /** Whether the agent def would accept `latest` without an untested warning. */
  accepted: boolean;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function readRepoFile(relative: string): string {
  return readFileSync(path.join(REPO_ROOT, relative), "utf8");
}

/** The version our one-line installer hands a user today. */
export function readPinnedVersion(installerSource: string): string {
  const found = /DSH_VERSION='([^']+)'/u.exec(installerSource)?.[1];
  if (!found) throw new Error(`could not read DSH_VERSION from ${INSTALLER_SH}`);
  return found;
}

/**
 * The release line the agent def accepts, rebuilt from the literal in source.
 * Absent is valid — it means the def only accepts the versions it lists.
 */
export function readAcceptedPattern(defSource: string): RegExp | null {
  const found = /supportedVersionPattern:\s*\/(.+?)\/([a-z]*)\s*,/u.exec(defSource);
  const body = found?.[1];
  if (!body) return null;
  return new RegExp(body, found?.[2] ?? "");
}

export function readListedVersions(defSource: string): string[] {
  const list = /supportedVersions:\s*\[([^\]]*)\]/u.exec(defSource)?.[1] ?? "";
  return [...list.matchAll(/'([^']+)'/gu)]
    .map((entry) => entry[1])
    .filter((entry): entry is string => typeof entry === "string");
}

/**
 * How badly we have fallen behind.
 *
 * `behind` means a user who takes our installer gets an older version than the
 * registry serves — annoying, but everything works. `unsupported` means a user
 * who has what npm serves is outside what we claim to support: Settings calls
 * their CLI untested, and the peer ranges very likely do not resolve either.
 */
export function classifyDrift(args: {
  accepted: boolean;
  latest: string;
  pinned: string;
}): DriftVerdict {
  const { accepted, latest, pinned } = args;
  if (!accepted) return { accepted, latest, pinned, severity: "unsupported" };
  if (latest !== pinned) return { accepted, latest, pinned, severity: "behind" };
  return { accepted, latest, pinned, severity: "in-sync" };
}

async function fetchLatestVersion(): Promise<string> {
  const response = await fetch(`${REGISTRY}/${encodeURIComponent(PACKAGE)}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  });
  if (!response.ok) {
    throw new Error(`registry returned HTTP ${response.status} for ${PACKAGE}`);
  }
  const body = (await response.json()) as { "dist-tags"?: Record<string, string> };
  const latest = body["dist-tags"]?.latest;
  if (!latest) throw new Error(`${PACKAGE} has no dist-tag "latest"`);
  return latest;
}

export function buildCard(verdict: DriftVerdict): Record<string, unknown> {
  const blocking = verdict.severity === "unsupported";
  const headline = blocking
    ? `DeepSeek Harness ${verdict.latest} 不在我们支持的范围内`
    : `DeepSeek Harness 已发布 ${verdict.latest}，我们还钉在 ${verdict.pinned}`;
  const consequence = blocking
    ? [
        `装到 \`${verdict.latest}\` 的用户会被告知「未经测试」，`,
        "而且 `packages/dsh-runtime` 的 peer 范围很可能直接解析失败——",
        "semver 要求同 major.minor.patch 且自身带 prerelease 的比较器，",
        "所以每条新的 prerelease 线都得单独加一个比较器，组件才装得上。",
      ].join("")
    : `按我们安装脚本装的用户会拿到 \`${verdict.pinned}\`，比 registry 的 \`latest\` 旧。`;

  return {
    config: { wide_screen_mode: true },
    elements: [
      {
        tag: "div",
        text: { tag: "lark_md", content: `${consequence}` },
      },
      { tag: "hr" },
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: [
            "**三处要一起改**（漏掉第三条会让组件装不上，不只是警告）：",
            `1. \`${INSTALLER_SH}\` 和 \`.ps1\` — 版本 + \`--before\` 时间窗`,
            `2. \`${AGENT_DEF}\` — 接受的发布线`,
            `3. \`${PEER_MANIFEST}\` — peer 范围加一条比较器`,
          ].join("\n"),
        },
      },
    ],
    header: {
      template: blocking ? "red" : "orange",
      title: { content: headline, tag: "plain_text" },
    },
  };
}

function signedEnvelope(card: Record<string, unknown>): Record<string, unknown> {
  const body = { card, msg_type: "interactive" };
  const signSecret = process.env.FEISHU_SIGN_SECRET?.trim() ?? "";
  if (signSecret.length === 0) return body;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sign = createHmac("sha256", `${timestamp}\n${signSecret}`).update("").digest("base64");
  return { sign, timestamp, ...body };
}

export interface FeishuDelivery {
  code: number | null;
  delivered: boolean;
  retryable: boolean;
}

/**
 * Decide whether Feishu actually accepted the card.
 *
 * A rejected webhook request still comes back HTTP 200 with a nonzero `code`,
 * so treating every 2xx as success loses the one message this workflow exists
 * to send — silently, which is the worst way to lose an alert. Same contract as
 * the landing notifier: code 0 (or absent) is delivered; 429, 5xx and Feishu's
 * 9499 are worth another attempt.
 */
export function interpretFeishuResponse(args: {
  status: number;
  text: string;
}): FeishuDelivery {
  let code: number | null = null;
  try {
    const parsed = JSON.parse(args.text) as { StatusCode?: unknown; code?: unknown };
    const raw = parsed.code ?? parsed.StatusCode ?? null;
    code = typeof raw === "number" ? raw : null;
  } catch {
    // Feishu normally returns JSON; fall back to the HTTP status alone.
  }
  const ok = args.status >= 200 && args.status < 300;
  if (ok && (code === 0 || code === null)) {
    return { code, delivered: true, retryable: false };
  }
  return {
    code,
    delivered: false,
    retryable: args.status === 429 || args.status >= 500 || code === 9499,
  };
}

async function postFeishu(card: Record<string, unknown>): Promise<void> {
  const webhook = requiredEnv("FEISHU_WEBHOOK");
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(webhook, {
      body: JSON.stringify(signedEnvelope(card)),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const text = await response.text();
    const delivery = interpretFeishuResponse({ status: response.status, text });
    if (delivery.delivered) {
      console.log(`[dsh-drift] delivered (HTTP ${response.status}, code ${delivery.code ?? "n/a"})`);
      return;
    }
    console.warn(
      `[dsh-drift] attempt ${attempt}/5 failed: HTTP ${response.status} ` +
        `code ${String(delivery.code)} ${text.slice(0, 300)}`,
    );
    if (!delivery.retryable || attempt === 5) {
      throw new Error(
        `Feishu webhook failed: HTTP ${response.status} code ${String(delivery.code)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
}

async function run(dryRun: boolean): Promise<void> {
  const pinned = readPinnedVersion(readRepoFile(INSTALLER_SH));
  const defSource = readRepoFile(AGENT_DEF);
  const pattern = readAcceptedPattern(defSource);
  const listed = readListedVersions(defSource);
  const latest = await fetchLatestVersion();
  const accepted = listed.includes(latest) || (pattern?.test(latest) ?? false);
  const verdict = classifyDrift({ accepted, latest, pinned });

  console.log(
    `[dsh-drift] pinned=${verdict.pinned} latest=${verdict.latest} ` +
      `accepted=${verdict.accepted} severity=${verdict.severity}`,
  );

  if (verdict.severity === "in-sync") return;
  const card = buildCard(verdict);
  if (dryRun) {
    console.log(JSON.stringify(card, null, 2));
    return;
  }
  await postFeishu(card);
  console.log("[dsh-drift] posted to Feishu");
}

function selfCheck(): void {
  const installer = "NODE_VERSION='24.19.0'\nDSH_VERSION='0.1.1-rc.2'\n";
  if (readPinnedVersion(installer) !== "0.1.1-rc.2") {
    throw new Error("self-check could not read the pinned version");
  }

  const def = [
    "    supportedVersions: ['0.1.0-rc.8', '0.1.1-rc.2'],",
    "    supportedVersionPattern: /^0\\.1\\.\\d+(?:-rc\\.\\d+)?$/u,",
  ].join("\n");
  const pattern = readAcceptedPattern(def);
  if (!pattern) throw new Error("self-check could not rebuild the accepted pattern");
  if (!pattern.test("0.1.1-rc.2") || pattern.test("0.2.0-rc.1")) {
    throw new Error("self-check rebuilt a pattern that does not match the source literal");
  }
  if (!readListedVersions(def).includes("0.1.0-rc.8")) {
    throw new Error("self-check could not read the listed versions");
  }

  // The state that shipped twice: the installer and the def agreed with each
  // other and both were behind the registry. Anything that reports this as
  // healthy has lost the only thing this check is for.
  const missed = classifyDrift({
    accepted: false,
    latest: "0.1.1-rc.2",
    pinned: "0.1.0-rc.8",
  });
  if (missed.severity !== "unsupported") {
    throw new Error("self-check expected the shipped-twice state to be unsupported");
  }
  if (String(buildCard(missed).header).length === 0) {
    throw new Error("self-check expected a card for a drifted verdict");
  }

  const behind = classifyDrift({ accepted: true, latest: "0.1.2", pinned: "0.1.1-rc.2" });
  if (behind.severity !== "behind") {
    throw new Error("self-check expected an accepted-but-older latest to be behind");
  }
  const synced = classifyDrift({ accepted: true, latest: "0.1.1-rc.2", pinned: "0.1.1-rc.2" });
  if (synced.severity !== "in-sync") {
    throw new Error("self-check expected an exact match to be in-sync");
  }

  console.log("[dsh-drift] self-check passed");
}

// Only dispatch when this file is the process entrypoint. Without the guard,
// importing it to reuse the pure helpers executes `run`: a live registry
// request during test collection, and — once drift exists — an attempted
// Feishu post before a single assertion has run.
const entry = process.argv[1];
const invokedDirectly = entry !== undefined && path.resolve(entry) === import.meta.filename;

if (invokedDirectly) {
  const command = process.argv[2] ?? "run";
  if (command === "self-check") {
    selfCheck();
  } else if (command === "run") {
    await run(process.argv.includes("--dry-run"));
  } else {
    console.error(`unknown command: ${command}`);
    process.exit(2);
  }
}
