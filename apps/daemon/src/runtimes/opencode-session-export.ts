type JsonObject = Record<string, unknown>;

export interface OpenCodeRecoveredReply {
  messageId: string | null;
  text: string;
  completedAt: number;
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    thought_tokens?: number;
    cached_read_tokens?: number;
    cached_write_tokens?: number;
  } | null;
  costUsd: number | null;
}

function isRecord(value: unknown): value is JsonObject {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function usageFromMessage(info: JsonObject): OpenCodeRecoveredReply['usage'] {
  if (!isRecord(info.tokens)) return null;
  const tokens = info.tokens;
  const usage: NonNullable<OpenCodeRecoveredReply['usage']> = {};
  const input = finiteNumber(tokens.input);
  const output = finiteNumber(tokens.output);
  const reasoning = finiteNumber(tokens.reasoning);
  if (input !== null) usage.input_tokens = input;
  if (output !== null) usage.output_tokens = output;
  if (reasoning !== null) usage.thought_tokens = reasoning;
  if (isRecord(tokens.cache)) {
    const cacheRead = finiteNumber(tokens.cache.read);
    const cacheWrite = finiteNumber(tokens.cache.write);
    if (cacheRead !== null) usage.cached_read_tokens = cacheRead;
    if (cacheWrite !== null) usage.cached_write_tokens = cacheWrite;
  }
  return Object.keys(usage).length > 0 ? usage : null;
}

/**
 * Extract the current attempt's completed assistant reply from
 * `opencode export <sessionID>`.
 *
 * OpenCode's headless JSON runner can persist the final assistant message and
 * exit before its event subscriber flushes the terminal `text` frame. The
 * export is OpenCode's stable session interface, so it is safer than reading
 * its private SQLite schema. Requiring both a completion timestamp and a
 * creation time at/after `since` prevents a resumed session from replaying an
 * older assistant turn.
 */
export function extractOpenCodeSessionReply(
  rawExport: string,
  options: { since: number },
): OpenCodeRecoveredReply | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawExport);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.messages)) return null;

  for (let index = parsed.messages.length - 1; index >= 0; index -= 1) {
    const message = parsed.messages[index];
    if (!isRecord(message) || !isRecord(message.info)) continue;
    const info = message.info;
    if (info.role !== 'assistant' || !isRecord(info.time)) continue;
    const createdAt = finiteNumber(info.time.created);
    if (createdAt === null || createdAt < options.since) continue;

    // This is the newest assistant row from the current attempt. Never fall
    // back to an earlier row if it is incomplete or failed: doing so could
    // replay stale text from a prior model step and hide the real failure.
    const completedAt = finiteNumber(info.time.completed);
    if (
      completedAt === null ||
      !Array.isArray(message.parts) ||
      info.error != null
    ) {
      return null;
    }
    const stepFinish = [...message.parts]
      .reverse()
      .find((part) => isRecord(part) && part.type === 'step-finish');
    const finish = typeof info.finish === 'string'
      ? info.finish
      : isRecord(stepFinish) && typeof stepFinish.reason === 'string'
        ? stepFinish.reason
        : null;
    // `tool-calls` is an intermediate turn and `length` is truncated; neither
    // is a completed user-visible answer. Recover only an explicit clean stop.
    if (finish !== 'stop') return null;

    const text = message.parts
      .filter(
        (part): part is JsonObject =>
          isRecord(part) &&
          part.type === 'text' &&
          typeof part.text === 'string' &&
          part.text.length > 0,
      )
      .map((part) => part.text as string)
      .join('');
    if (!text.trim()) return null;

    return {
      messageId: typeof info.id === 'string' && info.id ? info.id : null,
      text,
      completedAt,
      usage: usageFromMessage(info),
      costUsd: finiteNumber(info.cost),
    };
  }

  return null;
}
