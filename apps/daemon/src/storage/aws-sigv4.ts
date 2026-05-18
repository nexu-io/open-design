// Phase 5 / spec §15.6 — minimal AWS Signature V4 signer.
//
// We sign S3 requests inline with the spec'd canonical-request /
// string-to-sign / signing-key / authorization recipe, using only
// node:crypto. No `@aws-sdk/*` dependency is pulled in; the
// substrate stays small and the OD daemon ships without an extra
// 60+ MB of SDK code on disk.
//
// References:
//   https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html
//   https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
//
// Caller passes:
//   - the HTTP method + path + query + headers + body
//   - region + service ('s3') + AWS access key + secret key
//   - optional sessionToken (for STS-vended creds)
//   - optional 'now' override for tests so signatures stay
//     deterministic.
//
// The signer mutates the supplied headers map by adding
// 'authorization', 'x-amz-date', 'x-amz-content-sha256', and (when
// supplied) 'x-amz-security-token'. The caller is responsible for
// setting 'host'.
//
// Path-style vs virtual-host-style: this signer does not care; the
// caller chooses by setting 'host' + path appropriately.

import { createHash, createHmac } from 'node:crypto';

export interface SigV4Credentials {
  accessKeyId:     string;
  secretAccessKey: string;
  sessionToken?:   string;
}

export interface SignSigV4Input {
  method:  string;
  // Canonical path (URI-encoded but with '/' preserved between
  // segments). For S3 object keys, the caller must double-encode
  // RFC-3986-reserved chars beyond the canonical pass.
  path:    string;
  // Already-stringified canonical query (sorted key=value join).
  // Pass '' when the request has no query.
  query:   string;
  // Mutable lower-case header map. The signer adds the four amz
  // headers and the Authorization header.
  headers: Record<string, string>;
  // Raw body bytes; pass an empty Buffer for no-body requests.
  body:    Buffer;
  region:  string;
  service: string;
  credentials: SigV4Credentials;
  // ISO-8601 UTC datetime used for the signature. Defaults to now.
  now?: Date;
}

export interface SignSigV4Result {
  authorization:  string;
  amzDate:        string;
  contentSha256:  string;
}

export function signSigV4(input: SignSigV4Input): SignSigV4Result {
  const now = input.now ?? new Date();
  const amzDate     = formatAmzDate(now);
  const dateStamp   = amzDate.slice(0, 8);
  const contentSha256 = sha256Hex(input.body);

  // Add the required amz headers BEFORE composing the canonical
  // request, since they're part of the signed-headers list.
  input.headers['x-amz-date']           = amzDate;
  input.headers['x-amz-content-sha256'] = contentSha256;
  if (input.credentials.sessionToken) {
    input.headers['x-amz-security-token'] = input.credentials.sessionToken;
  }

  // Canonical headers: lower-case keys + trim values; sort by key.
  const headerKeys = Object.keys(input.headers).map((k) => k.toLowerCase()).sort();
  const canonicalHeaders = headerKeys.map((k) => `${k}:${trimValue(input.headers[k] ?? input.headers[k.toLowerCase()] ?? '')}\n`).join('');
  const signedHeaders    = headerKeys.join(';');

  const canonicalRequest = [
    input.method.toUpperCase(),
    input.path,
    input.query,
    canonicalHeaders,
    signedHeaders,
    contentSha256,
  ].join('\n');

  const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(Buffer.from(canonicalRequest, 'utf8')),
  ].join('\n');

  // Derive the signing key.
  const kDate    = hmac(`AWS4${input.credentials.secretAccessKey}`, dateStamp);
  const kRegion  = hmac(kDate,    input.region);
  const kService = hmac(kRegion,  input.service);
  const kSigning = hmac(kService, 'aws4_request');

  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  input.headers['authorization'] = authorization;

  return { authorization, amzDate, contentSha256 };
}

function sha256Hex(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function trimValue(v: string): string {
  return v.trim().replace(/\s+/g, ' ');
}

function formatAmzDate(d: Date): string {
  const iso = d.toISOString().replace(/[-:]/g, '');
  // ISO is YYYYMMDDTHHmmss.sssZ; AWS expects YYYYMMDDTHHMMSSZ.
  return `${iso.slice(0, 15)}Z`;
}

// URI-encode a path segment per RFC 3986, with the AWS twist that
// the slash separator between segments stays literal. S3 object key
// chars that fall outside the unreserved set get %HH-encoded.
export function encodeS3PathSegment(seg: string): string {
  return encodeURIComponent(seg)
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
