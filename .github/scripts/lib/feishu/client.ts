import { createHmac } from "node:crypto";

export type ReleaseFeishuBot = {
  signSecret: string;
  webhook: string;
};

export function decodeReleaseFeishuBot(value: string): ReleaseFeishuBot | null {
  if (value.trim().length === 0) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(value) as unknown;
  } catch {
    throw new Error('release Feishu bot must use JSON tuple codec ["v1","webhook","sign-secret"]');
  }
  if (
    !Array.isArray(decoded)
    || decoded.length !== 3
    || decoded[0] !== "v1"
    || typeof decoded[1] !== "string"
    || typeof decoded[2] !== "string"
  ) throw new Error('release Feishu bot must use JSON tuple codec ["v1","webhook","sign-secret"]');
  const parsed = new URL(decoded[1]);
  const isFeishu = parsed.protocol === "https:"
    && ["open.feishu.cn", "open.larksuite.com"].includes(parsed.hostname)
    && /^\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9_-]+$/u.test(parsed.pathname);
  const isLoopbackFixture = parsed.protocol === "http:"
    && ["127.0.0.1", "localhost"].includes(parsed.hostname);
  if (!isFeishu && !isLoopbackFixture) {
    throw new Error("release Feishu bot webhook must be a Feishu/Lark custom-bot v2 hook URL");
  }
  return { signSecret: decoded[2], webhook: parsed.toString() };
}

export type FeishuCard = Record<string, unknown>;

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function optionalEnv(name: string, fallback = ""): string {
  const value = process.env[name];
  return value == null || value.length === 0 ? fallback : value;
}

export function createFeishuSignedEnvelope(
  card: FeishuCard,
  signSecret: string,
): Record<string, unknown> {
  const envelope = { msg_type: "interactive", card };
  if (signSecret.length === 0) return envelope;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const stringToSign = `${timestamp}\n${signSecret}`;
  const sign = createHmac("sha256", stringToSign).update("").digest("base64");
  return { timestamp, sign, ...envelope };
}

function sleep(attempt: number): Promise<void> {
  const ms = Math.min(1000 * 2 ** (attempt - 1), 15000);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function postFeishuWebhook(
  webhook: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const attempts = 5;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(webhook, {
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
    const text = await response.text();
    let code: unknown = null;
    try {
      const parsed = JSON.parse(text) as { code?: unknown; StatusCode?: unknown };
      code = parsed.code ?? parsed.StatusCode ?? null;
    } catch {
      // A non-JSON response has no bot-specific status code.
    }
    if (response.ok && (code === 0 || code === null)) {
      console.log(`[feishu] delivered (HTTP ${response.status}, code ${code ?? "n/a"})`);
      return;
    }
    console.warn(`[feishu] POST attempt ${attempt}/${attempts} HTTP ${response.status} code ${String(code)}: ${text.slice(0, 500)}`);
    const retryable = response.status === 429 || response.status >= 500 || code === 9499;
    if (!retryable || attempt === attempts) {
      throw new Error(`Feishu webhook failed: HTTP ${response.status} code ${String(code)}`);
    }
    await sleep(attempt);
  }
}
