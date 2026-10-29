// Short-term Bedrock API keys minted from an AWS profile.
//
// Bedrock accepts two bearer shapes on `Authorization: Bearer`: the long-term
// `ABSK...` key the user pastes in API-key mode, and a short-term key that is
// a SigV4-presigned `bedrock:CallWithBearerToken` request encoded in base64
// (the format produced by aws-bedrock-token-generator). Minting the second one
// from the user's AWS profile lets the AWS-profile mode run through exactly
// the same provider config as the API-key mode: same endpoints, same SDK
// paths, same limits. Only the way the bearer is obtained differs.
//
// Credentials come from `aws configure export-credentials` (AWS CLI v2), which
// resolves SSO, assumed roles and static profiles alike; the daemon never
// reads ~/.aws itself. The presign is ~60 lines of node:crypto, so no AWS SDK
// enters the daemon. The bearer is bounded by the credentials' own lifetime
// and by `expiresSeconds` (12 h max, the service limit).
import { createHash, createHmac } from 'node:crypto';

import {
  AWS_CLI_BIN,
  classifyBedrockCliFailure,
  isSsoTokenExpiredError,
  runAwsCli,
  type CliRunner,
} from './bedrock-aws-cli.js';
import { resolveOnPath } from '../runtimes/executables.js';

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface MintBedrockBearerOptions {
  /** Token lifetime in seconds; capped to the 12 h service maximum. */
  expiresSeconds?: number;
  /** Clock override for tests. */
  now?: () => Date;
}

const BEARER_PREFIX = 'bedrock-api-key-';
const BEARER_HOST = 'bedrock.amazonaws.com';
const BEARER_SERVICE = 'bedrock';
const BEARER_ACTION = 'CallWithBearerToken';
export const BEDROCK_BEARER_MAX_SECONDS = 12 * 60 * 60;

const sha256Hex = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');
const hmac = (key: Buffer | string, value: string): Buffer => createHmac('sha256', key).update(value, 'utf8').digest();
const rfc3986 = (value: string): string =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** SigV4 query-string presign of `POST https://bedrock.amazonaws.com/?Action=CallWithBearerToken`. */
export function mintBedrockBearerToken(
  credentials: AwsCredentials,
  region: string,
  options: MintBedrockBearerOptions = {},
): string {
  const now = (options.now ?? (() => new Date()))();
  const expires = Math.min(Math.max(1, Math.floor(options.expiresSeconds ?? BEDROCK_BEARER_MAX_SECONDS)), BEDROCK_BEARER_MAX_SECONDS);
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/${BEARER_SERVICE}/aws4_request`;

  const query: Record<string, string> = {
    Action: BEARER_ACTION,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${credentials.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
    ...(credentials.sessionToken ? { 'X-Amz-Security-Token': credentials.sessionToken } : {}),
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((key) => `${rfc3986(key)}=${rfc3986(query[key]!)}`)
    .join('&');
  const canonicalRequest = ['POST', '/', canonicalQuery, `host:${BEARER_HOST}\n`, 'host', sha256Hex('')].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, dateStamp), region), BEARER_SERVICE), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  // `Version=1` is appended after signing, outside the canonical query. That is
  // the reference token format (aws-bedrock-token-generator does the same) and
  // the CallWithBearerToken verifier accepts it; verified live on 2026-09-11.
  const presigned = `${BEARER_HOST}/?${canonicalQuery}&X-Amz-Signature=${signature}&Version=1`;
  return BEARER_PREFIX + Buffer.from(presigned, 'utf8').toString('base64');
}

export interface ResolveProfileBearerDeps {
  resolveAwsCli?: () => string | null;
  runCli?: CliRunner;
  now?: () => Date;
  timeoutMs?: number;
}

export type ProfileBearerFailureReason = 'aws_cli_missing' | 'sso_expired' | 'credentials_unavailable';

export class BedrockProfileBearerError extends Error {
  constructor(
    readonly reason: ProfileBearerFailureReason,
    message: string,
  ) {
    super(message);
    this.name = 'BedrockProfileBearerError';
  }
}

/**
 * Resolve the profile's current credentials through the AWS CLI and mint a
 * short-term Bedrock bearer for `region`. Never launches an SSO login: an
 * expired session surfaces as `sso_expired` so the UI can offer the explicit
 * sign-in action.
 */
export async function resolveBedrockBearerForProfile(
  profile: string,
  region: string,
  deps: ResolveProfileBearerDeps = {},
): Promise<string> {
  const awsBin = (deps.resolveAwsCli ?? (() => resolveOnPath(AWS_CLI_BIN)))();
  if (!awsBin) {
    throw new BedrockProfileBearerError('aws_cli_missing', 'AWS CLI v2 is required for the AWS profile mode.');
  }
  const runCli = deps.runCli ?? runAwsCli;
  const result = await runCli(
    awsBin,
    ['configure', 'export-credentials', '--profile', profile, '--format', 'process'],
    { timeoutMs: deps.timeoutMs ?? 20_000 },
  );
  if (result.spawnError) {
    throw new BedrockProfileBearerError('credentials_unavailable', `Could not run the AWS CLI: ${result.spawnError.message}`);
  }
  if (result.timedOut) {
    throw new BedrockProfileBearerError('credentials_unavailable', 'The AWS CLI did not return credentials in time.');
  }
  if (result.code !== 0) {
    const classified = classifyBedrockCliFailure(result.stderr);
    throw new BedrockProfileBearerError(
      isSsoTokenExpiredError(result.stderr) ? 'sso_expired' : 'credentials_unavailable',
      classified.detail,
    );
  }
  let parsed: { AccessKeyId?: unknown; SecretAccessKey?: unknown; SessionToken?: unknown };
  try {
    parsed = JSON.parse(result.stdout) as typeof parsed;
  } catch {
    throw new BedrockProfileBearerError('credentials_unavailable', 'The AWS CLI returned unreadable credentials.');
  }
  if (typeof parsed.AccessKeyId !== 'string' || typeof parsed.SecretAccessKey !== 'string') {
    throw new BedrockProfileBearerError('credentials_unavailable', 'The AWS profile resolved no credentials.');
  }
  return mintBedrockBearerToken(
    {
      accessKeyId: parsed.AccessKeyId,
      secretAccessKey: parsed.SecretAccessKey,
      ...(typeof parsed.SessionToken === 'string' ? { sessionToken: parsed.SessionToken } : {}),
    },
    region,
    { ...(deps.now ? { now: deps.now } : {}) },
  );
}
