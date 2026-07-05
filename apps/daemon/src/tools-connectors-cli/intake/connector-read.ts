/** @module intake/connector-read
 * Connector read-tool invocation and content decoding; owns all HTTP calls to /api/tools/connectors/execute
 * and the logic for decoding text, base64, binary, and signed-URL content payloads from connector responses.
 */
import path from 'node:path';

import { GITHUB_CONNECTOR_ID, MAX_CONTEXT_ASSET_BYTES, MAX_CONTEXT_FILE_BYTES, isBinaryDesignAssetPath, normalizeCliError, requestJson } from '../core/index.js';
import type { JsonObject } from '../core/index.js';

/**
 * Thin wrapper around requestJson that throws a human-readable error on non-2xx responses.
 * @internal
 */
async function requestJsonOrThrow(baseUrl: URL, token: string, pathname: string, init: RequestInit = {}): Promise<unknown> {
  const response = await requestJson(baseUrl, token, pathname, init);
  if (response.status >= 200 && response.status < 300) return response.body;
  const error = normalizeCliError(response.body);
  throw new Error(`${error.code ? `${error.code}: ` : ''}${error.message}`);
}

/**
 * Executes a named connector read-tool against the daemon API and unwraps the output payload.
 * @param toolName The connector tool to invoke (e.g. GITHUB_GET_RAW_CONTENT_TOOL).
 * @returns The unwrapped tool output, or the raw body if the shape is unrecognized.
 */
export async function executeConnectorReadTool(
  baseUrl: URL,
  token: string,
  toolName: string,
  input: JsonObject,
): Promise<unknown> {
  const body = await requestJsonOrThrow(baseUrl, token, '/api/tools/connectors/execute', {
    method: 'POST',
    body: JSON.stringify({ connectorId: GITHUB_CONNECTOR_ID, toolName, input }),
  });
  if (!body || typeof body !== 'object') return body;
  const output = (body as JsonObject).output;
  if (output && typeof output === 'object' && !Array.isArray(output) && 'data' in output) {
    return (output as JsonObject).data;
  }
  return output;
}

/**
 * Asserts that the GitHub connector is present and connected via the daemon connector list endpoint.
 * Throws a user-facing error if the connector is absent or in a non-connected state.
 */
export async function assertGithubConnectorIsListable(baseUrl: URL, token: string): Promise<void> {
  const body = await requestJsonOrThrow(baseUrl, token, '/api/tools/connectors/list', { method: 'GET' });
  const connectors = body && typeof body === 'object' && Array.isArray((body as JsonObject).connectors)
    ? (body as { connectors: JsonObject[] }).connectors
    : [];
  const github = connectors.find((connector) => connector.id === GITHUB_CONNECTOR_ID);
  if (!github) throw new Error('GitHub connector is not connected or has no auto-approved read tools');
  const status = typeof github.status === 'string' ? github.status.toLowerCase() : '';
  if (status && status !== 'connected') {
    throw new Error(`GitHub connector status is ${status}; connect GitHub before repository intake`);
  }
}

/**
 * Recursively searches an object for the first non-empty string found at any of the given keys.
 * Used to extract fields like "path" or "name" from arbitrarily shaped connector payloads.
 * @returns The first matching string value, or undefined if none found.
 */
export function getStringAtKeys(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as JsonObject;
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === 'string' && direct.trim()) return direct;
  }
  for (const child of Object.values(record)) {
    const found = getStringAtKeys(child, keys);
    if (found) return found;
  }
  return undefined;
}

/**
 * Extracts the repository default branch name from a connector metadata payload.
 * @returns The branch name string, or undefined if not present.
 */
export function getDefaultBranch(metadata: unknown): string | undefined {
  return getStringAtKeys(metadata, ['default_branch', 'defaultBranch']);
}

/**
 * Recursively decodes a connector content payload into a UTF-8 string, handling base64 encoding.
 * @internal
 */
function decodeContentPayload(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return undefined;
  const record = value as JsonObject;
  const content = typeof record.content === 'string'
    ? record.content
    : typeof record.data === 'string'
      ? record.data
      : undefined;
  if (content !== undefined) {
    const encoding = typeof record.encoding === 'string' ? record.encoding.toLowerCase() : '';
    if (encoding === 'base64') return decodeBase64Content(content);
    return content;
  }
  for (const [key, child] of Object.entries(record)) {
    if (key === 'mimetype' || key === 'name' || key === 's3url') continue;
    const decoded = decodeContentPayload(child);
    if (decoded !== undefined) return decoded;
  }
  return undefined;
}

/** Decodes a base64 string to a UTF-8 string. @internal */
function decodeBase64Content(value: string): string {
  return decodeBase64Buffer(value).toString('utf8');
}

/** Strips whitespace and decodes a base64 string to a raw Buffer. @internal */
function decodeBase64Buffer(value: string): Buffer {
  return Buffer.from(value.replace(/\s+/gu, ''), 'base64');
}

/** Recursively searches a connector payload for a base64-encoded binary content field and returns it as a Buffer. @internal */
function decodeBinaryContentPayload(value: unknown): Buffer | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const decoded = decodeBinaryContentPayload(item);
      if (decoded) return decoded;
    }
    return undefined;
  }
  const record = value as JsonObject;
  const content = typeof record.content === 'string'
    ? record.content
    : typeof record.data === 'string'
      ? record.data
      : undefined;
  if (content !== undefined) {
    const encoding = typeof record.encoding === 'string' ? record.encoding.toLowerCase() : '';
    if (encoding === 'base64') return decodeBase64Buffer(content);
  }
  for (const [key, child] of Object.entries(record)) {
    if (key === 'mimetype' || key === 'name' || key === 's3url') continue;
    const decoded = decodeBinaryContentPayload(child);
    if (decoded) return decoded;
  }
  return undefined;
}

/** Recursively searches a connector payload for an `s3url` signed download URL. @internal */
function findConnectorSignedContentUrl(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findConnectorSignedContentUrl(item);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as JsonObject;
  if (typeof record.s3url === 'string' && /^https:\/\//iu.test(record.s3url)) return record.s3url;
  for (const child of Object.values(record)) {
    const found = findConnectorSignedContentUrl(child);
    if (found) return found;
  }
  return undefined;
}

/**
 * Decodes a connector payload to a UTF-8 string, falling back to a signed-URL download when no inline content is found.
 * @returns The decoded text, or `undefined` if no readable content is present.
 */
export async function readConnectorTextContent(value: unknown): Promise<string | undefined> {
  const decoded = decodeContentPayload(value);
  if (decoded !== undefined) return decoded;
  const signedUrl = findConnectorSignedContentUrl(value);
  if (!signedUrl) return undefined;
  const response = await fetch(signedUrl);
  if (!response.ok) {
    throw new Error(`connector content download failed with HTTP ${response.status}`);
  }
  const text = await response.text();
  return text.slice(0, MAX_CONTEXT_FILE_BYTES);
}

/** Decodes a connector payload to a raw Buffer, falling back to a signed-URL download. @internal */
async function readConnectorBinaryContent(value: unknown): Promise<Buffer | undefined> {
  const decoded = decodeBinaryContentPayload(value);
  if (decoded) return decoded;
  const signedUrl = findConnectorSignedContentUrl(value);
  if (!signedUrl) return undefined;
  const response = await fetch(signedUrl);
  if (!response.ok) {
    throw new Error(`connector content download failed with HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Reads a connector file payload as either binary or UTF-8 text depending on the path extension.
 * @param repoPath — Repo-relative path used to determine whether binary or text decoding applies.
 * @param value — The raw connector output payload.
 * @returns `{ content, bytes, binary? }`, or `undefined` if no readable content could be extracted.
 */
export async function readConnectorSnapshotContent(
  repoPath: string,
  value: unknown,
): Promise<{ content: string | Buffer; bytes: number; binary?: boolean } | undefined> {
  const normalizedPath = repoPath.toLowerCase();
  if (isBinaryDesignAssetPath(normalizedPath)) {
    const binaryContent = await readConnectorBinaryContent(value);
    if (!binaryContent) return undefined;
    if (binaryContent.length > MAX_CONTEXT_ASSET_BYTES) {
      throw new Error(`binary asset exceeds ${MAX_CONTEXT_ASSET_BYTES} bytes`);
    }
    return { content: binaryContent, bytes: binaryContent.length, binary: true };
  }
  const textContent = await readConnectorTextContent(value);
  if (textContent === undefined) return undefined;
  const content = textContent.slice(0, MAX_CONTEXT_FILE_BYTES);
  return { content, bytes: Buffer.byteLength(content, 'utf8') };
}

/**
 * Recursively walks an arbitrary connector payload and collects all non-directory `path` strings into a sorted list.
 * @param value — The raw connector tree payload (may be nested objects or arrays).
 * @returns Sorted array of repo-relative file paths.
 */
export function extractTreePaths(value: unknown): string[] {
  const paths = new Set<string>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const record = node as JsonObject;
    const rawPath = typeof record.path === 'string' ? record.path : undefined;
    const rawType = typeof record.type === 'string' ? record.type.toLowerCase() : '';
    if (rawPath && rawType !== 'tree' && rawType !== 'dir') {
      paths.add(rawPath);
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  return [...paths].sort((left, right) => left.localeCompare(right));
}

/** A single entry (file or directory) returned by the GitHub repository-content connector tool. */
export interface GithubDirectoryEntry {
  path: string;
  type: 'file' | 'dir';
}

/**
 * Recursively walks an arbitrary connector payload and collects all file/directory entries into a sorted list.
 * @param value — The raw connector directory-listing payload.
 * @returns Sorted array of `GithubDirectoryEntry` objects with `path` and `type`.
 */
export function extractDirectoryEntries(value: unknown): GithubDirectoryEntry[] {
  const entries = new Map<string, GithubDirectoryEntry>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const record = node as JsonObject;
    const rawPath = typeof record.path === 'string' ? record.path : undefined;
    const rawType = typeof record.type === 'string' ? record.type.toLowerCase() : '';
    if (rawPath && (rawType === 'file' || rawType === 'dir')) {
      entries.set(rawPath, { path: rawPath, type: rawType });
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  return [...entries.values()].sort((left, right) => left.path.localeCompare(right.path));
}
