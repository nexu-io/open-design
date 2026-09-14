// Feishu (Lark) *application* bot transport.
//
// The custom-bot webhook in `feishu.ts` can only append: once a card is in the
// channel it is frozen, so a build that reports progress has to post one
// message per state change and the channel fills with stale cards. An
// application bot can PATCH a message it sent, which is what lets one card
// track a release from "the pipeline started" to "everything green".
//
// Three endpoints, in the order a caller uses them:
//   POST  /open-apis/auth/v3/tenant_access_token/internal  {app_id, app_secret}
//   POST  /open-apis/im/v1/messages?receive_id_type=chat_id
//   PATCH /open-apis/im/v1/messages/{message_id}
//
// `content` is a JSON *string* on both message endpoints, not an object — the
// card is serialized into a field, and forgetting that is the usual first
// failure (code 230001, "param invalid").

const FEISHU_BASE_URL = process.env.FEISHU_BASE_URL ?? "https://open.feishu.cn";

// Tenant tokens are valid for two hours. A progressive card can outlive that,
// so refresh a minute early rather than discovering expiry as a 99991663.
const TOKEN_LEEWAY_MS = 60_000;
const MAX_ATTEMPTS = 5;

export type FeishuCard = Record<string, unknown>;

export type FeishuAppClientOptions = {
  appId: string;
  appSecret: string;
  /** Injected in tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected in tests so retry backoff does not really sleep. */
  sleepImpl?: (ms: number) => Promise<void>;
  now?: () => number;
};

type FeishuResponse = {
  code?: number;
  msg?: string;
  data?: Record<string, unknown>;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * True for failures worth another attempt: transport errors, 5xx, 429, and the
 * Feishu-side rate limit / internal codes. A 4xx with a Feishu error code is a
 * configuration mistake (bad app secret, bot not in the chat) and retrying it
 * only delays the diagnosis.
 */
function retryable(status: number, code: number | null): boolean {
  if (status === 429 || status >= 500) return true;
  return code === 99991400 || code === 230020 || code === 11232;
}

export class FeishuAppClient {
  readonly #appId: string;
  readonly #appSecret: string;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #now: () => number;
  #token: string | null = null;
  #tokenExpiresAt = 0;

  constructor(options: FeishuAppClientOptions) {
    this.#appId = options.appId;
    this.#appSecret = options.appSecret;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#sleep = options.sleepImpl ?? defaultSleep;
    this.#now = options.now ?? Date.now;
  }

  async #request(path: string, init: RequestInit): Promise<FeishuResponse> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await this.#fetch(`${FEISHU_BASE_URL}${path}`, init);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`[feishu-app] ${path} attempt ${attempt}/${MAX_ATTEMPTS} threw: ${lastError.message}`);
        if (attempt === MAX_ATTEMPTS) break;
        await this.#sleep(Math.min(1000 * 2 ** (attempt - 1), 15_000));
        continue;
      }
      const text = await response.text();
      let parsed: FeishuResponse = {};
      try {
        parsed = JSON.parse(text) as FeishuResponse;
      } catch {
        // Non-JSON body: fall through to the failure path with code null.
      }
      const code = typeof parsed.code === "number" ? parsed.code : null;
      if (response.ok && code === 0) return parsed;
      const detail = `HTTP ${response.status} code ${code ?? "n/a"}: ${text.slice(0, 400)}`;
      lastError = new Error(`Feishu ${path} failed: ${detail}`);
      console.warn(`[feishu-app] ${path} attempt ${attempt}/${MAX_ATTEMPTS} ${detail}`);
      if (!retryable(response.status, code) || attempt === MAX_ATTEMPTS) break;
      await this.#sleep(Math.min(1000 * 2 ** (attempt - 1), 15_000));
    }
    throw lastError ?? new Error(`Feishu ${path} failed`);
  }

  async token(): Promise<string> {
    if (this.#token != null && this.#now() < this.#tokenExpiresAt - TOKEN_LEEWAY_MS) return this.#token;
    const parsed = await this.#request("/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: this.#appId, app_secret: this.#appSecret }),
    });
    const token = (parsed as { tenant_access_token?: unknown }).tenant_access_token;
    if (typeof token !== "string" || token.length === 0) {
      throw new Error("Feishu tenant_access_token response carried no token");
    }
    const expire = (parsed as { expire?: unknown }).expire;
    const ttlMs = typeof expire === "number" && expire > 0 ? expire * 1000 : 7200_000;
    this.#token = token;
    this.#tokenExpiresAt = this.#now() + ttlMs;
    return token;
  }

  /** Post a new interactive card. Returns the message id needed to update it. */
  async sendCard(chatId: string, card: FeishuCard): Promise<string> {
    const token = await this.token();
    const parsed = await this.#request("/open-apis/im/v1/messages?receive_id_type=chat_id", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ receive_id: chatId, msg_type: "interactive", content: JSON.stringify(card) }),
    });
    const messageId = parsed.data?.message_id;
    if (typeof messageId !== "string" || messageId.length === 0) {
      throw new Error("Feishu message send returned no message_id");
    }
    return messageId;
  }

  /** Replace the card of a message this app sent. Whole-card replace, not a merge. */
  async patchCard(messageId: string, card: FeishuCard): Promise<void> {
    const token = await this.token();
    await this.#request(`/open-apis/im/v1/messages/${encodeURIComponent(messageId)}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ content: JSON.stringify(card) }),
    });
  }
}
