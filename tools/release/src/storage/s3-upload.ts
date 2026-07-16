import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

export type StorageConfig = {
  accessKeyId: string;
  bucket: string;
  endpointUrl: string;
  region: string;
  secretAccessKey: string;
  sessionToken?: string;
};

type PutObjectOptions = StorageConfig & {
  body?: Buffer;
  bodyPath?: string;
  cacheControl: string;
  contentType: string;
  headers?: Record<string, string>;
  objectKey: string;
};

type GetObjectOptions = StorageConfig & {
  objectKey: string;
};

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function hash(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function amzTimestamp(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

function objectUrl(config: StorageConfig, objectKey: string): { canonicalUri: string; url: URL } {
  const endpoint = new URL(config.endpointUrl.replace(/\/+$/, ""));
  const endpointPath = endpoint.pathname === "/" ? "" : endpoint.pathname.replace(/\/+$/, "");
  const objectPath = [config.bucket, ...objectKey.split("/")].map(encodePathSegment).join("/");
  const canonicalUri = `${endpointPath}/${objectPath}`;
  const url = new URL(endpoint.toString());
  url.pathname = canonicalUri;
  return { canonicalUri, url };
}

function authorizationHeader(config: StorageConfig, method: "GET" | "PUT", canonicalUri: string, headers: Record<string, string>, payloadHash: string, dateStamp: string): string {
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", headers["x-amz-date"], credentialScope, hash(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), config.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    const causeCode = cause instanceof Error ? (cause as { code?: string }).code : undefined;
    return causeCode != null ? `${error.message} (${causeCode})` : error.message;
  }
  return String(error);
}

// A single PUT/GET of a multi-hundred-MB release artifact over one TLS connection
// periodically eats a transient reset (ECONNRESET) or a 5xx from the storage edge.
// Without a retry the whole release job dies on one blip — so re-sign and resend a
// few times with exponential backoff. Each attempt re-signs because SigV4 ties the
// signature to x-amz-date and a stale date would be rejected after a long backoff.
async function signedFetchWithRetry(label: string, build: () => { init: RequestInit; url: URL }): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const { init, url } = build();
    try {
      const response = await fetch(url, init);
      // 429 and 5xx are transient at the edge; retry. Other 4xx (e.g. 412
      // precondition) are deterministic and must surface to the caller as-is.
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
        const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
        console.warn(`${label}: HTTP ${response.status} (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${delay}ms`);
        await response.body?.cancel().catch(() => {});
        await sleep(delay);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_ATTEMPTS) break;
      const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
      console.warn(`${label}: ${describeError(error)} (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw new Error(`${label}: failed after ${MAX_ATTEMPTS} attempts: ${describeError(lastError)}`);
}

export async function putStorageObject(options: PutObjectOptions): Promise<void> {
  const result = await putStorageObjectWithStatus(options);
  if (!result.ok) {
    throw new Error(`PUT ${result.url} failed with HTTP ${result.status}${result.body.length > 0 ? `: ${result.body}` : ""}`);
  }
}

export async function putStorageObjectWithStatus(options: PutObjectOptions): Promise<{ body: string; ok: boolean; status: number; url: string }> {
  if (options.body == null && options.bodyPath == null) {
    throw new Error("PUT storage object requires body or bodyPath");
  }
  const body = options.body == null ? readFileSync(options.bodyPath ?? "") : Buffer.from(options.body);
  const payloadHash = hash(body);
  const { canonicalUri, url } = objectUrl(options, options.objectKey);
  // x-amz-date is filled in per attempt inside signedFetchWithRetry so the
  // signature never goes stale across a backoff; keep the key present here so it
  // is part of the signed header set.
  const headers: Record<string, string> = {
    "cache-control": options.cacheControl,
    "content-type": options.contentType,
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": "",
    ...(options.headers ?? {}),
  };
  if (options.sessionToken != null && options.sessionToken.length > 0) {
    headers["x-amz-security-token"] = options.sessionToken;
  }

  const response = await signedFetchWithRetry(`PUT ${url.toString()}`, () => {
    const { amzDate, dateStamp } = amzTimestamp(new Date());
    const signedHeaders = { ...headers, "x-amz-date": amzDate };
    return {
      init: {
        body,
        headers: {
          ...signedHeaders,
          Authorization: authorizationHeader(options, "PUT", canonicalUri, signedHeaders, payloadHash, dateStamp),
        },
        method: "PUT",
      },
      url,
    };
  });
  return {
    body: await response.text().catch(() => ""),
    ok: response.ok,
    status: response.status,
    url: url.toString(),
  };
}

export async function getStorageObject(options: GetObjectOptions): Promise<{ bytes: Buffer; etag: string; text: string } | null> {
  const payloadHash = hash("");
  const { canonicalUri, url } = objectUrl(options, options.objectKey);
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": "",
  };
  if (options.sessionToken != null && options.sessionToken.length > 0) {
    headers["x-amz-security-token"] = options.sessionToken;
  }

  const response = await signedFetchWithRetry(`GET ${url.toString()}`, () => {
    const { amzDate, dateStamp } = amzTimestamp(new Date());
    const signedHeaders = { ...headers, "x-amz-date": amzDate };
    return {
      init: {
        headers: {
          ...signedHeaders,
          Authorization: authorizationHeader(options, "GET", canonicalUri, signedHeaders, payloadHash, dateStamp),
        },
        method: "GET",
      },
      url,
    };
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`GET ${url} failed with HTTP ${response.status}${text.length > 0 ? `: ${text}` : ""}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    bytes,
    etag: response.headers.get("etag") ?? "",
    text: bytes.toString("utf8"),
  };
}

export async function getStorageObjectText(options: GetObjectOptions): Promise<string | null> {
  const object = await getStorageObject(options);
  return object?.text ?? null;
}
