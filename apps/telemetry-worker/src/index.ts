const DEFAULT_LANGFUSE_BASE_URL = 'https://us.cloud.langfuse.com';
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_BATCH_EVENTS = 100;
const DEFAULT_OBJECT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_OBJECT_BATCH_MAX_BYTES = 20 * 1024 * 1024;
const RELAY_MARKER_HEADER = 'X-Open-Design-Telemetry';
const RELAY_MARKER_VALUE = 'langfuse-ingestion-v1';
const OBJECT_RELAY_MARKER_VALUE = 'object-ingestion-v1';
const OBJECT_UPLOAD_TOKEN_TTL_SECONDS = 5 * 60;
const OBJECT_AUTHORIZE_MAX_OBJECTS = 1000;
const OBJECT_SCOPE_TTL_SECONDS = 10 * 60;
const ALLOWED_EVENT_TYPES = new Set([
  'trace-create',
  'span-create',
  'generation-create',
  'event-create',
  'score-create',
]);

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface R2BucketBinding {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream,
    options?: {
      httpMetadata?: {
        contentType?: string;
      };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
}

interface ObjectScopeBinding {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<unknown>;
}

export interface Env {
  LANGFUSE_PUBLIC_KEY?: string;
  LANGFUSE_SECRET_KEY?: string;
  LANGFUSE_BASE_URL?: string;
  TRACE_OBJECT_BUCKET?: R2BucketBinding;
  TRACE_OBJECT_PREFIX?: string;
  TRACE_OBJECT_MAX_BYTES?: string;
  TRACE_OBJECT_BATCH_MAX_BYTES?: string;
  TRACE_OBJECT_UPLOAD_SECRET?: string;
  TRACE_OBJECT_SCOPE_KV?: ObjectScopeBinding;
  TELEMETRY_CLIENT_RATE_LIMITER?: RateLimitBinding;
  TELEMETRY_IP_RATE_LIMITER?: RateLimitBinding;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function bodySizeBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function base64UrlEncode(value: string): string {
  return btoa(value)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value: string): string | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=');
    return atob(padded);
  } catch {
    return null;
  }
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

interface ObjectUploadScopeObject {
  storage_ref: string;
  object_class: string;
  size_bytes: number;
  sha256: string;
}

interface ObjectUploadTokenPayload {
  version: 1;
  client_id: string;
  project_id: string;
  run_id: string;
  exp: number;
  objects: ObjectUploadScopeObject[];
}

function isAllowedObjectClass(value: unknown): value is 'attachment' | 'artifact' | 'input_text_snapshot' {
  return (
    typeof value === 'string' &&
    ['attachment', 'artifact', 'input_text_snapshot'].includes(value)
  );
}

function objectScopeKey(object: Pick<ObjectUploadScopeObject, 'storage_ref' | 'object_class'>): string {
  return `${object.object_class}\n${object.storage_ref}`;
}

function objectAuthorityRegistryKey(clientId: string, projectId: string, runId: string): string {
  const raw = JSON.stringify({ clientId, projectId, runId });
  return `trace-object-scope:${base64UrlEncode(raw)}`;
}

function validateObjectScopeBody(value: unknown, maxObjects: number): string | null {
  if (!isRecord(value)) return 'body must be a JSON object';
  if (typeof value.client_id !== 'string' || value.client_id.length === 0) {
    return 'body.client_id must be a string';
  }
  if (typeof value.project_id !== 'string' || value.project_id.length === 0) {
    return 'body.project_id must be a string';
  }
  if (typeof value.run_id !== 'string' || value.run_id.length === 0) {
    return 'body.run_id must be a string';
  }
  if (!Array.isArray(value.objects)) return 'body.objects must be an array';
  if (value.objects.length === 0) return 'body.objects must not be empty';
  if (value.objects.length > maxObjects) return 'body.objects has too many objects';

  for (const [index, object] of value.objects.entries()) {
    if (!isRecord(object)) return `body.objects[${index}] must be an object`;
    if (typeof object.storage_ref !== 'string' || !object.storage_ref.startsWith('od://objects/')) {
      return `body.objects[${index}].storage_ref must be an od://objects reference`;
    }
    if (!isAllowedObjectClass(object.object_class)) {
      return `body.objects[${index}].object_class must be an allowed object class`;
    }
    const expectedPrefix = expectedStorageRefPrefix(
      value.project_id,
      value.run_id,
      object.object_class,
    );
    if (!expectedPrefix || !object.storage_ref.startsWith(expectedPrefix)) {
      return `body.objects[${index}].storage_ref must match the project, run, and object class`;
    }
    if (
      typeof object.size_bytes !== 'number' ||
      !Number.isFinite(object.size_bytes) ||
      object.size_bytes < 0
    ) {
      return `body.objects[${index}].size_bytes must be a non-negative number`;
    }
    if (
      typeof object.sha256 !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/i.test(object.sha256)
    ) {
      return `body.objects[${index}].sha256 must be a sha256 hex digest`;
    }
  }
  return null;
}

async function signUploadToken(
  env: Env,
  payload: ObjectUploadTokenPayload,
): Promise<string | null> {
  const uploadSecret = env.TRACE_OBJECT_UPLOAD_SECRET?.trim();
  if (!uploadSecret) return null;
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacSha256Hex(uploadSecret, payloadPart);
  return `${payloadPart}.${signature}`;
}

async function verifyUploadToken(
  env: Env,
  token: string,
): Promise<ObjectUploadTokenPayload | null> {
  const uploadSecret = env.TRACE_OBJECT_UPLOAD_SECRET?.trim();
  if (!uploadSecret) return null;
  const [payloadPart, signaturePart, ...rest] = token.split('.');
  if (!payloadPart || !signaturePart || rest.length > 0) return null;
  if (!/^[a-f0-9]{64}$/i.test(signaturePart)) return null;
  const expected = await hmacSha256Hex(uploadSecret, payloadPart);
  if (!timingSafeEqualHex(expected, signaturePart.toLowerCase())) return null;
  const decoded = base64UrlDecode(payloadPart);
  if (!decoded) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== 1) return null;
  if (
    typeof parsed.client_id !== 'string' ||
    typeof parsed.project_id !== 'string' ||
    typeof parsed.run_id !== 'string' ||
    typeof parsed.exp !== 'number' ||
    !Array.isArray(parsed.objects)
  ) {
    return null;
  }
  const validationError = validateObjectScopeBody(parsed, OBJECT_AUTHORIZE_MAX_OBJECTS);
  if (validationError != null) return null;
  if (Math.floor(Date.now() / 1000) > parsed.exp) return null;
  return parsed as unknown as ObjectUploadTokenPayload;
}

function basicAuthHeader(publicKey: string, secretKey: string): string {
  const bytes = new TextEncoder().encode(`${publicKey}:${secretKey}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

function validateIngestionBody(value: unknown): string | null {
  if (!isRecord(value)) return 'body must be a JSON object';
  const batch = value.batch;
  if (!Array.isArray(batch)) return 'body.batch must be an array';
  if (batch.length === 0) return 'body.batch must not be empty';
  if (batch.length > MAX_BATCH_EVENTS) return 'body.batch has too many events';

  for (const [index, event] of batch.entries()) {
    if (!isRecord(event)) return `body.batch[${index}] must be an object`;
    if (typeof event.id !== 'string' || event.id.length === 0) {
      return `body.batch[${index}].id must be a string`;
    }
    if (event.id.length > 200) return `body.batch[${index}].id is too long`;
    if (typeof event.type !== 'string' || !ALLOWED_EVENT_TYPES.has(event.type)) {
      return `body.batch[${index}].type is not allowed`;
    }
    if (!isRecord(event.body)) return `body.batch[${index}].body must be an object`;
  }
  return null;
}

function findTraceUserId(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.batch)) return null;
  for (const event of value.batch) {
    if (!isRecord(event) || event.type !== 'trace-create' || !isRecord(event.body)) {
      continue;
    }
    const userId = event.body.userId;
    return typeof userId === 'string' && userId.length > 0 ? userId.slice(0, 200) : null;
  }
  return null;
}

function findObjectClientId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const clientId = value.client_id ?? value.installation_id;
  return typeof clientId === 'string' && clientId.length > 0
    ? clientId.slice(0, 200)
    : null;
}

async function enforceClientRateLimit(
  env: Env,
  parsedBody: unknown,
  findClientId: (value: unknown) => string | null = findTraceUserId,
): Promise<Response | null> {
  const clientKey = findClientId(parsedBody);
  if (clientKey && env.TELEMETRY_CLIENT_RATE_LIMITER) {
    const { success } = await env.TELEMETRY_CLIENT_RATE_LIMITER.limit({
      key: `client:${clientKey}`,
    });
    if (!success) return jsonResponse(429, { error: 'rate limit exceeded' });
  }

  return null;
}

async function enforceIpRateLimit(request: Request, env: Env): Promise<Response | null> {
  const ip = request.headers.get('CF-Connecting-IP')?.trim();
  if (ip && env.TELEMETRY_IP_RATE_LIMITER) {
    const { success } = await env.TELEMETRY_IP_RATE_LIMITER.limit({
      key: `ip:${ip}`,
    });
    if (!success) return jsonResponse(429, { error: 'rate limit exceeded' });
  }

  return null;
}

async function enforceRateLimits(
  request: Request,
  env: Env,
  parsedBody: unknown,
  findClientId: (value: unknown) => string | null = findTraceUserId,
): Promise<Response | null> {
  return (
    await enforceClientRateLimit(env, parsedBody, findClientId)
  ) ?? enforceIpRateLimit(request, env);
}

async function readBoundedBody(request: Request): Promise<string | Response> {
  const contentLength = request.headers.get('content-length');
  if (contentLength != null && Number(contentLength) > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'payload too large' });
  }

  const text = await request.text();
  if (bodySizeBytes(text) > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'payload too large' });
  }
  return text;
}

async function readBoundedBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<string | Response> {
  const contentLength = request.headers.get('content-length');
  if (contentLength != null && Number(contentLength) > maxBytes) {
    return jsonResponse(413, { error: 'payload too large' });
  }

  const text = await request.text();
  if (bodySizeBytes(text) > maxBytes) {
    return jsonResponse(413, { error: 'payload too large' });
  }
  return text;
}

function resolveLangfuseUrl(env: Env): string {
  return `${(env.LANGFUSE_BASE_URL?.trim() || DEFAULT_LANGFUSE_BASE_URL).replace(/\/+$/, '')}/api/public/ingestion`;
}

function hasLangfuseCredentials(env: Env): boolean {
  return Boolean(env.LANGFUSE_PUBLIC_KEY?.trim() && env.LANGFUSE_SECRET_KEY?.trim());
}

function hasObjectRelayConfig(env: Env): boolean {
  return Boolean(env.TRACE_OBJECT_BUCKET && env.TRACE_OBJECT_UPLOAD_SECRET?.trim());
}

function hasObjectAuthorizeConfig(env: Env): boolean {
  return hasObjectRelayConfig(env) && Boolean(env.TRACE_OBJECT_SCOPE_KV);
}

function isHealthPath(request: Request): boolean {
  const { pathname } = new URL(request.url);
  return pathname === '/api/langfuse' || pathname === '/health';
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function normalizeObjectPrefix(raw: string | undefined): string {
  return (raw ?? 'observability').trim().replace(/^\/+|\/+$/g, '') || 'observability';
}

function safeObjectSegment(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/[^A-Za-z0-9._=-]/g, '_'))
    .filter((segment) => segment !== '.' && segment !== '..')
    .join('/');
}

function expectedStorageRefPrefix(
  projectId: string,
  runId: string,
  objectClass: string,
): string | null {
  const safeProject = safeObjectSegment(projectId);
  const safeRun = safeObjectSegment(runId);
  const safeClass = safeObjectSegment(objectClass);
  if (!safeProject || !safeRun || !safeClass) return null;
  return `od://objects/workspaces/unknown/projects/${safeProject}/runs/${safeRun}/${safeClass}/`;
}

function keyFromStorageRef(storageRef: string, prefix: string): string | null {
  const marker = 'od://objects/';
  if (!storageRef.startsWith(marker)) return null;
  const suffix = safeObjectSegment(storageRef.slice(marker.length));
  if (!suffix) return null;
  return `${prefix}/${suffix}`;
}

function decodeBase64(input: string): Uint8Array | null {
  try {
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function traceCreateEventIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  if (!isRecord(value) || !Array.isArray(value.batch)) return ids;
  for (const event of value.batch) {
    if (
      isRecord(event) &&
      event.type === 'trace-create' &&
      typeof event.id === 'string' &&
      event.id.length > 0
    ) {
      ids.add(event.id);
    }
  }
  return ids;
}

function eventResultIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(value)) return ids;
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id.length === 0) continue;
    ids.add(item.id);
  }
  return ids;
}

function acceptedTraceCreateEventIds(responseBody: string, requestBody: unknown): Set<string> {
  const traceIds = traceCreateEventIds(requestBody);
  if (traceIds.size === 0 || !responseBody) return traceIds;
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    return traceIds;
  }
  if (!isRecord(parsed)) return traceIds;

  const successes = eventResultIds(parsed.successes);
  if (successes.size > 0) {
    return new Set([...traceIds].filter((id) => successes.has(id)));
  }

  const errors = eventResultIds(parsed.errors);
  if (errors.size > 0) {
    return new Set([...traceIds].filter((id) => !errors.has(id)));
  }

  return traceIds;
}

function validateObjectBody(value: unknown): string | null {
  if (!isRecord(value)) return 'body must be a JSON object';
  if (typeof value.client_id !== 'string' || value.client_id.length === 0) {
    return 'body.client_id must be a string';
  }
  if (typeof value.project_id !== 'string' || value.project_id.length === 0) {
    return 'body.project_id must be a string';
  }
  if (typeof value.run_id !== 'string' || value.run_id.length === 0) {
    return 'body.run_id must be a string';
  }
  if (typeof value.upload_token !== 'string' || value.upload_token.length === 0) {
    return 'body.upload_token must be a string';
  }
  if (!Array.isArray(value.objects)) return 'body.objects must be an array';
  if (value.objects.length === 0) return 'body.objects must not be empty';
  if (value.objects.length > 100) return 'body.objects has too many objects';

  for (const [index, object] of value.objects.entries()) {
    if (!isRecord(object)) return `body.objects[${index}] must be an object`;
    if (typeof object.storage_ref !== 'string' || !object.storage_ref.startsWith('od://objects/')) {
      return `body.objects[${index}].storage_ref must be an od://objects reference`;
    }
    if (!isAllowedObjectClass(object.object_class)) {
      return `body.objects[${index}].object_class must be an allowed object class`;
    }
    const expectedPrefix = expectedStorageRefPrefix(
      value.project_id,
      value.run_id,
      object.object_class,
    );
    if (!expectedPrefix || !object.storage_ref.startsWith(expectedPrefix)) {
      return `body.objects[${index}].storage_ref must match the project, run, and object class`;
    }
    if (typeof object.content_base64 !== 'string' || object.content_base64.length === 0) {
      return `body.objects[${index}].content_base64 must be a string`;
    }
    if (object.mime !== undefined && typeof object.mime !== 'string') {
      return `body.objects[${index}].mime must be a string`;
    }
  }
  return null;
}

function manifestObjectsFromMetadata(metadata: unknown): ObjectUploadScopeObject[] {
  if (!isRecord(metadata)) return [];
  const out: ObjectUploadScopeObject[] = [];
  for (const key of [
    'attachment_manifest',
    'artifact_manifest',
    'input_text_snapshot_manifest',
  ]) {
    const entries = metadata[key];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!isRecord(entry)) continue;
      if (
        typeof entry.storage_ref !== 'string' ||
        !isAllowedObjectClass(entry.object_class) ||
        typeof entry.size_bytes !== 'number' ||
        !Number.isFinite(entry.size_bytes) ||
        entry.size_bytes < 0 ||
        typeof entry.sha256 !== 'string' ||
        !/^sha256:[a-f0-9]{64}$/i.test(entry.sha256)
      ) {
        continue;
      }
      out.push({
        storage_ref: entry.storage_ref,
        object_class: entry.object_class,
        size_bytes: Math.floor(entry.size_bytes),
        sha256: entry.sha256.toLowerCase(),
      });
    }
  }
  return out;
}

async function registerObjectUploadScopes(
  env: Env,
  parsed: unknown,
  acceptedTraceEventIds: Set<string>,
): Promise<void> {
  if (!env.TRACE_OBJECT_SCOPE_KV || !isRecord(parsed) || !Array.isArray(parsed.batch)) return;
  for (const event of parsed.batch) {
    if (!isRecord(event) || event.type !== 'trace-create' || !isRecord(event.body)) continue;
    if (typeof event.id !== 'string' || !acceptedTraceEventIds.has(event.id)) continue;
    const body = event.body;
    const metadata = body.metadata;
    if (!isRecord(metadata)) continue;
    const clientId = typeof body.userId === 'string' && body.userId.length > 0
      ? body.userId
      : null;
    const projectId = typeof metadata.projectId === 'string' && metadata.projectId.length > 0
      ? metadata.projectId
      : null;
    const runId = typeof body.id === 'string' && body.id.length > 0
      ? body.id
      : null;
    if (!clientId || !projectId || !runId) continue;
    const objects = manifestObjectsFromMetadata(metadata);
    if (objects.length === 0) continue;
    await env.TRACE_OBJECT_SCOPE_KV.put(
      objectAuthorityRegistryKey(clientId, projectId, runId),
      JSON.stringify({ version: 1, client_id: clientId, project_id: projectId, run_id: runId, objects }),
      { expirationTtl: OBJECT_SCOPE_TTL_SECONDS },
    );
  }
}

async function loadRegisteredObjectScopes(
  env: Env,
  clientId: string,
  projectId: string,
  runId: string,
): Promise<ObjectUploadScopeObject[] | null> {
  const raw = await env.TRACE_OBJECT_SCOPE_KV?.get(
    objectAuthorityRegistryKey(clientId, projectId, runId),
  );
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.objects)) return null;
  const validationError = validateObjectScopeBody(parsed, OBJECT_AUTHORIZE_MAX_OBJECTS);
  if (validationError != null) return null;
  return (parsed as unknown as ObjectUploadTokenPayload).objects;
}

async function handleObjectAuthorizeRequest(request: Request, env: Env): Promise<Response> {
  if (request.headers.get(RELAY_MARKER_HEADER) !== OBJECT_RELAY_MARKER_VALUE) {
    return jsonResponse(403, { error: 'missing object client marker' });
  }
  if (!hasObjectAuthorizeConfig(env)) {
    return jsonResponse(503, { error: 'object relay upload authority is not configured' });
  }
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return jsonResponse(415, { error: 'content-type must be application/json' });
  }
  const ipRateLimitResponse = await enforceIpRateLimit(request, env);
  if (ipRateLimitResponse) return ipRateLimitResponse;

  const rawBody = await readBoundedBody(request);
  if (rawBody instanceof Response) return rawBody;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, { error: 'invalid JSON' });
  }
  const validationError = validateObjectScopeBody(parsed, OBJECT_AUTHORIZE_MAX_OBJECTS);
  if (validationError != null) return jsonResponse(400, { error: validationError });

  const rateLimitResponse = await enforceClientRateLimit(env, parsed, findObjectClientId);
  if (rateLimitResponse) return rateLimitResponse;

  const now = Math.floor(Date.now() / 1000);
  const payload = parsed as {
    client_id: string;
    project_id: string;
    run_id: string;
    objects: ObjectUploadScopeObject[];
  };
  const registeredObjects = await loadRegisteredObjectScopes(
    env,
    payload.client_id,
    payload.project_id,
    payload.run_id,
  );
  if (!registeredObjects) {
    return jsonResponse(403, { error: 'object upload authority is not registered' });
  }
  const registeredByKey = new Map(
    registeredObjects.map((object) => [objectScopeKey(object), object]),
  );
  for (const object of payload.objects) {
    const registered = registeredByKey.get(objectScopeKey(object));
    if (
      !registered ||
      registered.size_bytes !== object.size_bytes ||
      registered.sha256.toLowerCase() !== object.sha256.toLowerCase()
    ) {
      return jsonResponse(403, { error: 'object upload authority scope mismatch' });
    }
  }
  const token = await signUploadToken(env, {
    version: 1,
    client_id: payload.client_id,
    project_id: payload.project_id,
    run_id: payload.run_id,
    exp: now + OBJECT_UPLOAD_TOKEN_TTL_SECONDS,
    objects: payload.objects.map((object) => ({
      ...object,
      sha256: object.sha256.toLowerCase(),
    })),
  });
  if (!token) return jsonResponse(503, { error: 'object relay upload authority is not configured' });
  return jsonResponse(200, {
    upload_token: token,
    expires_at: new Date((now + OBJECT_UPLOAD_TOKEN_TTL_SECONDS) * 1000).toISOString(),
  });
}

async function handleObjectBatchRequest(request: Request, env: Env): Promise<Response> {
  if (request.headers.get(RELAY_MARKER_HEADER) !== OBJECT_RELAY_MARKER_VALUE) {
    return jsonResponse(403, { error: 'missing object client marker' });
  }
  if (!hasObjectRelayConfig(env)) {
    return jsonResponse(503, { error: 'object relay upload authority is not configured' });
  }
  const objectBucket = env.TRACE_OBJECT_BUCKET!;

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return jsonResponse(415, { error: 'content-type must be application/json' });
  }

  const ipRateLimitResponse = await enforceIpRateLimit(request, env);
  if (ipRateLimitResponse) return ipRateLimitResponse;

  const batchMaxBytes = parsePositiveInt(
    env.TRACE_OBJECT_BATCH_MAX_BYTES,
    DEFAULT_OBJECT_BATCH_MAX_BYTES,
  );
  const rawBody = await readBoundedBodyWithLimit(request, batchMaxBytes);
  if (rawBody instanceof Response) return rawBody;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, { error: 'invalid JSON' });
  }

  const validationError = validateObjectBody(parsed);
  if (validationError != null) {
    return jsonResponse(400, { error: validationError });
  }
  if (!env.TRACE_OBJECT_UPLOAD_SECRET?.trim()) {
    return jsonResponse(503, { error: 'object relay upload authority is not configured' });
  }
  const uploadToken = (parsed as { upload_token: string }).upload_token;
  const tokenPayload = await verifyUploadToken(env, uploadToken);
  if (!tokenPayload) return jsonResponse(403, { error: 'invalid object upload authority' });
  const body = parsed as {
    client_id: string;
    project_id: string;
    run_id: string;
    objects: Array<Record<string, unknown>>;
  };
  if (
    body.client_id !== tokenPayload.client_id ||
    body.project_id !== tokenPayload.project_id ||
    body.run_id !== tokenPayload.run_id
  ) {
    return jsonResponse(403, { error: 'object upload authority scope mismatch' });
  }
  const allowedByKey = new Map(tokenPayload.objects.map((object) => [objectScopeKey(object), object]));

  const rateLimitResponse = await enforceClientRateLimit(
    env,
    parsed,
    findObjectClientId,
  );
  if (rateLimitResponse) return rateLimitResponse;

  const objectMaxBytes = parsePositiveInt(env.TRACE_OBJECT_MAX_BYTES, DEFAULT_OBJECT_MAX_BYTES);
  const prefix = normalizeObjectPrefix(env.TRACE_OBJECT_PREFIX);
  const results: Array<Record<string, unknown>> = [];

  for (const object of body.objects) {
    const storageRef = object.storage_ref as string;
    const authorized = allowedByKey.get(objectScopeKey({
      storage_ref: storageRef,
      object_class: object.object_class as string,
    }));
    if (!authorized) {
      results.push({ storage_ref: storageRef, status: 'unavailable', reason: 'unauthorized_object' });
      continue;
    }
    const key = keyFromStorageRef(storageRef, prefix);
    if (!key) {
      results.push({ storage_ref: storageRef, status: 'unavailable', reason: 'invalid_storage_ref' });
      continue;
    }

    const bytes = decodeBase64(object.content_base64 as string);
    if (!bytes) {
      results.push({ storage_ref: storageRef, status: 'unavailable', reason: 'invalid_base64' });
      continue;
    }
    if (bytes.byteLength > objectMaxBytes) {
      results.push({
        storage_ref: storageRef,
        status: 'unavailable',
        reason: 'object_too_large',
        size_bytes: bytes.byteLength,
      });
      continue;
    }

    const sha256 = `sha256:${await sha256Hex(bytes)}`;
    if (bytes.byteLength !== authorized.size_bytes || sha256 !== authorized.sha256.toLowerCase()) {
      results.push({
        storage_ref: storageRef,
        status: 'unavailable',
        reason: 'object_authority_mismatch',
        size_bytes: bytes.byteLength,
        sha256,
      });
      continue;
    }
    await objectBucket.put(key, bytes, {
      httpMetadata: {
        contentType: typeof object.mime === 'string' ? object.mime : 'application/octet-stream',
      },
      customMetadata: {
        storage_ref: storageRef,
        sha256,
      },
    });
    results.push({
      storage_ref: storageRef,
      status: 'available',
      size_bytes: bytes.byteLength,
      sha256,
    });
  }

  return jsonResponse(200, { objects: results });
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET' && isHealthPath(request)) {
    return jsonResponse(200, {
      ok: true,
      service: 'open-design-telemetry-relay',
      configured: hasLangfuseCredentials(env),
      objectRelayConfigured: hasObjectAuthorizeConfig(env),
      upstream: resolveLangfuseUrl(env),
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'method not allowed' });
  }

  const { pathname } = new URL(request.url);
  if (pathname === '/api/objects/batch') {
    return handleObjectBatchRequest(request, env);
  }
  if (pathname === '/api/objects/authorize') {
    return handleObjectAuthorizeRequest(request, env);
  }

  if (request.headers.get(RELAY_MARKER_HEADER) !== RELAY_MARKER_VALUE) {
    return jsonResponse(403, { error: 'missing telemetry client marker' });
  }

  const publicKey = env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = env.LANGFUSE_SECRET_KEY?.trim();
  if (!publicKey || !secretKey) {
    return jsonResponse(503, { error: 'telemetry relay is not configured' });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return jsonResponse(415, { error: 'content-type must be application/json' });
  }

  const rawBody = await readBoundedBody(request);
  if (rawBody instanceof Response) return rawBody;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, { error: 'invalid JSON' });
  }

  const validationError = validateIngestionBody(parsed);
  if (validationError != null) {
    return jsonResponse(400, { error: validationError });
  }

  const rateLimitResponse = await enforceRateLimits(request, env, parsed);
  if (rateLimitResponse) return rateLimitResponse;

  const upstream = await fetch(resolveLangfuseUrl(env), {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(publicKey, secretKey),
      'Content-Type': 'application/json',
    },
    body: rawBody,
  });
  const upstreamBody = await upstream.text();
  if (upstream.ok) {
    await registerObjectUploadScopes(env, parsed, acceptedTraceCreateEventIds(upstreamBody, parsed));
  }
  return new Response(upstreamBody, {
    status: upstream.status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}

export default {
  fetch: handleRequest,
};
