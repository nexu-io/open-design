/** @module langfuse-trace/core/redact
 * Privacy redaction utilities applied to all user-generated content before it
 * reaches Langfuse. Enforces UTF-8 byte-aware truncation, artifact-block stripping,
 * local-path masking, and per-tool content gating.
 * Part of the foundation kernel: imports no sibling subdirectory.
 */

// Byte-aware UTF-8 truncation. JS String.length counts UTF-16 code units,
// not bytes — non-ASCII text (CJK, emoji) can occupy 2-4× as many bytes as
// characters, so a `value.length > max` cap silently lets oversized prompts
// through. We truncate on a UTF-8 byte boundary so the result is still
// valid Unicode (no half-encoded characters).
/**
 * Truncate `value` to at most `maxBytes` UTF-8 bytes, respecting multi-byte
 * character boundaries so the result is always valid Unicode.
 *
 * JS `String.length` counts UTF-16 code units, not bytes, which means a
 * plain length check silently passes oversized non-ASCII content. This
 * function converts to a Buffer first and walks backwards to find the
 * nearest leading byte before slicing.
 *
 * @param value - The string to truncate, or `undefined` (returned unchanged).
 * @param maxBytes - Maximum number of UTF-8 bytes in the returned string.
 * @returns The (possibly truncated) string, or `undefined` when input is falsy.
 */
export function truncate(value: string | undefined, maxBytes: number): string | undefined {
  if (!value) return undefined;
  const buf = Buffer.from(value, 'utf8');
  if (buf.length <= maxBytes) return value;
  let cut = maxBytes;
  // UTF-8 continuation bytes have the bit pattern 10xxxxxx. Walk backwards
  // until we land on a leading byte (0xxxxxxx, 110xxxxx, 1110xxxx, 11110xxx)
  // so the slice doesn't end mid-character.
  while (cut > 0 && (buf[cut]! & 0xc0) === 0x80) cut -= 1;
  return buf.subarray(0, cut).toString('utf8');
}

/**
 * Replace the body of every `<artifact ...>...</artifact>` block with a
 * `[REDACTED:artifact_content]` placeholder while preserving the tag's
 * attributes (slug, type, etc.) for observability metadata.
 *
 * Artifact content can be arbitrarily large and may contain user IP; this
 * redaction ensures neither size nor sensitivity bleeds into Langfuse traces.
 *
 * @param value - String that may contain artifact XML blocks, or `undefined`.
 * @returns The redacted string, or `undefined` when input is undefined.
 */
export function redactArtifactBlocks(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.replace(
    /<artifact\b([^>]*)>[\s\S]*?<\/artifact>/gi,
    (_match, attrs: string) =>
      `<artifact${attrs}>[REDACTED:artifact_content]</artifact>`,
  );
}

/**
 * Set of tool names whose input and output payloads are fully redacted
 * rather than path- and artifact-scrubbed.
 *
 * These tools read or write raw file content, which is always too sensitive
 * to forward verbatim to Langfuse regardless of path. Any new tool that
 * touches filesystem content should be added here.
 */
export const CONTENT_TOOL_NAMES = new Set([
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
]);

/**
 * Replace absolute user-local filesystem paths with `[REDACTED:local_path]`.
 * Covers both Unix (`/Users/<name>/...`) and Windows (`C:\Users\<name>\...`)
 * path patterns to avoid leaking home-directory structure across platforms.
 *
 * @param value - String that may contain absolute user paths, or `undefined`.
 * @returns The path-scrubbed string, or `undefined` when input is undefined.
 */
export function redactLocalPaths(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value
    .replace(/\/Users\/[^/\s"']+(?:\/[^ \n\r\t"'`<>)]*)?/g, '[REDACTED:local_path]')
    .replace(/[A-Za-z]:\\Users\\[^\\\s"']+(?:\\[^ \n\r\t"'`<>)]*)?/g, '[REDACTED:local_path]');
}

/**
 * Produce a trace-safe version of a tool call's input or output payload.
 *
 * Content-tool payloads (`Read`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit`)
 * are fully redacted because they contain raw file content. All other tool
 * payloads are run through artifact-block stripping and local-path masking,
 * which preserves structural information useful for debugging.
 *
 * @param toolName - The name of the tool that produced the payload.
 * @param direction - Whether this is the tool's `'input'` or `'output'`.
 * @param value - The raw payload string, or `undefined`.
 * @returns The redacted payload, or `undefined` when input is undefined.
 */
export function traceSafeToolPayload(
  toolName: string,
  direction: 'input' | 'output',
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  if (CONTENT_TOOL_NAMES.has(toolName)) {
    return `[REDACTED:tool_${direction}:content_tool:${toolName}]`;
  }
  return redactLocalPaths(redactArtifactBlocks(value));
}
