/** @module core/api
 * Daemon connector API calls and response compaction/formatting helpers used by the connector subcommands.
 */

import { endpoint, writeJson } from './cli-io.js';
import type { CliError, JsonObject, ToolCliResult } from './types.js';

/**
 * Makes an authenticated JSON request to the daemon and returns the HTTP status plus parsed body.
 * @param baseUrl — The daemon base URL from `daemonUrl()`.
 * @param token — Bearer token from `toolToken()`.
 * @param pathname — Path (with optional query string) relative to the daemon base URL.
 * @param init — Optional `fetch` init overrides (method, body, etc.).
 */
export async function requestJson(baseUrl: URL, token: string, pathname: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const response = await fetch(endpoint(baseUrl, pathname), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body: unknown = text;
  if (text.length > 0) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { message: text };
    }
  }
  return { status: response.status, body };
}

/** Reduces a raw tool object from the connector list to its essential display fields. @internal */
function compactTool(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const tool = value as JsonObject;
  return {
    name: tool.name,
    description: tool.description,
    safety: tool.safety,
    curation: tool.curation,
    inputSchema: tool.inputSchemaJson ?? tool.inputSchema,
  };
}

/** Reduces a raw connector object from the connector list to its essential display fields. @internal */
function compactConnector(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const connector = value as JsonObject;
  const tools = Array.isArray(connector.tools) ? connector.tools : [];
  return {
    id: connector.id,
    name: connector.name,
    provider: connector.provider,
    category: connector.category,
    status: connector.status,
    accountLabel: connector.accountLabel,
    tools: tools.map(compactTool),
  };
}

/**
 * Compacts a `/api/tools/connectors/list` response body to the fields needed by the CLI.
 * @param value — The raw response body from `requestJson`.
 */
export function compactList(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const response = value as JsonObject;
  const connectors = Array.isArray(response.connectors) ? response.connectors : [];
  return { connectors: connectors.map(compactConnector) };
}

/**
 * Compacts a `/api/tools/connectors/execute` response body to the fields needed by the CLI.
 * @param value — The raw response body from `requestJson`.
 */
export function compactExecution(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const response = value as JsonObject;
  return {
    connectorId: response.connectorId,
    accountLabel: response.accountLabel,
    toolName: response.toolName,
    safety: response.safety,
    outputSummary: response.outputSummary,
    output: response.output,
    metadata: response.metadata,
  };
}

/** Compacts a validation-kind error details object to just its issues array. @internal */
function compactValidationDetails(details: unknown): unknown {
  if (!details || typeof details !== 'object') return details;
  const record = details as JsonObject;
  if (record.kind !== 'validation' || !Array.isArray(record.issues)) return details;
  return {
    kind: 'validation',
    issues: record.issues.map((issue) => {
      if (!issue || typeof issue !== 'object') return { message: String(issue) };
      const issueRecord = issue as JsonObject;
      return {
        ...(typeof issueRecord.path === 'string' ? { path: issueRecord.path } : {}),
        message: typeof issueRecord.message === 'string' ? issueRecord.message : String(issueRecord.message ?? 'validation failed'),
        ...(typeof issueRecord.code === 'string' ? { code: issueRecord.code } : {}),
      };
    }),
  };
}

/**
 * Normalizes an arbitrary daemon error response body into a typed `CliError` object.
 * @param body — The raw response body (may be a string, an `{ error }` wrapper, or a plain object).
 */
export function normalizeCliError(body: unknown): CliError {
  const rawError = body && typeof body === 'object' && 'error' in body ? (body as JsonObject).error : body;

  if (typeof rawError === 'string') return { message: rawError };
  if (!rawError || typeof rawError !== 'object') return { message: String(rawError ?? 'request failed') };

  const error = rawError as JsonObject;
  return {
    ...(typeof error.code === 'string' ? { code: error.code } : {}),
    message: typeof error.message === 'string' ? error.message : String(error.error ?? 'request failed'),
    ...(error.details === undefined ? {} : { details: compactValidationDetails(error.details) }),
    ...(typeof error.retryable === 'boolean' ? { retryable: error.retryable } : {}),
    ...(typeof error.requestId === 'string' ? { requestId: error.requestId } : {}),
  };
}

/**
 * Writes a compacted API response to stdout on success, or a normalized error to stderr on failure.
 * @param response — The `{ status, body }` pair returned by `requestJson`.
 * @param compact — Formatter applied to the success body before writing.
 */
export async function printApiResult(response: { status: number; body: unknown }, compact: (body: unknown) => unknown): Promise<ToolCliResult> {
  if (response.status < 200 || response.status >= 300) {
    writeJson({ ok: false, status: response.status, error: normalizeCliError(response.body) }, process.stderr);
    return { exitCode: 1 };
  }
  const body = compact(response.body);
  writeJson(body && typeof body === 'object' && !Array.isArray(body) ? { ok: true, ...(body as JsonObject) } : { ok: true, result: body });
  return { exitCode: 0 };
}
