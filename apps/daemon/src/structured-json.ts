import type { z } from 'zod-v3';

export interface StructuredJsonRequest<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  chatAgentId?: string;
}

export interface StructuredJsonTextRequest {
  system: string;
  user: string;
  chatAgentId?: string;
}

export interface StructuredJsonTextResult {
  text: string;
  sensitiveValues?: readonly string[];
}

export interface StructuredJsonDeps {
  generateText(
    request: StructuredJsonTextRequest,
  ): Promise<string | StructuredJsonTextResult | null>;
  sensitiveValues?: readonly string[];
}

export type StructuredJsonErrorCode =
  | 'PROVIDER_NOT_CONFIGURED'
  | 'INVALID_PROVIDER_RESPONSE';

export class StructuredJsonError extends Error {
  constructor(
    readonly code: StructuredJsonErrorCode,
    message: string,
    readonly rawSummary = '',
  ) {
    super(message);
    this.name = 'StructuredJsonError';
  }
}

function stripMarkdownFence(raw: string): string {
  const text = raw.trim();
  if (!text.startsWith('```')) return text;
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function parseCandidate<T>(raw: string, schema: z.ZodType<T>): T {
  const text = stripMarkdownFence(raw);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Provider output was not valid JSON',
    );
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; '));
  }
  return parsed.data;
}

export function redactStructuredJsonSensitiveText(
  raw: string,
  sensitiveValues: readonly string[],
): string {
  const preciselyRedacted = sensitiveValues
    .filter((value) => value.length > 0)
    .reduce(
      (text, value) => text.split(value).join('[REDACTED]'),
      raw,
    );
  return preciselyRedacted
    .replace(
      /("(?:api[_-]?key|token|authorization)"\s*:\s*")[^"]*(")/gi,
      '$1[REDACTED]$2',
    )
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]');
}

function summarizeProviderOutput(raw: string, sensitiveValues: readonly string[]): string {
  return redactStructuredJsonSensitiveText(raw, sensitiveValues)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function normalizeTextResult(
  result: string | StructuredJsonTextResult,
): StructuredJsonTextResult {
  return typeof result === 'string' ? { text: result } : result;
}

function mergedSensitiveValues(
  configured: readonly string[],
  discovered: readonly string[] | undefined,
): string[] {
  return [...new Set([...configured, ...(discovered ?? [])].filter(Boolean))];
}

function assertNoSensitiveValues(
  value: unknown,
  sensitiveValues: readonly string[],
): void {
  const exactValues = sensitiveValues.filter((candidate) => candidate.length > 0);
  const containsSensitiveValue = (candidate: unknown): boolean => {
    if (typeof candidate === 'string') {
      return exactValues.some((secret) => candidate.includes(secret));
    }
    if (Array.isArray(candidate)) return candidate.some(containsSensitiveValue);
    if (candidate && typeof candidate === 'object') {
      return Object.entries(candidate).some(([key, nested]) => (
        containsSensitiveValue(key) || containsSensitiveValue(nested)
      ));
    }
    return false;
  };
  if (containsSensitiveValue(value)) {
    throw new Error('Provider output contained a configured sensitive value');
  }
}

function repairRequest(
  request: StructuredJsonTextRequest,
  raw: string,
  validationError: unknown,
  sensitiveValues: readonly string[],
): StructuredJsonTextRequest {
  const reason = validationError instanceof Error
    ? validationError.message
    : String(validationError);
  return {
    ...request,
    system: `${request.system}

Your previous response did not match the required JSON schema. Return only the corrected JSON object. Do not add prose or Markdown fences.`,
    user: `${request.user}

Repair the previous response so it is valid JSON and matches the requested schema.
Validation error: ${reason.slice(0, 500)}
Previous response:
${summarizeProviderOutput(raw, sensitiveValues)}`,
  };
}

export async function generateStructuredJson<T>(
  request: StructuredJsonRequest<T>,
  deps: StructuredJsonDeps,
): Promise<T> {
  const textRequest: StructuredJsonTextRequest = {
    system: request.system,
    user: request.user,
    ...(request.chatAgentId ? { chatAgentId: request.chatAgentId } : {}),
  };
  const firstRaw = await deps.generateText(textRequest);
  if (firstRaw === null) {
    throw new StructuredJsonError(
      'PROVIDER_NOT_CONFIGURED',
      'No configured provider is available for structured JSON generation',
    );
  }
  const first = normalizeTextResult(firstRaw);
  const firstSensitiveValues = mergedSensitiveValues(
    deps.sensitiveValues ?? [],
    first.sensitiveValues,
  );

  try {
    const parsed = parseCandidate(first.text, request.schema);
    assertNoSensitiveValues(parsed, firstSensitiveValues);
    return parsed;
  } catch (firstError) {
    const repairedRaw = await deps.generateText(repairRequest(
      textRequest,
      first.text,
      firstError,
      firstSensitiveValues,
    ));
    if (repairedRaw === null) {
      throw new StructuredJsonError(
        'PROVIDER_NOT_CONFIGURED',
        'No configured provider is available for structured JSON repair',
      );
    }
    const repaired = normalizeTextResult(repairedRaw);
    const allSensitiveValues = mergedSensitiveValues(
      firstSensitiveValues,
      repaired.sensitiveValues,
    );
    try {
      const parsed = parseCandidate(repaired.text, request.schema);
      assertNoSensitiveValues(parsed, allSensitiveValues);
      return parsed;
    } catch {
      const rawSummary = summarizeProviderOutput(repaired.text, allSensitiveValues);
      throw new StructuredJsonError(
        'INVALID_PROVIDER_RESPONSE',
        rawSummary
          ? `Provider returned invalid structured JSON: ${rawSummary}`
          : 'Provider returned invalid structured JSON',
        rawSummary,
      );
    }
  }
}
