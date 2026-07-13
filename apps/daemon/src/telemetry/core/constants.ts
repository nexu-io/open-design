/** @module core/constants
 * Foundational, dependency-free telemetry constants shared across the module.
 * Holds the redaction protocol version and the local-path redaction marker; imports no sibling subdirectory.
 */

/**
 * Identifies the redaction/fingerprint contract version stamped onto every
 * emitted prompt-stack telemetry payload. Bump this whenever the redaction or
 * fingerprinting behavior changes so downstream consumers can distinguish
 * incompatible payload shapes.
 */
export const PROMPT_STACK_REDACTION_VERSION = 'prompt-stack-redaction-v1';

/**
 * Sentinel token substituted for any local filesystem path detected in prompt
 * content before hashing or content capture, so no user path ever leaks into
 * telemetry.
 */
export const PROMPT_STACK_PATH_MARKER = '[REDACTED:path]';
