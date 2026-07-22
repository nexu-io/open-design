import { createHmac, timingSafeEqual } from 'node:crypto';

export const CHATGPT_STUDIO_COOKIE = 'od_chatgpt_studio';

export type ChatGptCapabilityPurpose = 'preview' | 'studio';

export interface ChatGptCapabilityClaims {
  v: 1;
  purpose: ChatGptCapabilityPurpose;
  tenantKey: string;
  projectId: string;
  exp: number;
  conversationId?: string;
  entryFile?: string;
}

export interface CreateChatGptCapabilityInput {
  purpose: ChatGptCapabilityPurpose;
  tenantKey: string;
  projectId: string;
  conversationId?: string | null;
  entryFile?: string | null;
}

const TENANT_KEY_RE = /^[a-f0-9]{64}$/u;
const DEFAULT_CAPABILITY_TTL_SECONDS = 60 * 60;
const MAX_CAPABILITY_TTL_SECONDS = 24 * 60 * 60;

function assertSigningSecret(secret: string): void {
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('ChatGPT capability signing secret must be at least 32 bytes.');
  }
}

function signature(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

function validOptionalString(value: unknown, maxLength: number): value is string | undefined {
  return value === undefined
    || (typeof value === 'string' && value.length > 0 && value.length <= maxLength);
}

function isClaims(value: unknown, nowSeconds: number): value is ChatGptCapabilityClaims {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const claims = value as Partial<ChatGptCapabilityClaims>;
  return claims.v === 1
    && (claims.purpose === 'preview' || claims.purpose === 'studio')
    && typeof claims.tenantKey === 'string'
    && TENANT_KEY_RE.test(claims.tenantKey)
    && typeof claims.projectId === 'string'
    && claims.projectId.length > 0
    && claims.projectId.length <= 256
    && Number.isInteger(claims.exp)
    && Number(claims.exp) > nowSeconds
    && validOptionalString(claims.conversationId, 256)
    && validOptionalString(claims.entryFile, 2_048);
}

export function chatGptCapabilitySecret(env: NodeJS.ProcessEnv): string {
  const independent = String(env.OD_CHATGPT_CAPABILITY_SIGNING_SECRET ?? '').trim();
  const secret = independent
    || String(env.OD_CHATGPT_TENANT_GATEWAY_SECRET ?? '').trim();
  assertSigningSecret(secret);
  return secret;
}

export function chatGptCapabilityTtlSeconds(env: NodeJS.ProcessEnv): number {
  const raw = String(
    env.OD_CHATGPT_CAPABILITY_TTL_SECONDS ?? DEFAULT_CAPABILITY_TTL_SECONDS,
  );
  const ttl = Number.parseInt(raw, 10);
  if (!Number.isInteger(ttl) || ttl <= 0 || ttl > MAX_CAPABILITY_TTL_SECONDS) {
    throw new Error(
      `OD_CHATGPT_CAPABILITY_TTL_SECONDS must be between 1 and ${MAX_CAPABILITY_TTL_SECONDS}.`,
    );
  }
  return ttl;
}

export function createChatGptCapabilityToken(
  input: CreateChatGptCapabilityInput,
  secret: string,
  options: { nowMs?: number; ttlSeconds?: number } = {},
): string {
  assertSigningSecret(secret);
  if (!TENANT_KEY_RE.test(input.tenantKey)) {
    throw new Error('ChatGPT capability tenant key must be a SHA-256 hex digest.');
  }
  if (!input.projectId || input.projectId.length > 256) {
    throw new Error('ChatGPT capability project id is invalid.');
  }
  const nowMs = options.nowMs ?? Date.now();
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_CAPABILITY_TTL_SECONDS;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > MAX_CAPABILITY_TTL_SECONDS) {
    throw new Error('ChatGPT capability TTL is invalid.');
  }
  const claims: ChatGptCapabilityClaims = {
    v: 1,
    purpose: input.purpose,
    tenantKey: input.tenantKey,
    projectId: input.projectId,
    exp: Math.floor(nowMs / 1000) + ttlSeconds,
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.entryFile ? { entryFile: input.entryFile } : {}),
  };
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  return `${payload}.${signature(payload, secret).toString('base64url')}`;
}

export function verifyChatGptCapabilityToken(
  token: string,
  secret: string,
  options: { nowMs?: number } = {},
): ChatGptCapabilityClaims | null {
  try {
    assertSigningSecret(secret);
    const [payload, encodedSignature, extra] = token.split('.');
    if (!payload || !encodedSignature || extra !== undefined) return null;
    const actual = Buffer.from(encodedSignature, 'base64url');
    const expected = signature(payload, secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
    const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
    return isClaims(claims, nowSeconds) ? claims : null;
  } catch {
    return null;
  }
}

export function chatGptStudioCookieToken(cookieHeader: string | undefined): string | null {
  for (const entry of String(cookieHeader ?? '').split(';')) {
    const [rawName, ...rawValue] = entry.trim().split('=');
    if (rawName !== CHATGPT_STUDIO_COOKIE) continue;
    const value = rawValue.join('=');
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function encodeChatGptCapabilityPath(pathValue: string): string {
  return pathValue
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}
