/** @module redaction/redaction
 * Redaction primitives that scrub local filesystem paths and secrets out of
 * prompt content before it is hashed or captured. Reaches the foundation
 * (`../core`) for the path marker and section-kind type, and the daemon-wide
 * secret scrubber (`../../redact.js`); it imports no concern sibling.
 * The prompt-stack builder consumes `redactPromptText` and `sanitizeSectionContent` through this subdir's barrel.
 */
import { redactSecrets } from '../../redact.js';

import { PROMPT_STACK_PATH_MARKER } from '../core/index.js';
import type { PromptTelemetrySectionKind } from '../core/index.js';

const FILE_LOCAL_PATH =
  /(^|[\s([{"'`@])file:\/\/(?:localhost)?\/[^\s)\]}"'`,;<>]+/gi;
const POSIX_LOCAL_PATH =
  /(^|[\s([{"'`@])\/(?:Users|home|root|tmp|private\/tmp|private\/var\/folders|private\/var\/tmp|var\/folders|var\/tmp|usr\/local|opt|Volumes|mnt|media|srv|workspace|workspaces|app)\/[^\s)\]}"'`,;<>]+/g;
const WINDOWS_LOCAL_PATH =
  /(^|[\s([{"'`@])(?:[A-Za-z]:\\|\\\\)[^\s)\]}"'`,;<>]+/g;

/**
 * Replaces every recognized local filesystem path (file:// URLs, common POSIX
 * roots, and Windows drive/UNC paths) with {@link PROMPT_STACK_PATH_MARKER},
 * preserving the leading delimiter so surrounding text stays intact. Exported
 * as public surface (and directly unit-tested) because path leakage is the
 * highest-risk redaction case.
 */
export function redactLocalPaths(input: string): string {
  if (!input) return input;
  return input
    .replace(FILE_LOCAL_PATH, (_match, prefix: string) => {
      return `${prefix}${PROMPT_STACK_PATH_MARKER}`;
    })
    .replace(POSIX_LOCAL_PATH, (_match, prefix: string) => {
      return `${prefix}${PROMPT_STACK_PATH_MARKER}`;
    })
    .replace(WINDOWS_LOCAL_PATH, (_match, prefix: string) => {
      return `${prefix}${PROMPT_STACK_PATH_MARKER}`;
    });
}

/**
 * Full prompt-text redaction pass: scrubs secrets first, then local paths.
 * Shared with the builder subdir via this barrel so every captured or hashed
 * string goes through the identical sanitization.
 */
export function redactPromptText(input: string): string {
  return redactLocalPaths(redactSecrets(input));
}

/**
 * @internal
 * Drops any line carrying a runtime tool token so per-run tool credentials
 * never reach telemetry, regardless of later redaction.
 */
function stripRuntimeToolPromptTokens(input: string): string {
  return input
    .split(/\r?\n/)
    .filter((line) => !line.includes('OD_TOOL_TOKEN'))
    .join('\n');
}

/**
 * Sanitizes a single section's raw content for capture: runtime-tool-prompt
 * sections first have their tool-token lines stripped (a structural safety step
 * that redaction alone would miss), then all sections run through
 * {@link redactPromptText}.
 */
export function sanitizeSectionContent(kind: PromptTelemetrySectionKind, content: string): string {
  const structurallySafe =
    kind === 'runtimeToolPrompt' ? stripRuntimeToolPromptTokens(content) : content;
  return redactPromptText(structurallySafe);
}
