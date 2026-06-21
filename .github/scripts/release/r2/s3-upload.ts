import { createHmac, createHash } from "node:crypto";
import { readFileSync } from "node:fs";

type UploadS3ObjectOptions = {
  accessKeyId: string;
  bodyPath: string;
  bucket: string;
  cacheControl: string;
  contentType: string;
  endpointUrl: string;
  objectKey: string;
  region: string;
  secretAccessKey: string;
  sessionToken?: string;
};

type GetS3ObjectOptions = {
  accessKeyId: string;
  bucket: string;
  endpointUrl: string;
  objectKey: string;
  region: string;
  secretAccessKey: string;
  sessionToken?: string;
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

export async function uploadS3Object(options: UploadS3ObjectOptions): Promise<void> {
  const endpoint = new URL(options.endpointUrl.replace(/\/+$/, ""));
  const body = readFileSync(options.bodyPath);
  const payloadHash = hash(body);
  const { amzDate, dateStamp } = amzTimestamp(new Date());
  const endpointPath = endpoint.pathname === "/" ? "" : endpoint.pathname.replace(/\/+$/, "");
  const objectPath = [options.bucket, ...options.objectKey.split("/")].map(encodePathSegment).join("/");
  const canonicalUri = `${endpointPath}/${objectPath}`;
  const url = new URL(endpoint.toString());
  url.pathname = canonicalUri;

  const headers: Record<string, string> = {
    "cache-control": options.cacheControl,
    "content-type": options.contentType,
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (options.sessionToken != null && options.sessionToken.length > 0) {
    headers["x-amz-security-token"] = options.sessionToken;
  }

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${options.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, hash(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${options.secretAccessKey}`, dateStamp), options.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(url, {
    body,
    headers: {
      ...headers,
      Authorization: authorization,
    },
    method: "PUT",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`PUT ${url} failed with HTTP ${response.status}${text.length > 0 ? `: ${text}` : ""}`);
  }
}

export async function getS3ObjectText(options: GetS3ObjectOptions): Promise<string | null> {
  const endpoint = new URL(options.endpointUrl.replace(/\/+$/, ""));
  const payloadHash = hash("");
  const { amzDate, dateStamp } = amzTimestamp(new Date());
  const endpointPath = endpoint.pathname === "/" ? "" : endpoint.pathname.replace(/\/+$/, "");
  const objectPath = [options.bucket, ...options.objectKey.split("/")].map(encodePathSegment).join("/");
  const canonicalUri = `${endpointPath}/${objectPath}`;
  const url = new URL(endpoint.toString());
  url.pathname = canonicalUri;

  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (options.sessionToken != null && options.sessionToken.length > 0) {
    headers["x-amz-security-token"] = options.sessionToken;
  }

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const canonicalRequest = ["GET", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${options.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, hash(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${options.secretAccessKey}`, dateStamp), options.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(url, {
    headers: {
      ...headers,
      Authorization: authorization,
    },
    method: "GET",
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`GET ${url} failed with HTTP ${response.status}${text.length > 0 ? `: ${text}` : ""}`);
  }
  return await response.text();
}
