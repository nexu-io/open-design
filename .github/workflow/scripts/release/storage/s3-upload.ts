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
  bodyPath: string;
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

export async function putStorageObject(options: PutObjectOptions): Promise<void> {
  const result = await putStorageObjectWithStatus(options);
  if (!result.ok) {
    throw new Error(`PUT ${result.url} failed with HTTP ${result.status}${result.body.length > 0 ? `: ${result.body}` : ""}`);
  }
}

export async function putStorageObjectWithStatus(options: PutObjectOptions): Promise<{ body: string; ok: boolean; status: number; url: string }> {
  const body = readFileSync(options.bodyPath);
  const payloadHash = hash(body);
  const { amzDate, dateStamp } = amzTimestamp(new Date());
  const { canonicalUri, url } = objectUrl(options, options.objectKey);
  const headers: Record<string, string> = {
    "cache-control": options.cacheControl,
    "content-type": options.contentType,
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(options.headers ?? {}),
  };
  if (options.sessionToken != null && options.sessionToken.length > 0) {
    headers["x-amz-security-token"] = options.sessionToken;
  }

  const response = await fetch(url, {
    body,
    headers: {
      ...headers,
      Authorization: authorizationHeader(options, "PUT", canonicalUri, headers, payloadHash, dateStamp),
    },
    method: "PUT",
  });
  return {
    body: await response.text().catch(() => ""),
    ok: response.ok,
    status: response.status,
    url: url.toString(),
  };
}

export async function getStorageObject(options: GetObjectOptions): Promise<{ etag: string; text: string } | null> {
  const payloadHash = hash("");
  const { amzDate, dateStamp } = amzTimestamp(new Date());
  const { canonicalUri, url } = objectUrl(options, options.objectKey);
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (options.sessionToken != null && options.sessionToken.length > 0) {
    headers["x-amz-security-token"] = options.sessionToken;
  }

  const response = await fetch(url, {
    headers: {
      ...headers,
      Authorization: authorizationHeader(options, "GET", canonicalUri, headers, payloadHash, dateStamp),
    },
    method: "GET",
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`GET ${url} failed with HTTP ${response.status}${text.length > 0 ? `: ${text}` : ""}`);
  }
  return {
    etag: response.headers.get("etag") ?? "",
    text: await response.text(),
  };
}

export async function getStorageObjectText(options: GetObjectOptions): Promise<string | null> {
  const object = await getStorageObject(options);
  return object?.text ?? null;
}
