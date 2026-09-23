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
  /**
   * When the registry published `latest`, ISO-8601, or `null` when it did not
   * say. Nullable on purpose — see `readPublishedAt`.
   */
  publishedAt: string | null;
}

interface CardBlock {
  tag: string;
  text?: { tag: string; content: string };
}

export interface DriftCard {
  config: { wide_screen_mode: boolean };
  elements: CardBlock[];
  header: {
    template: "orange" | "red";
    title: { content: string; tag: "plain_text" };
  };
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
  publishedAt: string | null;
}): DriftVerdict {
  const { accepted, latest, pinned, publishedAt } = args;
  const facts = { accepted, latest, pinned, publishedAt };
  if (!accepted) return { ...facts, severity: "unsupported" };
  if (latest !== pinned) return { ...facts, severity: "behind" };
  return { ...facts, severity: "in-sync" };
}

/**
 * When the registry says `version` was published, or `null` when it does not.
 *
 * Nullable rather than throwing, and deliberately so: the publish date is one
 * sentence of context on an alert whose entire reason to exist is being sent.
 * A registry that answers with a compact packument (no `time` map at all), a
 * `time` map that has not caught up with `dist-tags`, or a non-string entry
 * must cost the card that sentence — never the alert.
 */
export function readPublishedAt(packument: unknown, version: string): string | null {
  if (typeof packument !== "object" || packument === null) return null;
  const time = (packument as { time?: unknown }).time;
  if (typeof time !== "object" || time === null) return null;
  const published = (time as Record<string, unknown>)[version];
  return typeof published === "string" && published.length > 0 ? published : null;
}

/**
 * `2026-09-03（4 天前）` — the date plus the one thing a bare date does not
 * answer: whether this landed this morning or has been sitting for a fortnight.
 * `null` for anything unparseable, so callers can drop the clause entirely.
 */
export function describePublishedAt(publishedAt: string | null, now: Date): string | null {
  if (publishedAt === null) return null;
  const at = new Date(publishedAt);
  if (Number.isNaN(at.getTime())) return null;
  const day = at.toISOString().slice(0, 10);
  const elapsed = Math.round(
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
      Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())) /
      86_400_000,
  );
  if (elapsed < 0) return day;
  if (elapsed === 0) return `${day}（今天）`;
  return `${day}（${elapsed} 天前）`;
}

async function fetchLatestRelease(): Promise<{ latest: string; publishedAt: string | null }> {
  // The compact packument (`application/vnd.npm.install-v1+json`) carries only
  // name / dist-tags / versions / modified — it has no `time` map, so the card
  // could never say when upstream shipped. This runs once a day; the full
  // document is worth its bytes.
  const response = await fetch(`${REGISTRY}/${encodeURIComponent(PACKAGE)}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`registry returned HTTP ${response.status} for ${PACKAGE}`);
  }
  const body = (await response.json()) as unknown;
  const tags = (body as { "dist-tags"?: Record<string, string> })["dist-tags"];
  const latest = tags?.latest;
  if (!latest) throw new Error(`${PACKAGE} has no dist-tag "latest"`);
  return { latest, publishedAt: readPublishedAt(body, latest) };
}

/**
 * The card a maintainer wakes up to.
 *
 * Read top to bottom it answers, in this order: what check is this, what
 * happened, why it matters, what to change. An earlier version led with a
 * verdict as its headline and opened its body with semver theory, and the
 * maintainer who received it could not tell what the message even was. So the
 * headline names the check and nothing else — severity is carried by the header
 * template, which Feishu renders before a single word of text — and the first
 * sentence is three facts with no reasoning attached: the upstream version,
 * when it shipped, and what we still pin.
 */
export function buildCard(verdict: DriftVerdict, now: Date = new Date()): DriftCard {
  const blocking = verdict.severity === "unsupported";
  const released = describePublishedAt(verdict.publishedAt, now);
  const when = released === null ? "" : `，发布于 ${released}`;
  const situation =
    `上游 \`${PACKAGE}\` 已发布 \`${verdict.latest}\`${when}。` +
    `我们的安装脚本目前钉在 \`${verdict.pinned}\`。`;
  // The bold lead sentence gets its own line: markdown will not close a `**`
  // run that is followed straight by a CJK character, so `**…。**装到` renders
  // the asterisks literally.
  const consequence = blocking
    ? [
        `**\`${verdict.latest}\` 不在我们声明支持的范围内。**`,
        "装到这个版本的用户，CLI 会在设置里被标成「未经测试」，" +
          "而且 `packages/dsh-runtime` 的 peer 范围多半直接解析不出来，组件根本装不上。",
        "（semver 只在比较器带同一 major.minor.patch、且自身也带 prerelease 标签时才放行一个 prerelease，" +
          "所以每条新的 prerelease 线都得单独加一个比较器。）",
      ].join("\n")
    : [
        `**\`${verdict.latest}\` 我们是支持的，只是安装脚本还没跟上。**`,
        `照我们的一行安装命令装的用户会拿到 \`${verdict.pinned}\`，` +
          "比 registry 上的 `latest` 旧一档——能用，但不是最新的。",
      ].join("\n");

  return {
    config: { wide_screen_mode: true },
    elements: [
      { tag: "div", text: { tag: "lark_md", content: situation } },
      { tag: "div", text: { tag: "lark_md", content: consequence } },
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
      title: { content: "DeepSeek Harness 上游新版检测", tag: "plain_text" },
    },
  };
}

function signedEnvelope(card: DriftCard): Record<string, unknown> {
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

async function postFeishu(card: DriftCard): Promise<void> {
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
  const { latest, publishedAt } = await fetchLatestRelease();
  const accepted = listed.includes(latest) || (pattern?.test(latest) ?? false);
  const verdict = classifyDrift({ accepted, latest, pinned, publishedAt });

  console.log(
    `[dsh-drift] pinned=${verdict.pinned} latest=${verdict.latest} ` +
      `published=${verdict.publishedAt ?? "unknown"} ` +
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

  const registryAnswer = {
    "dist-tags": { latest: "0.1.1-rc.2" },
    name: PACKAGE,
    time: { "0.1.0-rc.8": "2026-08-21T09:02:11.000Z", "0.1.1-rc.2": "2026-09-03T06:21:52.107Z" },
  };
  if (readPublishedAt(registryAnswer, "0.1.1-rc.2") !== "2026-09-03T06:21:52.107Z") {
    throw new Error("self-check could not read the publish date out of a packument");
  }
  // The compact packument has no `time` map. Degrading, not throwing, is the
  // whole contract: an alert without a date still beats no alert.
  if (readPublishedAt({ "dist-tags": { latest: "0.1.1-rc.2" } }, "0.1.1-rc.2") !== null) {
    throw new Error("self-check expected a missing publish date to read as null");
  }

  // The state that shipped twice: the installer and the def agreed with each
  // other and both were behind the registry. Anything that reports this as
  // healthy has lost the only thing this check is for.
  const missed = classifyDrift({
    accepted: false,
    latest: "0.1.1-rc.2",
    pinned: "0.1.0-rc.8",
    publishedAt: "2026-09-03T06:21:52.107Z",
  });
  if (missed.severity !== "unsupported") {
    throw new Error("self-check expected the shipped-twice state to be unsupported");
  }

  // `String(card.header)` is "[object Object]" whatever the card says, so the
  // assertion that used to stand here could never fail. Read the fields a human
  // reads instead: the card has to name the check, and its body has to carry
  // all three facts — upstream version, publish date, what we pin — including
  // on the blocking branch, which once mentioned no pinned version at all.
  const card = buildCard(missed, new Date("2026-09-07T00:00:00.000Z"));
  const body = card.elements.map((element) => element.text?.content ?? "").join("\n");
  if (!card.header.title.content.includes("新版检测")) {
    throw new Error("self-check expected the headline to name the check");
  }
  for (const fact of [missed.latest, missed.pinned, "2026-09-03"]) {
    if (!body.includes(fact)) {
      throw new Error(`self-check expected the card body to state ${fact}`);
    }
  }
  const undated = buildCard({ ...missed, publishedAt: null });
  const undatedBody = undated.elements.map((element) => element.text?.content ?? "").join("\n");
  if (!undatedBody.includes(missed.latest) || undatedBody.includes("Invalid Date")) {
    throw new Error("self-check expected an undated verdict to still produce a readable card");
  }

  const behind = classifyDrift({
    accepted: true,
    latest: "0.1.2",
    pinned: "0.1.1-rc.2",
    publishedAt: null,
  });
  if (behind.severity !== "behind") {
    throw new Error("self-check expected an accepted-but-older latest to be behind");
  }
  if (buildCard(behind).header.template !== "orange") {
    throw new Error("self-check expected a non-blocking verdict to stay orange");
  }
  const synced = classifyDrift({
    accepted: true,
    latest: "0.1.1-rc.2",
    pinned: "0.1.1-rc.2",
    publishedAt: null,
  });
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
